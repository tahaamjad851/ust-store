// What a customer is told when place_order() refuses. The database raises stable codes (docs/DATABASE.md); this turns
// them into plain sentences and, where one input is to blame, puts the message on that field. Details such as the
// SKU or the quantity left stay out of the message: customers never see stock counts.
import type { DbErrorLike } from "@/features/admin/db-errors";

export type PlaceOrderFailure = {
  /** The database's own code, or "unexpected". */
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  /** The idempotency key can no longer be used for this form: the browser must make a new one. */
  newKey?: boolean;
};

export const GENERIC_ORDER_ERROR = "We could not place your order. Please try again, or call us and we will take it by phone.";

const FIELD: Record<string, { field: string; message: string }> = {
  invalid_phone: { field: "phone", message: "Enter a Pakistani mobile number, e.g. 0300 1234567" },
  invalid_name: { field: "full_name", message: "Enter your name" },
  invalid_email: { field: "email", message: "Enter a valid email or leave it empty" },
  invalid_company: { field: "company_name", message: "Keep this under 120 characters" },
  invalid_notes: { field: "notes", message: "Keep this under 500 characters" },
  invalid_address: { field: "address", message: "Check your address, city and province" },
  delivery_method_unavailable: { field: "delivery_method_id", message: "That delivery method is not available. Choose another." },
  payment_method_unavailable: { field: "payment_method", message: "That payment method is not available. Choose another." },
};

const MESSAGE: Record<string, string> = {
  insufficient_stock: "Some items are no longer available in the quantity you chose. Please check your cart and try again.",
  item_unavailable: "An item in your cart is no longer for sale. Please check your cart and try again.",
  invalid_items: "Something is wrong with the items in your cart. Please check your cart and try again.",
  guest_checkout_disabled: "Please sign in to place an order.",
  not_authenticated: "Please sign in again to place your order.",
  account_disabled: "This account has been disabled. Please contact us.",
  too_many_open_orders: "You already have several orders waiting to be processed. We will call you about them, or call us to place another.",
  coupon_invalid: GENERIC_ORDER_ERROR,
};

export function describePlaceOrderError(error: DbErrorLike): PlaceOrderFailure {
  const code = (error.message ?? "").trim();
  const field = FIELD[code];
  if (field) return { code, message: "Please check the highlighted field.", fieldErrors: { [field.field]: field.message } };
  if (code === "idempotency_key_conflict") {
    return { code, message: "This form was already used for a different order. Please check your details and try again.", newKey: true };
  }
  const message = MESSAGE[code];
  if (message) return { code, message };
  return { code: "unexpected", message: GENERIC_ORDER_ERROR };
}
