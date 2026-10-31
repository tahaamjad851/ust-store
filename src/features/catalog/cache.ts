// Cache tags and lifetimes for the public catalog (Next.js "use cache").
//
// Admin writes (Phase 3B) call revalidateTag(tag, "max") for the tags they touch; order placement
// (Phase 4) must revalidate CATALOG_TAGS.stock. Until then entries also expire by themselves, so a
// change is never older than the lifetimes below. The database stays authoritative for money and
// stock: place_order() re-checks both when an order is placed.

export const CATALOG_TAGS = {
  /** Everything public in the catalog. */
  all: "catalog",
  settings: "catalog-settings",
  categories: "catalog-categories",
  tractors: "catalog-tractors",
  products: "catalog-products",
  /** Anything that shows a stock status. */
  stock: "catalog-stock",
} as const;

/** Rarely edited data: categories, tractor models, store settings. */
export const CACHE_STATIC = { stale: 300, revalidate: 900, expire: 86_400 } as const;

/** Data that carries a stock status or a price: refreshed at least every two minutes. */
export const CACHE_PRODUCTS = { stale: 60, revalidate: 120, expire: 900 } as const;

/**
 * The product cards on the home page. Same server refresh as CACHE_PRODUCTS, but `stale` is long
 * enough (5 minutes) for the home page to be prerendered with them in its static shell; a shorter
 * `stale` would make them a dynamic hole that must sit inside <Suspense>.
 */
export const CACHE_FEATURED = { stale: 300, revalidate: 120, expire: 900 } as const;
