// Product listing parameters. The URL is untrusted input: it is parsed with Zod, anything invalid is
// dropped (never thrown), and the result is what the database function catalog_search() is asked.
// Searching, filtering, sorting and paging all happen in the database, not in this process.
import { z } from "zod";

const SORT_VALUES = ["relevance", "price-asc", "price-desc", "name", "newest"] as const;
export type SortValue = (typeof SORT_VALUES)[number];

export const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name A–Z" },
  { value: "newest", label: "Newest" },
];

export const PAGE_SIZE = 9;

// A form submits empty fields as "min=&max=": those mean "not set", not 0 (z.coerce.number turns "" into 0).
const one = (v: unknown) => {
  const first = Array.isArray(v) ? v[0] : v;
  return typeof first === "string" && first.trim() === "" ? undefined : first;
};
// Search text: control characters are dropped, whitespace is collapsed, empty means "no search".
const searchText = z.preprocess(
  one,
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .pipe(z.string().max(100))
    .transform((s) => (s === "" ? undefined : s))
    .optional()
    .catch(undefined),
);
const optionalRupees = z.preprocess(one, z.coerce.number().int().min(0).max(10_000_000).optional().catch(undefined));

/** Validates untrusted URL search params. */
export const listingParamsSchema = z.object({
  q: searchText,
  // guid, not uuid: the seed's md5-derived ids are well-formed but not RFC-4122 versioned, and Zod's uuid() rejects them.
  model: z.preprocess(one, z.guid().optional().catch(undefined)),
  stock: z.preprocess(one, z.enum(["in"]).optional().catch(undefined)),
  min: optionalRupees,
  max: optionalRupees,
  sort: z.preprocess(one, z.enum(SORT_VALUES).catch("relevance").default("relevance")),
  page: z.preprocess(one, z.coerce.number().int().min(1).max(1000).catch(1).default(1)),
});

export type ListingParams = z.infer<typeof listingParamsSchema>;

export function parseListingParams(raw: Record<string, string | string[] | undefined>): ListingParams {
  const params = listingParamsSchema.parse(raw);
  // A reversed range is a slip, not an empty result: read it as the range the visitor meant.
  if (params.min !== undefined && params.max !== undefined && params.min > params.max) {
    return { ...params, min: params.max, max: params.min };
  }
  return params;
}

/** Arguments of the catalog_search() database function for one page. */
export function searchArgs(params: ListingParams, categoryId: string | null, page: number) {
  return {
    p_query: params.q ?? null,
    p_category_id: categoryId,
    p_model_id: params.model ?? null,
    p_in_stock: params.stock === "in",
    p_min_paisa: params.min !== undefined ? params.min * 100 : null,
    p_max_paisa: params.max !== undefined ? params.max * 100 : null,
    p_sort: params.sort,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  };
}
