// What the public shop lists, decided from data. Pure, so every rule is unit-tested
// (tests/unit/catalog-visibility.test.ts).
//
// A category with nothing in it is not shown: not in the menus, not on the home page, not in the footer, not as a
// filter. Its own page still opens (a direct link answers with a clear "no products yet" message, not a 404), so a
// link the owner sent out never breaks. A category counts the products of the categories below it.
import type { Category } from "@/types/catalog";

export type CategoryNode = Category & { children: Category[] };

/** Number of visible products per category id, descendants included. Missing id = unknown, treated as shown. */
export type CategoryCounts = Readonly<Record<string, number>>;

/** True unless the count says the category is empty. An id the counts do not know is shown (fail open). */
export function hasProducts(counts: CategoryCounts, id: string): boolean {
  return counts[id] === undefined || counts[id] > 0;
}

/** The categories that have products, in their given order. */
export function withProducts(categories: readonly Category[], counts: CategoryCounts): Category[] {
  return categories.filter((c) => hasProducts(counts, c.id));
}

/** Top-level categories with products, each with its non-empty subcategories. `all` is every visible category. */
export function buildCategoryTree(all: readonly Category[], counts: CategoryCounts): CategoryNode[] {
  const shown = withProducts(all, counts);
  return shown
    .filter((c) => c.parent_id === null)
    .map((c) => ({ ...c, children: shown.filter((s) => s.parent_id === c.id) }));
}
