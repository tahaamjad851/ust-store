// Checks a parsed CSV file against the catalogue WITHOUT writing anything, and builds the payload that
// import_catalog() applies in one transaction. Every problem is reported with its line number; the file
// can only be applied when there is none. The database checks again (uniqueness, foreign keys, SKU owner).
import { rupeesToPaisa } from "@/lib/pricing/money";
import { SKU_PATTERN, SLUG_PATTERN, slugify } from "@/lib/validation/admin";
import { CSV_COLUMNS, type CsvColumn } from "./columns";
import { uncsvGuard } from "./parse";

export type ImportContext = {
  /** Lower-case category path ("tractor-parts/engine-parts" or "engine-oils") -> id. */
  categoriesByPath: Map<string, string>;
  /** Lower-case brand name -> ids (more than one means the name is ambiguous). */
  brandsByName: Map<string, string[]>;
  existingSlugs: Set<string>;
  variantsBySku: Map<string, { productSlug: string; regularPaisa: number; salePaisa: number | null; reserved: number }>;
  /** Barcode -> SKU that owns it. */
  barcodeOwner: Map<string, string>;
  canSetCost: boolean;
};

export type RowReport = { line: number; sku: string; productSlug: string; kind: "new" | "existing"; errors: string[]; warnings: string[] };

export type ImportVariant = Record<string, unknown> & { sku: string };
export type ImportProduct = Record<string, unknown> & { slug: string; variants: ImportVariant[] };

export type ImportReport = {
  ok: boolean;
  /** Problems with the file as a whole: nothing can be applied while there are any. */
  fileErrors: string[];
  /** Things that are ignored (unknown columns) and do not block. */
  fileWarnings: string[];
  rows: RowReport[];
  products: ImportProduct[];
  counts: { productsNew: number; productsUpdated: number; variantsNew: number; variantsUpdated: number; rows: number };
};

const TYPES = ["part", "oil", "filter", "accessory", "tool", "tyre", "other"];
const STATUSES = ["draft", "published", "archived"];
const MAX_TEXT: Partial<Record<CsvColumn, number>> = {
  product_name: 200, short_description: 500, description: 10_000, part_number: 80, viscosity_grade: 40, origin: 80,
  warranty_info: 1000, packaging_info: 500, seo_title: 70, seo_description: 170, variant_name: 120,
};
const CLEAR = Symbol("clear");

function parseBool(v: string): boolean | null {
  const t = v.toLowerCase();
  if (["yes", "y", "true", "1"].includes(t)) return true;
  if (["no", "n", "false", "0"].includes(t)) return false;
  return null;
}

export function validateImport(records: string[][], ctx: ImportContext): ImportReport {
  const report: ImportReport = { ok: false, fileErrors: [], fileWarnings: [], rows: [], products: [], counts: { productsNew: 0, productsUpdated: 0, variantsNew: 0, variantsUpdated: 0, rows: 0 } };
  if (records.length === 0) {
    report.fileErrors.push("The file is empty.");
    return report;
  }
  const header = records[0].map((h) => h.trim().toLowerCase());
  const index = new Map<string, number>();
  header.forEach((h, i) => {
    if (!(CSV_COLUMNS as readonly string[]).includes(h)) report.fileWarnings.push(`Unknown column "${h}" in the header. It is ignored.`);
    else if (index.has(h)) report.fileErrors.push(`The column "${h}" appears twice.`);
    else index.set(h, i);
  });
  if (!index.has("sku")) report.fileErrors.push('The header has no "sku" column.');
  if (records.length === 1) report.fileErrors.push("The file has a header but no rows.");
  if (report.fileErrors.length > 0) return report;

  const seenSku = new Map<string, number>();
  const seenBarcode = new Map<string, number>();
  const groups = new Map<string, { product: ImportProduct; firstLine: number; isNew: boolean; fields: Map<string, { value: string; line: number }> }>();

  for (let r = 1; r < records.length; r++) {
    const line = r + 1;
    const row = records[r];
    const errors: string[] = [];
    const warnings: string[] = [];
    // undefined: absent or blank (keep); CLEAR: "-"; string: a value.
    const cell = (col: CsvColumn): string | typeof CLEAR | undefined => {
      const i = index.get(col);
      if (i === undefined) return undefined;
      const v = uncsvGuard((row[i] ?? "").trim());
      if (v === "") return undefined;
      return v === "-" ? CLEAR : v;
    };
    if (row.length > header.length) warnings.push("The row has more cells than the header; the extra cells are ignored.");

    const skuRaw = cell("sku");
    const sku = typeof skuRaw === "string" ? skuRaw.toUpperCase() : "";
    if (!sku) errors.push("The SKU is empty.");
    else if (!SKU_PATTERN.test(sku)) errors.push(`The SKU "${sku}" is not valid. Use capital letters, numbers, dots, dashes or slashes.`);
    else if (seenSku.has(sku)) errors.push(`The SKU ${sku} is already on line ${seenSku.get(sku)}. Each SKU may appear once.`);
    else seenSku.set(sku, line);

    const existing = sku ? ctx.variantsBySku.get(sku) : undefined;
    const nameCell = cell("product_name");
    const slugCell = cell("product_slug");
    let slug = typeof slugCell === "string" ? slugCell.toLowerCase() : "";
    if (slugCell === CLEAR) errors.push("product_slug cannot be cleared.");
    if (!slug) slug = existing ? existing.productSlug : typeof nameCell === "string" ? slugify(nameCell, 120) : "";
    if (!slug) errors.push("The row has no product_slug and no product_name, so the product cannot be identified.");
    else if (!SLUG_PATTERN.test(slug) || slug.length > 120) errors.push(`The product web address "${slug}" is not valid. Use lowercase letters, numbers and single dashes.`);
    if (existing && slug && existing.productSlug !== slug) {
      errors.push(`The SKU ${sku} belongs to the product "${existing.productSlug}", not "${slug}".`);
    }

    const isNewProduct = slug ? !ctx.existingSlugs.has(slug) : true;
    let group = slug ? groups.get(slug) : undefined;
    if (slug && !group) {
      group = { product: { slug, variants: [] }, firstLine: line, isNew: isNewProduct, fields: new Map() };
      groups.set(slug, group);
    }
    const product = group?.product ?? ({ slug, variants: [] } as ImportProduct);

    // --- product-level fields: the first row sets them; later rows of the product may repeat them, not contradict them.
    const setProduct = (key: string, col: CsvColumn, value: unknown, raw: string) => {
      const prior = group?.fields.get(key);
      if (prior) {
        if (prior.value !== raw) errors.push(`${col} differs from line ${prior.line} (same product).`);
        return;
      }
      group?.fields.set(key, { value: raw, line });
      product[key] = value;
    };
    for (const col of ["product_name", "short_description", "description", "part_number", "viscosity_grade", "origin", "warranty_info", "packaging_info", "seo_title", "seo_description"] as const) {
      const v = cell(col);
      if (v === undefined) continue;
      if (col === "product_name" && v === CLEAR) { errors.push("product_name cannot be cleared."); continue; }
      if (typeof v === "string" && v.length > (MAX_TEXT[col] ?? 1e9)) { errors.push(`${col} is longer than ${MAX_TEXT[col]} characters.`); continue; }
      setProduct(col === "product_name" ? "name" : col, col, v === CLEAR ? null : v, v === CLEAR ? "-" : v);
    }
    for (const col of ["oem_part_numbers", "oil_specifications"] as const) {
      const v = cell(col);
      if (v === undefined) continue;
      const items = v === CLEAR ? [] : [...new Set(v.split("|").map((s) => s.trim()).filter(Boolean))];
      if (items.length > (col === "oem_part_numbers" ? 50 : 30) || items.some((s) => s.length > 100)) errors.push(`${col} has too many or too long entries.`);
      else setProduct(col, col, items, v === CLEAR ? "-" : v);
    }
    const type = cell("product_type");
    if (type !== undefined) {
      if (type === CLEAR || !TYPES.includes(type.toLowerCase())) errors.push(`product_type must be one of: ${TYPES.join(", ")}.`);
      else setProduct("product_type", "product_type", type.toLowerCase(), type.toLowerCase());
    }
    const status = cell("status");
    if (status !== undefined) {
      if (status === CLEAR || !STATUSES.includes(status.toLowerCase())) errors.push(`status must be one of: ${STATUSES.join(", ")}.`);
      else setProduct("status", "status", status.toLowerCase(), status.toLowerCase());
    }
    for (const col of ["is_returnable", "is_featured"] as const) {
      const v = cell(col);
      if (v === undefined) continue;
      const b = v === CLEAR ? null : parseBool(v);
      if (b === null) errors.push(`${col} must be yes or no.`);
      else setProduct(col, col, b, String(b));
    }
    const category = cell("category");
    if (category !== undefined) {
      const id = category === CLEAR ? undefined : ctx.categoriesByPath.get(category.toLowerCase().replace(/\s*\/\s*/g, "/"));
      if (!id) errors.push(category === CLEAR ? "category cannot be cleared." : `Unknown category "${category}". Use the web address from the Categories page, like engine-oils or tractor-parts/engine-parts.`);
      else setProduct("category_id", "category", id, id);
    }
    const brand = cell("brand");
    if (brand !== undefined) {
      if (brand === CLEAR) setProduct("brand_id", "brand", null, "-");
      else {
        const ids = ctx.brandsByName.get(brand.toLowerCase());
        if (!ids || ids.length === 0) errors.push(`Unknown brand "${brand}". Add it on the Brands page first.`);
        else if (ids.length > 1) errors.push(`The brand name "${brand}" matches more than one brand.`);
        else setProduct("brand_id", "brand", ids[0], ids[0]);
      }
    }
    if (isNewProduct && group && group.firstLine === line) {
      if (typeof nameCell !== "string") errors.push("A new product needs a product_name.");
      if (category === undefined) errors.push("A new product needs a category.");
    }

    // --- variant fields
    const variant: ImportVariant = { sku };
    const vname = cell("variant_name");
    if (vname !== undefined) {
      if (vname === CLEAR || vname.length > 120) errors.push("variant_name must be 1 to 120 characters.");
      else variant.name = vname;
    }
    const barcode = cell("barcode");
    if (barcode !== undefined) {
      if (barcode === CLEAR) variant.barcode = null;
      else if (!/^[0-9A-Za-z-]{4,64}$/.test(barcode)) errors.push("barcode must be 4 to 64 letters, numbers or dashes.");
      else {
        const owner = ctx.barcodeOwner.get(barcode);
        if (owner && owner !== sku) errors.push(`The barcode ${barcode} already belongs to ${owner}.`);
        else if (seenBarcode.has(barcode)) errors.push(`The barcode ${barcode} is already on line ${seenBarcode.get(barcode)}.`);
        else { seenBarcode.set(barcode, line); variant.barcode = barcode; }
      }
    }
    const money = (col: "regular_price" | "sale_price" | "cost") => {
      const v = cell(col);
      if (v === undefined) return undefined;
      if (v === CLEAR) return col === "regular_price" ? (errors.push("regular_price cannot be cleared."), undefined) : null;
      const paisa = rupeesToPaisa(v);
      if (paisa === null || paisa <= 0) { errors.push(`${col} "${v}" is not an amount. Use 1250 or 1250.50.`); return undefined; }
      return paisa;
    };
    const regular = money("regular_price");
    const sale = money("sale_price");
    const cost = money("cost");
    if (regular !== undefined) variant.regular_price_paisa = regular;
    if (sale !== undefined) variant.sale_price_paisa = sale;
    if (!existing && regular === undefined) errors.push("A new variant needs a regular_price.");
    const effRegular = regular ?? existing?.regularPaisa;
    const effSale = sale === undefined ? existing?.salePaisa ?? null : sale;
    if (effRegular !== undefined && effSale !== null && effSale >= effRegular) errors.push("The sale price must be lower than the regular price.");
    if (cost !== undefined) {
      if (ctx.canSetCost) variant.cost_paisa = cost;
      else warnings.push("cost is ignored: only an administrator can set cost prices.");
    }
    const stock = cell("stock");
    if (stock !== undefined) {
      if (stock === CLEAR || !/^\d{1,7}$/.test(stock) || Number(stock) > 1_000_000) errors.push("stock must be a whole number, 0 or more.");
      else if (existing && Number(stock) < existing.reserved) errors.push(`stock ${stock} is below the ${existing.reserved} already reserved for orders.`);
      else variant.stock = Number(stock);
    }
    for (const col of ["weight_grams", "length_mm", "width_mm", "height_mm"] as const) {
      const v = cell(col);
      if (v === undefined) continue;
      if (v === CLEAR) variant[col] = null;
      else if (!/^\d{1,9}$/.test(v)) errors.push(`${col} must be a whole number.`);
      else variant[col] = Number(v);
    }
    const active = cell("variant_active");
    if (active !== undefined) {
      const b = active === CLEAR ? null : parseBool(active);
      if (b === null) errors.push("variant_active must be yes or no.");
      else variant.is_active = b;
    }

    report.rows.push({ line, sku, productSlug: slug, kind: existing ? "existing" : "new", errors, warnings });
    if (errors.length === 0 && group) group.product.variants.push(variant);
  }

  report.counts.rows = report.rows.length;
  for (const g of groups.values()) {
    if (g.product.variants.length === 0) continue;
    report.products.push(g.product);
    if (g.isNew) report.counts.productsNew++;
    else report.counts.productsUpdated++;
    for (const v of g.product.variants) {
      if (ctx.variantsBySku.has(v.sku)) report.counts.variantsUpdated++;
      else report.counts.variantsNew++;
    }
  }
  report.ok = report.rows.every((r) => r.errors.length === 0);
  return report;
}
