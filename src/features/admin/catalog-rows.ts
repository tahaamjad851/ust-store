// Joins the flat catalogue tables (see loadCatalogIndex) into the rows the admin list pages show. Pure,
// so it is unit-tested and runs on the server; the results are plain data for client components.
import type { AdminInventoryRow, AdminProductRow, AdminVariantRow, CatalogIndex, ProductStatus, StockLevel } from "./types";
import { stockLevel } from "./types";

export type VariantListRow = {
  variantId: string;
  sku: string;
  variantName: string;
  isDefault: boolean;
  isActive: boolean;
  regularPaisa: number;
  salePaisa: number | null;
  /** product_variants.updated_at as returned by the database (sent back to detect a stale page). */
  updatedAt: string;
  onHand: number;
  reserved: number;
  lowStockThreshold: number;
  reorderLevel: number | null;
  level: StockLevel;
  productId: string;
  productName: string;
  productSlug: string;
  productStatus: ProductStatus;
  categoryId: string;
  /** The category and its parent (when it is a subcategory): what a category filter matches against. */
  categoryIds: string[];
  categoryName: string;
  brandName: string | null;
  partNumber: string | null;
};

/** Category name as shown to people: "Tractor Parts › Engine Parts" for a subcategory. */
export function categoryLabels(categories: CatalogIndex["categories"]): Map<string, string> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const labels = new Map<string, string>();
  for (const c of categories) {
    const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
    labels.set(c.id, parent ? `${parent.name} › ${c.name}` : c.name);
  }
  return labels;
}

export function buildVariantRows(index: CatalogIndex): VariantListRow[] {
  const products = new Map<string, AdminProductRow>(index.products.map((p) => [p.id, p]));
  const inventory = new Map<string, AdminInventoryRow>(index.inventory.map((i) => [i.variant_id, i]));
  const labels = categoryLabels(index.categories);
  const brands = new Map(index.brands.map((b) => [b.id, b.name]));
  const parentOf = new Map(index.categories.map((c) => [c.id, c.parent_id]));
  const categoryChain = (id: string) => {
    const parent = parentOf.get(id);
    return parent ? [id, parent] : [id];
  };

  const rows: VariantListRow[] = [];
  for (const v of index.variants as AdminVariantRow[]) {
    const p = products.get(v.product_id);
    if (!p) continue;
    const inv = inventory.get(v.id);
    rows.push({
      variantId: v.id,
      sku: v.sku,
      variantName: v.name,
      isDefault: v.is_default,
      isActive: v.is_active,
      regularPaisa: v.regular_price_paisa,
      salePaisa: v.sale_price_paisa,
      updatedAt: v.updated_at,
      onHand: inv?.on_hand ?? 0,
      reserved: inv?.reserved ?? 0,
      lowStockThreshold: inv?.low_stock_threshold ?? 0,
      reorderLevel: inv?.reorder_level ?? null,
      level: stockLevel(inv),
      productId: p.id,
      productName: p.name,
      productSlug: p.slug,
      productStatus: p.status,
      categoryId: p.category_id,
      categoryIds: categoryChain(p.category_id),
      categoryName: labels.get(p.category_id) ?? "",
      brandName: p.brand_id ? (brands.get(p.brand_id) ?? null) : null,
      partNumber: p.part_number,
    });
  }
  // Product name, then the variant order the owner set.
  const order = new Map(index.products.map((p, i) => [p.id, i]));
  return rows.sort((a, b) => (order.get(a.productId) ?? 0) - (order.get(b.productId) ?? 0));
}

export type ProductListRow = {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  categoryId: string;
  categoryIds: string[];
  categoryName: string;
  brandName: string | null;
  partNumber: string | null;
  isFeatured: boolean;
  variantCount: number;
  skus: string[];
  /** Lowest and highest price a customer pays across active variants; null when there are none. */
  priceFromPaisa: number | null;
  priceToPaisa: number | null;
  level: StockLevel;
  updatedAt: string;
};

const LEVEL_RANK: Record<StockLevel, number> = { out: 0, low: 1, ok: 2 };

export function buildProductRows(index: CatalogIndex): ProductListRow[] {
  const variants = buildVariantRows(index);
  const byProduct = new Map<string, VariantListRow[]>();
  for (const v of variants) byProduct.set(v.productId, [...(byProduct.get(v.productId) ?? []), v]);
  const labels = categoryLabels(index.categories);
  const brands = new Map(index.brands.map((b) => [b.id, b.name]));
  const parentOf = new Map(index.categories.map((c) => [c.id, c.parent_id]));
  const categoryChain = (id: string) => {
    const parent = parentOf.get(id);
    return parent ? [id, parent] : [id];
  };

  return index.products.map((p) => {
    const vs = byProduct.get(p.id) ?? [];
    const active = vs.filter((v) => v.isActive);
    const prices = active.map((v) => v.salePaisa ?? v.regularPaisa);
    // The product is as well stocked as its best active variant.
    const level = active.reduce<StockLevel>((best, v) => (LEVEL_RANK[v.level] > LEVEL_RANK[best] ? v.level : best), "out");
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      status: p.status,
      categoryId: p.category_id,
      categoryIds: categoryChain(p.category_id),
      categoryName: labels.get(p.category_id) ?? "",
      brandName: p.brand_id ? (brands.get(p.brand_id) ?? null) : null,
      partNumber: p.part_number,
      isFeatured: p.is_featured,
      variantCount: vs.length,
      skus: vs.map((v) => v.sku),
      priceFromPaisa: prices.length ? Math.min(...prices) : null,
      priceToPaisa: prices.length ? Math.max(...prices) : null,
      level,
      updatedAt: p.updated_at,
    };
  });
}

/** Options for a category <select>: top-level categories with their subcategories right under them. */
export function categoryOptions(categories: CatalogIndex["categories"]): { id: string; label: string; isActive: boolean }[] {
  const labels = categoryLabels(categories);
  const tops = categories.filter((c) => c.parent_id === null);
  const out: { id: string; label: string; isActive: boolean }[] = [];
  for (const top of tops) {
    out.push({ id: top.id, label: labels.get(top.id) ?? top.name, isActive: top.is_active });
    for (const child of categories.filter((c) => c.parent_id === top.id)) {
      out.push({ id: child.id, label: labels.get(child.id) ?? child.name, isActive: child.is_active && top.is_active });
    }
  }
  return out;
}
