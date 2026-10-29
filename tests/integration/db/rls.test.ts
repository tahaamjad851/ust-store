// RLS and permission tests against the DEV Supabase project. Run: npm run test:db
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anon,
  archiveFixtures,
  createFixture,
  createUser,
  deleteUsers,
  orderArgs,
  service,
  type Fixture,
  type TestUser,
} from "./helpers";

let admin: TestUser;
let alice: TestUser;
let bob: TestUser;
let fx: Fixture;
let aliceOrderId: string;
let aliceAddressId: string;

beforeAll(async () => {
  admin = await createUser("rls-admin", "admin");
  alice = await createUser("rls-alice");
  bob = await createUser("rls-bob");
  fx = await createFixture(admin, "rls", { pricePaisa: 150_000, stock: 20 });
  await service.from("product_variant_costs").insert({ variant_id: fx.variantId, cost_paisa: 90_000 });

  const { data: order, error } = await alice.client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }]));
  if (error) throw new Error(error.message);
  aliceOrderId = order.order_id;

  const { data: addr, error: addrError } = await alice.client
    .from("addresses")
    .insert({ full_name: "Alice Test", phone: "03001234567", line1: "House 1", city: "Khanpur", province: "Punjab" })
    .select("id")
    .single();
  if (addrError) throw new Error(addrError.message);
  aliceAddressId = addr.id;
});

afterAll(async () => {
  await archiveFixtures();
  await deleteUsers();
});

describe("customers are isolated from each other", () => {
  it("customer B cannot read customer A's order or its items", async () => {
    const orders = await bob.client.from("orders").select("id").eq("id", aliceOrderId);
    const items = await bob.client.from("order_items").select("id").eq("order_id", aliceOrderId);
    expect(orders.error).toBeNull();
    expect(orders.data).toEqual([]);
    expect(items.data).toEqual([]);
    const own = await alice.client.from("orders").select("id").eq("id", aliceOrderId);
    expect(own.data).toHaveLength(1);
  });

  it("customer B cannot read, change or delete customer A's address", async () => {
    const read = await bob.client.from("addresses").select("id").eq("id", aliceAddressId);
    expect(read.data).toEqual([]);
    const update = await bob.client.from("addresses").update({ city: "Lahore" }).eq("id", aliceAddressId).select("id");
    expect(update.data ?? []).toEqual([]);
    const del = await bob.client.from("addresses").delete().eq("id", aliceAddressId).select("id");
    expect(del.data ?? []).toEqual([]);
    const still = await alice.client.from("addresses").select("city").eq("id", aliceAddressId).single();
    expect(still.data?.city).toBe("Khanpur");
  });

  it("a customer cannot change their own order's totals, status or payment status", async () => {
    const res = await alice.client
      .from("orders")
      .update({ total_paisa: 1, status: "delivered", payment_status: "paid" })
      .eq("id", aliceOrderId)
      .select("id");
    expect(res.data ?? []).toEqual([]);
    const { data } = await service.from("orders").select("total_paisa, status, payment_status").eq("id", aliceOrderId).single();
    expect(data).toMatchObject({ status: "pending", payment_status: "unpaid" });
    expect(Number(data?.total_paisa)).toBe(fx.pricePaisa + fx.shippingPaisa);
  });
});

describe("anonymous visitors", () => {
  it("cannot read cost prices", async () => {
    const res = await anon().from("product_variant_costs").select("cost_paisa");
    expect(res.error?.message).toMatch(/permission denied/);
  });

  it("cannot read stock rows, orders, bank accounts or coupons directly", async () => {
    for (const table of ["inventory", "orders", "bank_accounts", "coupons", "stock_movements"]) {
      const res = await anon().from(table).select("*").limit(1);
      expect(res.error?.message, table).toMatch(/permission denied/);
    }
  });

  it("can read published products and variant prices but not costs", async () => {
    const res = await anon().from("product_variants").select("*").eq("id", fx.variantId).single();
    expect(res.error).toBeNull();
    expect(Number(res.data.regular_price_paisa)).toBe(fx.pricePaisa);
    expect(res.data).not.toHaveProperty("cost_paisa");
  });

  it("cannot place orders directly (guests go through the server)", async () => {
    const res = await anon().rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }]));
    expect(res.error?.message).toMatch(/permission denied/);
    const guest = await anon().rpc("place_order_as_guest", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }]));
    expect(guest.error?.message).toMatch(/permission denied/);
  });
});

describe("non-admins cannot perform admin actions", () => {
  it("a customer cannot adjust stock", async () => {
    const res = await alice.client.rpc("adjust_stock", {
      p_variant_id: fx.variantId,
      p_on_hand_delta: 100,
      p_movement_type: "receive",
      p_reason: "not allowed",
    });
    expect(res.error?.message).toMatch(/not_authorized/);
    const direct = await alice.client.from("inventory").update({ on_hand: 9999 }).eq("variant_id", fx.variantId).select();
    expect(direct.data ?? []).toEqual([]);
  });

  it("a customer cannot read cost prices", async () => {
    const res = await alice.client.from("product_variant_costs").select("cost_paisa");
    expect(res.data ?? []).toEqual([]);
  });

  it("a customer cannot give themselves a role", async () => {
    const res = await alice.client.from("user_roles").insert({ user_id: alice.id, role: "admin" });
    expect(res.error?.message).toMatch(/row-level security/);
    const isAdmin = await alice.client.rpc("is_admin");
    expect(isAdmin.data).toBe(false);
  });

  it("an admin cannot change their own role", async () => {
    const res = await admin.client.from("user_roles").update({ role: "staff" }).eq("user_id", admin.id).select();
    expect(res.data ?? []).toEqual([]);
    const { data } = await service.from("user_roles").select("role").eq("user_id", admin.id).single();
    expect(data?.role).toBe("admin");
  });

  it("a customer cannot change order or payment status", async () => {
    const s = await alice.client.rpc("set_order_status", { p_order_id: aliceOrderId, p_status: "confirmed" });
    expect(s.error?.message).toMatch(/not_authorized/);
    const p = await alice.client.rpc("set_payment_status", { p_order_id: aliceOrderId, p_status: "paid" });
    expect(p.error?.message).toMatch(/not_authorized/);
  });

  it("a customer cannot disable their own account flag", async () => {
    const res = await alice.client.from("profiles").update({ disabled_at: new Date().toISOString() }).eq("id", alice.id);
    expect(res.error?.message).toMatch(/only an admin/);
  });
});
