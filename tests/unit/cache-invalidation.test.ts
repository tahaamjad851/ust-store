// Admin saves must refresh the cached public pages. Every cached reader in services/catalog.ts is listed here with the
// admin areas that must expire it; the test reads the source, so a reader added later (or a tag removed) fails here
// instead of showing a stale shop to customers.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG_TAGS, PUBLIC_TAGS } from "@/features/catalog/cache";

const source = readFileSync(new URL("../../src/services/catalog.ts", import.meta.url), "utf8");

/** name -> the CATALOG_TAGS keys it is cached under, for every function that starts with "use cache". */
function cachedReaders(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const header = /function\s+(\w+)\s*\([^)]*\)[^{]*\{\s*"use cache";/g;
  for (let m = header.exec(source); m; m = header.exec(source)) {
    const rest = source.slice(m.index + m[0].length);
    const body = rest.slice(0, rest.search(/\nexport |\nasync function |\nfunction |$/));
    const call = /cacheTag\(([^)]*)\)/.exec(body);
    out[m[1]] = call ? [...call[1].matchAll(/CATALOG_TAGS\.(\w+)/g)].map((t) => t[1]) : [];
  }
  return out;
}

/** The admin areas (runAdminAction `revalidate`) that must expire each reader. */
const MUST_BE_EXPIRED_BY: Record<string, (keyof typeof PUBLIC_TAGS)[]> = {
  getStoreSettings: ["settings"],
  getVisibleCategories: ["categories"],
  getTractorModels: ["tractors"],
  getCategoryCounts: ["categories", "products"], // a category appears when its first product is published
  getStockedBrands: ["categories", "products"], // brands are edited under "categories"; products carry the brand
  getCachedProductPage: ["products", "stock", "categories", "tractors"],
  getFeaturedProducts: ["products", "stock", "categories"],
  loadProductBySlug: ["products", "stock", "categories"],
};

describe("admin saves refresh the cached public pages", () => {
  const readers = cachedReaders();

  it("knows every cached reader (a new one must be added to this table on purpose)", () => {
    expect(Object.keys(readers).sort()).toEqual(Object.keys(MUST_BE_EXPIRED_BY).sort());
  });

  it("every cached reader carries the catch-all tag", () => {
    for (const [name, tags] of Object.entries(readers)) expect(tags, name).toContain("all");
  });

  it("every cached reader is expired by each admin area that changes what it shows", () => {
    for (const [name, areas] of Object.entries(MUST_BE_EXPIRED_BY)) {
      const own = readers[name].map((k) => CATALOG_TAGS[k as keyof typeof CATALOG_TAGS]);
      for (const area of areas) {
        const expired: readonly string[] = PUBLIC_TAGS[area];
        expect(own.some((t) => expired.includes(t)), `${name} is not refreshed by a "${area}" save`).toBe(true);
      }
    }
  });

  it("no cached reader uses a tag that no admin save ever expires", () => {
    const expirable = new Set<string>([CATALOG_TAGS.all, ...Object.values(PUBLIC_TAGS).flat()]);
    for (const [name, tags] of Object.entries(readers)) {
      for (const key of tags) {
        const tag = CATALOG_TAGS[key as keyof typeof CATALOG_TAGS];
        expect(expirable.has(tag), `${name} is tagged "${tag}", which no admin save expires`).toBe(true);
      }
    }
  });

  it("each admin area expires something", () => {
    for (const [area, tags] of Object.entries(PUBLIC_TAGS)) expect(tags.length, area).toBeGreaterThan(0);
  });
});
