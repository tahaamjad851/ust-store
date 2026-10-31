import { describe, expect, it } from "vitest";
import { buildExportCsv, buildTemplateCsv } from "@/features/catalog/csv/export";
import { csvCell, MAX_CSV_ROWS, parseCsv, toCsv, uncsvGuard } from "@/features/catalog/csv/parse";
import { validateImport, type ImportContext } from "@/features/catalog/csv/validate";
import { CSV_COLUMNS } from "@/features/catalog/csv/columns";

describe("parseCsv", () => {
  it("reads plain rows with LF and CRLF", () => {
    expect(parseCsv("a,b\n1,2\n").rows).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a,b\r\n1,2\r\n").rows).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("handles quotes, commas, doubled quotes and line breaks inside cells", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n"two\nlines",z').rows).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["two\nlines", "z"]]);
  });
  it("drops the Excel byte-order mark and empty lines, keeps empty cells", () => {
    expect(parseCsv("﻿a,b\n\n1,\n,2\n").rows).toEqual([["a", "b"], ["1", ""], ["", "2"]]);
  });
  it("keeps non-Latin text", () => {
    expect(parseCsv("name\nانجن آئل").rows[1]).toEqual(["انجن آئل"]);
  });
  it("reports malformed quotes instead of guessing", () => {
    expect(parseCsv('a\n"open').error).toMatch(/never closed/);
    expect(parseCsv('a\nab"c').error).toMatch(/quote in the middle/);
  });
  it("refuses an enormous file", () => {
    const big = "a\n" + "x\n".repeat(MAX_CSV_ROWS + 5);
    expect(parseCsv(big).error).toMatch(/more than/);
  });
});

describe("csv cells", () => {
  it("guards against spreadsheet formulas and undoes the guard", () => {
    for (const v of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx"]) {
      expect(csvCell(v).replace(/^"|"$/g, "").startsWith("'")).toBe(true);
      expect(uncsvGuard(`'${v}`)).toBe(v);
    }
    expect(csvCell("plain")).toBe("plain");
    expect(uncsvGuard("-")).toBe("-");
    expect(uncsvGuard("'quoted")).toBe("'quoted");
  });
  it("quotes cells that need it", () => {
    expect(toCsv([["a,b", 'c"d', "e\nf"]])).toBe('"a,b","c""d","e\nf"\r\n');
  });
});

const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  categoriesByPath: new Map([["engine-oils", "cat-oils"], ["tractor-parts/engine-parts", "cat-engine"]]),
  brandsByName: new Map([["acme", ["brand-acme"]], ["twin", ["b1", "b2"]]]),
  existingSlugs: new Set(["existing-product"]),
  variantsBySku: new Map([["OLD-1", { productSlug: "existing-product", regularPaisa: 100_000, salePaisa: null, reserved: 3 }]]),
  barcodeOwner: new Map([["11112222", "OLD-1"]]),
  canSetCost: true,
  ...over,
});

const file = (...lines: string[]) => parseCsv(lines.join("\n")).rows;
const H = "sku,product_slug,product_name,category,brand,regular_price,sale_price,cost,stock,status,oem_part_numbers,barcode,variant_active";

describe("validateImport", () => {
  it("builds a payload for new and existing products, grouped by product", () => {
    const r = validateImport(
      file(H, "NEW-1,new-oil,New Oil,engine-oils,Acme,1250.50,1000,900,5,draft,A1|B2,,yes", "NEW-2,new-oil,New Oil,engine-oils,,2000,,,,,,,", "OLD-1,existing-product,,,,1500,,,10,,,,"),
      ctx(),
    );
    expect(r.ok).toBe(true);
    expect(r.counts).toMatchObject({ productsNew: 1, productsUpdated: 1, variantsNew: 2, variantsUpdated: 1, rows: 3 });
    const oil = r.products.find((p) => p.slug === "new-oil")!;
    expect(oil).toMatchObject({ name: "New Oil", category_id: "cat-oils", brand_id: "brand-acme", status: "draft", oem_part_numbers: ["A1", "B2"] });
    expect(oil.variants[0]).toMatchObject({ sku: "NEW-1", regular_price_paisa: 125050, sale_price_paisa: 100000, cost_paisa: 90000, stock: 5, is_active: true });
    expect(oil.variants).toHaveLength(2);
    const old = r.products.find((p) => p.slug === "existing-product")!;
    // Blank cells are absent keys (kept by the database), not nulls.
    expect(old).not.toHaveProperty("name");
    expect(old.variants[0]).toEqual({ sku: "OLD-1", regular_price_paisa: 150000, stock: 10 });
  });

  it("derives the slug from the name and the owner's slug from an existing SKU", () => {
    const r = validateImport(file("sku,product_name,category,regular_price", "A-1,Brake Pad Set,engine-oils,10", "OLD-1,,,"), ctx());
    expect(r.ok).toBe(true);
    expect(r.products.map((p) => p.slug).sort()).toEqual(["brake-pad-set", "existing-product"]);
  });

  it("a single dash clears a field", () => {
    const r = validateImport(file("sku,sale_price,brand,barcode", "OLD-1,-,-,-"), ctx());
    expect(r.ok).toBe(true);
    expect(r.products[0].variants[0]).toMatchObject({ sale_price_paisa: null, barcode: null });
    expect(r.products[0]).toMatchObject({ brand_id: null });
  });

  it("reports every problem with its line number and applies nothing", () => {
    const r = validateImport(
      file(H, "bad sku,p,P,engine-oils,,10,,,,,,,", "DUP-1,p,P,engine-oils,,10,,,,,,,", "DUP-1,p,P,engine-oils,,10,,,,,,,", "X-3,p2,P2,nowhere,Nobody,abc,,,,,,,", "X-4,p3,P3,engine-oils,Twin,10,20,,,,,,", "OLD-1,other-product,,,,,,,1,,,,", "X-6,p4,P4,engine-oils,,10,,,,weird,,11112222,maybe"),
      ctx(),
    );
    expect(r.ok).toBe(false);
    const msgs = r.rows.flatMap((x) => x.errors.map((e) => `${x.line}: ${e}`)).join("\n");
    expect(msgs).toMatch(/2: The SKU "BAD SKU" is not valid/);
    expect(msgs).toMatch(/4: The SKU DUP-1 is already on line 3/);
    expect(msgs).toMatch(/5: Unknown category "nowhere"/);
    expect(msgs).toMatch(/5: Unknown brand "Nobody"/);
    expect(msgs).toMatch(/5: regular_price "abc" is not an amount/);
    expect(msgs).toMatch(/6: The brand name "Twin" matches more than one brand/);
    expect(msgs).toMatch(/6: The sale price must be lower than the regular price/);
    expect(msgs).toMatch(/7: The SKU OLD-1 belongs to the product "existing-product", not "other-product"/);
    expect(msgs).toMatch(/7: stock 1 is below the 3 already reserved/);
    expect(msgs).toMatch(/8: status must be one of/);
    expect(msgs).toMatch(/8: The barcode 11112222 already belongs to OLD-1/);
    expect(msgs).toMatch(/8: variant_active must be yes or no/);
  });

  it("a new product needs a name and category; a new variant needs a price", () => {
    const r = validateImport(file("sku,product_slug,regular_price", "N-1,fresh,", "OLD-1,existing-product,5"), ctx());
    expect(r.rows[0].errors.join("|")).toMatch(/needs a product_name.*needs a category.*needs a regular_price/s);
    expect(r.rows[1].errors).toEqual([]);
  });

  it("rows of one product may repeat product fields but not contradict them", () => {
    const r = validateImport(file("sku,product_slug,product_name,category,regular_price", "A-1,p,One,engine-oils,1", "A-2,p,Two,engine-oils,1"), ctx());
    expect(r.rows[1].errors.join()).toMatch(/differs from line 2/);
  });

  it("ignores an administrator-only cost for staff, with a warning", () => {
    const r = validateImport(file("sku,cost", "OLD-1,500"), ctx({ canSetCost: false }));
    expect(r.ok).toBe(true);
    expect(r.rows[0].warnings.join()).toMatch(/cost is ignored/);
    expect(r.products[0].variants[0]).not.toHaveProperty("cost_paisa");
  });

  it("fails the whole file for a missing sku column, duplicate columns or no rows; unknown columns only warn", () => {
    expect(validateImport(file("name", "x"), ctx()).fileErrors.join()).toMatch(/no "sku" column/);
    expect(validateImport(file("sku,sku", "a,b"), ctx()).fileErrors.join()).toMatch(/appears twice/);
    expect(validateImport(file("sku"), ctx()).fileErrors.join()).toMatch(/no rows/);
    const warn = validateImport(file("sku,colour", "OLD-1,red"), ctx());
    expect(warn.ok).toBe(true);
    expect(warn.fileWarnings.join()).toMatch(/Unknown column "colour"/);
    expect(validateImport([], ctx()).fileErrors.join()).toMatch(/empty/);
  });

  it("reads a formula-guarded cell back as typed", () => {
    const r = validateImport(file("sku,product_slug,product_name,category,regular_price", "A-1,p,'=Weird name,engine-oils,1"), ctx());
    expect(r.products[0]).toMatchObject({ name: "=Weird name" });
  });
});

describe("export", () => {
  const data = {
    categories: [
      { id: "c1", parent_id: null, slug: "tractor-parts", name: "Tractor Parts", description: null, icon: null, sort_order: 1, is_active: true },
      { id: "c2", parent_id: "c1", slug: "engine-parts", name: "Engine Parts", description: null, icon: null, sort_order: 1, is_active: true },
    ],
    brands: [{ id: "b1", slug: "acme", name: "Acme", description: null, is_active: true }],
    products: [
      {
        id: "p1", slug: "gasket", name: "=Gasket, set", short_description: null, description: 'Has "quotes"', category_id: "c2", brand_id: "b1", product_type: "part" as const,
        part_number: null, oem_part_numbers: ["A", "B"], specs: [], viscosity_grade: null, oil_specifications: [], origin: null, warranty_info: null, packaging_info: null,
        is_returnable: true, is_featured: false, status: "published" as const, seo_title: null, seo_description: null, published_at: null, created_at: "", updated_at: "",
      },
    ],
    variants: [
      { id: "v1", product_id: "p1", sku: "GSK-1", barcode: null, name: "Default", regular_price_paisa: 125050, sale_price_paisa: null, weight_grams: 200, length_mm: null, width_mm: null, height_mm: null, is_default: true, is_active: true, sort_order: 1, updated_at: "" },
    ],
    stock: new Map([["v1", 7]]),
    costs: new Map([["v1", 90000]]),
  };

  it("exports one row per variant in the import columns, with prices in rupees", () => {
    const rows = parseCsv(buildExportCsv(data, true)).rows;
    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    const row = Object.fromEntries(CSV_COLUMNS.map((c, i) => [c, rows[1][i]]));
    expect(row).toMatchObject({ sku: "GSK-1", category: "tractor-parts/engine-parts", brand: "Acme", regular_price: "1250.50", cost: "900", stock: "7", oem_part_numbers: "A|B", variant_active: "yes" });
  });
  it("guards formulas, leaves cost empty for staff, and the file reads back without problems", () => {
    const csv = buildExportCsv(data, false);
    expect(csv).toContain("'=Gasket");
    const rows = parseCsv(csv).rows;
    expect(rows[1][CSV_COLUMNS.indexOf("cost")]).toBe("");
    const back = validateImport(rows, ctx({ categoriesByPath: new Map([["tractor-parts/engine-parts", "c2"]]), brandsByName: new Map([["acme", ["b1"]]]), existingSlugs: new Set(["gasket"]), variantsBySku: new Map([["GSK-1", { productSlug: "gasket", regularPaisa: 125050, salePaisa: null, reserved: 0 }]]) }));
    expect(back.ok).toBe(true);
    expect(back.products[0]).toMatchObject({ name: "=Gasket, set" });
  });
  it("the template is a valid header plus one example", () => {
    expect(parseCsv(buildTemplateCsv()).rows).toHaveLength(2);
  });
});
