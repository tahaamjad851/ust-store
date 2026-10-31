// Builds the export file: one row per variant, in the same columns the import reads, so an exported file
// can be edited and imported back.
import { paisaToRupeesInput } from "@/lib/pricing/money";
import { CSV_COLUMNS } from "./columns";
import { toCsv } from "./parse";
import type { ExportData } from "@/features/admin/queries";

const yesNo = (b: boolean) => (b ? "yes" : "no");
const num = (n: number | null) => (n === null ? "" : String(n));

/** `includeCosts` is for administrators; staff never get a cost column filled in (the database gives them none). */
export function buildExportCsv(data: ExportData, includeCosts: boolean): string {
  const catById = new Map(data.categories.map((c) => [c.id, c]));
  const path = (id: string) => {
    const c = catById.get(id);
    const parent = c?.parent_id ? catById.get(c.parent_id) : undefined;
    return c ? (parent ? `${parent.slug}/${c.slug}` : c.slug) : "";
  };
  const brandName = new Map(data.brands.map((b) => [b.id, b.name]));
  const byProduct = new Map<string, ExportData["variants"]>();
  for (const v of data.variants) byProduct.set(v.product_id, [...(byProduct.get(v.product_id) ?? []), v]);

  const rows: string[][] = [[...CSV_COLUMNS]];
  for (const p of data.products) {
    for (const v of byProduct.get(p.id) ?? []) {
      const cost = includeCosts ? data.costs.get(v.id) : undefined;
      const cells: Record<(typeof CSV_COLUMNS)[number], string> = {
        sku: v.sku,
        product_slug: p.slug,
        product_name: p.name,
        category: path(p.category_id),
        brand: p.brand_id ? (brandName.get(p.brand_id) ?? "") : "",
        product_type: p.product_type,
        status: p.status,
        short_description: p.short_description ?? "",
        description: p.description ?? "",
        part_number: p.part_number ?? "",
        oem_part_numbers: p.oem_part_numbers.join("|"),
        viscosity_grade: p.viscosity_grade ?? "",
        oil_specifications: p.oil_specifications.join("|"),
        origin: p.origin ?? "",
        warranty_info: p.warranty_info ?? "",
        packaging_info: p.packaging_info ?? "",
        is_returnable: yesNo(p.is_returnable),
        is_featured: yesNo(p.is_featured),
        seo_title: p.seo_title ?? "",
        seo_description: p.seo_description ?? "",
        variant_name: v.name,
        barcode: v.barcode ?? "",
        regular_price: paisaToRupeesInput(v.regular_price_paisa),
        sale_price: v.sale_price_paisa === null ? "" : paisaToRupeesInput(v.sale_price_paisa),
        cost: cost === undefined ? "" : paisaToRupeesInput(cost),
        stock: String(data.stock.get(v.id) ?? 0),
        weight_grams: num(v.weight_grams),
        length_mm: num(v.length_mm),
        width_mm: num(v.width_mm),
        height_mm: num(v.height_mm),
        variant_active: yesNo(v.is_active),
      };
      rows.push(CSV_COLUMNS.map((c) => cells[c]));
    }
  }
  // The byte-order mark makes Excel read the file as UTF-8 (Urdu text, "Rs", and so on).
  return "﻿" + toCsv(rows);
}

/** A header and one example row. */
export function buildTemplateCsv(): string {
  const example: Record<string, string> = {
    sku: "OIL-15W40-5L", product_slug: "engine-oil-15w40", product_name: "Engine Oil 15W-40", category: "engine-oils", product_type: "oil",
    status: "draft", variant_name: "5 L", regular_price: "4500", stock: "10",
  };
  return "﻿" + toCsv([[...CSV_COLUMNS], CSV_COLUMNS.map((c) => example[c] ?? "")]);
}
