// Helpers for database tests that run against the hosted Supabase DEV project (npm run test:db).
// They create their own labelled fixtures (UST-TEST-<run>) and test users (@example.test), and
// never touch real customer data. Ledger rows are append-only by design, so test orders and
// stock movements remain in the dev database (reset the DEV project to clear them).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomInt, randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const devRef = process.env.DB_TEST_PROJECT_REF;

if (process.env.DB_TESTS !== "dev") {
  throw new Error("Refusing to run: use `npm run test:db`, which targets your DEV Supabase project.");
}
if (!url || !anonKey || !serviceKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.");
}
// The tests create admin users, publish products and place orders, so they must never hit production.
if (!devRef || !/^[a-z0-9]{20}$/.test(devRef) || new URL(url).hostname !== `${devRef}.supabase.co`) {
  throw new Error(
    "Refusing to run: set DB_TEST_PROJECT_REF to your DEV project ref; it must match NEXT_PUBLIC_SUPABASE_URL.",
  );
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export const RUN = randomBytes(3).toString("hex").toUpperCase();
const run = RUN.toLowerCase();
export const service = createClient(url, serviceKey, noSession);
export const anon = () => createClient(url, anonKey, noSession);

/** Throws on error; returns data (possibly null for writes without .select()). */
function ok<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/** Like ok(), but data must be present. */
function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  const data = ok(res, what);
  if (data === null || data === undefined) throw new Error(`${what}: no data returned`);
  return data as NonNullable<T>;
}

export type TestUser = { id: string; email: string; client: SupabaseClient };
const createdUsers: string[] = [];

export async function createUser(label: string, role?: "admin" | "staff"): Promise<TestUser> {
  const email = `ust-test-${run}-${label}@example.test`;
  const password = randomBytes(24).toString("base64url");
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser ${label}: ${created.error?.message ?? "no user"}`);
  const user = created.data.user;
  createdUsers.push(user.id);
  if (role) ok(await service.from("user_roles").insert({ user_id: user.id, role }), `grant ${role}`);
  const client = createClient(url!, anonKey!, noSession);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`signIn ${label}: ${signIn.error.message}`);
  return { id: user.id, email, client };
}

export async function deleteUsers() {
  const failures: string[] = [];
  for (const id of createdUsers.splice(0)) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) failures.push(`${id}: ${error.message}`);
  }
  if (failures.length) throw new Error(`deleteUsers: ${failures.join("; ")}`);
}

export const DELIVERY_METHOD_ID = `ust_test_${run}`;
export const SHIPPING_PAISA = 25_000;
let deliveryReady = false;

async function ensureDeliveryMethod() {
  if (deliveryReady) return;
  ok(await service.from("delivery_methods").insert({ id: DELIVERY_METHOD_ID, name: `UST TEST ${RUN}` }), "delivery method");
  // free_over_paisa very high so the store-wide free-delivery threshold never applies here.
  ok(
    await service.from("shipping_rates").insert({ delivery_method_id: DELIVERY_METHOD_ID, fee_paisa: SHIPPING_PAISA, free_over_paisa: 9_000_000_000 }),
    "shipping rate",
  );
  deliveryReady = true;
}

export type Fixture = { productId: string; variantId: string; sku: string; pricePaisa: number; deliveryMethodId: string; shippingPaisa: number };

/** A published product with one variant, opening stock (through adjust_stock as admin) and a delivery method. */
export async function createFixture(admin: TestUser, label: string, opts: { pricePaisa: number; stock: number }): Promise<Fixture> {
  await ensureDeliveryMethod();
  const category = must(
    await service
      .from("categories")
      // Active, because a product in an inactive category is not readable by anon (Phase 3B). It is deactivated
      // again, and the products archived, in archiveFixtures(); do not run these tests while browsing the shop.
      .upsert({ slug: "ust-test", name: "UST TEST (automated tests)", is_active: true }, { onConflict: "parent_id,slug" })
      .select("id")
      .single(),
    "category",
  );
  const product = must(
    await service
      .from("products")
      .insert({ slug: `ust-test-${run}-${label}`, name: `UST TEST ${RUN} ${label}`, category_id: category.id, status: "published" })
      .select("id")
      .single(),
    "product",
  );
  const sku = `UST-TEST-${RUN}-${label.toUpperCase()}`;
  const variant = must(
    await service
      .from("product_variants")
      .insert({ product_id: product.id, sku, regular_price_paisa: opts.pricePaisa, is_default: true })
      .select("id")
      .single(),
    "variant",
  );
  if (opts.stock > 0) {
    ok(
      await admin.client.rpc("adjust_stock", {
        p_variant_id: variant.id,
        p_on_hand_delta: opts.stock,
        p_movement_type: "receive",
        p_reason: `UST TEST ${RUN} opening stock`,
      }),
      "adjust_stock",
    );
  }
  return { productId: product.id, variantId: variant.id, sku, pricePaisa: opts.pricePaisa, deliveryMethodId: DELIVERY_METHOD_ID, shippingPaisa: SHIPPING_PAISA };
}

/** Archives fixtures so they disappear from the storefront (ordered products cannot be deleted). */
export async function archiveFixtures() {
  ok(await service.from("products").update({ status: "archived" }).like("slug", `ust-test-${run}-%`), "archive products");
  ok(await service.from("categories").update({ is_active: false }).eq("slug", "ust-test").is("parent_id", null), "deactivate fixture category");
  if (deliveryReady) ok(await service.from("delivery_methods").update({ is_active: false }).eq("id", DELIVERY_METHOD_ID), "archive delivery");
}

/** Runs fn with a store setting temporarily changed, then restores it. */
export async function withSetting<T>(column: string, value: unknown, fn: () => Promise<T>): Promise<T> {
  const before = must(await service.from("store_settings").select(column).eq("id", true).single(), "read setting") as unknown as Record<string, unknown>;
  ok(await service.from("store_settings").update({ [column]: value }).eq("id", true), "set setting");
  try {
    return await fn();
  } finally {
    ok(await service.from("store_settings").update({ [column]: before[column] }).eq("id", true), "restore setting");
  }
}

/** A unique Pakistani mobile number per order, so the per-phone open-order cap does not interfere. */
export const testPhone = () => `03${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
export const address = { line1: "Test House 1", city: "Khanpur", province: "Punjab" };

export function orderArgs(fx: Fixture, items: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    p_idempotency_key: randomUUID(),
    p_items: items,
    p_customer: { full_name: "UST Test Customer", phone: testPhone(), email: "customer@example.test" },
    p_shipping_address: address,
    p_delivery_method_id: fx.deliveryMethodId,
    p_payment_method: "cod",
    p_coupon_code: null,
    p_customer_notes: null,
    ...overrides,
  };
}

export async function inventoryOf(variantId: string) {
  return must(await service.from("inventory").select("on_hand, reserved").eq("variant_id", variantId).single(), "inventory");
}
