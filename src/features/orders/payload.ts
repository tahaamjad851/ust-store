// Turns a validated checkout into the arguments of place_order() / place_order_as_guest(). Pure, so it can be
// tested without a database. The arguments hold what the customer chose (ids, quantities, text) and no money.
import { ADDRESS_TYPES, normalisePkMobile, type CartLines, type CheckoutInput } from "@/lib/validation/checkout";

export const CALL_TO_CONFIRM_NOTE = "Customer asked for a call to confirm the parts fit before dispatch.";

export type PlaceOrderArgs = {
  p_idempotency_key: string;
  p_items: { variant_id: string; quantity: number }[];
  p_customer: { full_name: string; phone: string; email: string | null; company_name: string | null };
  p_shipping_address: { line1: string; area: string | null; city: string; province: string; instructions: string | null };
  p_delivery_method_id: string;
  p_payment_method: CheckoutInput["payment_method"];
  p_coupon_code: null;
  p_customer_notes: string | null;
};

const blankToNull = (s: string) => (s.trim() === "" ? null : s.trim());

export function buildPlaceOrderArgs(idempotencyKey: string, items: CartLines, form: CheckoutInput): PlaceOrderArgs {
  const addressType = ADDRESS_TYPES.find((t) => t.value === form.address_type)?.label;
  const instructions = [
    addressType ? `Address type: ${addressType}` : null,
    blankToNull(form.cargo_terminal) ? `Preferred cargo terminal: ${form.cargo_terminal.trim()}` : null,
  ]
    .filter(Boolean)
    .join(". ");
  const notes = [blankToNull(form.notes), form.call_to_confirm ? CALL_TO_CONFIRM_NOTE : null].filter(Boolean).join("\n");

  return {
    p_idempotency_key: idempotencyKey,
    // Only the id and the quantity of each line. Anything else the browser might have sent is dropped here.
    p_items: items.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity })),
    p_customer: {
      full_name: form.full_name.trim(),
      phone: normalisePkMobile(form.phone),
      email: blankToNull(form.email)?.toLowerCase() ?? null,
      company_name: blankToNull(form.company_name),
    },
    p_shipping_address: {
      line1: form.address.trim(),
      area: blankToNull(form.landmark),
      city: form.city.trim(),
      province: form.province,
      instructions: blankToNull(instructions),
    },
    p_delivery_method_id: form.delivery_method_id,
    p_payment_method: form.payment_method,
    p_coupon_code: null,
    p_customer_notes: blankToNull(notes),
  };
}
