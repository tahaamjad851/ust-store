// Row shapes for the planned catalog tables. Field names match the Postgres columns
// (snake_case) so the mock layer in lib/mock can be swapped for Supabase queries.
// Money is always integer paisa (Rs 1 = 100 paisa).

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

/** Table: categories (self-referencing: parent_id null = top-level) */
export type Category = {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  icon: CategoryIcon;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
};

/** Table: tractor_models */
export type TractorModel = {
  id: string;
  make: string;
  model: string;
  year_from: number;
  year_to: number | null;
};

/** Table: product_fitments (product_id, tractor_model_id) */
export type ProductFitment = {
  product_id: string;
  tractor_model_id: string;
};

export type ProductSpec = { label: string; value: string };

/** Table: products */
export type Product = {
  id: string;
  category_id: string;
  slug: string;
  sku: string;
  oem_ref: string | null;
  name: string;
  short_description: string;
  description: string;
  brand: string | null;
  origin: string | null;
  retail_price_paisa: number;
  compare_at_price_paisa: number | null;
  stock_qty: number;
  low_stock_threshold: number;
  specs: ProductSpec[];
  /** Paths under public/ for now; Supabase Storage object paths later. */
  image_paths: string[];
  is_active: boolean;
  created_at: string;
};

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";
