// Hand-written subset of the Supabase schema: only the tables, columns and functions the PUBLIC
// storefront reads with the anon key. It is written from supabase/migrations/ because the CLI
// cannot reach the database from the developer's network (see docs/DATABASE.md, "Checking
// src/types/database.ts"). Columns that exist but are never read publicly (costs, wholesale,
// internal fields) are deliberately not listed.
//
// Nothing here is trusted blindly: tests/integration/db/catalog-public.test.ts selects every
// column listed in src/features/catalog/columns.ts from the real project, so a typo or a drifted
// column fails there. Replace this file with generated types when the CLI works.
//
// Money is integer paisa (bigint columns arrive as JSON numbers).

type NoWrites = { Insert: never; Update: never; Relationships: [] };

export type CategoryRow = {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
};

export type TractorMakeRow = { id: string; name: string; sort_order: number; is_active: boolean };

export type TractorModelRow = {
  id: string;
  make_id: string;
  name: string;
  year_from: number | null;
  year_to: number | null;
  sort_order: number;
  is_active: boolean;
};

export type BrandRow = { id: string; name: string; is_active: boolean };

export type ProductRow = {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description: string | null;
  category_id: string;
  brand_id: string | null;
  status: "draft" | "published" | "archived";
  product_type: "part" | "oil" | "filter" | "accessory" | "tool" | "tyre" | "other";
  part_number: string | null;
  oem_part_numbers: string[];
  specs: unknown;
  viscosity_grade: string | null;
  oil_specifications: string[];
  origin: string | null;
  warranty_info: string | null;
  packaging_info: string | null;
  is_returnable: boolean;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at: string;
};

export type VariantRow = {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  option_values: unknown;
  regular_price_paisa: number;
  sale_price_paisa: number | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
};

export type ProductImageRow = {
  product_id: string;
  storage_path: string;
  alt_text: string;
  sort_order: number;
  is_primary: boolean;
};

export type CompatibilityRow = {
  product_id: string;
  tractor_model_id: string;
  year_from: number | null;
  year_to: number | null;
  notes: string | null;
};

export type StoreSettingsRow = {
  id: boolean;
  business_name: string;
  tagline: string;
  value_statement: string;
  phone_primary: string;
  phone_secondary: string | null;
  whatsapp_number: string;
  email: string;
  address_line: string;
  city: string;
  province: string;
  business_hours: string;
  announcement_text: string;
  cod_enabled: boolean;
  bank_transfer_enabled: boolean;
  delivery_charge_note: string;
  return_policy_note: string;
};

export type DeliveryMethodRow = { id: string; name: string; description: string; sort_order: number; is_active: boolean };

export type CatalogSearchRow = {
  product_id: string;
  variant_id: string;
  stock_status: "in_stock" | "low_stock" | "out_of_stock";
  total_count: number;
};

export type Database = {
  public: {
    Tables: {
      categories: { Row: CategoryRow } & NoWrites;
      tractor_makes: { Row: TractorMakeRow } & NoWrites;
      tractor_models: { Row: TractorModelRow } & NoWrites;
      brands: { Row: BrandRow } & NoWrites;
      products: { Row: ProductRow } & NoWrites;
      product_variants: { Row: VariantRow } & NoWrites;
      product_images: { Row: ProductImageRow } & NoWrites;
      product_compatibility: { Row: CompatibilityRow } & NoWrites;
      store_settings: { Row: StoreSettingsRow } & NoWrites;
      delivery_methods: { Row: DeliveryMethodRow } & NoWrites;
    };
    Views: Record<string, never>;
    Functions: {
      catalog_search: {
        Args: {
          p_query?: string | null;
          p_category_id?: string | null;
          p_model_id?: string | null;
          p_in_stock?: boolean;
          p_min_paisa?: number | null;
          p_max_paisa?: number | null;
          p_sort?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: CatalogSearchRow[];
      };
      stock_availability: {
        Args: { p_variant_ids: string[] };
        Returns: { variant_id: string; status: "in_stock" | "low_stock" | "out_of_stock" }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
