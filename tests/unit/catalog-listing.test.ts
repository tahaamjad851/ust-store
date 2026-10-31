import { describe, expect, it } from "vitest";
import { PAGE_SIZE, parseListingParams, searchArgs, SORT_OPTIONS } from "@/features/catalog/listing";

const UUID = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";

describe("parseListingParams", () => {
  it("has sensible defaults", () => {
    expect(parseListingParams({})).toEqual({
      q: undefined, model: undefined, stock: undefined, min: undefined, max: undefined, sort: "relevance", page: 1,
    });
  });

  it("reads every filter", () => {
    expect(parseListingParams({ q: "clutch plate", model: UUID, stock: "in", min: "500", max: "20000", sort: "price-asc", page: "3" })).toEqual({
      q: "clutch plate", model: UUID, stock: "in", min: 500, max: 20000, sort: "price-asc", page: 3,
    });
  });

  it("drops invalid values instead of throwing", () => {
    const p = parseListingParams({ model: "tm-mf-385", stock: "out", min: "-5", max: "abc", sort: "popular", page: "0" });
    expect(p).toMatchObject({ model: undefined, stock: undefined, min: undefined, max: undefined, sort: "relevance", page: 1 });
    expect(parseListingParams({ page: "1001" }).page).toBe(1);
    expect(parseListingParams({ page: "2.5" }).page).toBe(1);
    expect(parseListingParams({ min: "99999999999" }).min).toBeUndefined();
  });

  it("takes the first of a repeated parameter", () => {
    expect(parseListingParams({ q: ["first", "second"], sort: ["name", "price-asc"] })).toMatchObject({ q: "first", sort: "name" });
  });

  it("cleans the search text: control characters, extra spaces, empty and over-long input", () => {
    expect(parseListingParams({ q: "  clutch \t\n plate\u0000  " }).q).toBe("clutch plate");
    expect(parseListingParams({ q: "   " }).q).toBeUndefined();
    expect(parseListingParams({ q: "x".repeat(101) }).q).toBeUndefined();
    expect(parseListingParams({ q: "x".repeat(100) }).q).toHaveLength(100);
  });

  it("reads empty form fields as not set (a submitted \"min=&max=\" is not a price of 0)", () => {
    expect(parseListingParams({ q: "oil", model: "", min: "", max: "  ", sort: "", page: "" })).toEqual({
      q: "oil", model: undefined, stock: undefined, min: undefined, max: undefined, sort: "relevance", page: 1,
    });
    expect(parseListingParams({ min: "0", max: "0" })).toMatchObject({ min: 0, max: 0 });
  });

  it("accepts the seed's md5-made ids, which are well-formed but not RFC-4122 versioned", () => {
    const md5Id = "b0b5c5a2-4b5c-199b-fdb7-b971529be644";
    expect(parseListingParams({ model: md5Id }).model).toBe(md5Id);
    expect(parseListingParams({ model: "b0b5c5a2-4b5c-199b-fdb7" }).model).toBeUndefined();
  });

  it("reads a reversed price range as the range the visitor meant", () => {
    expect(parseListingParams({ min: "9000", max: "1000" })).toMatchObject({ min: 1000, max: 9000 });
  });

  it("accepts every sort option the page offers, including newest", () => {
    for (const o of SORT_OPTIONS) expect(parseListingParams({ sort: o.value }).sort).toBe(o.value);
    expect(SORT_OPTIONS.map((o) => o.value)).toContain("newest");
  });
});

describe("searchArgs", () => {
  it("turns rupees into paisa and the page into an offset", () => {
    const params = parseListingParams({ q: "oil", model: UUID, stock: "in", min: "500", max: "1200", sort: "price-desc", page: "3" });
    expect(searchArgs(params, "cat-id", 3)).toEqual({
      p_query: "oil",
      p_category_id: "cat-id",
      p_model_id: UUID,
      p_in_stock: true,
      p_min_paisa: 50_000,
      p_max_paisa: 120_000,
      p_sort: "price-desc",
      p_limit: PAGE_SIZE,
      p_offset: 2 * PAGE_SIZE,
    });
  });

  it("sends nulls for what is not filtered", () => {
    expect(searchArgs(parseListingParams({}), null, 1)).toEqual({
      p_query: null,
      p_category_id: null,
      p_model_id: null,
      p_in_stock: false,
      p_min_paisa: null,
      p_max_paisa: null,
      p_sort: "relevance",
      p_limit: PAGE_SIZE,
      p_offset: 0,
    });
  });

  it("keeps a zero minimum (free of the 'no filter' null)", () => {
    expect(searchArgs(parseListingParams({ min: "0" }), null, 1).p_min_paisa).toBe(0);
  });
});
