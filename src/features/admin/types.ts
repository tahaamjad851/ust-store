// Shapes shared by the admin server actions, queries and client components. No server-only imports here.

/** What an admin server action returns. Actions that succeed by redirecting never return. */
export type AdminResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; message?: string; fieldErrors?: Record<string, string>; code?: string; detail?: unknown };

export type ProductStatus = "draft" | "published" | "archived";
export type ProductType = "part" | "oil" | "filter" | "accessory" | "tool" | "tyre" | "other";

export type AdminCategory = {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
};

export type AdminBrand = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

export type AdminMake = { id: string; slug: string; name: string; sort_order: number; is_active: boolean };

export type AdminModel = {
  id: string;
  make_id: string;
  slug: string;
  name: string;
  year_from: number | null;
  year_to: number | null;
  sort_order: number;
  is_active: boolean;
};

export type AdminProductRow = {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  product_type: ProductType;
  category_id: string;
  brand_id: string | null;
  part_number: string | null;
  is_featured: boolean;
  updated_at: string;
};

export type AdminVariantRow = {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  regular_price_paisa: number;
  sale_price_paisa: number | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  updated_at: string;
};

export type AdminInventoryRow = {
  variant_id: string;
  on_hand: number;
  reserved: number;
  low_stock_threshold: number;
  reorder_level: number | null;
};

export type CatalogIndex = {
  categories: AdminCategory[];
  brands: AdminBrand[];
  products: AdminProductRow[];
  variants: AdminVariantRow[];
  inventory: AdminInventoryRow[];
};

export type StockLevel = "out" | "low" | "ok";

export function stockLevel(inv: Pick<AdminInventoryRow, "on_hand" | "reserved" | "low_stock_threshold"> | undefined): StockLevel {
  if (!inv) return "out";
  const available = inv.on_hand - inv.reserved;
  if (available <= 0) return "out";
  return available <= inv.low_stock_threshold ? "low" : "ok";
}

export type AdminImage = {
  id: string;
  product_id: string;
  storage_path: string;
  alt_text: string;
  sort_order: number;
  is_primary: boolean;
};

export type AdminCompatibility = {
  id: string;
  product_id: string;
  tractor_model_id: string;
  year_from: number | null;
  year_to: number | null;
  notes: string | null;
};

export type AdminProductDetail = {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description: string | null;
  category_id: string;
  brand_id: string | null;
  product_type: ProductType;
  part_number: string | null;
  oem_part_numbers: string[];
  specs: { label: string; value: string }[];
  viscosity_grade: string | null;
  oil_specifications: string[];
  origin: string | null;
  warranty_info: string | null;
  packaging_info: string | null;
  is_returnable: boolean;
  is_featured: boolean;
  status: ProductStatus;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminVariantDetail = AdminVariantRow & {
  barcode: string | null;
  weight_grams: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  /** null for staff: costs are visible to admins only. */
  cost_paisa: number | null;
  on_hand: number;
  reserved: number;
};

export type PriceChangeRow = {
  id: number;
  variant_id: string;
  sku: string;
  product_name: string;
  old_regular_paisa: number;
  new_regular_paisa: number;
  old_sale_paisa: number | null;
  new_sale_paisa: number | null;
  changed_by: string | null;
  changed_by_name: string | null;
  source: "direct" | "daily_prices" | "csv_import";
  batch_id: string | null;
  created_at: string;
};

export type StockMovementRow = {
  id: number;
  movement_type: string;
  on_hand_delta: number;
  reserved_delta: number;
  on_hand_after: number;
  reserved_after: number;
  reason: string | null;
  actor_name: string | null;
  order_id: string | null;
  created_at: string;
};

export type AdminSettings = {
  business_name: string;
  tagline: string;
  value_statement: string;
  announcement_text: string;
  phone_primary: string;
  phone_secondary: string | null;
  whatsapp_number: string;
  email: string;
  address_line: string;
  city: string;
  province: string;
  business_hours: string;
  delivery_charge_note: string;
  return_policy_note: string;
  price_change_alert_percent: number;
};

export type AdminCourier = { id: string; name: string; sort_order: number; is_active: boolean };
