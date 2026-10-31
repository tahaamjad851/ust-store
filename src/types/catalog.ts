// Storefront shapes, produced from the Supabase rows by src/features/catalog/mappers.ts.
// Money is always integer paisa (Rs 1 = 100 paisa). Nothing here can carry a cost or wholesale
// price or an exact stock count: those never reach the public pages.

export type CategoryIcon =
  | "tractor"
  | "engine-oil"
  | "lubricant"
  | "hydraulic"
  | "filter"
  | "accessory"
  | "tyre"
  | "electrical"
  | "tools"
  | "engine"
  | "clutch"
  | "brake"
  | "gearbox"
  | "transmission"
  | "steering"
  | "cooling"
  | "fuel"
  | "belt"
  | "bearing"
  | "body";

/** Table: categories (self-referencing: parent_id null = top-level). Only active categories reach the storefront. */
export type Category = {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  icon: CategoryIcon;
  image_path: string | null;
  sort_order: number;
};

/** A tractor model with its make's name: tractor_models joined with tractor_makes. */
export type TractorModel = {
  id: string;
  make: string;
  model: string;
  year_from: number | null;
  year_to: number | null;
};

export type ProductSpec = { label: string; value: string };

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export type ProductImage = {
  /** A same-origin placeholder path or a public Supabase Storage URL. */
  src: string;
  alt: string;
  /** True for the shipped placeholder drawings (no photo uploaded yet). */
  placeholder: boolean;
};

/**
 * What a product card and the cart need. The price, SKU and stock are those of the product's
 * "display variant" (the active default variant, else the first active one); `variant_id` is what
 * goes into the cart.
 */
export type Product = {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  variant_id: string;
  sku: string;
  part_number: string | null;
  /** The price charged: the sale price when there is one, else the regular price. */
  retail_price_paisa: number;
  /** The regular price while a sale price is active, else null. */
  compare_at_price_paisa: number | null;
  stock_status: StockStatus;
  image: ProductImage;
  specs: ProductSpec[];
};

export type ProductVariant = {
  id: string;
  sku: string;
  name: string;
  option_values: Record<string, string>;
  retail_price_paisa: number;
  compare_at_price_paisa: number | null;
  stock_status: StockStatus;
  is_default: boolean;
};

/** A product page: the card data plus everything shown only there. */
export type ProductDetail = Product & {
  description: string;
  brand: string | null;
  origin: string | null;
  viscosity_grade: string | null;
  oil_specifications: string[];
  warranty_info: string | null;
  packaging_info: string | null;
  oem_part_numbers: string[];
  category_id: string;
  variants: ProductVariant[];
  /** Every image, primary first. Never empty: a placeholder stands in when none is uploaded. */
  images: ProductImage[];
  models: TractorModel[];
  seo_title: string | null;
  seo_description: string | null;
};

/** One page of listing results. */
export type ProductPage = {
  items: Product[];
  total: number;
  page: number;
  pageCount: number;
};

/** A cart line as shown to the customer: priced by the server, never by the browser. */
export type CartCatalogItem = {
  variant_id: string;
  product_id: string;
  slug: string;
  name: string;
  /** Variant label such as "5 L", or null for a product without options. */
  variant_name: string | null;
  sku: string;
  retail_price_paisa: number;
  compare_at_price_paisa: number | null;
  stock_status: StockStatus;
  image: ProductImage;
};
