import { describe, expect, it } from "vitest";
import { isValidDeliveryCharge, lineTotal, MAX_DELIVERY_CHARGE_PAISA, orderTotal } from "@/features/orders/totals";
import { cartTotals } from "@/lib/pricing";

describe("orderTotal", () => {
  it("is the subtotal while the delivery charge is not confirmed (checkout has no charge)", () => {
    expect(orderTotal({ subtotal_paisa: 1_650_000 })).toBe(1_650_000);
    expect(orderTotal({ subtotal_paisa: 1_650_000, shipping_paisa: 0 })).toBe(1_650_000);
  });

  it("adds the delivery charge staff enter, and subtracts a discount", () => {
    expect(orderTotal({ subtotal_paisa: 1_650_000, shipping_paisa: 85_000 })).toBe(1_735_000);
    expect(orderTotal({ subtotal_paisa: 1_650_000, discount_paisa: 150_000, shipping_paisa: 85_000 })).toBe(1_585_000);
  });

  it("changes when the charge is corrected, never accumulates", () => {
    const base = { subtotal_paisa: 500_000 };
    expect(orderTotal({ ...base, shipping_paisa: 30_000 })).toBe(530_000);
    expect(orderTotal({ ...base, shipping_paisa: 0 })).toBe(500_000);
  });

  it("refuses amounts that cannot be right", () => {
    expect(() => orderTotal({ subtotal_paisa: -1 })).toThrow(RangeError);
    expect(() => orderTotal({ subtotal_paisa: 100, shipping_paisa: -5 })).toThrow(RangeError);
    expect(() => orderTotal({ subtotal_paisa: 100, discount_paisa: 101 })).toThrow(RangeError);
    expect(() => orderTotal({ subtotal_paisa: 1.5 })).toThrow(RangeError);
    expect(() => orderTotal({ subtotal_paisa: Number.NaN })).toThrow(RangeError);
  });
});

describe("lineTotal and the cart total agree", () => {
  it("multiplies whole paisa by a whole quantity", () => {
    expect(lineTotal(125_050, 3)).toBe(375_150);
    expect(() => lineTotal(100, 0)).toThrow(RangeError);
    expect(() => lineTotal(100, 1.5)).toThrow(RangeError);
  });

  it("the cart subtotal is the sum of the lines and carries no delivery", () => {
    const totals = cartTotals([
      { product: { retail_price_paisa: 250_000 }, quantity: 2 },
      { product: { retail_price_paisa: 99_950 }, quantity: 1 },
    ]);
    expect(totals.subtotal_paisa).toBe(599_950);
    expect(orderTotal({ subtotal_paisa: totals.subtotal_paisa })).toBe(599_950);
  });
});

describe("isValidDeliveryCharge", () => {
  it("accepts 0 (free delivery agreed) up to the limit", () => {
    expect(isValidDeliveryCharge(0)).toBe(true);
    expect(isValidDeliveryCharge(85_000)).toBe(true);
    expect(isValidDeliveryCharge(MAX_DELIVERY_CHARGE_PAISA)).toBe(true);
  });
  it("refuses negative, fractional and absurd amounts", () => {
    expect(isValidDeliveryCharge(-1)).toBe(false);
    expect(isValidDeliveryCharge(10.5)).toBe(false);
    expect(isValidDeliveryCharge(MAX_DELIVERY_CHARGE_PAISA + 1)).toBe(false);
  });
});
