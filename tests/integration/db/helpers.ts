// Helpers for database tests that run against the hosted Supabase DEV project (npm run test:db).
// They create their own labelled fixtures (UST-TEST-<run>) and test users (@example.test), and
// never touch real customer data. Ledger rows are append-only by design, so test orders and
// stock movements remain in the dev database; reset it with `supabase db reset --linked`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (process.env.DB_TESTS !== "dev") {
  throw new Error("Refusing to run: set DB_TESTS=dev to confirm these tests target your DEV Supabase project.");
}
if (!url || !anonKey || !serviceKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export const RUN = randomBytes(3).toString("hex").toUpperCase();
export const service = createClient(url, serviceKey, noSession);
export const anon = () => createClient(url, anonKey, noSession);

export type TestUser = { id: string; email: string; client: SupabaseClient };
const createdUsers: string[] = [];

export async function createUser(label: string, role?: "admin" | "staff"): Promise<TestUser> {
  const email = `ust-test-${RUN.toLowerCase()}-${label}@example.test`;
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser ${label}: ${error?.message}`);
  createdUsers.push(data.user.id);
  if (role) {
    const { error: roleError } = await service.from("user_roles").insert({ user_id: data.user.id, role });
    if (roleError) throw new Error(`grant ${role}: ${roleError.message}`);
  }
  const client = createClient(url!, anonKey!, noSession);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn ${label}: ${signInError.message}`);
  return { id: data.user.id, email, client };
}

export async function deleteUsers() {
  for (const id of createdUsers.splice(0)) await service.auth.admin.deleteUser(id);
}

export type Fixture = { productId: string; variantId: string; sku: string; pricePaisa: number; deliveryMethodId: string; shippingPaisa: number };

/** Creates a published product with one variant, opening stock (through adjust_stock as admin) and a delivery method. */
export async function createFixture(admin: TestUser, label: string, opts: { pricePaisa: number; stock: number }): Promise<Fixture> {
  const { data: category, error: catError } = await service
    .from("categories")
    .upsert({ slug: "ust-test", name: "UST TEST (automated tests)", is_active: false }, { onConflict: "parent_id,slug" })
    .select("id")
    .single();
  if (catError) throw new Error(`category: ${catError.message}`);

  const slug = `ust-test-${RUN.toLowerCase()}-${label}`;
  const { data: product, error: pError } = await service
    .from("products")
    .insert({ slug, name: `UST TEST ${RUN} ${label}`, category_id: category.id, status: "published" })
    .select("id")
    .single();
  if (pError) throw new Error(`product: ${pError.message}`);

  const sku = `UST-TEST-${RUN}-${label.toUpperCase()}`;
  const { data: variant, error: vError } = await service
    .from("product_variants")
    .insert({ product_id: product.id, sku, regular_price_paisa: opts.pricePaisa, is_default: true })
    .select("id")
    .single();
  if (vError) throw new Error(`variant: ${vError.message}`);

  if (opts.stock > 0) {
    const { error } = await admin.client.rpc("adjust_stock", {
      p_variant_id: variant.id,
      p_on_hand_delta: opts.stock,
      p_movement_type: "receive",
      p_reason: `UST TEST ${RUN} opening stock`,
    });
    if (error) throw new Error(`adjust_stock: ${error.message}`);
  }

  const deliveryMethodId = `ust_test_${RUN.toLowerCase()}`;
  const shippingPaisa = 25_000;
  await service.from("delivery_methods").upsert({ id: deliveryMethodId, name: `UST TEST ${RUN}`, is_active: true });
  await service
    .from("shipping_rates")
    .upsert(
      // free_over_paisa set very high so the store-wide free-delivery threshold never applies here.
      { delivery_method_id: deliveryMethodId, fee_paisa: shippingPaisa, free_over_paisa: 9_000_000_000 },
      { onConflict: "id" },
    );
  return { productId: product.id, variantId: variant.id, sku, pricePaisa: opts.pricePaisa, deliveryMethodId, shippingPaisa };
}

/** Archives fixtures so they disappear from the storefront (rows with ledger history cannot be deleted). */
export async function archiveFixtures() {
  await service.from("products").update({ status: "archived" }).like("slug", `ust-test-${RUN.toLowerCase()}-%`);
  await service.from("delivery_methods").update({ is_active: false }).eq("id", `ust_test_${RUN.toLowerCase()}`);
}

export const customer = { full_name: "UST Test Customer", phone: "0300 1234567", email: "customer@example.test" };
export const address = { line1: "Test House 1", city: "Khanpur", province: "Punjab" };

export function orderArgs(fx: Fixture, items: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    p_idempotency_key: randomUUID(),
    p_items: items,
    p_customer: customer,
    p_shipping_address: address,
    p_delivery_method_id: fx.deliveryMethodId,
    p_payment_method: "cod",
    p_coupon_code: null,
    p_customer_notes: null,
    ...overrides,
  };
}

export async function inventoryOf(variantId: string) {
  const { data, error } = await service.from("inventory").select("on_hand, reserved").eq("variant_id", variantId).single();
  if (error) throw new Error(error.message);
  return data;
}
