import { describe, expect, it } from "vitest";
import { checkRowEdit, effectivePaisa, findLargeChanges, percentChange, type PriceRow } from "@/features/admin/price-changes";

const row = (over: Partial<PriceRow> = {}): PriceRow => ({
  variantId: "00000000-0000-4000-8000-000000000001",
  regularPaisa: 100_000,
  salePaisa: null,
  isActive: true,
  onHand: 10,
  updatedAt: "2026-11-01T10:00:00.123456+00:00",
  ...over,
});

describe("checkRowEdit", () => {
  it("sends nothing for a row that was not edited or was edited back to the same values", () => {
    expect(checkRowEdit(row(), undefined)).toEqual({ errors: {}, change: null });
    expect(checkRowEdit(row(), { regular: "1000", sale: "", onHand: "10", isActive: true })).toEqual({ errors: {}, change: null });
    expect(checkRowEdit(row(), { regular: "1,000.00" }).change).toBeNull();
  });

  it("sends only the fields that differ, with the stale-page guard", () => {
    const check = checkRowEdit(row(), { regular: "1100" });
    expect(check.errors).toEqual({});
    expect(check.change).toEqual({
      variant_id: row().variantId,
      regular_price_paisa: 110_000,
      expected_updated_at: "2026-11-01T10:00:00.123456+00:00",
    });
  });

  it("adds and removes a sale price", () => {
    expect(checkRowEdit(row(), { sale: "900" }).change?.sale_price_paisa).toBe(90_000);
    const withSale = row({ salePaisa: 90_000 });
    expect(checkRowEdit(withSale, { sale: "" }).change?.sale_price_paisa).toBeNull();
    expect(checkRowEdit(withSale, { sale: "900" }).change).toBeNull();
  });

  it("changes stock with the expected value, and availability", () => {
    const check = checkRowEdit(row(), { onHand: "25", isActive: false });
    expect(check.change).toMatchObject({ set_on_hand: 25, expected_on_hand: 10, is_active: false });
    // Stock alone does not need the price-page guard.
    expect(checkRowEdit(row(), { onHand: "0" }).change).toEqual({ variant_id: row().variantId, set_on_hand: 0, expected_on_hand: 10 });
  });

  it.each([
    [{ regular: "" }, "regular"],
    [{ regular: "0" }, "regular"],
    [{ regular: "abc" }, "regular"],
    [{ regular: "-5" }, "regular"],
    [{ sale: "abc" }, "sale"],
    [{ sale: "0" }, "sale"],
    [{ sale: "1000" }, "sale"],
    [{ sale: "1200" }, "sale"],
    [{ onHand: "" }, "onHand"],
    [{ onHand: "-1" }, "onHand"],
    [{ onHand: "1.5" }, "onHand"],
    [{ onHand: "2000000" }, "onHand"],
  ] as const)("refuses %j on %s", (edit, field) => {
    const check = checkRowEdit(row(), edit);
    expect(check.change).toBeNull();
    expect(check.errors[field]).toBeTruthy();
  });

  it("checks a sale price against the NEW regular price", () => {
    expect(checkRowEdit(row(), { regular: "2000", sale: "1500" }).errors).toEqual({});
    expect(checkRowEdit(row({ salePaisa: 90_000 }), { regular: "800" }).errors.sale).toBeTruthy();
  });
});

describe("large changes", () => {
  it("measures the change in the price the customer pays", () => {
    expect(effectivePaisa(100, 80)).toBe(80);
    expect(effectivePaisa(100, null)).toBe(100);
    expect(percentChange(100, 120)).toBe(20);
    expect(percentChange(100, 50)).toBe(50);
    expect(percentChange(0, 50)).toBe(0);
  });

  it("flags only changes above the threshold", () => {
    const rows = [row()];
    const at = (regular: number) => [{ variant_id: rows[0].variantId, regular_price_paisa: regular }];
    expect(findLargeChanges(rows, at(120_000), 20)).toEqual([]); // exactly 20% is not above 20%
    const large = findLargeChanges(rows, at(120_001), 20);
    expect(large).toHaveLength(1);
    expect(large[0]).toMatchObject({ fromPaisa: 100_000, toPaisa: 120_001 });
    expect(findLargeChanges(rows, at(50_000), 20)[0].percent).toBe(50);
  });

  it("counts a new sale price as a price cut, and ignores changes that do not move the price", () => {
    const rows = [row()];
    const id = rows[0].variantId;
    expect(findLargeChanges(rows, [{ variant_id: id, sale_price_paisa: 50_000 }], 20)).toHaveLength(1);
    expect(findLargeChanges(rows, [{ variant_id: id, sale_price_paisa: 95_000 }], 20)).toHaveLength(0);
    expect(findLargeChanges(rows, [{ variant_id: id, is_active: false }], 20)).toHaveLength(0);
    expect(findLargeChanges(rows, [{ variant_id: id, set_on_hand: 500 }], 20)).toHaveLength(0);
  });

  it("an existing sale price is the base: raising the regular price under it changes nothing for the customer", () => {
    const rows = [row({ salePaisa: 90_000 })];
    expect(findLargeChanges(rows, [{ variant_id: rows[0].variantId, regular_price_paisa: 500_000 }], 20)).toHaveLength(0);
  });

  it("ignores ids it does not know", () => {
    expect(findLargeChanges([row()], [{ variant_id: "other", regular_price_paisa: 9_999_999 }], 20)).toEqual([]);
  });
});
