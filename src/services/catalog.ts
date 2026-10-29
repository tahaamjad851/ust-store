// Catalog data access. Currently backed by the DEMO mock layer in lib/mock; replace the
// bodies with Supabase queries later and keep the signatures, so pages don't change.
import "server-only";
import { DEMO_CATEGORIES } from "@/lib/mock/categories";
import { DEMO_PRODUCTS } from "@/lib/mock/products";
import { DEMO_STORE_SETTINGS } from "@/lib/mock/store-settings";
import { DEMO_PRODUCT_FITMENTS, DEMO_TRACTOR_MODELS } from "@/lib/mock/tractors";
import type { Category, Product, TractorModel } from "@/types/catalog";
import type { StoreSettings } from "@/types/store";

export type CategoryNode = Category & { children: Category[] };

const bySort = (a: Category, b: Category) => a.sort_order - b.sort_order;

export async function getStoreSettings(): Promise<StoreSettings> {
  return DEMO_STORE_SETTINGS;
}

export async function getCategoryTree(): Promise<CategoryNode[]> {
  const active = DEMO_CATEGORIES.filter((c) => c.is_active);
  return active
    .filter((c) => c.parent_id === null)
    .sort(bySort)
    .map((c) => ({ ...c, children: active.filter((s) => s.parent_id === c.id).sort(bySort) }));
}

export async function getCategoryBySlug(slug: string, parentId: string | null = null): Promise<Category | null> {
  return DEMO_CATEGORIES.find((c) => c.is_active && c.slug === slug && c.parent_id === parentId) ?? null;
}

export async function getChildCategories(parentId: string): Promise<Category[]> {
  return DEMO_CATEGORIES.filter((c) => c.is_active && c.parent_id === parentId).sort(bySort);
}

export async function getProducts(): Promise<Product[]> {
  return DEMO_PRODUCTS.filter((p) => p.is_active);
}

/** Products in a category and, for a top-level category, in all of its subcategories. */
export async function getProductsInCategory(categoryId: string): Promise<Product[]> {
  const ids = new Set([categoryId, ...DEMO_CATEGORIES.filter((c) => c.parent_id === categoryId).map((c) => c.id)]);
  return DEMO_PRODUCTS.filter((p) => p.is_active && ids.has(p.category_id));
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  return DEMO_PRODUCTS.find((p) => p.is_active && p.slug === slug) ?? null;
}

export async function getCategoryById(id: string): Promise<Category | null> {
  return DEMO_CATEGORIES.find((c) => c.id === id) ?? null;
}

export async function getTractorModels(): Promise<TractorModel[]> {
  return DEMO_TRACTOR_MODELS;
}

export async function getFitmentChecker() {
  const pairs = new Set(DEMO_PRODUCT_FITMENTS.map((f) => `${f.product_id}|${f.tractor_model_id}`));
  return (productId: string, modelId: string) => pairs.has(`${productId}|${modelId}`);
}

export async function getModelsForProduct(productId: string): Promise<TractorModel[]> {
  const ids = new Set(DEMO_PRODUCT_FITMENTS.filter((f) => f.product_id === productId).map((f) => f.tractor_model_id));
  return DEMO_TRACTOR_MODELS.filter((m) => ids.has(m.id));
}

/** Map of product id -> first fitting model label, for the fitment badge on product cards. */
export async function getFitmentLabels(): Promise<Record<string, string>> {
  const labels: Record<string, string> = {};
  for (const f of DEMO_PRODUCT_FITMENTS) {
    if (labels[f.product_id]) continue;
    const model = DEMO_TRACTOR_MODELS.find((m) => m.id === f.tractor_model_id);
    if (model) labels[f.product_id] = `Fits ${model.model}`;
  }
  return labels;
}

export type CartCatalogItem = Pick<
  Product,
  | "id"
  | "slug"
  | "name"
  | "sku"
  | "retail_price_paisa"
  | "compare_at_price_paisa"
  | "stock_qty"
  | "low_stock_threshold"
  | "image_paths"
>;

/** Slim retail-priced snapshot for the DEMO client cart. Never add wholesale prices here: this is sent to every browser. */
export async function getCartCatalog(): Promise<CartCatalogItem[]> {
  return DEMO_PRODUCTS.filter((p) => p.is_active).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    sku: p.sku,
    retail_price_paisa: p.retail_price_paisa,
    compare_at_price_paisa: p.compare_at_price_paisa,
    stock_qty: p.stock_qty,
    low_stock_threshold: p.low_stock_threshold,
    image_paths: p.image_paths.slice(0, 1),
  }));
}

export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  return DEMO_PRODUCTS.filter((p) => p.is_active && p.id !== product.id && p.category_id === product.category_id).slice(0, limit);
}
