// Phase 2 database tests against the DEV Supabase project: rate limiter, staff-only columns,
// address rules, anonymous sign-ins. Run: npm run test:db
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { archiveFixtures, createFixture, createUser, deleteUsers, orderArgs, service, anon, type Fixture, type TestUser } from "./helpers";

let admin: TestUser;
let staff: TestUser;
let alice: TestUser;
let bob: TestUser;
let fx: Fixture;
let aliceOrderId: string;

beforeAll(async () => {
  admin = await createUser("auth-admin", "admin");
  staff = await createUser("auth-staff", "staff");
  alice = await createUser("auth-alice");
  bob = await createUser("auth-bob");
  fx = await createFixture(admin, "auth", { pricePaisa: 100_000, stock: 10 });
  const { data, error } = await alice.client.rpc("place_order", orderArgs(fx, [{ variant_id: fx.variantId, quantity: 1 }]));
  if (error) throw new Error(error.message);
  aliceOrderId = data.order_id;
  // A staff-written note and a status change, so there is something staff-only to look for.
  const note = await staff.client.from("internal_notes").insert({ entity_type: "order", entity_id: aliceOrderId, note: "call before delivery" });
  if (note.error) throw new Error(note.error.message);
  const status = await staff.client.rpc("set_order_status", { p_order_id: aliceOrderId, p_status: "confirmed", p_note: "confirmed by phone" });
  if (status.error) throw new Error(status.error.message);
});

afterAll(async () => {
  await archiveFixtures();
  await deleteUsers();
});

describe("rate limiter", () => {
  const key = () => `ust-test-${Math.random().toString(16).slice(2)}`;
  const call = (client: { rpc: typeof service.rpc }, k: string, limit = 2, window = 60) =>
    client.rpc("check_rate_limit", { p_bucket: "login_ip", p_key: k, p_limit: limit, p_window_seconds: window });

  it("counts attempts and refuses over the limit, with a retry time", async () => {
    const k = key();
    const first = await call(service, k);
    const second = await call(service, k);
    const third = await call(service, k);
    expect(first.data?.[0]).toMatchObject({ allowed: true });
    expect(second.data?.[0]).toMatchObject({ allowed: true });
    expect(third.data?.[0].allowed).toBe(false);
    expect(third.data?.[0].retry_after_seconds).toBeGreaterThan(0);
    expect(third.data?.[0].retry_after_seconds).toBeLessThanOrEqual(60);
  });

  it("keeps keys independent and resets after the window", async () => {
    const a = key();
    expect((await call(service, a, 1, 1)).data?.[0].allowed).toBe(true);
    expect((await call(service, a, 1, 1)).data?.[0].allowed).toBe(false);
    expect((await call(service, key(), 1, 1)).data?.[0].allowed).toBe(true);
    await new Promise((r) => setTimeout(r, 1500));
    expect((await call(service, a, 1, 1)).data?.[0].allowed).toBe(true);
  });

  it("is safe under concurrent calls", async () => {
    const k = key();
    const results = await Promise.all(Array.from({ length: 10 }, () => call(service, k, 4)));
    const allowed = results.filter((r) => r.data?.[0].allowed).length;
    expect(allowed).toBe(4);
  });

  it("rejects nonsense arguments", async () => {
    expect((await call(service, "", 1)).error).not.toBeNull();
    expect((await call(service, key(), 0)).error).not.toBeNull();
    expect((await call(service, key(), 1, 999_999)).error).not.toBeNull();
  });

  it("cannot be called, or read, by visitors or signed-in users (they could lock others out)", async () => {
    for (const client of [anon(), alice.client, staff.client, admin.client]) {
      const r = await call(client, key());
      expect(r.error).not.toBeNull();
      const t = await client.from("rate_limits").select("key");
      expect(t.error !== null || (t.data ?? []).length === 0).toBe(true);
    }
  });
});

describe("staff-only columns are hidden from customers", () => {
  const cases: Array<[string, string, string]> = [
    ["order_status_history", "id, order_id, from_status, to_status, note, created_at", "actor_id"],
    ["payments", "id, order_id, method, amount_paisa, status, verified_at", "verified_by"],
    ["shipments", "id, order_id, courier, tracking_number", "created_by"],
    ["refunds", "id, order_id, amount_paisa, status", "created_by"],
  ];

  it.each(cases)("%s: a customer reads the allowed columns of their own order only", async (table, columns) => {
    const own = await alice.client.from(table).select(columns).eq("order_id", aliceOrderId);
    expect(own.error).toBeNull();
    const other = await bob.client.from(table).select(columns).eq("order_id", aliceOrderId);
    expect(other.data ?? []).toEqual([]);
  });

  it.each(cases)("%s: the staff identity column is refused, also with select *", async (table, _columns, hidden) => {
    for (const who of [alice, staff, admin]) {
      const named = await who.client.from(table).select(hidden).limit(1);
      expect(named.error?.code).toBe("42501");
      const star = await who.client.from(table).select("*").limit(1);
      expect(star.error?.code).toBe("42501");
    }
  });

  it("the actor of a status change is still recorded and visible to staff in the audit log", async () => {
    const { data: history } = await service.from("order_status_history").select("actor_id").eq("order_id", aliceOrderId).eq("to_status", "confirmed");
    expect(history?.[0].actor_id).toBe(staff.id);
    const audit = await staff.client.from("audit_log").select("actor_id, action").eq("entity_id", aliceOrderId).eq("action", "order.status");
    expect(audit.data?.some((r) => r.actor_id === staff.id)).toBe(true);
  });

  it("customers see the customer-facing status note, never internal notes", async () => {
    const history = await alice.client.from("order_status_history").select("note, to_status").eq("order_id", aliceOrderId);
    expect(history.data?.some((r) => r.note === "confirmed by phone")).toBe(true);

    const mine = await alice.client.from("internal_notes").select("note");
    expect(mine.data ?? []).toEqual([]);
    const byId = await alice.client.from("internal_notes").select("note").eq("entity_id", aliceOrderId);
    expect(byId.data ?? []).toEqual([]);
    const insert = await alice.client.from("internal_notes").insert({ entity_type: "order", entity_id: aliceOrderId, note: "x" });
    expect(insert.error).not.toBeNull();

    const staffView = await staff.client.from("internal_notes").select("note").eq("entity_id", aliceOrderId);
    expect(staffView.data?.[0].note).toBe("call before delivery");
  });

  it("no customer-readable order table exposes a column named like staff data", async () => {
    // order rows themselves carry no staff identity or note columns
    const o = await alice.client.from("orders").select("*").eq("id", aliceOrderId).single();
    expect(o.error).toBeNull();
    const keys = Object.keys(o.data ?? {});
    expect(keys.filter((k) => /internal|staff|actor|verified_by|created_by/.test(k))).toEqual([]);
  });
});

describe("addresses", () => {
  const base = { full_name: "Ali Khan", phone: "03001234567", line1: "House 1", city: "Okara", province: "Punjab" };

  it("first address becomes the default; a new default replaces it; deleting the default promotes another", async () => {
    const a = await bob.client.from("addresses").insert({ ...base, label: "one" }).select("id, is_default").single();
    expect(a.data?.is_default).toBe(true);
    const b = await bob.client.from("addresses").insert({ ...base, label: "two", is_default: true }).select("id, is_default").single();
    expect(b.data?.is_default).toBe(true);
    let rows = (await bob.client.from("addresses").select("id, is_default")).data ?? [];
    expect(rows.filter((r) => r.is_default).map((r) => r.id)).toEqual([b.data!.id]);

    const set = await bob.client.from("addresses").update({ is_default: true }).eq("id", a.data!.id).select("id");
    expect(set.data?.length).toBe(1);
    rows = (await bob.client.from("addresses").select("id, is_default")).data ?? [];
    expect(rows.filter((r) => r.is_default).map((r) => r.id)).toEqual([a.data!.id]);

    await bob.client.from("addresses").delete().eq("id", a.data!.id);
    rows = (await bob.client.from("addresses").select("id, is_default")).data ?? [];
    expect(rows).toEqual([{ id: b.data!.id, is_default: true }]);
  });

  it("caps a customer at 10 addresses", async () => {
    const carol = await createUser("auth-carol");
    for (let i = 0; i < 10; i++) {
      const r = await carol.client.from("addresses").insert({ ...base, label: `n${i}` });
      expect(r.error).toBeNull();
    }
    const eleventh = await carol.client.from("addresses").insert({ ...base, label: "n11" });
    expect(eleventh.error?.message).toContain("address_limit_reached");
  });

  it("another customer cannot read, change, delete or create addresses for someone else", async () => {
    const mine = await alice.client.from("addresses").insert(base).select("id").single();
    const id = mine.data!.id as string;
    expect((await bob.client.from("addresses").select("id").eq("id", id)).data ?? []).toEqual([]);
    expect((await bob.client.from("addresses").update({ city: "Hacked" }).eq("id", id).select("id")).data ?? []).toEqual([]);
    expect((await bob.client.from("addresses").delete().eq("id", id).select("id")).data ?? []).toEqual([]);
    expect((await bob.client.from("addresses").insert({ ...base, user_id: alice.id })).error).not.toBeNull();
    expect((await alice.client.from("addresses").select("city").eq("id", id).single()).data?.city).toBe("Okara");
  });
});

describe("profiles", () => {
  it("a customer cannot disable themselves or re-enable themselves", async () => {
    const r = await alice.client.from("profiles").update({ disabled_at: new Date().toISOString() }).eq("id", alice.id).select("id");
    expect(r.error).not.toBeNull();
    const row = await service.from("profiles").select("disabled_at").eq("id", alice.id).single();
    expect(row.data?.disabled_at).toBeNull();
  });

  it("a customer can edit their own name, phone and company, and not another customer's", async () => {
    const own = await alice.client.from("profiles").update({ full_name: "Alice Edited", phone: "03111234567" }).eq("id", alice.id).select("id");
    expect(own.data?.length).toBe(1);
    const other = await alice.client.from("profiles").update({ full_name: "Hacked" }).eq("id", bob.id).select("id");
    expect(other.data ?? []).toEqual([]);
  });
});

describe("anonymous sign-ins stay off", () => {
  it("Supabase refuses anonymous sign-in on this project", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await client.auth.signInAnonymously();
    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });
});
