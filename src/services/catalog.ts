// Catalog data access for the PUBLIC storefront, backed by Supabase.
//
//   * Reads use the anon key through row-level security only (createPublicClient): drafts, archived
//     products, inactive variants and categories, costs and inventory are invisible to it. The one
//     SECURITY DEFINER function used, catalog_search(), re-applies the same rules and returns ids
//     and a stock status only.
//   * Every query lists its columns (src/features/catalog/columns.ts). No `select *`.
//   * Results contain retail prices and a stock STATUS. Never costs, wholesale prices or counts.
//   * Cached with "use cache" and tag revalidation (src/features/catalog/cache.ts).
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  BRAND_COLUMNS,
  CARD_COMPATIBILITY_COLUMNS,
  CARD_PRODUCT_COLUMNS,
  CART_PRODUCT_COLUMNS,
  CATEGORY_COLUMNS,
  COMPATIBILITY_COLUMNS,
  DELIVERY_METHOD_COLUMNS,
  PRODUCT_COLUMNS,
  PRODUCT_IMAGE_COLUMNS,
  STORE_SETTINGS_COLUMNS,
  TRACTOR_MAKE_COLUMNS,
  TRACTOR_MODEL_COLUMNS,
  VARIANT_COLUMNS,
} from "@/features/catalog/columns";
import { CACHE_FEATURED, CACHE_PRODUCTS, CACHE_STATIC, CATALOG_TAGS } from "@/features/catalog/cache";
import { PAGE_SIZE, searchArgs, type ListingParams } from "@/features/catalog/listing";
import { buildCategoryTree, withProducts, type CategoryCounts, type CategoryNode } from "@/features/catalog/visibility";
import {
  fitmentLabel,
  mapCartItem,
  mapCategory,
  mapProductCard,
  mapProductDetail,
  mapStoreSettings,
  mapTractorModels,
  pageInfo,
  toStockStatus,
} from "@/features/catalog/mappers";
import { createPublicClient } from "@/lib/supabase/public";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { CatalogSearchRow } from "@/types/database";
import type {
  CartCatalogItem,
  Category,
  Product,
  ProductDetail,
  ProductPage,
  StockStatus,
  TractorModel,
} from "@/types/catalog";
import type { StoreSettings } from "@/types/store";

export type { CartCatalogItem } from "@/types/catalog";
export type { CategoryNode } from "@/features/catalog/visibility";
export type ProductCards = { items: Product[]; fitmentLabels: Record<string, string> };

type Db = ReturnType<typeof createPublicClient>;

/** Throws with the failing step named (the log has it; visitors only ever see the error page). */
function unwrap<T>(res: { data: T | null; error: PostgrestError | null }, what: string): T {
  if (res.error) throw new Error(`catalog: ${what} failed (${res.error.code ?? "no code"}): ${res.error.message}`);
  return (res.data ?? ([] as unknown)) as T;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const baseUrl = () => getSupabasePublicEnv().url;

// ---------------------------------------------------------------------------
// Store settings
// ---------------------------------------------------------------------------

export async function getStoreSettings(): Promise<StoreSettings> {
  "use cache";
  cacheLife(CACHE_STATIC);
  cacheTag(CATALOG_TAGS.all, CATALOG_TAGS.settings);
  const db = createPublicClient();
  const [settings, methods] = await Promise.all([
    db.from("store_settings").select(STORE_SETTINGS_COLUMNS).eq("id", true).maybeSingle(),
    db.from("delivery_methods").select(DELIVERY_METHOD_COLUMNS).eq("is_active", true).order("sort_order"),
  ]);
  if (settings.error) throw new Error(`catalog: store settings failed (${settings.error.code ?? "no code"}): ${settings.error.message}`);
  if (!settings.data) throw new Error("catalog: store_settings has no row");
  return mapStoreSettings(settings.data, unwrap(methods, "delivery methods"));
}

// ---------------------------------------------------------------------------
// Categories (visible = active, with every ancestor active)
// ---------------------------------------------------------------------------

async function getVisibleCategories(): Promise<Category[]> {
  "use cache";
  cacheLife(CACHE_STATIC);
  cacheTag(CATALOG_TAGS.all, CATALOG_TAGS.categories);
  const db = createPublicClient();
  const rows = unwrap(
    await db.from("categories").select(CATEGORY_COLUMNS).eq("is_active", true).order("sort_order").order("name"),
    "categories",
  );
  const byParent = new Map<string | null, Category[]>();
  for (const row of rows) {
    const list = byParent.get(row.parent_id) ?? [];
    list.push(mapCategory(row));
    byParent.set(row.parent_id, list);
  }
  const visible: Category[] = [];
  const walk = (parentId: string | null) => {
    for (const c of byParent.get(parentId) ?? []) {
      visible.push(c);
      walk(c.id);
    }
  };
  walk(null);
  return visible;
}

/**
 * Visible products per category, descendants included. Asked of catalog_search() itself, so a category is hidden
 * exactly when its own page would list nothing. Tagged with the product tags too: publishing the first product of
 * a category must make the category appear at once. If one count cannot be read the category is left out of the
 * result, which shows it (fail open: a hiccup must not make a category vanish from the menu).
 */
async function getCategoryCounts(): Promise<CategoryCounts> {
  "use cache";
  cacheLife(CACHE_FEATURED);
  cacheTag(CATALOG_TAGS.all, CATALOG_TAGS.categories, CATALOG_TAGS.products);
  const categories = await getVisibleCategories();
  const db = createPublicClient();
  const entries = await Promise.all(
    categories.map(async (c): Promise<[string, number] | null> => {
      const res = await db.rpc("catalog_search", { p_category_id: c.id, p_sort: "relevance", p_limit: 1, p_offset: 0 });
      if (res.error) {
        console.error(`catalog: product count of a category failed (${res.error.code ?? "no code"}): ${res.error.message}`);
        return null;
      }
      return [c.id, res.data && res.data.length > 0 ? Number(res.data[0].total_count) : 0];
    }),
  );
  return Object.fromEntries(entries.flatMap((e) => (e ? [e] : [])));
}

/** The categories the public shop lists: those with at least one product, each with its non-empty subcategories. */
export async function getCategoryTree(): Promise<CategoryNode[]> {
  const [all, counts] = await Promise.all([getVisibleCategories(), getCategoryCounts()]);
  return buildCategoryTree(all, counts);
}

export async function getCategoryBySlug(slug: string, parentId: string | null = null): Promise<Category | null> {
  const all = await getVisibleCategories();
  return all.find((c) => c.slug === slug && c.parent_id === parentId) ?? null;
}

/** Subcategories of a category that have products. */
export async function getChildCategories(parentId: string): Promise<Category[]> {
  const [all, counts] = await Promise.all([getVisibleCategories(), getCategoryCounts()]);
  return withProducts(all.filter((c) => c.parent_id === parentId), counts);
}

/**
 * Names of the active brands that have at least one published product, for the home page. Brands have no logo
 * column, so these are names only. Empty when no product has a brand.
 */
export async function getStockedBrands(): Promise<string[]> {
  "use cache";
  cacheLife(CACHE_FEATURED);
  cacheTag(CATALOG_TAGS.all, CATALOG_TAGS.categories, CATALOG_TAGS.products);
  const db = createPublicClient();
  const ids = new Set<string>();
  const PAGE = 1000;
  for (let page = 0; page < 5; page++) {
    const rows = unwrap(
      await db.from("products").select("brand_id").eq("status", "published").not("brand_id", "is", null).order("id").range(page * PAGE, page * PAGE + PAGE - 1),
      "brands in use",
    );
    for (const row of rows) if (row.brand_id) ids.add(row.brand_id);
    if (rows.length < PAGE) break;
  }
  if (ids.size === 0) return [];
  const brands = unwrap(
    await db.from("brands").select(BRAND_COLUMNS).in("id", [...ids].slice(0, 200)).eq("is_active", true).order("name"),
    "brands",
  );
  return brands.map((b) => b.name);
}

export async function getCategoryById(id: string): Promise<Category | null> {
  return (await getVisibleCategories()).find((c) => c.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Tractor makes and models
// ---------------------------------------------------------------------------

export async function getTractorModels(): Promise<TractorModel[]> {
  "use cache";
  cacheLife(CACHE_STATIC);
  cacheTag(CATALOG_TAGS.all, CATALOG_TAGS.tractors);
  const db = createPublicClient();
  const [makes, models] = await Promise.all([
    db.from("tractor_makes").select(TRACTOR_MAKE_COLUMNS).eq("is_active", true),
    db.from("tractor_models").select(TRACTOR_MODEL_COLUMNS).eq("is_active", true),
  ]);
  return mapTractorModels(unwrap(makes, "tractor makes"), unwrap(models, "tractor models"));
}

// ---------------------------------------------------------------------------
// Product cards (listing, home page, related products)
// ---------------------------------------------------------------------------

async function search(db: Db, params: ListingParams, categoryId: string | null, page: number): Promise<CatalogSearchRow[]> {
  return unwrap(await db.rpc("catalog_search", searchArgs(params, categoryId, page)), "product search");
}

/** Turns search hits into cards, in the order of the hits. A product that vanished meanwhile is skipped. */
async function loadCards(db: Db, hits: CatalogSearchRow[]): Promise<ProductCards> {
  if (hits.length === 0) return { items: [], fitmentLabels: {} };
  const productIds = hits.map((h) => h.product_id);
  const variantIds = hits.map((h) => h.variant_id);
  const [products, variants, images, compat, models] = await Promise.all([
    db.from("products").select(CARD_PRODUCT_COLUMNS).in("id", productIds).eq("status", "published"),
    db.from("product_variants").select(VARIANT_COLUMNS).in("id", variantIds).eq("is_active", true),
    db.from("product_images").select(PRODUCT_IMAGE_COLUMNS).in("product_id", productIds),
    db.from("product_compatibility").select(CARD_COMPATIBILITY_COLUMNS).in("product_id", productIds),
    getTractorModels(),
  ]);
  const productById = new Map(unwrap(products, "products").map((p) => [p.id, p]));
  const variantById = new Map(unwrap(variants, "variants").map((v) => [v.id, v]));
  const imageRows = unwrap(images, "product images");
  const compatRows = unwrap(compat, "compatibility");
  const modelById = new Map(models.map((m) => [m.id, m]));

  const items: Product[] = [];
  const fitmentLabels: Record<string, string> = {};
  for (const hit of hits) {
    const product = productById.get(hit.product_id);
    const variant = variantById.get(hit.variant_id);
    if (!product || !variant) continue;
    items.push(
      mapProductCard({
        product,
        variant,
        stock_status: toStockStatus(hit.stock_status),
        images: imageRows.filter((i) => i.product_id === product.id),
        baseUrl: baseUrl(),
      }),
    );
    const label = fitmentLabel(compatRows.filter((c) => c.product_id === product.id), modelById);
    if (label) fitmentLabels[product.id] = label;
  }
  return { items, fitmentLabels };
}

async function loadProductPage(params: ListingParams, categoryId: string | null): Promise<ProductPage & { fitmentLabels: Record<string, string> }> {
  const db = createPublicClient();
  let page = params.page;
  let hits = await search(db, params, categoryId, page);
  // A page past the end has no rows (and so no total): fall back to the first page.
  if (hits.length === 0 && page > 1) {
    page = 1;
    hits = await search(db, params, categoryId, page);
  }
  const total = hits.length > 0 ? Number(hits[0].total_count) : 0;
  const { items, fitmentLabels } = await loadCards(db, hits);
  return { items, fitmentLabels, total, ...pageInfo(total, page, PAGE_SIZE) };
}

async function getCachedProductPage(params: ListingParams, categoryId: string | null) {
  "use cache";
  cacheLife(CACHE_PRODUCTS);
  cacheTag(CATALOG_TAGS.all, CATALOG_TAGS.products, CATALOG_TAGS.stock);
  return loadProductPage(params, categoryId);
}

/**
 * One page of the shop or of a category (a category includes its subcategories). Search, filters,
 * sorting and paging run in the database. Only the common, bounded shapes are cached: no free text,
 * no price range (both are unbounded in what a visitor can type), a model that really exists, and
 * one of the first pages. Everything else is answered straight from the database, so a script
 * looping over made-up URLs cannot fill the cache with junk entries and push real ones out.
 */
export async function getProductPage(
  params: ListingParams,
  categoryId: string | null = null,
): Promise<ProductPage & { fitmentLabels: Record<string, string> }> {
  const cacheable =
    !params.q &&
    params.min === undefined &&
    params.max === undefined &&
    params.page <= MAX_CACHED_PAGE &&
    (params.model === undefined || (await getTractorModels()).some((m) => m.id === params.model));
  return cacheable ? getCachedProductPage(params, categoryId) : loadProductPage(params, categoryId);
}

const MAX_CACHED_PAGE = 10;

/** The first products of a category in the shop's default order (featured first, then newest). */
export async function getFeaturedProducts(categoryId: string, limit: number): Promise<ProductCards> {
  "use cache";
  cacheLife(CACHE_FEATURED);
  cacheTag(CATALOG_TAGS.all, CATALOG_TAGS.products, CATALOG_TAGS.stock);
  const db = createPublicClient();
  const hits = unwrap(
    await db.rpc("catalog_search", {
      p_category_id: categoryId,
      p_sort: "relevance",
      p_limit: Math.min(Math.max(1, limit), 48),
      p_offset: 0,
    }),
    "featured products",
  );
  return loadCards(db, hits);
}

export async function getRelatedProducts(product: { id: string; category_id: string }, limit = 4): Promise<ProductCards> {
  const { items, fitmentLabels } = await getFeaturedProducts(product.category_id, limit + 1);
  return { items: items.filter((p) => p.id !== product.id).slice(0, limit), fitmentLabels };
}

// ---------------------------------------------------------------------------
// Product page
// ---------------------------------------------------------------------------

/**
 * A published product with at least one active variant in a visible category, or null. A malformed
 * slug is refused here, before the cached lookup, so made-up URLs never become cache keys.
 */
export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  if (!SLUG.test(slug) || slug.length > 120) return null;
  return loadProductBySlug(slug);
}

async function loadProductBySlug(slug: string): Promise<ProductDetail | null> {
  "use cache";
  cacheLife(CACHE_PRODUCTS);
  cacheTag(CATALOG_TAGS.all, CATALOG_TAGS.products, CATALOG_TAGS.stock);

  const db = createPublicClient();
  const product = unwrap(
    await db.from("products").select(PRODUCT_COLUMNS).eq("slug", slug).eq("status", "published").limit(1),
    "product",
  )[0];
  if (!product) return null;
  // Same rule as catalog_search(): a product in a deactivated category is not public.
  if (!(await getCategoryById(product.category_id))) return null;

  const [variants, images, compat, brand, models] = await Promise.all([
    db.from("product_variants").select(VARIANT_COLUMNS).eq("product_id", product.id).eq("is_active", true),
    db.from("product_images").select(PRODUCT_IMAGE_COLUMNS).eq("product_id", product.id),
    db.from("product_compatibility").select(COMPATIBILITY_COLUMNS).eq("product_id", product.id),
    product.brand_id
      ? db.from("brands").select(BRAND_COLUMNS).eq("id", product.brand_id).eq("is_active", true).limit(1)
      : Promise.resolve({ data: [], error: null }),
    getTractorModels(),
  ]);
  const variantRows = unwrap(variants, "variants");
  if (variantRows.length === 0) return null;
  const stock = await stockStatuses(db, variantRows.map((v) => v.id));
  const modelById = new Map(models.map((m) => [m.id, m]));

  return mapProductDetail({
    product,
    variants: variantRows,
    stock,
    images: unwrap(images, "product images"),
    brand: unwrap(brand, "brand")[0] ?? null,
    models: unwrap(compat, "compatibility").flatMap((c) => modelById.get(c.tractor_model_id) ?? []),
    baseUrl: baseUrl(),
  });
}

async function stockStatuses(db: Db, variantIds: string[]): Promise<Map<string, StockStatus>> {
  if (variantIds.length === 0) return new Map();
  const rows = unwrap(await db.rpc("stock_availability", { p_variant_ids: variantIds }), "stock status");
  return new Map(rows.map((r) => [r.variant_id, toStockStatus(r.status)]));
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export const MAX_CART_LOOKUP = 50;

/**
 * Price, name, image and stock status for the variants in a browser's cart. The browser only
 * stores variant ids and quantities; everything shown comes from here. Variants that are not for
 * sale (unknown, inactive, product not published or category deactivated) are simply absent.
 * Not cached: the id set is the visitor's own.
 */
export async function getCartItems(variantIds: string[]): Promise<CartCatalogItem[]> {
  const ids = [...new Set(variantIds)].slice(0, MAX_CART_LOOKUP);
  if (ids.length === 0) return [];
  const db = createPublicClient();
  const variants = unwrap(await db.from("product_variants").select(VARIANT_COLUMNS).in("id", ids).eq("is_active", true), "cart variants");
  if (variants.length === 0) return [];
  const productIds = [...new Set(variants.map((v) => v.product_id))];
  const [products, images, stock] = await Promise.all([
    db.from("products").select(CART_PRODUCT_COLUMNS).in("id", productIds).eq("status", "published"),
    db.from("product_images").select(PRODUCT_IMAGE_COLUMNS).in("product_id", productIds),
    stockStatuses(db, variants.map((v) => v.id)),
  ]);
  const productById = new Map(unwrap(products, "cart products").map((p) => [p.id, p]));
  const imageRows = unwrap(images, "cart images");
  const visibleCategories = new Set((await getVisibleCategories()).map((c) => c.id));

  const byVariant = new Map<string, CartCatalogItem>();
  for (const variant of variants) {
    const product = productById.get(variant.product_id);
    if (!product || !visibleCategories.has(product.category_id)) continue;
    byVariant.set(
      variant.id,
      mapCartItem({
        variant,
        product,
        stock_status: toStockStatus(stock.get(variant.id)),
        images: imageRows.filter((i) => i.product_id === product.id),
        baseUrl: baseUrl(),
      }),
    );
  }
  return ids.flatMap((id) => byVariant.get(id) ?? []);
}

// ---------------------------------------------------------------------------
// Static params (build time)
// ---------------------------------------------------------------------------

/** Slugs of the newest published products, to prerender. Others render on their first visit. */
export async function getProductSlugsForStaticParams(limit = 48): Promise<string[]> {
  const db = createPublicClient();
  const hits = unwrap(
    await db.rpc("catalog_search", { p_sort: "newest", p_limit: Math.min(Math.max(1, limit), 48), p_offset: 0 }),
    "static product slugs",
  );
  if (hits.length === 0) return [];
  const rows = unwrap(await db.from("products").select("id,slug").in("id", hits.map((h) => h.product_id)), "static product slugs");
  const slugById = new Map(rows.map((r) => [r.id, r.slug]));
  return hits.flatMap((h) => slugById.get(h.product_id) ?? []);
}
