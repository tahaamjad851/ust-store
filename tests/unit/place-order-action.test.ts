import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const updateTag = vi.fn();
vi.mock("next/cache", () => ({ updateTag: (t: string) => updateTag(t), revalidatePath: vi.fn() }));
const afterCallbacks: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => unknown) => afterCallbacks.push(fn), connection: async () => undefined }));

type AuthState = { status: "anonymous" } | { status: "disabled" } | { status: "ok"; user: { id: string; fullName: string; phone: string; email: string } };
let auth: AuthState;
vi.mock("@/lib/auth/session", () => ({ getAuthState: async () => auth }));

let limit: { allowed: true } | { allowed: false; reason: "limited"; retryAfterSeconds: number };
const checkRateLimits = vi.fn(async () => limit);
vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimits: (...a: unknown[]) => (checkRateLimits as (...x: unknown[]) => unknown)(...a),
  clientIp: async () => "203.0.113.9",
  rateLimitMessage: () => "Too many attempts. Please wait 5 minutes and try again.",
}));

type Rpc = { fn: string; args: Record<string, unknown>; client: "user" | "service" };
let rpcCalls: Rpc[];
let rpcResult: { data: unknown; error: { message: string; code?: string } | null };
const makeClient = (client: Rpc["client"]) => ({
  rpc: async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args, client });
    return rpcResult;
  },
  from: () => ({ select: () => ({ eq: () => ({ order: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }),
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => makeClient("user") }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeClient("service") }));
const notify = vi.fn(async (id: string) => (id ? "sent" : "failed"));
vi.mock("@/features/orders/owner-notification", () => ({ notifyOwnerOfNewOrder: (id: string) => notify(id) }));

import { loadCheckoutPrefill, placeOrderAction } from "@/features/orders/actions";
import { deriveTrackingToken } from "@/features/orders/tracking-token";

const KEY = "33333333-3333-4333-8333-333333333333";
const VARIANT = "11111111-1111-4111-8111-111111111111";
const SECRET = "test-service-role-key";
const form = {
  phone: "0300 1234567",
  full_name: "Ali Khan",
  email: "",
  company_name: "",
  address_type: "farm",
  province: "Punjab",
  city: "Khanpur",
  address: "Chak 12",
  landmark: "",
  cargo_terminal: "",
  delivery_method_id: "courier",
  payment_method: "cod",
  call_to_confirm: false,
  notes: "",
};
const input = (over: Record<string, unknown> = {}) => ({ idempotency_key: KEY, items: [{ variant_id: VARIANT, quantity: 2 }], form, ...over });
const placed = (over: Record<string, unknown> = {}) => ({
  order_id: "44444444-4444-4444-8444-444444444444",
  order_number: "UST-2026-000123",
  tracking_token: null,
  replayed: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = SECRET;
  auth = { status: "anonymous" };
  limit = { allowed: true };
  rpcCalls = [];
  rpcResult = { data: placed(), error: null };
  afterCallbacks.length = 0;
});

describe("placeOrderAction: a guest", () => {
  it("is rate limited, then placed through the server-only guest function with a derived tracking token", async () => {
    const result = await placeOrderAction(input());
    const token = deriveTrackingToken(KEY, SECRET);
    expect(checkRateLimits).toHaveBeenCalledWith([
      ["checkout_ip", "203.0.113.9"],
      ["checkout_phone_ip", "03001234567|203.0.113.9"],
      ["checkout_all", "all"],
    ]);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({ fn: "place_order_as_guest", client: "service" });
    expect(rpcCalls[0].args.p_tracking_token).toBe(token);
    expect(result).toEqual({ ok: true, redirectTo: `/order/${token}?placed=1`, orderNumber: "UST-2026-000123" });
  });

  it("sends the key, ids, quantities and text, and no price, total, discount or delivery charge", async () => {
    await placeOrderAction(input({ items: [{ variant_id: VARIANT, quantity: 2, price_paisa: 1, unit_price: 1, total_paisa: 1 }], total_paisa: 1, shipping_paisa: 99999 }));
    const args = rpcCalls[0].args;
    expect(args.p_idempotency_key).toBe(KEY);
    expect(args.p_items).toEqual([{ variant_id: VARIANT, quantity: 2 }]);
    expect(Object.keys(args).filter((k) => /price|total|discount|shipping_paisa|fee/.test(k))).toEqual([]);
    expect(JSON.stringify(args)).not.toMatch(/99999|price_paisa|total_paisa/);
  });

  it("is refused before the database when the limit is reached", async () => {
    limit = { allowed: false, reason: "limited", retryAfterSeconds: 300 };
    const result = await placeOrderAction(input());
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/Too many attempts/) });
    expect(rpcCalls).toHaveLength(0);
  });

  it("tells the owner once, after the response", async () => {
    await placeOrderAction(input());
    expect(notify).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(notify).toHaveBeenCalledWith("44444444-4444-4444-8444-444444444444");
  });

  it("a retry of the same attempt (replayed) returns the same link and sends no second e-mail", async () => {
    rpcResult = { data: placed({ replayed: true, tracking_token: deriveTrackingToken(KEY, SECRET) }), error: null };
    const result = await placeOrderAction(input());
    expect(result).toMatchObject({ ok: true, redirectTo: `/order/${deriveTrackingToken(KEY, SECRET)}?placed=1` });
    expect(afterCallbacks).toHaveLength(0);
  });

  it("refreshes the shop's stock labels after an order", async () => {
    await placeOrderAction(input());
    expect(updateTag).toHaveBeenCalledWith("catalog-stock");
    expect(updateTag).toHaveBeenCalledWith("catalog-products");
  });
});

describe("placeOrderAction: a signed-in customer", () => {
  beforeEach(() => {
    auth = { status: "ok", user: { id: "55555555-5555-4555-8555-555555555555", fullName: "Ali", phone: "03001234567", email: "a@example.test" } };
  });

  it("uses their own session, no rate-limit bucket of the guest path, and lands on their order page", async () => {
    const result = await placeOrderAction(input());
    expect(rpcCalls[0]).toMatchObject({ fn: "place_order", client: "user" });
    expect(rpcCalls[0].args).not.toHaveProperty("p_tracking_token");
    expect(checkRateLimits).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, redirectTo: "/account/orders/44444444-4444-4444-8444-444444444444?placed=1", orderNumber: "UST-2026-000123" });
  });

  it("a disabled account cannot order", async () => {
    auth = { status: "disabled" };
    const result = await placeOrderAction(input());
    expect(result).toMatchObject({ ok: false });
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("placeOrderAction: refusals", () => {
  it("puts a database refusal on the right field", async () => {
    rpcResult = { data: null, error: { message: "invalid_phone", code: "22023" } };
    const result = await placeOrderAction(input());
    expect(result).toMatchObject({ ok: false, fieldErrors: { phone: expect.any(String) } });
    expect(afterCallbacks).toHaveLength(0);
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("says the stock ran out without a number, and does not tell the owner", async () => {
    rpcResult = { data: null, error: { message: "insufficient_stock", code: "P0001" } };
    const result = await placeOrderAction(input());
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/no longer available/) });
    expect(afterCallbacks).toHaveLength(0);
  });

  it("asks the browser for a new key when the old one was used for another request", async () => {
    rpcResult = { data: null, error: { message: "idempotency_key_conflict", code: "23505" } };
    expect(await placeOrderAction(input())).toMatchObject({ ok: false, newKey: true });
  });

  it("refuses invalid input without calling anything", async () => {
    for (const bad of [
      input({ items: [] }),
      input({ idempotency_key: "not-a-uuid" }),
      input({ form: { ...form, phone: "123" } }),
      input({ items: [{ variant_id: VARIANT, quantity: 0 }] }),
      null,
      "oops",
    ]) {
      const result = await placeOrderAction(bad);
      expect(result.ok).toBe(false);
    }
    expect(rpcCalls).toHaveLength(0);
    expect(checkRateLimits).not.toHaveBeenCalled();
  });

  it("reports a field error for a bad form value", async () => {
    const result = await placeOrderAction(input({ form: { ...form, phone: "123" } }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { phone: expect.any(String) } });
  });

  it("does not leak a thrown error's text", async () => {
    rpcResult = undefined as never;
    const result = await placeOrderAction(input());
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toMatch(/undefined|TypeError|Cannot read/);
  });

  it("answers an unexpected response shape with the generic message", async () => {
    rpcResult = { data: { surprise: true }, error: null };
    expect(await placeOrderAction(input())).toMatchObject({ ok: false });
  });
});

describe("loadCheckoutPrefill", () => {
  it("is empty for a visitor", async () => {
    expect(await loadCheckoutPrefill()).toEqual({ signedIn: false });
  });

  it("carries a signed-in customer's own details", async () => {
    auth = { status: "ok", user: { id: "55555555-5555-4555-8555-555555555555", fullName: "Ali", phone: "03001234567", email: "a@example.test" } };
    expect(await loadCheckoutPrefill()).toMatchObject({ signedIn: true, full_name: "Ali", phone: "03001234567", email: "a@example.test", addresses: [] });
  });
});
