// Turns what the database (through PostgREST) says into a sentence the shop owner can act on.
// The raw message and code are logged on the server by the caller; only these texts reach the browser.

export type DbErrorLike = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };

export type DescribedError = { code: string; message: string };

/** Errors the database raises on purpose, keyed by the text of the exception. */
const RAISED: Record<string, string> = {
  not_authorized: "You are not allowed to do that.",
  product_has_orders: "This product is on an order, so it cannot be deleted. Archive it instead.",
  variant_has_orders: "This variant is on an order, so it cannot be deleted. Turn it off instead.",
  product_in_coupon: "A coupon is limited to this product, so it cannot be deleted. Archive it instead.",
  category_has_children: "This category has subcategories. Move or delete them first.",
  category_has_products: "This category still has products. Move or archive them first.",
  category_in_coupon: "A coupon is limited to this category, so it cannot be deleted. Turn it off instead.",
  category_depth: "Categories have two levels only: a category and its subcategories.",
  brand_has_products: "Products still use this brand. Change their brand first.",
  make_has_models: "This make still has models. Delete the models first.",
  model_has_products: "Products are listed as fitting this model. Remove it from them first.",
  image_limit: "A product can have up to 8 photos. Remove one first.",
  invalid_image_path: "That photo could not be saved.",
  stale_data: "Someone changed this while you were editing. Reload the page and try again.",
  invalid_price: "A price is not valid. Prices must be above zero and a sale price must be below the regular price.",
  invalid_quantity: "That quantity is not valid.",
  insufficient_stock: "That would take the stock below what customers have already reserved.",
  reason_required: "Write a short reason.",
  invalid_movement_type: "That kind of stock movement is not allowed here.",
  variant_not_found: "That variant no longer exists. Reload the page.",
  image_not_found: "That photo no longer exists. Reload the page.",
  cost_requires_admin: "Only an administrator can change cost prices.",
  sku_belongs_to_other_product: "A SKU in the file already belongs to a different product.",
  missing_price: "A new variant needs a price.",
  duplicate_value: "A SKU, barcode or web address in the file is already used.",
  invalid_changes: "There is nothing valid to save.",
  invalid_import: "The import is not valid.",
  // Orders (Phase 4)
  invalid_transition: "An order cannot move to that status from where it is now. Reload the page to see the current status.",
  payment_required: "This order must be paid before it can be dispatched or delivered.",
  order_not_found: "That order no longer exists. Reload the page.",
  order_closed: "This order is already finished, so that cannot be changed.",
  order_paid: "The payment was already collected, so the delivery charge can no longer change.",
  invalid_amount: "Enter an amount from 0 to 100,000.",
  courier_unavailable: "Choose a courier from the list. An admin can add couriers in Settings.",
  invalid_tracking_number: "A tracking number can have letters, numbers, spaces and . _ / # - only.",
  invalid_note: "Write a note of up to 2,000 characters.",
  cod_only: "Only a cash-on-delivery order can be marked as collected.",
  already_paid: "The payment is already marked as collected.",
  not_dispatched: "Mark cash as collected once the order is dispatched.",
};

/** Constraint names -> what is already used. */
const UNIQUE: Record<string, string> = {
  product_variants_sku_key: "That SKU is already used by another variant.",
  product_variants_barcode_key: "That barcode is already used by another variant.",
  product_variants_one_default: "A product can have only one default variant.",
  products_slug_key: "That web address (slug) is already used by another product.",
  categories_parent_slug_key: "That web address (slug) is already used in this category level.",
  brands_slug_key: "That web address (slug) is already used by another brand.",
  tractor_makes_slug_key: "That web address (slug) is already used by another make.",
  tractor_makes_name_key: "A make with that name already exists.",
  tractor_models_make_slug_key: "That web address (slug) is already used by another model of this make.",
  product_compatibility_key: "This product is already listed for that model.",
  couriers_name_key: "A courier with that name already exists.",
};

export function describeDbError(error: DbErrorLike): DescribedError {
  const message = (error.message ?? "").trim();
  const code = error.code ?? "";

  const raised = RAISED[message];
  if (raised) return { code: message, message: raised };

  if (code === "23505") {
    const constraint = /"([^"]+)"/.exec(message)?.[1] ?? "";
    return { code: constraint || "unique", message: UNIQUE[constraint] ?? "That value is already used." };
  }
  if (code === "42501" || /row-level security/i.test(message)) {
    return { code: "forbidden", message: "You are not allowed to do that." };
  }
  if (code === "23503") return { code: "in_use", message: "That is still in use, so it cannot be removed." };
  if (code === "23514") return { code: "check", message: "One of the values is not allowed. Check the lengths and numbers." };
  if (code === "22P02" || code === "22023") return { code: "invalid", message: "One of the values is not valid." };
  if (code === "PGRST116") return { code: "not_found", message: "That item no longer exists, or you are not allowed to change it. Reload the page." };
  if (code === "PGRST301" || /jwt/i.test(message)) {
    return { code: "session", message: "Your session has ended. Sign in again." };
  }
  return { code: code || "unknown", message: "Something went wrong. Please try again." };
}
