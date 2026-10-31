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
// A Supabase stack on this machine (127.0.0.1 / localhost) cannot be production, so it needs no project ref.
const isLocal = ["127.0.0.1", "localhost"].includes(new URL(url).hostname);
if (process.env.UST_EXPECT_LOCAL === "1" && !isLocal) {
  throw new Error("UST_EXPECT_LOCAL=1 but the Supabase URL is not on this machine; refusing to run.");
}
if (!isLocal && (!devRef || !/^[a-z0-9]{20}$/.test(devRef) || new URL(url).hostname !== `${devRef}.supabase.co`)) {
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
let deliveryReady = false;

async function ensureDeliveryMethod() {
  if (deliveryReady) return;
  // Since Phase 4 no shipping rate is needed: the delivery charge is entered by staff after the order is placed.
  ok(await service.from("delivery_methods").insert({ id: DELIVERY_METHOD_ID, name: `UST TEST ${RUN}` }), "delivery method");
  deliveryReady = true;
}

export type Fixture = { productId: string; variantId: string; sku: string; pricePaisa: number; deliveryMethodId: string };

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
  return { productId: product.id, variantId: variant.id, sku, pricePaisa: opts.pricePaisa, deliveryMethodId: DELIVERY_METHOD_ID };
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

export type ProjectNeeds = {
  /** table -> columns that must exist */
  columns?: Record<string, string[]>;
  /** functions that must exist, with arguments that make the call harmless (it is expected to refuse or return nothing) */
  functions?: { name: string; args: Record<string, unknown> }[];
  /** the migration(s) that create these objects, for the message */
  migrations: string[];
};

/**
 * Runs FIRST in a test file's beforeAll. Asks the project whether every column and function the file relies
 * on exists, and fails with ONE message that lists everything missing, instead of a confusing error from the
 * middle of a fixture. A migration can be recorded in schema_migrations without having been applied (the
 * record is a separate statement), so the list of applied migrations is not proof; this asks the objects.
 */
export async function assertProjectHas(needs: ProjectNeeds) {
  const missing: string[] = [];
  for (const [table, columns] of Object.entries(needs.columns ?? {})) {
    for (const column of columns) {
      const res = await service.from(table).select(column).limit(1);
      if (res.error) missing.push(`column ${table}.${column} (${res.error.code ?? "no code"}: ${res.error.message})`);
    }
  }
  for (const fn of needs.functions ?? []) {
    const res = await service.rpc(fn.name, fn.args);
    // PGRST202: no function with that name and argument names. Any other answer (even a refusal) means it exists.
    if (res.error?.code === "PGRST202" || res.error?.code === "42883") missing.push(`function ${fn.name}(${Object.keys(fn.args).join(", ")})`);
  }
  if (missing.length > 0) {
    throw new Error(
      `This project is missing ${missing.length} object(s) that these tests need:\n  - ${missing.join("\n  - ")}\n` +
        `Expected from: ${needs.migrations.join(", ")}.\n` +
        `A migration can be listed in supabase_migrations.schema_migrations without having been applied. Run ` +
        `supabase/checks/schema_check.sql in the SQL Editor to see exactly what is missing, apply the migration(s) ` +
        `(docs/CATALOG.md), and if you just applied one, run: notify pgrst, 'reload schema';`,
    );
  }
}
