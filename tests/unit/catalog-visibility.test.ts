import { describe, expect, it } from "vitest";
import { buildCategoryTree, hasProducts, withProducts } from "@/features/catalog/visibility";
import type { Category } from "@/types/catalog";

const cat = (id: string, parent_id: string | null = null, sort_order = 0): Category => ({
  id, parent_id, slug: id, name: id.toUpperCase(), description: null, icon: "tools", image_path: null, sort_order,
});

const parts = cat("parts");
const clutch = cat("clutch", "parts");
const brakes = cat("brakes", "parts");
const oils = cat("oils");
const empty = cat("empty");
const all = [parts, clutch, brakes, oils, empty];

describe("categories with no products are not listed", () => {
  it("drops an empty top-level category and an empty subcategory, keeps the rest in order", () => {
    // A category counts the products below it: parts = clutch (3) + brakes (0).
    const tree = buildCategoryTree(all, { parts: 3, clutch: 3, brakes: 0, oils: 2, empty: 0 });
    expect(tree.map((c) => c.id)).toEqual(["parts", "oils"]);
    expect(tree[0].children.map((c) => c.id)).toEqual(["clutch"]);
    expect(tree[1].children).toEqual([]);
  });

  it("an empty shop has an empty tree (nothing to show, nothing to break)", () => {
    expect(buildCategoryTree(all, { parts: 0, clutch: 0, brakes: 0, oils: 0, empty: 0 })).toEqual([]);
    expect(buildCategoryTree([], {})).toEqual([]);
  });

  it("a subcategory whose parent is empty is not promoted to the top level", () => {
    const tree = buildCategoryTree(all, { parts: 0, clutch: 5, brakes: 0, oils: 1, empty: 0 });
    expect(tree.map((c) => c.id)).toEqual(["oils"]);
  });

  it("an unknown count is shown (a failed count must not make a category vanish)", () => {
    expect(hasProducts({}, "parts")).toBe(true);
    expect(hasProducts({ parts: 0 }, "parts")).toBe(false);
    expect(hasProducts({ parts: 1 }, "parts")).toBe(true);
    expect(buildCategoryTree(all, { oils: 0 }).map((c) => c.id)).toEqual(["parts", "empty"]);
  });

  it("withProducts keeps the order and does not touch the input", () => {
    const input = [oils, empty, parts];
    expect(withProducts(input, { oils: 1, empty: 0, parts: 4 }).map((c) => c.id)).toEqual(["oils", "parts"]);
    expect(input.map((c) => c.id)).toEqual(["oils", "empty", "parts"]);
  });
});
