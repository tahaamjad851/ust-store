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
  testPhone,
  withSetting,
  type Fixture,
  type TestUser,
} from "./helpers";

let admin: TestUser;
const shoppers: TestUser[] = [];

beforeAll(async () => {
  admin = await createUser("po-admin", "admin");
  for (let i = 0; i < 10; i++) shoppers.push(await createUser(`po-shopper${i}`));
});

afterAll(async () => {
  await archiveFixtures();
  await deleteUsers();
});

// The tests below place several orders per shopper; lift the anti-hoarding cap while they run.
const uncapped = <T>(fn: () => Promise<T>) => withSetting("max_open_orders_per_customer", 50, fn);

describe("no overselling under concurrent checkouts", () => {
  it("two simultaneous orders for the last unit: exactly one succeeds", () =>
    uncapped(async () => {
      const fx = await createFixture(admin, "last-unit", { pricePaisa: 100_000, stock: 1 });
      const results = await Promise.all(
        shoppers.slice(0, 2).map((s) => s.client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }]))),
      );
      expect(results.map((r) => (r.error ? r.error.message : "ok")).sort()).toEqual(["insufficient_stock", "ok"]);
      expect(await inventoryOf(fx.variantId)).toEqual({ on_hand: 1, reserved: 1 });
    }));

  it("twenty simultaneous orders for ten units, three rounds: never more than ten succeed", () =>
    uncapped(async () => {
      for (let round = 0; round < 3; round++) {
        const fx = await createFixture(admin, `ten-units-${round}`, { pricePaisa: 100_000, stock: 10 });
        const attempts = Array.from({ length: 20 }, (_, i) =>
          shoppers[i % shoppers.length].client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }])),
        );
        const results = await Promise.all(attempts);
        const unexpected = results.filter((r) => r.error && r.error.message !== "insufficient_stock");
        expect(unexpected.map((r) => r.error?.message)).toEqual([]);
        expect(results.filter((r) => !r.error)).toHaveLength(10);
        expect(await inventoryOf(fx.variantId)).toEqual({ on_hand: 10, reserved: 10 });
      }
    }));
});

describe("idempotency", () => {
  let fx: Fixture;
  beforeAll(async () => {
    fx = await createFixture(admin, "idem", { pricePaisa: 50_000, stock: 50 });
  });

  it("the same request with the same key returns the same order, even sent twice at once", () =>
    uncapped(async () => {
      const key = randomUUID();
      const args = orderArgs(fx, [{ variant_id: fx.variantId, quantity: 2 }], { p_idempotency_key: key });
      const [r1, r2] = await Promise.all([shoppers[0].client.rpc("place_order", args), shoppers[0].client.rpc("place_order", args)]);
      expect(r1.error).toBeNull();
      expect(r2.error).toBeNull();
      expect(r2.data.order_id).toBe(r1.data.order_id);
      const [first, replay] = r1.data.replayed ? [r2.data, r1.data] : [r1.data, r2.data];
      expect(first.replayed).toBe(false);
      expect(first.tracking_token).toMatch(/^[0-9a-f]{64}$/);
      expect(replay.replayed).toBe(true);
      expect(replay.tracking_token).toBeNull();

      const { count } = await service.from("orders").select("id", { count: "exact", head: true }).eq("idempotency_key", key);
      expect(count).toBe(1);
      expect(await inventoryOf(fx.variantId)).toEqual({ on_hand: 50, reserved: 2 });
    }));

  it("reusing a key with a different cart, or by another customer, is rejected", () =>
    uncapped(async () => {
      const key = randomUUID();
      const args = orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }], { p_idempotency_key: key });
      expect((await shoppers[0].client.rpc("place_order", args)).error).toBeNull();
      const changed = await shoppers[0].client.rpc("place_order", { ...args, p_items: [{ variant_id: fx.variantId, quantity: 3 }] });
      expect(changed.error?.message).toBe("idempotency_key_conflict");
      const other = await shoppers[1].client.rpc("place_order", args);
      expect(other.error?.message).toBe("idempotency_key_conflict");
    }));
});

describe("prices are recomputed on the server", () => {
  it("ignores client-sent prices and totals", () =>
    uncapped(async () => {
      const fx = await createFixture(admin, "price", { pricePaisa: 123_400, stock: 10 });
      const res = await shoppers[0].client.rpc(
        "place_order",
        orderArgs(fx, [{ variant_id: fx.variantId, quantity: 3, unit_price_paisa: 1, price: 1, total_paisa: 1 }]),
      );
      expect(res.error).toBeNull();
      expect(res.data.subtotal_paisa).toBe(123_400 * 3);
      // Phase 4: no delivery charge at checkout; staff enter it later.
      expect(res.data.shipping_paisa).toBe(0);
      expect(res.data.total_paisa).toBe(123_400 * 3);

      const { data: items } = await service
        .from("order_items")
        .select("unit_price_paisa, quantity, line_total_paisa, sku")
        .eq("order_id", res.data.order_id);
      expect(items?.map((i) => ({ ...i, unit_price_paisa: Number(i.unit_price_paisa), line_total_paisa: Number(i.line_total_paisa) }))).toEqual([
        { unit_price_paisa: 123_400, quantity: 3, line_total_paisa: 370_200, sku: fx.sku },
      ]);
    }));

  it("uses the sale price when one is set", () =>
    uncapped(async () => {
      const fx = await createFixture(admin, "sale", { pricePaisa: 200_000, stock: 10 });
      await service.from("product_variants").update({ sale_price_paisa: 150_000 }).eq("id", fx.variantId);
      const res = await shoppers[1].client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }]));
      expect(res.error).toBeNull();
      expect(res.data.subtotal_paisa).toBe(150_000);
    }));

  it("rejects an unpublished product", () =>
    uncapped(async () => {
      const fx = await createFixture(admin, "draft", { pricePaisa: 10_000, stock: 10 });
      await service.from("products").update({ status: "draft" }).eq("id", fx.productId);
      const res = await shoppers[2].client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }]));
      expect(res.error?.message).toBe("item_unavailable");
    }));
});

describe("anti-hoarding", () => {
  it("caps open orders per customer", () =>
    withSetting("max_open_orders_per_customer", 2, async () => {
      const fx = await createFixture(admin, "cap", { pricePaisa: 10_000, stock: 20 });
      const shopper = await createUser("po-capped");
      const phone = testPhone();
      const order = () =>
        shopper.client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }], {
          p_customer: { full_name: "UST Test Capped", phone },
        }));
      expect((await order()).error).toBeNull();
      expect((await order()).error).toBeNull();
      expect((await order()).error?.message).toBe("too_many_open_orders");
    }));
});

describe("guest orders", () => {
  it("are placed through the service role only", () =>
    uncapped(async () => {
      const fx = await createFixture(admin, "guest", { pricePaisa: 10_000, stock: 5 });
      const res = await service.rpc("place_order_as_guest", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }]));
      expect(res.error).toBeNull();
      const { data } = await service.from("orders").select("user_id").eq("id", res.data.order_id).single();
      expect(data?.user_id).toBeNull();
      const tracked = await service.rpc("get_order_by_tracking_token", { p_token: res.data.tracking_token });
      expect(tracked.data.order_number).toBe(res.data.order_number);
    }));
});

describe("stock lifecycle", () => {
  it("cancellation releases the reservation exactly once", () =>
    uncapped(async () => {
      const fx = await createFixture(admin, "cancel", { pricePaisa: 10_000, stock: 5 });
      const res = await shoppers[3].client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 2 }]));
      expect(await inventoryOf(fx.variantId)).toEqual({ on_hand: 5, reserved: 2 });

      const cancel = await admin.client.rpc("set_order_status", { p_order_id: res.data.order_id, p_status: "cancelled", p_note: "test" });
      expect(cancel.error).toBeNull();
      const again = await admin.client.rpc("set_order_status", { p_order_id: res.data.order_id, p_status: "cancelled" });
      expect(again.error?.message).toBe("invalid_transition");
      expect(await inventoryOf(fx.variantId)).toEqual({ on_hand: 5, reserved: 0 });
    }));

  it("delivery converts the reservation into a deduction", () =>
    uncapped(async () => {
      const fx = await createFixture(admin, "ship", { pricePaisa: 10_000, stock: 5 });
      const res = await shoppers[4].client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 2 }]));
      for (const status of ["confirmed", "dispatched", "delivered"]) {
        const r = await admin.client.rpc("set_order_status", { p_order_id: res.data.order_id, p_status: status });
        expect(r.error, status).toBeNull();
      }
      expect(await inventoryOf(fx.variantId)).toEqual({ on_hand: 3, reserved: 0 });
    }));

  // Bank transfer is off by default since Phase 4 (store_settings.bank_transfer_enabled), so the test switches it on and restores it.
  it("unpaid bank transfers past their hold are cancelled and their stock released", () =>
    withSetting("bank_transfer_enabled", true, () =>
    uncapped(async () => {
      const fx = await createFixture(admin, "expire", { pricePaisa: 10_000, stock: 5 });
      const res = await shoppers[5].client.rpc(
        "place_order",
        orderArgs(fx, [{ variant_id: fx.variantId, quantity: 2 }], { p_payment_method: "bank_transfer" }),
      );
      expect(res.error).toBeNull();
      await service.from("orders").update({ reservation_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", res.data.order_id);
      const job = await service.rpc("expire_unpaid_bank_transfers");
      expect(job.error).toBeNull();
      const { data } = await service.from("orders").select("status, stock_state").eq("id", res.data.order_id).single();
      expect(data).toEqual({ status: "cancelled", stock_state: "released" });
      expect(await inventoryOf(fx.variantId)).toEqual({ on_hand: 5, reserved: 0 });
    })));
});
