// DEMO seed source only. These are the row shapes the DEMO data in this folder is written in;
// the storefront does not import them (it reads Supabase through src/types/catalog.ts). Kept so
// `npm run db:seed:generate` can keep producing supabase/seed.sql until the demo data is retired.

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


// Components read business details from here; nothing is hardcoded in UI.

export type DeliveryMethod = {
  id: string;
  name: string;
  description: string;
  /** null = fee confirmed after the order is placed */
  fee_paisa: number | null;
};

export type PaymentMethod = {
  id: "cod" | "bank_transfer";
  name: string;
  description: string;
  enabled: boolean;
};

export type StoreSettings = {
  business_name: string;
  tagline: string;
  /** Short neutral line used in the announcement bar, hero and footer. */
  value_statement: string;
  phone_primary: string;
  phone_secondary: string | null;
  /** Digits only, international format without "+", e.g. 923001234567 */
  whatsapp_number: string;
  email: string;
  address_line: string;
  city: string;
  province: string;
  business_hours: string;
  /** null = no free-delivery offer shown */
  free_delivery_threshold_paisa: number | null;
  /** null = return period not shown */
  return_period_days: number | null;
  delivery_methods: DeliveryMethod[];
  payment_methods: PaymentMethod[];
};
