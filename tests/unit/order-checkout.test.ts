import { describe, expect, it } from "vitest";
import { buildPlaceOrderArgs, CALL_TO_CONFIRM_NOTE } from "@/features/orders/payload";
import { describePlaceOrderError, GENERIC_ORDER_ERROR } from "@/features/orders/place-order-errors";
import { cartLinesSchema, checkoutSchema, placeOrderInputSchema, type CheckoutInput } from "@/lib/validation/checkout";

const VARIANT_A = "11111111-1111-4111-8111-111111111111";
const VARIANT_B = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";

const form: CheckoutInput = {
  phone: "+92 300 1234567",
  full_name: "  Ali Khan ",
  email: "Ali@Example.com",
  company_name: "",
  address_type: "farm",
  province: "Punjab",
  city: " Khanpur ",
  address: "Chak 12, near the canal",
  landmark: "Behind the school",
  cargo_terminal: "",
  delivery_method_id: "courier",
  payment_method: "cod",
  call_to_confirm: true,
  notes: "Massey 385",
};

describe("checkout schema", () => {
  it("accepts a complete form", () => {
    expect(checkoutSchema.safeParse(form).success).toBe(true);
  });

  it("rejects what the database would refuse, before it gets there", () => {
    expect(checkoutSchema.safeParse({ ...form, phone: "12345" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...form, full_name: "A" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...form, province: "Atlantis" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...form, address: "x".repeat(121) }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...form, payment_method: "bitcoin" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...form, email: "not-an-email" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...form, notes: "n".repeat(501) }).success).toBe(false);
  });

  it("has no field for a price, a discount, a total or a delivery charge", () => {
    const keys = Object.keys(checkoutSchema.shape);
    expect(keys.filter((k) => /price|total|discount|shipping|fee|charge/.test(k))).toEqual([]);
  });
});

describe("cart lines", () => {
  it("are ids and quantities only; extra keys are stripped by the schema", () => {
    const parsed = cartLinesSchema.parse([{ variant_id: VARIANT_A, quantity: 2, price_paisa: 1, name: "Free part" }]);
    expect(parsed).toEqual([{ variant_id: VARIANT_A, quantity: 2 }]);
  });

  it("refuse an empty cart, a bad id and an impossible quantity", () => {
    expect(cartLinesSchema.safeParse([]).success).toBe(false);
    expect(cartLinesSchema.safeParse([{ variant_id: "abc", quantity: 1 }]).success).toBe(false);
    expect(cartLinesSchema.safeParse([{ variant_id: VARIANT_A, quantity: 0 }]).success).toBe(false);
    expect(cartLinesSchema.safeParse([{ variant_id: VARIANT_A, quantity: 100 }]).success).toBe(false);
    expect(cartLinesSchema.safeParse([{ variant_id: VARIANT_A, quantity: 1.5 }]).success).toBe(false);
  });

  it("need an idempotency key made for this attempt", () => {
    const base = { items: [{ variant_id: VARIANT_A, quantity: 1 }], form };
    expect(placeOrderInputSchema.safeParse({ ...base, idempotency_key: KEY }).success).toBe(true);
    expect(placeOrderInputSchema.safeParse({ ...base, idempotency_key: "retry" }).success).toBe(false);
    expect(placeOrderInputSchema.safeParse(base).success).toBe(false);
  });
});

describe("buildPlaceOrderArgs", () => {
  const items = [
    { variant_id: VARIANT_A, quantity: 2 },
    { variant_id: VARIANT_B, quantity: 1 },
  ];
  const args = buildPlaceOrderArgs(KEY, items, form);

  it("sends the key, the ids and quantities, and nothing priced", () => {
    expect(args.p_idempotency_key).toBe(KEY);
    expect(args.p_items).toEqual(items);
    expect(JSON.stringify(args)).not.toMatch(/price|total|discount|shipping_paisa|fee/i);
    expect(args.p_coupon_code).toBeNull();
  });

  it("normalises the phone and trims the text", () => {
    expect(args.p_customer).toEqual({ full_name: "Ali Khan", phone: "03001234567", email: "ali@example.com", company_name: null });
    expect(args.p_shipping_address).toMatchObject({ line1: "Chak 12, near the canal", city: "Khanpur", province: "Punjab", area: "Behind the school" });
  });

  it("keeps the address type, cargo terminal and fitment call in the order", () => {
    expect(args.p_shipping_address.instructions).toBe("Address type: Farm / dera");
    expect(args.p_customer_notes).toBe(`Massey 385\n${CALL_TO_CONFIRM_NOTE}`);
    const withTerminal = buildPlaceOrderArgs(KEY, items, { ...form, cargo_terminal: "Faisal Movers, Rahim Yar Khan", call_to_confirm: false, notes: "" });
    expect(withTerminal.p_shipping_address.instructions).toBe("Address type: Farm / dera. Preferred cargo terminal: Faisal Movers, Rahim Yar Khan");
    expect(withTerminal.p_customer_notes).toBeNull();
  });

  it("stays inside the database limits at the maximum input", () => {
    const max = buildPlaceOrderArgs(KEY, items, {
      ...form,
      landmark: "l".repeat(120),
      cargo_terminal: "c".repeat(120),
      notes: "n".repeat(500),
    });
    expect((max.p_shipping_address.instructions ?? "").length).toBeLessThanOrEqual(500);
    expect((max.p_customer_notes ?? "").length).toBeLessThanOrEqual(1000);
  });
});

describe("describePlaceOrderError", () => {
  it("never reveals a stock count or a SKU", () => {
    const failure = describePlaceOrderError({ message: "insufficient_stock", details: '{"variant_id":"x","sku":"SECRET-1","available":3}' });
    expect(failure.message).toMatch(/no longer available/);
    expect(JSON.stringify(failure)).not.toMatch(/SECRET|available":3|\b3\b/);
  });

  it("puts a field problem on its field", () => {
    expect(describePlaceOrderError({ message: "invalid_phone" }).fieldErrors).toHaveProperty("phone");
    expect(describePlaceOrderError({ message: "invalid_address" }).fieldErrors).toHaveProperty("address");
    expect(describePlaceOrderError({ message: "payment_method_unavailable" }).fieldErrors).toHaveProperty("payment_method");
  });

  it("asks for a new key only when the old one cannot be used again", () => {
    expect(describePlaceOrderError({ message: "idempotency_key_conflict" }).newKey).toBe(true);
    expect(describePlaceOrderError({ message: "insufficient_stock" }).newKey).toBeUndefined();
  });

  it("gives a plain message for anything unknown and leaks no database text", () => {
    const failure = describePlaceOrderError({ code: "XX000", message: 'relation "secret_table" does not exist' });
    expect(failure.message).toBe(GENERIC_ORDER_ERROR);
    expect(JSON.stringify(failure)).not.toContain("secret_table");
  });
});
