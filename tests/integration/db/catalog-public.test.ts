// What an anonymous visitor can and cannot see of the catalog, against the real DEV project:
// drafts and archived products are invisible, cost prices, inventory and counts are never returned,
// and catalog_search() searches, filters, sorts and pages correctly. Needs migration
// 20261031100000_catalog_public.sql applied. Run with `npm run test:db`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PUBLIC_TABLE_COLUMNS } from "@/features/catalog/columns";
import { anon, archiveFixtures, createUser, deleteUsers, RUN, service, type TestUser } from "./helpers";

const run = RUN.toLowerCase();
type Row = Record<string, unknown>;

/**
 * A write that does not ask for its row back (no .select()) answers 201 with an EMPTY body on the real
 * PostgREST (Prefer: return=minimal is the default), so supabase-js gives data: null and error: null.
 * That is a success: ok() checks the error only. Use must() when the row is needed.
 */
function ok<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  const data = ok(res, what);
  if (data === null || data === undefined) throw new Error(`${what}: no data returned (did the query forget .select()?)`);
  return data as NonNullable<T>;
}

let admin: TestUser;
const ids: Record<string, { product: string; variant: string; sku: string }> = {};
let parentCategory: string;
let childCategory: string;
let inactiveCategory: string;
let brandId: string;
let makeId: string;
let modelId: string;

async function makeProduct(
  label: string,
  opts: {
    status?: "draft" | "published" | "archived";
    category?: string;
    stock?: number;
    regular?: number;
    sale?: number | null;
    variantActive?: boolean;
    brand?: boolean;
    partNumber?: string;
    compatible?: boolean;
  } = {},
) {
  const product = must(
    await service
      .from("products")
      .insert({
        slug: `ust-test-${run}-${label}`,
        name: `UST TEST ${RUN} ${label}`,
        category_id: opts.category ?? childCategory,
        status: opts.status ?? "published",
        brand_id: opts.brand ? brandId : null,
        part_number: opts.partNumber ?? null,
      })
      .select("id")
      .single(),
    `product ${label}`,
  );
  const sku = `UST-CAT-${RUN}-${label.toUpperCase()}`;
  const variant = must(
    await service
      .from("product_variants")
      .insert({
        product_id: product.id,
        sku,
        regular_price_paisa: opts.regular ?? 100_000,
        sale_price_paisa: opts.sale ?? null,
        is_default: true,
        is_active: opts.variantActive ?? true,
      })
      .select("id")
      .single(),
    `variant ${label}`,
  );
  if (opts.stock) {
    ok(
      await admin.client.rpc("adjust_stock", {
        p_variant_id: variant.id,
        p_on_hand_delta: opts.stock,
        p_movement_type: "receive",
        p_reason: `UST TEST ${RUN} catalog fixture`,
      }),
      `stock ${label}`,
    );
  }
  if (opts.compatible) {
    ok(await service.from("product_compatibility").insert({ product_id: product.id, tractor_model_id: modelId }), `compat ${label}`);
  }
  ids[label] = { product: product.id, variant: variant.id, sku };
  return ids[label];
}

const search = async (args: Record<string, unknown> = {}) => {
  const res = await anon().rpc("catalog_search", { p_query: RUN, p_limit: 48, ...args });
  if (res.error) throw new Error(`catalog_search: ${res.error.message}`);
  return res.data as { product_id: string; variant_id: string; stock_status: string; total_count: number }[];
};
const labelsOf = (hits: { product_id: string }[]) =>
  Object.entries(ids)
    .filter(([, v]) => hits.some((h) => h.product_id === v.product))
    .map(([label]) => label)
    .sort();

beforeAll(async () => {
  admin = await createUser("catalog-admin", "admin");
  parentCategory = must(await service.from("categories").insert({ slug: `ust-cat-${run}`, name: `UST TEST ${RUN} parent` }).select("id").single(), "parent category").id;
  childCategory = must(
    await service.from("categories").insert({ slug: `ust-sub-${run}`, name: `UST TEST ${RUN} child`, parent_id: parentCategory }).select("id").single(),
    "child category",
  ).id;
  inactiveCategory = must(
    await service.from("categories").insert({ slug: `ust-off-${run}`, name: `UST TEST ${RUN} off`, is_active: false }).select("id").single(),
    "inactive category",
  ).id;
  brandId = must(await service.from("brands").insert({ slug: `ust-brand-${run}`, name: `Zorbrand${RUN}` }).select("id").single(), "brand").id;
  makeId = must(await service.from("tractor_makes").insert({ slug: `ust-make-${run}`, name: `Zormake${RUN}` }).select("id").single(), "make").id;
  modelId = must(await service.from("tractor_models").insert({ make_id: makeId, slug: `ust-model-${run}`, name: `Zormodel${RUN} 385` }).select("id").single(), "model").id;

  await makeProduct("pub", { stock: 20, brand: true, partNumber: `PN-${RUN}`, compatible: true, regular: 250_000 });
  await makeProduct("sale", { stock: 20, regular: 900_000, sale: 700_000 });
  await makeProduct("low", { stock: 3, regular: 300_000 });
  await makeProduct("oos", { regular: 50_000 });
  await makeProduct("draft", { status: "draft", stock: 5 });
  await makeProduct("archived", { status: "archived", stock: 5 });
  await makeProduct("novariant", { stock: 5, variantActive: false });
  await makeProduct("offcat", { stock: 5, category: inactiveCategory });
  // Two variants: the default is out of stock, the second one is in stock.
  const multi = await makeProduct("multi", { regular: 400_000 });
  const second = must(
    await service
      .from("product_variants")
      .insert({ product_id: multi.product, sku: `${multi.sku}-B`, name: "Second", regular_price_paisa: 10_000, sort_order: 5 })
      .select("id")
      .single(),
    "second variant",
  );
  ok(
    await admin.client.rpc("adjust_stock", { p_variant_id: second.id, p_on_hand_delta: 9, p_movement_type: "receive", p_reason: `UST TEST ${RUN} multi` }),
    "second stock",
  );
  // A cost price exists for one variant: it must never be readable.
  ok(await service.from("product_variant_costs").insert({ variant_id: ids.pub.variant, cost_paisa: 90_000 }), "cost");
});

/** Deletes what this file created. Falls back to hiding it where a delete is refused (see below). */
async function removeOrHide(table: "categories" | "brands" | "tractor_models" | "tractor_makes", id: string | undefined) {
  if (!id) return;
  const deleted = await service.from(table).delete().eq("id", id);
  if (deleted.error) await service.from(table).update({ is_active: false }).eq("id", id);
}

afterAll(async () => {
  // Leave nothing behind. These products were never ordered, so with the Phase 3B migration they can be
  // deleted (their stock ledger goes with them); before it, a ledger row blocks the delete and the fallback
  // archives them instead, as before. The rows they used are removed after them, children first.
  const gone = await service.from("products").delete().like("slug", `ust-test-${run}-%`);
  if (gone.error) await archiveFixtures();
  await removeOrHide("categories", childCategory);
  await removeOrHide("categories", inactiveCategory);
  await removeOrHide("categories", parentCategory);
  await removeOrHide("brands", brandId);
  await removeOrHide("tractor_models", modelId);
  await removeOrHide("tractor_makes", makeId);
  await deleteUsers();
});

describe("the public column lists (src/features/catalog/columns.ts) match the real schema", () => {
  for (const [table, columns] of Object.entries(PUBLIC_TABLE_COLUMNS)) {
    it(`anon can select ${table}(${columns.split(",").length} columns)`, async () => {
      const res = await anon().from(table).select(columns).limit(1);
      expect(res.error?.message).toBeUndefined();
    });
  }
});

describe("drafts, archived products and inactive variants are invisible to anon", () => {
  it("shows only published products through the table API", async () => {
    const res = await anon().from("products").select("slug,status").like("slug", `ust-test-${run}-%`);
    const slugs = (res.data ?? []).map((r: Row) => String(r.slug).replace(`ust-test-${run}-`, "")).sort();
    expect(res.error).toBeNull();
    // novariant is a published row too (it has no active variant): hiding it is catalog_search()'s and the
    // service's job. offcat is published but in a deactivated category: RLS hides it since Phase 3B.
    expect(slugs).toEqual(["low", "multi", "novariant", "oos", "pub", "sale"]);
    expect((res.data ?? []).every((r: Row) => r.status === "published")).toBe(true);
  });

  it("hides the variants of draft and archived products and inactive variants", async () => {
    const res = await anon().from("product_variants").select("sku").like("sku", `UST-CAT-${RUN}-%`);
    const skus = (res.data ?? []).map((r: Row) => String(r.sku).replace(`UST-CAT-${RUN}-`, "")).sort();
    expect(skus).toEqual(["LOW", "MULTI", "MULTI-B", "OOS", "PUB", "SALE"]);
  });

  it("does not return them from catalog_search() either, nor products in an inactive category", async () => {
    const labels = labelsOf(await search());
    expect(labels).toEqual(["low", "multi", "oos", "pub", "sale"]);
    for (const hidden of ["draft", "archived", "novariant", "offcat"]) expect(labels).not.toContain(hidden);
  });

  it("does not return their stock status", async () => {
    const res = await anon().rpc("stock_availability", {
      p_variant_ids: [ids.draft.variant, ids.archived.variant, ids.novariant.variant, ids.pub.variant],
    });
    expect(res.error).toBeNull();
    expect((res.data as Row[]).map((r) => r.variant_id)).toEqual([ids.pub.variant]);
  });

  it("hides a category that is deactivated, and with it the product pages in it", async () => {
    const res = await anon().from("categories").select("slug").in("id", [childCategory, inactiveCategory]);
    expect((res.data ?? []).map((r: Row) => r.slug)).toEqual([`ust-sub-${run}`]);
  });
});

describe("cost and wholesale prices never reach anon", () => {
  it("cannot read cost prices, inventory or the ledger", async () => {
    for (const table of ["product_variant_costs", "inventory", "stock_movements"]) {
      const res = await anon().from(table).select("*").limit(5);
      // Either permission denied or no rows: never data.
      expect(res.data ?? [], table).toEqual([]);
    }
    const cost = await anon().from("product_variant_costs").select("cost_paisa").eq("variant_id", ids.pub.variant);
    expect(cost.data ?? []).toEqual([]);
  });

  it("has no cost or wholesale column on any table anon can read", async () => {
    const tables = Object.keys(PUBLIC_TABLE_COLUMNS);
    for (const table of tables) {
      const res = await anon().from(table).select("*").limit(1);
      const keys = Object.keys((res.data?.[0] as Row | undefined) ?? {});
      expect(keys.filter((k) => /cost|wholesale|margin|supplier|on_hand|reserved/i.test(k)), table).toEqual([]);
    }
  });

  it("catalog_search() and stock_availability() return ids and a status only", async () => {
    const hits = await search();
    expect(Object.keys(hits[0]).sort()).toEqual(["product_id", "stock_status", "total_count", "variant_id"]);
    const res = await anon().rpc("stock_availability", { p_variant_ids: [ids.pub.variant] });
    expect(Object.keys((res.data as Row[])[0]).sort()).toEqual(["status", "variant_id"]);
  });

  it("cannot change anything", async () => {
    const res = await anon().from("products").update({ name: "hacked" }).eq("id", ids.pub.product).select("id");
    expect(res.data ?? []).toEqual([]);
    const settings = await anon().from("store_settings").update({ delivery_charge_note: "free" }).eq("id", true).select("id");
    expect(settings.data ?? []).toEqual([]);
    const call = await anon().rpc("adjust_stock", { p_variant_id: ids.pub.variant, p_on_hand_delta: 1, p_movement_type: "receive", p_reason: "x" });
    expect(call.error).not.toBeNull();
  });
});

describe("stock status", () => {
  it("reports in stock, low stock and out of stock, using each product's display variant", async () => {
    const hits = await search();
    const status = (label: string) => hits.find((h) => h.product_id === ids[label].product)?.stock_status;
    expect(status("pub")).toBe("in_stock");
    expect(status("low")).toBe("low_stock");
    expect(status("oos")).toBe("out_of_stock");
    // The default variant is out of stock, so the product reads as out of stock even though another variant is available.
    expect(status("multi")).toBe("out_of_stock");
    expect(hits.find((h) => h.product_id === ids.multi.product)?.variant_id).toBe(ids.multi.variant);
  });

  it("filters to products that can be bought", async () => {
    expect(labelsOf(await search({ p_in_stock: true }))).toEqual(["low", "pub", "sale"]);
  });
});

describe("search", () => {
  it("finds a product by name, SKU, part number, brand, tractor model and make", async () => {
    expect(labelsOf(await search({ p_query: `${RUN} sale` }))).toEqual(["sale"]);
    expect(labelsOf(await search({ p_query: ids.pub.sku.toLowerCase() }))).toEqual(["pub"]);
    expect(labelsOf(await search({ p_query: `PN-${RUN}` }))).toEqual(["pub"]);
    expect(labelsOf(await search({ p_query: `zorbrand${run}` }))).toEqual(["pub"]);
    expect(labelsOf(await search({ p_query: `zormodel${run} 385` }))).toEqual(["pub"]);
    expect(labelsOf(await search({ p_query: `zormake${run}` }))).toEqual(["pub"]);
  });

  it("needs every word to match", async () => {
    expect(await search({ p_query: `${RUN} nosuchword` })).toEqual([]);
  });

  it("treats wildcards and quotes as plain text", async () => {
    expect(await search({ p_query: "%" })).toEqual([]);
    expect(await search({ p_query: "_" })).toEqual([]);
    expect(await search({ p_query: "'; drop table products; --" })).toEqual([]);
  });

  it("finds a product by its exact SKU", async () => {
    const hits = await search({ p_query: ids.oos.sku.toLowerCase() });
    expect(hits[0].product_id).toBe(ids.oos.product);
  });
});

describe("filters, sorting and paging", () => {
  it("filters by tractor model", async () => {
    expect(labelsOf(await search({ p_model_id: modelId, p_query: null }))).toEqual(["pub"]);
  });

  it("filters by category and includes subcategories", async () => {
    expect(labelsOf(await search({ p_category_id: parentCategory }))).toEqual(["low", "multi", "oos", "pub", "sale"]);
    expect(labelsOf(await search({ p_category_id: childCategory }))).toEqual(["low", "multi", "oos", "pub", "sale"]);
    expect(await search({ p_category_id: inactiveCategory })).toEqual([]);
  });

  it("filters by price on the price actually charged (the sale price when there is one)", async () => {
    expect(labelsOf(await search({ p_min_paisa: 600_000, p_max_paisa: 800_000 }))).toEqual(["sale"]);
    expect(labelsOf(await search({ p_max_paisa: 60_000 }))).toEqual(["oos"]);
  });

  it("sorts by price, name and newest", async () => {
    const asc = await search({ p_sort: "price-asc" });
    expect(labelsOf([asc[0]])).toEqual(["oos"]);
    // Charged prices: oos 500, pub 2,500, low 3,000, multi 4,000, sale 7,000 (the sale price, not the regular 9,000).
    expect(labelsOf([asc[asc.length - 1]])).toEqual(["sale"]);
    const desc = await search({ p_sort: "price-desc" });
    expect(labelsOf([desc[0]])).toEqual(["sale"]);
    const byName = await search({ p_sort: "name" });
    expect(byName.length).toBe(5);
    expect(labelsOf([byName[0]])).toEqual(["low"]);
    expect((await search({ p_sort: "newest" })).length).toBe(5);
    expect((await search({ p_sort: "not-a-sort" })).length).toBe(5);
  });

  it("pages on the server: total on every row, no overlap, empty past the end", async () => {
    const first = await search({ p_limit: 2, p_offset: 0, p_sort: "name" });
    const second = await search({ p_limit: 2, p_offset: 2, p_sort: "name" });
    const third = await search({ p_limit: 2, p_offset: 4, p_sort: "name" });
    expect([first.length, second.length, third.length]).toEqual([2, 2, 1]);
    expect([...first, ...second, ...third].every((h) => Number(h.total_count) === 5)).toBe(true);
    expect(new Set([...first, ...second, ...third].map((h) => h.product_id)).size).toBe(5);
    expect(await search({ p_limit: 2, p_offset: 6 })).toEqual([]);
  });

  it("clamps the page size", async () => {
    expect((await search({ p_limit: 100000 })).length).toBeLessThanOrEqual(48);
    expect((await search({ p_limit: -3 })).length).toBe(1);
  });
});

describe("store settings texts", () => {
  it("are readable by anon: delivery charge note and exchange policy", async () => {
    const res = await anon().from("store_settings").select("delivery_charge_note,return_policy_note").eq("id", true).single();
    expect(res.error).toBeNull();
    expect(typeof res.data?.delivery_charge_note).toBe("string");
    expect(typeof res.data?.return_policy_note).toBe("string");
  });
});
