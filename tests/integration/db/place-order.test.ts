// place_order() tests against the DEV Supabase project. Run: npm run test:db
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archiveFixtures,
  createFixture,
  createUser,
  deleteUsers,
  inventoryOf,
  orderArgs,
  service,
  type Fixture,
  type TestUser,
} from "./helpers";

let admin: TestUser;
const shoppers: TestUser[] = [];

beforeAll(async () => {
  admin = await createUser("po-admin", "admin");
  for (let i = 0; i < 5; i++) shoppers.push(await createUser(`po-shopper${i}`));
});

afterAll(async () => {
  await archiveFixtures();
  await deleteUsers();
});

describe("no overselling under concurrent checkouts", () => {
  it("two simultaneous orders for the last unit: exactly one succeeds", async () => {
    const fx = await createFixture(admin, "last-unit", { pricePaisa: 100_000, stock: 1 });
    const [a, b] = await Promise.all(
      shoppers.slice(0, 2).map((s) => s.client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }]))),
    );
    const outcomes = [a, b].map((r) => (r.error ? r.error.message : "ok")).sort();
    expect(outcomes).toEqual(["insufficient_stock", "ok"]);
    expect(await inventoryOf(fx.variantId)).toEqual({ on_hand: 1, reserved: 1 });
  });

  it("five simultaneous orders for three units: exactly three succeed", async () => {
    const fx = await createFixture(admin, "three-units", { pricePaisa: 100_000, stock: 3 });
    const results = await Promise.all(
      shoppers.map((s) => s.client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }]))),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(3);
    expect(results.filter((r) => r.error?.message === "insufficient_stock")).toHaveLength(2);
    expect(await inventoryOf(fx.variantId)).toEqual({ on_hand: 3, reserved: 3 });
  });
});

describe("idempotency", () => {
  let fx: Fixture;
  beforeAll(async () => {
    fx = await createFixture(admin, "idem", { pricePaisa: 50_000, stock: 50 });
  });

  it("the same key returns the same order, even when sent twice at once", async () => {
    const key = randomUUID();
    const args = orderArgs(fx, [{ variant_id: fx.variantId, quantity: 2 }], { p_idempotency_key: key });
    const [r1, r2] = await Promise.all([shoppers[0].client.rpc("place_order", args), shoppers[0].client.rpc("place_order", args)]);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    expect(r2.data.order_id).toBe(r1.data.order_id);
    expect([r1.data.replayed, r2.data.replayed].sort()).toEqual([false, true]);

    const { count } = await service.from("orders").select("id", { count: "exact", head: true }).eq("idempotency_key", key);
    expect(count).toBe(1);
    expect(await inventoryOf(fx.variantId)).toEqual({ on_hand: 50, reserved: 2 });
  });

  it("another customer cannot reuse the key", async () => {
    const key = randomUUID();
    const first = await shoppers[0].client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }], { p_idempotency_key: key }));
    expect(first.error).toBeNull();
    const second = await shoppers[1].client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }], { p_idempotency_key: key }));
    expect(second.error?.message).toBe("idempotency_key_conflict");
  });
});

describe("prices are recomputed on the server", () => {
  it("ignores client-sent prices and totals", async () => {
    const fx = await createFixture(admin, "price", { pricePaisa: 123_400, stock: 10 });
    const res = await shoppers[0].client.rpc(
      "place_order",
      orderArgs(fx, [{ variant_id: fx.variantId, quantity: 3, unit_price_paisa: 1, price: 1, total_paisa: 1 }], {}),
    );
    expect(res.error).toBeNull();
    expect(res.data.subtotal_paisa).toBe(123_400 * 3);
    expect(res.data.shipping_paisa).toBe(fx.shippingPaisa);
    expect(res.data.total_paisa).toBe(123_400 * 3 + fx.shippingPaisa);

    const { data: items } = await service.from("order_items").select("unit_price_paisa, quantity, line_total_paisa, sku").eq("order_id", res.data.order_id);
    expect(items?.map((i) => ({ ...i, unit_price_paisa: Number(i.unit_price_paisa), line_total_paisa: Number(i.line_total_paisa) }))).toEqual([
      { unit_price_paisa: 123_400, quantity: 3, line_total_paisa: 370_200, sku: fx.sku },
    ]);
  });

  it("uses the sale price when one is set", async () => {
    const fx = await createFixture(admin, "sale", { pricePaisa: 200_000, stock: 10 });
    await service.from("product_variants").update({ sale_price_paisa: 150_000 }).eq("id", fx.variantId);
    const res = await shoppers[1].client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }]));
    expect(res.error).toBeNull();
    expect(res.data.subtotal_paisa).toBe(150_000);
  });

  it("rejects an unpublished product", async () => {
    const fx = await createFixture(admin, "draft", { pricePaisa: 10_000, stock: 10 });
    await service.from("products").update({ status: "draft" }).eq("id", fx.productId);
    const res = await shoppers[2].client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }]));
    expect(res.error?.message).toBe("item_unavailable");
  });
});

describe("stock lifecycle", () => {
  it("cancellation releases the reservation exactly once", async () => {
    const fx = await createFixture(admin, "cancel", { pricePaisa: 10_000, stock: 5 });
    const res = await shoppers[3].client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 2 }]));
    expect(await inventoryOf(fx.variantId)).toEqual({ on_hand: 5, reserved: 2 });

    const cancel = await admin.client.rpc("set_order_status", { p_order_id: res.data.order_id, p_status: "cancelled", p_note: "test" });
    expect(cancel.error).toBeNull();
    const again = await admin.client.rpc("set_order_status", { p_order_id: res.data.order_id, p_status: "cancelled" });
    expect(again.error?.message).toBe("invalid_transition");
    expect(await inventoryOf(fx.variantId)).toEqual({ on_hand: 5, reserved: 0 });
  });

  it("shipping converts the reservation into a deduction", async () => {
    const fx = await createFixture(admin, "ship", { pricePaisa: 10_000, stock: 5 });
    const res = await shoppers[4].client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 2 }]));
    for (const status of ["confirmed", "processing", "dispatched", "shipped"]) {
      const r = await admin.client.rpc("set_order_status", { p_order_id: res.data.order_id, p_status: status });
      expect(r.error, status).toBeNull();
    }
    expect(await inventoryOf(fx.variantId)).toEqual({ on_hand: 3, reserved: 0 });
  });
});
