// Cache tags and lifetimes for the public catalog (Next.js "use cache").
//
// Admin writes call updateTag(tag) for the tags they touch (PUBLIC_TAGS below, through runAdminAction), and order
// placement expires CATALOG_TAGS.stock and .products. Entries also expire by themselves, so a change is never older
// than the lifetimes below. The database stays authoritative for money and
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

/**
 * What an admin change expires on the public site, by area (the `revalidate` option of runAdminAction). A change to
 * a category, brand or tractor model decides what is visible, so it also expires the product listings; stock and
 * price changes expire the product caches (every cached product entry carries both tags). Every cached reader in
 * services/catalog.ts must carry CATALOG_TAGS.all plus at least one tag listed here
 * (tests/unit/cache-invalidation.test.ts checks it).
 */
export const PUBLIC_TAGS = {
  categories: [CATALOG_TAGS.categories, CATALOG_TAGS.products],
  tractors: [CATALOG_TAGS.tractors, CATALOG_TAGS.products],
  products: [CATALOG_TAGS.products, CATALOG_TAGS.stock],
  stock: [CATALOG_TAGS.stock, CATALOG_TAGS.products],
  settings: [CATALOG_TAGS.settings],
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
