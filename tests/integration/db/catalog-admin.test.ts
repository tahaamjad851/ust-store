// Phase 3B database tests, against the DEV project (npm run test:db). They cover what the migration
// 20261101100000_catalog_admin.sql promises: every admin write is refused for anon and customers, costs
// are admin-only, a product that was ordered can never be deleted, price changes are logged and large ones
// need a confirmation, and an import is all-or-nothing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anon, archiveFixtures, createFixture, createUser, deleteUsers, orderArgs, RUN, service, type Fixture, type TestUser } from "./helpers";

let admin: TestUser;
let staff: TestUser;
let customer: TestUser;
let fx: Fixture;
let orderedFx: Fixture;
const run = RUN.toLowerCase();

beforeAll(async () => {
  admin = await createUser("cadmin-admin", "admin");
  staff = await createUser("cadmin-staff", "staff");
  customer = await createUser("cadmin-customer");
  fx = await createFixture(admin, "adm", { pricePaisa: 100_000, stock: 10 });
  orderedFx = await createFixture(admin, "ord", { pricePaisa: 50_000, stock: 5 });
  const order = await customer.client.rpc("place_order", orderArgs(orderedFx, [{ variant_id: orderedFx.variantId, quantity: 1 }]));
  if (order.error) throw new Error(`placing the fixture order: ${order.error.message}`);
});

afterAll(async () => {
  await archiveFixtures();
  await deleteUsers();
});

const daily = (who: TestUser, changes: unknown[], confirm = false) => who.client.rpc("apply_daily_changes", { p_changes: changes, p_confirm_large: confirm });

describe("every admin write is refused for anon and customers", () => {
  const writes: [string, (c: ReturnType<typeof anon>) => PromiseLike<{ error: { message: string } | null }>][] = [
    ["insert a category", (c) => c.from("categories").insert({ slug: `zz-${run}`, name: "ZZ" })],
    ["insert a brand", (c) => c.from("brands").insert({ slug: `zz-${run}`, name: "ZZ" })],
    ["insert a tractor make", (c) => c.from("tractor_makes").insert({ slug: `zz-${run}`, name: `ZZ ${RUN}` })],
    ["insert a courier", (c) => c.from("couriers").insert({ name: `ZZ ${RUN}` })],
    ["insert a product", (c) => c.from("products").insert({ slug: `zz-${run}`, name: "ZZ", category_id: randomUUID() })],
    ["apply_daily_changes", (c) => c.rpc("apply_daily_changes", { p_changes: [] })],
    ["import_catalog", (c) => c.rpc("import_catalog", { p_products: [] })],
    ["catalog_reorder", (c) => c.rpc("catalog_reorder", { p_entity: "categories", p_ids: [randomUUID()] })],
    ["set_primary_image", (c) => c.rpc("set_primary_image", { p_image_id: randomUUID() })],
  ];

  for (const [label, attempt] of writes) {
    it(`anon cannot ${label}`, async () => {
      const res = await attempt(anon());
      expect(res.error).not.toBeNull();
    });
    it(`a customer cannot ${label}`, async () => {
      const res = await attempt(customer.client);
      expect(res.error).not.toBeNull();
    });
  }

  it("a customer's update or delete on catalog rows changes nothing", async () => {
    await customer.client.from("products").update({ name: "HACKED" }).eq("id", fx.productId);
    await customer.client.from("product_variants").update({ regular_price_paisa: 1 }).eq("id", fx.variantId);
    await customer.client.from("products").delete().eq("id", fx.productId);
    const { data } = await service.from("product_variants").select("regular_price_paisa, products(name)").eq("id", fx.variantId).single();
    expect(Number(data?.regular_price_paisa)).toBe(100_000);
  });

  it("staff cannot change store settings or couriers", async () => {
    await staff.client.from("store_settings").update({ announcement_text: "hacked" }).eq("id", true);
    const { data } = await service.from("store_settings").select("announcement_text").eq("id", true).single();
    expect(data?.announcement_text).not.toBe("hacked");
    expect((await staff.client.from("couriers").insert({ name: `ZZ ${RUN}` })).error).not.toBeNull();
  });
});

describe("cost prices are admin-only", () => {
  it("an admin can write and read a cost; staff, customers and anon get nothing", async () => {
    expect((await admin.client.from("product_variant_costs").upsert({ variant_id: fx.variantId, cost_paisa: 61_234 })).error).toBeNull();
    const read = await admin.client.from("product_variant_costs").select("cost_paisa").eq("variant_id", fx.variantId);
    expect(read.data?.[0]?.cost_paisa).toBe(61_234);

    expect((await staff.client.from("product_variant_costs").select("cost_paisa").eq("variant_id", fx.variantId)).data).toEqual([]);
    expect((await customer.client.from("product_variant_costs").select("cost_paisa")).data).toEqual([]);
    expect((await anon().from("product_variant_costs").select("cost_paisa")).error?.message).toMatch(/permission denied/);
    expect((await staff.client.from("product_variant_costs").upsert({ variant_id: fx.variantId, cost_paisa: 1 })).error).not.toBeNull();
  });

  it("the audit log never holds a cost value", async () => {
    const { data } = await service.from("audit_log").select("details").eq("entity_type", "product_variant_costs").limit(50);
    expect(JSON.stringify(data)).not.toContain("61234");
  });
});

describe("products in a deactivated category are not readable through the API", () => {
  it("hides a published product, its variants and its price from anon", async () => {
    const category = await service.from("categories").insert({ slug: `zz-off-${run}`, name: `ZZ off ${RUN}`, is_active: false }).select("id").single();
    expect(category.error).toBeNull();
    await service.from("products").update({ category_id: category.data!.id }).eq("id", fx.productId);
    try {
      expect((await anon().from("products").select("id").eq("id", fx.productId)).data).toEqual([]);
      expect((await anon().from("product_variants").select("id").eq("id", fx.variantId)).data).toEqual([]);
      // Staff still see it, to fix it.
      expect((await staff.client.from("products").select("id").eq("id", fx.productId)).data).toHaveLength(1);
    } finally {
      const back = await service.from("categories").select("id").eq("slug", "ust-test").is("parent_id", null).single();
      await service.from("products").update({ category_id: back.data!.id }).eq("id", fx.productId);
      await service.from("categories").update({ is_active: false }).eq("id", category.data!.id);
    }
  });
});

describe("what was ordered is never deleted", () => {
  it("staff cannot delete a product at all (only an admin can)", async () => {
    await staff.client.from("products").delete().eq("id", fx.productId);
    expect((await service.from("products").select("id").eq("id", fx.productId)).data).toHaveLength(1);
  });

  it("an admin cannot delete a product or a variant that is on an order, and nothing is lost", async () => {
    const product = await admin.client.from("products").delete().eq("id", orderedFx.productId);
    expect(product.error?.message).toMatch(/product_has_orders/);
    const variant = await admin.client.from("product_variants").delete().eq("id", orderedFx.variantId);
    expect(variant.error?.message).toMatch(/variant_has_orders/);
    expect((await service.from("products").select("id").eq("id", orderedFx.productId)).data).toHaveLength(1);
    expect((await service.from("stock_movements").select("id").eq("variant_id", orderedFx.variantId)).data!.length).toBeGreaterThan(0);
    expect((await service.from("order_items").select("id").eq("variant_id", orderedFx.variantId)).data).toHaveLength(1);
  });

  it("an admin can delete a never-ordered product, even one with stock history; it is audited", async () => {
    const lonely = await createFixture(admin, "lonely", { pricePaisa: 10_000, stock: 3 });
    expect((await service.from("stock_movements").select("id").eq("variant_id", lonely.variantId)).data!.length).toBeGreaterThan(0);
    const del = await admin.client.from("products").delete().eq("id", lonely.productId);
    expect(del.error).toBeNull();
    expect((await service.from("products").select("id").eq("id", lonely.productId)).data).toEqual([]);
    expect((await service.from("stock_movements").select("id").eq("variant_id", lonely.variantId)).data).toEqual([]);
    const audit = await service.from("audit_log").select("action").eq("action", "products.delete").contains("details", { label: `UST TEST ${RUN} lonely` });
    expect(audit.data!.length).toBeGreaterThan(0);
  });

  it("the stock ledger stays append-only for everyone else", async () => {
    await admin.client.from("stock_movements").delete().eq("variant_id", fx.variantId); // no policy: removes nothing
    expect((await service.from("stock_movements").select("id").eq("variant_id", fx.variantId)).data!.length).toBeGreaterThan(0);
    expect((await service.from("stock_movements").delete().eq("variant_id", fx.variantId)).error?.message).toMatch(/append-only/);
  });

  it("a category or brand that is in use cannot be deleted", async () => {
    const used = await service.from("products").select("category_id").eq("id", fx.productId).single();
    expect((await admin.client.from("categories").delete().eq("id", used.data!.category_id)).error?.message).toMatch(/category_has_products/);
  });
});

describe("daily prices: one transaction, logged, large changes confirmed", () => {
  it("staff save a price; the change is logged with who, old and new, and the source", async () => {
    const row = await service.from("product_variants").select("updated_at").eq("id", fx.variantId).single();
    const res = await daily(staff, [{ variant_id: fx.variantId, expected_updated_at: row.data!.updated_at, regular_price_paisa: 105_000 }]);
    expect(res.error).toBeNull();
    const log = await service.from("price_changes").select("*").eq("variant_id", fx.variantId).order("id", { ascending: false }).limit(1).single();
    expect(log.data).toMatchObject({ changed_by: staff.id, old_regular_paisa: 100_000, new_regular_paisa: 105_000, source: "daily_prices" });
  });

  it("refuses a stale page, a large change without confirmation, and invalid prices", async () => {
    const stale = await daily(staff, [{ variant_id: fx.variantId, expected_updated_at: "2020-01-01T00:00:00+00:00", regular_price_paisa: 106_000 }]);
    expect(stale.error?.message).toBe("stale_data");
    const large = await daily(staff, [{ variant_id: fx.variantId, regular_price_paisa: 500_000 }]);
    expect(large.error?.message).toBe("large_change_unconfirmed");
    expect(JSON.parse(large.error!.details)[0]).toMatchObject({ variant_id: fx.variantId });
    expect((await daily(staff, [{ variant_id: fx.variantId, regular_price_paisa: 0 }])).error?.message).toBe("invalid_price");
    expect((await daily(staff, [{ variant_id: fx.variantId, regular_price_paisa: 100_000, sale_price_paisa: 100_000 }])).error?.message).toBe("invalid_price");
    const now = await service.from("product_variants").select("regular_price_paisa").eq("id", fx.variantId).single();
    expect(Number(now.data!.regular_price_paisa)).toBe(105_000);
  });

  it("one bad row rolls back the whole save; a confirmed large change goes through; orders keep their price", async () => {
    const bad = await daily(staff, [
      { variant_id: fx.variantId, regular_price_paisa: 106_000 },
      { variant_id: orderedFx.variantId, regular_price_paisa: -5 },
    ]);
    expect(bad.error).not.toBeNull();
    expect(Number((await service.from("product_variants").select("regular_price_paisa").eq("id", fx.variantId).single()).data!.regular_price_paisa)).toBe(105_000);

    expect((await daily(staff, [{ variant_id: orderedFx.variantId, regular_price_paisa: 150_000 }], true)).error).toBeNull();
    const item = await service.from("order_items").select("unit_price_paisa").eq("variant_id", orderedFx.variantId).single();
    expect(Number(item.data!.unit_price_paisa)).toBe(50_000);
  });

  it("quick stock and availability are applied together, with the ledger and the actor", async () => {
    const res = await daily(staff, [{ variant_id: fx.variantId, set_on_hand: 25, is_active: false }]);
    expect(res.error).toBeNull();
    const inv = await service.from("inventory").select("on_hand").eq("variant_id", fx.variantId).single();
    expect(inv.data!.on_hand).toBe(25);
    const move = await service.from("stock_movements").select("actor_id").eq("variant_id", fx.variantId).order("id", { ascending: false }).limit(1).single();
    expect(move.data!.actor_id).toBe(staff.id);
    await daily(staff, [{ variant_id: fx.variantId, is_active: true }]);
  });

  it("customers cannot call it", async () => {
    expect((await daily(customer, [{ variant_id: fx.variantId, regular_price_paisa: 1 }])).error?.message).toMatch(/not_authorized|permission/);
  });
});

describe("catalog import is all or nothing", () => {
  const category = async () => (await service.from("categories").select("id").eq("slug", "ust-test").is("parent_id", null).single()).data!.id as string;
  const imp = (who: TestUser, products: unknown[]) => who.client.rpc("import_catalog", { p_products: products, p_label: "test.csv" });

  it("creates, updates by SKU, and writes nothing when one row is invalid", async () => {
    const slug = `ust-test-${run}-imp`;
    const sku = `UST-TEST-${RUN}-IMP`;
    const cat = await category();
    const created = await imp(staff, [{ slug, name: `UST TEST ${RUN} imp`, category_id: cat, variants: [{ sku, regular_price_paisa: 20_000, stock: 4 }] }]);
    expect(created.error).toBeNull();
    expect(created.data).toMatchObject({ products_new: 1, variants_new: 1, stock_changes: 1 });

    const updated = await imp(staff, [{ slug, variants: [{ sku, regular_price_paisa: 21_000 }] }]);
    expect(updated.data).toMatchObject({ products_new: 0, products_updated: 1, variants_updated: 1 });

    const rolledBack = await imp(staff, [
      { slug: `${slug}-a`, name: "A", category_id: cat, variants: [{ sku: `${sku}-A`, regular_price_paisa: 100 }] },
      { slug: `${slug}-b`, name: "B", category_id: cat, variants: [{ sku: `${sku}-B`, regular_price_paisa: -1 }] },
    ]);
    expect(rolledBack.error).not.toBeNull();
    expect((await service.from("products").select("id").like("slug", `${slug}-%`)).data).toEqual([]);

    expect((await imp(staff, [{ slug: `${slug}-x`, name: "X", category_id: cat, variants: [{ sku, regular_price_paisa: 1 }] }])).error?.message).toMatch(/sku_belongs_to_other_product/);
    expect((await imp(staff, [{ slug, variants: [{ sku, cost_paisa: 5 }] }])).error?.message).toBe("cost_requires_admin");
    expect((await imp(admin, [{ slug, variants: [{ sku, cost_paisa: 5 }] }])).error).toBeNull();
    await service.from("products").update({ status: "archived" }).eq("slug", slug);
  });
});

describe("photos follow the database rules", () => {
  it("only products/<id>/<name>.<jpg|png|webp|avif>, at most 8, one primary", async () => {
    const path = (n: number, ext = "webp") => `products/${fx.productId}/ust${run}${String(n).padStart(8, "0")}.${ext}`;
    expect((await staff.client.from("product_images").insert({ product_id: fx.productId, storage_path: `products/${randomUUID()}/x1234567.webp` })).error?.message).toMatch(/invalid_image_path/);
    expect((await staff.client.from("product_images").insert({ product_id: fx.productId, storage_path: path(1, "svg") })).error?.message).toMatch(/invalid_image_path/);
    for (let i = 1; i <= 8; i++) expect((await staff.client.from("product_images").insert({ product_id: fx.productId, storage_path: path(i) })).error).toBeNull();
    expect((await staff.client.from("product_images").insert({ product_id: fx.productId, storage_path: path(9) })).error?.message).toMatch(/image_limit/);
    const rows = await service.from("product_images").select("id, is_primary").eq("product_id", fx.productId);
    expect(rows.data!.filter((r) => r.is_primary)).toHaveLength(1);
    await service.from("product_images").delete().eq("product_id", fx.productId);
  });
});

describe("categories have two levels", () => {
  it("refuses a third level", async () => {
    const top = await service.from("categories").insert({ slug: `zz-top-${run}`, name: `ZZ top ${RUN}` }).select("id").single();
    const sub = await admin.client.from("categories").insert({ slug: `zz-sub-${run}`, name: "ZZ sub", parent_id: top.data!.id }).select("id").single();
    expect(sub.error).toBeNull();
    const deep = await admin.client.from("categories").insert({ slug: `zz-deep-${run}`, name: "ZZ deep", parent_id: sub.data!.id });
    expect(deep.error?.message).toMatch(/category_depth/);
    await admin.client.from("categories").delete().eq("id", sub.data!.id);
    await admin.client.from("categories").delete().eq("id", top.data!.id);
  });
});
