// Phase 4 database tests, against the DEV project (npm run test:db). They cover what the migration
// 20261102100000_orders.sql promises: place_order() is idempotent and cannot oversell, no delivery charge is
// calculated at checkout, the workflow refuses invalid transitions in the database, cancelling gives the stock back
// exactly once, delivery deducts it once, staff enter the delivery charge (the total is recalculated there), every
// staff change is audited, nothing is readable by anon, and a customer sees only their own orders.
//
// Needs the migration applied: the first thing the file does is list what the project lacks.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, archiveFixtures, assertProjectHas, createFixture, createUser, deleteUsers, inventoryOf, orderArgs, service, testPhone, withSetting, type Fixture, type TestUser } from "./helpers";

let admin: TestUser;
let staff: TestUser;
let alice: TestUser;
let bob: TestUser;
let fx: Fixture;

beforeAll(async () => {
  await assertProjectHas({
    columns: { orders: ["shipping_confirmed", "shipping_confirmed_at"], notifications: ["order_id", "template", "status", "last_error"] },
    functions: [
      { name: "search_orders", args: { p_limit: 1 } },
      { name: "set_order_delivery_charge", args: { p_order_id: "00000000-0000-0000-0000-000000000000", p_shipping_paisa: 0 } },
      { name: "set_order_shipment", args: { p_order_id: "00000000-0000-0000-0000-000000000000", p_courier: "TCS" } },
      { name: "add_order_note", args: { p_order_id: "00000000-0000-0000-0000-000000000000", p_note: "probe" } },
      { name: "mark_cod_collected", args: { p_order_id: "00000000-0000-0000-0000-000000000000" } },
    ],
    migrations: ["20261102100000_orders.sql"],
  });
  admin = await createUser("ord-admin", "admin");
  staff = await createUser("ord-staff", "staff");
  alice = await createUser("ord-alice");
  bob = await createUser("ord-bob");
  fx = await createFixture(admin, "ord", { pricePaisa: 100_000, stock: 500 });
});

afterAll(async () => {
  await archiveFixtures();
  await deleteUsers();
});

// Several orders per customer below; lift the anti-hoarding cap while they run.
const uncapped = <T>(fn: () => Promise<T>) => withSetting("max_open_orders_per_customer", 50, fn);

async function place(who: TestUser, quantity = 1, over: Record<string, unknown> = {}, variant = fx) {
  const res = await who.client.rpc("place_order", orderArgs(variant, [{ variant_id: variant.variantId, quantity }], over));
  if (res.error) throw new Error(`place_order: ${res.error.message}`);
  return res.data as { order_id: string; order_number: string; subtotal_paisa: number; shipping_paisa: number; total_paisa: number; tracking_token: string | null; replayed: boolean };
}
const setStatus = (who: TestUser, id: string, status: string, note?: string) => who.client.rpc("set_order_status", { p_order_id: id, p_status: status, p_note: note ?? null });
const orderRow = async (id: string) => (await service.from("orders").select("*").eq("id", id).single()).data as Record<string, unknown>;

describe("placing an order", () => {
  it("has no delivery charge: shipping 0, the total is the items, and it is marked unconfirmed", () =>
    uncapped(async () => {
      const placed = await place(alice, 3);
      expect(Number(placed.subtotal_paisa)).toBe(300_000);
      expect(Number(placed.shipping_paisa)).toBe(0);
      expect(Number(placed.total_paisa)).toBe(300_000);
      expect(placed.order_number).toMatch(/^UST-\d{4}-\d{6}$/);
      const row = await orderRow(placed.order_id);
      expect(row).toMatchObject({ status: "pending", payment_status: "unpaid", payment_method: "cod", shipping_confirmed: false });
    }));

  it("prices from the database whatever the client sends", () =>
    uncapped(async () => {
      const res = await alice.client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 2, unit_price_paisa: 1, price: 1, total_paisa: 1 }], { p_coupon_code: null }));
      expect(res.error).toBeNull();
      expect(Number(res.data.total_paisa)).toBe(200_000);
    }));

  it("the same key twice, even at once, gives one order and one reservation", () =>
    uncapped(async () => {
      const before = await inventoryOf(fx.variantId);
      const args = orderArgs(fx, [{ variant_id: fx.variantId, quantity: 2 }]);
      const [a, b] = await Promise.all([alice.client.rpc("place_order", args), alice.client.rpc("place_order", args)]);
      expect(a.error).toBeNull();
      expect(b.error).toBeNull();
      expect(a.data.order_id).toBe(b.data.order_id);
      expect([a.data.replayed, b.data.replayed].sort()).toEqual([false, true]);
      const after = await inventoryOf(fx.variantId);
      expect(after.reserved).toBe(before.reserved + 2);
      const rows = await service.from("orders").select("id").eq("idempotency_key", args.p_idempotency_key);
      expect(rows.data).toHaveLength(1);
    }));

  it("a key reused for a different request, or by someone else, is refused", () =>
    uncapped(async () => {
      const args = orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }]);
      expect((await alice.client.rpc("place_order", args)).error).toBeNull();
      expect((await alice.client.rpc("place_order", { ...args, p_items: [{ variant_id: fx.variantId, quantity: 4 }] })).error?.message).toBe("idempotency_key_conflict");
      expect((await bob.client.rpc("place_order", args)).error?.message).toBe("idempotency_key_conflict");
    }));

  it("the last unit goes to exactly one of several simultaneous buyers", async () => {
    const scarce = await createFixture(admin, "last", { pricePaisa: 50_000, stock: 1 });
    const buyers = [alice, bob];
    const results = await Promise.all(buyers.map((b) => b.client.rpc("place_order", orderArgs(scarce, [{ variant_id: scarce.variantId, quantity: 1 }]))));
    const wins = results.filter((r) => !r.error);
    const losses = results.filter((r) => r.error);
    expect(wins).toHaveLength(1);
    expect(losses[0].error?.message).toBe("insufficient_stock");
    expect(await inventoryOf(scarce.variantId)).toEqual({ on_hand: 1, reserved: 1 });
  });

  it("an order staff marked Contacted still counts against the open-order limit", () =>
    withSetting("max_open_orders_per_customer", 1, async () => {
      const phone = testPhone();
      const first = await place(alice, 1, { p_customer: { full_name: "UST Test Cap", phone, email: null } });
      expect((await setStatus(staff, first.order_id, "contacted")).error).toBeNull();
      const second = await alice.client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }], { p_customer: { full_name: "UST Test Cap", phone, email: null } }));
      expect(second.error?.message).toBe("too_many_open_orders");
      await setStatus(staff, first.order_id, "cancelled");
    }));

  it("refuses an unknown variant and a zero quantity", () =>
    uncapped(async () => {
      expect((await alice.client.rpc("place_order", orderArgs(fx, [{ variant_id: randomUUID(), quantity: 1 }]))).error?.message).toBe("item_unavailable");
      expect((await alice.client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 0 }]))).error?.message).toBe("invalid_items");
    }));

  it("refuses bank transfer while it is switched off (the launch setting)", async () => {
    const res = await alice.client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }], { p_payment_method: "bank_transfer" }));
    expect(res.error?.message).toBe("payment_method_unavailable");
  });

  it("guest orders: only the service role, a supplied token comes back on a retry, and nobody else sees the order", () =>
    uncapped(async () => {
      const key = randomUUID();
      const token = "ab".repeat(32);
      const args = { ...orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }], { p_idempotency_key: key }), p_tracking_token: token };
      expect((await anon().rpc("place_order_as_guest", args)).error).not.toBeNull();
      expect((await alice.client.rpc("place_order_as_guest", args)).error).not.toBeNull();
      const first = await service.rpc("place_order_as_guest", args);
      expect(first.error).toBeNull();
      expect(first.data).toMatchObject({ tracking_token: token, replayed: false });
      const retry = await service.rpc("place_order_as_guest", args);
      expect(retry.data).toMatchObject({ order_id: first.data.order_id, tracking_token: token, replayed: true });
      const bad = await service.rpc("place_order_as_guest", { ...args, p_idempotency_key: randomUUID(), p_tracking_token: "not-hex" });
      expect(bad.error?.message).toBe("invalid_tracking_token");
      expect((await service.from("orders").select("user_id").eq("id", first.data.order_id).single()).data?.user_id).toBeNull();
    }));
});

describe("the status workflow, enforced in the database", () => {
  it("walks New > Contacted > Confirmed > Dispatched > Delivered and rejects every shortcut", () =>
    uncapped(async () => {
      const { order_id } = await place(alice, 2);
      for (const bad of ["dispatched", "delivered", "exchange_requested"]) {
        expect((await setStatus(staff, order_id, bad)).error?.message, `pending -> ${bad}`).toBe("invalid_transition");
      }
      expect((await setStatus(staff, order_id, "contacted", "Called the customer")).error).toBeNull();
      expect((await setStatus(staff, order_id, "pending")).error?.message).toBe("invalid_transition");
      expect((await setStatus(staff, order_id, "confirmed")).error).toBeNull();
      expect((await setStatus(staff, order_id, "delivered")).error?.message).toBe("invalid_transition");
      expect((await setStatus(staff, order_id, "dispatched")).error).toBeNull();
      expect((await setStatus(staff, order_id, "delivered")).error).toBeNull();
      expect((await setStatus(staff, order_id, "cancelled")).error?.message).toBe("invalid_transition");
      expect((await setStatus(staff, order_id, "exchange_requested", "Wrong size")).error).toBeNull();
      expect((await setStatus(staff, order_id, "delivered", "Exchanged")).error).toBeNull();
    }));

  it("a customer cannot change a status, not even their own order's", () =>
    uncapped(async () => {
      const { order_id } = await place(alice);
      expect((await setStatus(alice, order_id, "confirmed")).error?.message).toBe("not_authorized");
      expect((await orderRow(order_id)).status).toBe("pending");
    }));

  it("cancelling gives the stock back exactly once; a second cancel and a reopen are refused", () =>
    uncapped(async () => {
      const own = await createFixture(admin, "cancel", { pricePaisa: 10_000, stock: 5 });
      const { order_id } = await place(alice, 3, {}, own);
      expect(await inventoryOf(own.variantId)).toEqual({ on_hand: 5, reserved: 3 });
      expect((await setStatus(staff, order_id, "cancelled", "Customer changed mind")).error).toBeNull();
      expect(await inventoryOf(own.variantId)).toEqual({ on_hand: 5, reserved: 0 });
      expect((await setStatus(staff, order_id, "cancelled")).error?.message).toBe("invalid_transition");
      expect((await setStatus(staff, order_id, "contacted")).error?.message).toBe("invalid_transition");
      expect(await inventoryOf(own.variantId)).toEqual({ on_hand: 5, reserved: 0 });
      const releases = await service.from("stock_movements").select("id").eq("order_id", order_id).eq("movement_type", "release");
      expect(releases.data).toHaveLength(1);
    }));

  it("a dispatched order can still be cancelled (refused at the door) and its stock returns once", () =>
    uncapped(async () => {
      const own = await createFixture(admin, "refused", { pricePaisa: 10_000, stock: 5 });
      const { order_id } = await place(alice, 2, {}, own);
      await setStatus(staff, order_id, "confirmed");
      await setStatus(staff, order_id, "dispatched");
      expect(await inventoryOf(own.variantId)).toEqual({ on_hand: 5, reserved: 2 });
      expect((await setStatus(staff, order_id, "cancelled", "Refused at the door")).error).toBeNull();
      expect(await inventoryOf(own.variantId)).toEqual({ on_hand: 5, reserved: 0 });
    }));

  it("delivery deducts the stock once; an exchange afterwards does not deduct again", () =>
    uncapped(async () => {
      const own = await createFixture(admin, "deliver", { pricePaisa: 10_000, stock: 5 });
      const { order_id } = await place(alice, 2, {}, own);
      for (const s of ["confirmed", "dispatched"]) expect((await setStatus(staff, order_id, s)).error).toBeNull();
      expect(await inventoryOf(own.variantId)).toEqual({ on_hand: 5, reserved: 2 });
      expect((await setStatus(staff, order_id, "delivered")).error).toBeNull();
      expect(await inventoryOf(own.variantId)).toEqual({ on_hand: 3, reserved: 0 });
      await setStatus(staff, order_id, "exchange_requested");
      await setStatus(staff, order_id, "delivered");
      expect(await inventoryOf(own.variantId)).toEqual({ on_hand: 3, reserved: 0 });
      const sales = await service.from("stock_movements").select("id").eq("order_id", order_id).eq("movement_type", "sale");
      expect(sales.data).toHaveLength(1);
    }));
});

describe("what staff enter on an order", () => {
  it("the delivery charge: validated, the total recalculated by the database, audited, locked after the money is collected", () =>
    uncapped(async () => {
      const { order_id, subtotal_paisa } = await place(alice, 2);
      expect((await alice.client.rpc("set_order_delivery_charge", { p_order_id: order_id, p_shipping_paisa: 1 })).error?.message).toBe("not_authorized");
      expect((await staff.client.rpc("set_order_delivery_charge", { p_order_id: order_id, p_shipping_paisa: -1 })).error?.message).toBe("invalid_amount");
      expect((await staff.client.rpc("set_order_delivery_charge", { p_order_id: order_id, p_shipping_paisa: 99_999_999 })).error?.message).toBe("invalid_amount");
      expect((await staff.client.rpc("set_order_delivery_charge", { p_order_id: order_id, p_shipping_paisa: 85_000 })).error).toBeNull();
      const row = await orderRow(order_id);
      expect(Number(row.total_paisa)).toBe(Number(subtotal_paisa) + 85_000);
      expect(row.shipping_confirmed).toBe(true);
      const payment = await service.from("payments").select("amount_paisa").eq("order_id", order_id).single();
      expect(Number(payment.data?.amount_paisa)).toBe(Number(row.total_paisa));

      await setStatus(staff, order_id, "confirmed");
      await setStatus(staff, order_id, "dispatched");
      expect((await staff.client.rpc("mark_cod_collected", { p_order_id: order_id })).error).toBeNull();
      expect((await staff.client.rpc("set_order_delivery_charge", { p_order_id: order_id, p_shipping_paisa: 1000 })).error?.message).toBe("order_paid");

      const audit = await service.from("audit_log").select("action").eq("entity_type", "orders").eq("entity_id", order_id);
      const actions = new Set((audit.data ?? []).map((a) => a.action));
      for (const expected of ["order.delivery_charge", "order.status", "order.payment_status"]) expect(actions.has(expected), expected).toBe(true);
    }));

  it("cash on delivery can be collected only for a COD order that has been dispatched, once", () =>
    uncapped(async () => {
      const { order_id } = await place(alice);
      expect((await staff.client.rpc("mark_cod_collected", { p_order_id: order_id })).error?.message).toBe("not_dispatched");
      await setStatus(staff, order_id, "confirmed");
      await setStatus(staff, order_id, "dispatched");
      expect((await alice.client.rpc("mark_cod_collected", { p_order_id: order_id })).error?.message).toBe("not_authorized");
      expect((await staff.client.rpc("mark_cod_collected", { p_order_id: order_id })).error).toBeNull();
      expect((await staff.client.rpc("mark_cod_collected", { p_order_id: order_id })).error?.message).toBe("already_paid");
      expect((await orderRow(order_id)).payment_status).toBe("paid");
    }));

  it("courier (from the list) and tracking number, one shipment per order, audited", () =>
    uncapped(async () => {
      const { order_id } = await place(alice);
      expect((await staff.client.rpc("set_order_shipment", { p_order_id: order_id, p_courier: "Not A Courier" })).error?.message).toBe("courier_unavailable");
      expect((await staff.client.rpc("set_order_shipment", { p_order_id: order_id, p_courier: "TCS", p_tracking_number: "bad;value" })).error?.message).toBe("invalid_tracking_number");
      expect((await alice.client.rpc("set_order_shipment", { p_order_id: order_id, p_courier: "TCS" })).error?.message).toBe("not_authorized");
      expect((await staff.client.rpc("set_order_shipment", { p_order_id: order_id, p_courier: "tcs", p_tracking_number: "TCS-1" })).error).toBeNull();
      expect((await staff.client.rpc("set_order_shipment", { p_order_id: order_id, p_courier: "Leopards", p_tracking_number: "LE-2" })).error).toBeNull();
      const ships = await service.from("shipments").select("courier, tracking_number").eq("order_id", order_id);
      expect(ships.data).toEqual([{ courier: "Leopards", tracking_number: "LE-2" }]);
    }));

  it("internal notes: staff only, and a customer cannot read them", () =>
    uncapped(async () => {
      const { order_id } = await place(alice);
      expect((await alice.client.rpc("add_order_note", { p_order_id: order_id, p_note: "x" })).error?.message).toBe("not_authorized");
      expect((await staff.client.rpc("add_order_note", { p_order_id: order_id, p_note: "  " })).error?.message).toBe("invalid_note");
      expect((await staff.client.rpc("add_order_note", { p_order_id: order_id, p_note: "Call after 5pm" })).error).toBeNull();
      const own = await alice.client.from("internal_notes").select("note").eq("entity_id", order_id);
      expect(own.data ?? []).toEqual([]);
      const staffView = await staff.client.from("internal_notes").select("note").eq("entity_id", order_id);
      expect(staffView.data).toEqual([{ note: "Call after 5pm" }]);
    }));
});

describe("search and filters", () => {
  it("finds an order by number, by phone in any format, by name, by status and by date; customers cannot search", () =>
    uncapped(async () => {
      const phone = testPhone();
      const placed = await place(alice, 1, { p_customer: { full_name: `Zed Searchable ${RUN_TAG}`, phone, email: null } });
      const search = (args: Record<string, unknown>) => staff.client.rpc("search_orders", args);
      const ids = async (args: Record<string, unknown>) => ((await search(args)).data ?? []).map((r: { id: string }) => r.id);
      expect(await ids({ p_query: placed.order_number })).toEqual([placed.order_id]);
      expect(await ids({ p_query: `+92 ${phone.slice(1, 4)}-${phone.slice(4)}` })).toContain(placed.order_id);
      expect(await ids({ p_query: `searchable ${RUN_TAG.toLowerCase()}` })).toContain(placed.order_id);
      expect(await ids({ p_query: placed.order_number, p_status: "pending" })).toEqual([placed.order_id]);
      expect(await ids({ p_query: placed.order_number, p_status: "cancelled" })).toEqual([]);
      const today = new Date().toISOString().slice(0, 10);
      expect(await ids({ p_query: placed.order_number, p_from: "2000-01-01", p_to: "2000-01-02" })).toEqual([]);
      expect(await ids({ p_query: placed.order_number, p_from: today, p_to: today })).toEqual([placed.order_id]);
      expect(await ids({ p_query: "%" })).toEqual([]);
      expect((await alice.client.rpc("search_orders", {})).error?.message).toBe("not_authorized");
      expect((await anon().rpc("search_orders", {})).error).not.toBeNull();
    }));
});

describe("who can read orders", () => {
  it("anon reads no order data at all, and cannot call the tracking function", async () => {
    const a = anon();
    for (const table of ["orders", "order_items", "payments", "shipments", "order_status_history", "internal_notes", "notifications", "audit_log"]) {
      const res = await a.from(table).select("*").limit(1);
      expect(res.error, table).not.toBeNull();
    }
    expect((await a.rpc("get_order_by_tracking_token", { p_token: "0".repeat(64) })).error).not.toBeNull();
  });

  it("a customer sees their own orders only; another customer's id gives nothing", () =>
    uncapped(async () => {
      const mine = await place(alice);
      const theirs = await place(bob);
      const aliceSees = await alice.client.from("orders").select("id").in("id", [mine.order_id, theirs.order_id]);
      expect((aliceSees.data ?? []).map((r) => r.id)).toEqual([mine.order_id]);
      const items = await alice.client.from("order_items").select("order_id").eq("order_id", theirs.order_id);
      expect(items.data ?? []).toEqual([]);
      const shipments = await alice.client.from("shipments").select("id").eq("order_id", theirs.order_id);
      expect(shipments.data ?? []).toEqual([]);
    }));

  it("the tracking summary resolves with the token, holds no phone, e-mail, note or cost, and nothing for a wrong token", () =>
    uncapped(async () => {
      const key = randomUUID();
      const token = "cd".repeat(32);
      const args = { ...orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }], { p_idempotency_key: key, p_customer_notes: "Gate code 4455" }), p_tracking_token: token };
      const placed = await service.rpc("place_order_as_guest", args);
      expect(placed.error).toBeNull();
      await staff.client.rpc("add_order_note", { p_order_id: placed.data.order_id, p_note: "internal remark XYZ" });
      const summary = await service.rpc("get_order_by_tracking_token", { p_token: token });
      expect(summary.data.order_number).toBe(placed.data.order_number);
      const text = JSON.stringify(summary.data);
      expect(text).not.toMatch(/internal remark|Gate code|example\.test|UST Test Customer|cost|phone|email/i);
      expect(summary.data.shipping_confirmed).toBe(false);
      expect((await service.rpc("get_order_by_tracking_token", { p_token: "ef".repeat(32) })).data).toBeNull();
      expect((await service.rpc("get_order_by_tracking_token", { p_token: "' or 1=1 --" })).data).toBeNull();
    }));

  it("order lines carry no cost column", async () => {
    const res = await staff.client.from("order_items").select("*").limit(1);
    expect(Object.keys(res.data?.[0] ?? {}).filter((k) => /cost|margin|profit/i.test(k))).toEqual([]);
  });
});

describe("the owner notification record", () => {
  it("there is at most one per order, and staff can read its status but customers cannot", () =>
    uncapped(async () => {
      const { order_id } = await place(alice);
      const row = { channel: "email", recipient: "owner@example.test", template: "owner_new_order", order_id, status: "pending" };
      expect((await service.from("notifications").insert(row)).error).toBeNull();
      expect((await service.from("notifications").insert(row)).error?.code).toBe("23505");
      expect(((await staff.client.from("notifications").select("status").eq("order_id", order_id)).data ?? []).length).toBe(1);
      expect((await alice.client.from("notifications").select("status").eq("order_id", order_id)).data ?? []).toEqual([]);
    }));
});

const RUN_TAG = randomUUID().slice(0, 6).toUpperCase();
