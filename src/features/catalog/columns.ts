// Explicit column lists for every public catalog query. Never `select *`: several tables carry
// column-level restrictions, and a public query must only ever name what the storefront shows.
// Each list is one string literal on one line on purpose: postgrest-js derives the result type from the literal.
// Keep in step with the row types in src/types/database.ts; tests/integration/db/catalog-public.test.ts
// runs each list against the real project.

export const CATEGORY_COLUMNS = "id,parent_id,slug,name,description,icon,image_path,sort_order";
export const TRACTOR_MAKE_COLUMNS = "id,name,sort_order";
export const TRACTOR_MODEL_COLUMNS = "id,make_id,name,year_from,year_to,sort_order";
export const BRAND_COLUMNS = "id,name";
export const PRODUCT_COLUMNS = "id,slug,name,short_description,description,category_id,brand_id,product_type,part_number,oem_part_numbers,specs,viscosity_grade,oil_specifications,origin,warranty_info,packaging_info,is_returnable,seo_title,seo_description,published_at,created_at";
/** Enough for a product card; the long description is only read on the product page. */
export const CARD_PRODUCT_COLUMNS = "id,slug,name,short_description,part_number,product_type,specs";
/** Card columns plus the category, which decides whether the product is public. */
export const CART_PRODUCT_COLUMNS = "id,slug,name,short_description,part_number,product_type,specs,category_id";
export const VARIANT_COLUMNS = "id,product_id,sku,name,option_values,regular_price_paisa,sale_price_paisa,is_default,sort_order";
export const PRODUCT_IMAGE_COLUMNS = "product_id,storage_path,alt_text,sort_order,is_primary";
export const CARD_COMPATIBILITY_COLUMNS = "product_id,tractor_model_id";
export const COMPATIBILITY_COLUMNS = "product_id,tractor_model_id,year_from,year_to,notes";
export const STORE_SETTINGS_COLUMNS = "business_name,tagline,value_statement,phone_primary,phone_secondary,whatsapp_number,email,address_line,city,province,business_hours,announcement_text,cod_enabled,bank_transfer_enabled,delivery_charge_note,return_policy_note";
export const DELIVERY_METHOD_COLUMNS = "id,name,description,sort_order";

/** Every public table with its column list, for the database test and the docs. */
export const PUBLIC_TABLE_COLUMNS = {
  categories: CATEGORY_COLUMNS,
  tractor_makes: TRACTOR_MAKE_COLUMNS,
  tractor_models: TRACTOR_MODEL_COLUMNS,
  brands: BRAND_COLUMNS,
  products: PRODUCT_COLUMNS,
  product_variants: VARIANT_COLUMNS,
  product_images: PRODUCT_IMAGE_COLUMNS,
  product_compatibility: COMPATIBILITY_COLUMNS,
  store_settings: STORE_SETTINGS_COLUMNS,
  delivery_methods: DELIVERY_METHOD_COLUMNS,
} as const;
