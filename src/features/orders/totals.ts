// Order money, in integer paisa. The authoritative numbers are made by the database (place_order() prices the lines,
// set_order_delivery_charge() recalculates the total); this mirrors the arithmetic for display and for the tests that
// keep the two in step. Nothing here is ever sent to the server as a price.

export type OrderAmounts = { subtotal_paisa: number; discount_paisa?: number; shipping_paisa?: number };

const isMoney = (n: number) => Number.isSafeInteger(n) && n >= 0;

/** subtotal - discount + delivery charge. The same rule as the `orders_total_matches` constraint. */
export function orderTotal({ subtotal_paisa, discount_paisa = 0, shipping_paisa = 0 }: OrderAmounts): number {
  if (!isMoney(subtotal_paisa) || !isMoney(discount_paisa) || !isMoney(shipping_paisa)) throw new RangeError("amounts must be whole paisa, zero or more");
  if (discount_paisa > subtotal_paisa) throw new RangeError("discount is larger than the subtotal");
  return subtotal_paisa - discount_paisa + shipping_paisa;
}

export function lineTotal(unit_price_paisa: number, quantity: number): number {
  if (!isMoney(unit_price_paisa) || !Number.isSafeInteger(quantity) || quantity < 1) throw new RangeError("invalid line");
  return unit_price_paisa * quantity;
}

/** The largest delivery charge staff may enter (Rs 100,000), as in set_order_delivery_charge(). */
export const MAX_DELIVERY_CHARGE_PAISA = 10_000_000;

export function isValidDeliveryCharge(paisa: number): boolean {
  return isMoney(paisa) && paisa <= MAX_DELIVERY_CHARGE_PAISA;
}
