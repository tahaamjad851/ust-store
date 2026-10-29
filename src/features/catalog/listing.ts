// Product listing rules: search, tractor fitment filter, stock filter, price range and sort.
// Works on plain rows so it can later move into a Supabase query unchanged in behaviour.
import { z } from "zod";
import type { Product } from "@/types/catalog";
import { stockStatus } from "@/features/inventory/stock";

const SORT_VALUES = ["relevance", "price-asc", "price-desc", "name"] as const;
export type SortValue = (typeof SORT_VALUES)[number];

export const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name A–Z" },
];

export const PAGE_SIZE = 9;

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const optionalText = z.preprocess(one, z.string().trim().max(100).optional().catch(undefined));
const optionalRupees = z.preprocess(one, z.coerce.number().int().min(0).max(10_000_000).optional().catch(undefined));

/** Validates untrusted URL search params. Anything invalid is dropped, never thrown. */
export const listingParamsSchema = z.object({
  q: optionalText,
  model: optionalText,
  stock: z.preprocess(one, z.enum(["in"]).optional().catch(undefined)),
  min: optionalRupees,
  max: optionalRupees,
  sort: z.preprocess(one, z.enum(SORT_VALUES).catch("relevance").default("relevance")),
  page: z.preprocess(one, z.coerce.number().int().min(1).max(1000).catch(1).default(1)),
});

export type ListingParams = z.infer<typeof listingParamsSchema>;

export function parseListingParams(raw: Record<string, string | string[] | undefined>): ListingParams {
  return listingParamsSchema.parse(raw);
}

export function filterProducts(
  products: Product[],
  params: ListingParams,
  fitsModel: (productId: string, modelId: string) => boolean,
): Product[] {
  const q = params.q?.toLowerCase();
  const result = products.filter((p) => {
    if (q && ![p.name, p.sku, p.oem_ref ?? "", p.short_description].some((f) => f.toLowerCase().includes(q))) {
      return false;
    }
    if (params.model && !fitsModel(p.id, params.model)) return false;
    if (params.stock === "in" && stockStatus(p) === "out_of_stock") return false;
    if (params.min !== undefined && p.retail_price_paisa < params.min * 100) return false;
    if (params.max !== undefined && p.retail_price_paisa > params.max * 100) return false;
    return true;
  });

  switch (params.sort) {
    case "price-asc":
      return result.sort((a, b) => a.retail_price_paisa - b.retail_price_paisa);
    case "price-desc":
      return result.sort((a, b) => b.retail_price_paisa - a.retail_price_paisa);
    case "name":
      return result.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return result;
  }
}

export function paginate<T>(items: T[], page: number, size = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pageCount);
  return { items: items.slice((current - 1) * size, current * size), page: current, pageCount, total: items.length };
}
