// Filterable product grid. Filters are a plain GET form, so they work without JavaScript.
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseListingParams, SORT_OPTIONS, type ListingParams } from "@/features/catalog/listing";
import { formatPKR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { getProductPage, getTractorModels } from "@/services/catalog";
import type { Category } from "@/types/catalog";
import { FiltersPanel } from "./filters-panel";
import { ProductCard } from "./product-card";
import { SortSelect } from "./sort-select";

type Props = {
  basePath: string;
  /** Category whose products (and its subcategories' products) are listed; null = the whole shop. */
  categoryId?: string | null;
  groups?: { title: string; items: (Pick<Category, "id" | "name"> & { href: string; current: boolean })[] };
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const FORM_ID = "listing-filters";
const fieldClass = "h-11 w-full rounded-lg border border-input bg-card px-3 text-body-lg md:text-body-md";

function hrefWith(basePath: string, params: ListingParams, overrides: Partial<Record<keyof ListingParams, string | number | undefined>>) {
  const merged: Record<string, string | number | undefined> = { ...params, ...overrides };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === "") continue;
    if (k === "sort" && v === "relevance") continue;
    if (k === "page" && Number(v) === 1) continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export async function ProductListing({ basePath, categoryId = null, groups, searchParams }: Props) {
  const params = parseListingParams(await searchParams);
  // Searching, filtering, sorting and paging all happen in the database.
  const [{ items, page, pageCount, total, fitmentLabels }, models] = await Promise.all([
    getProductPage(params, categoryId),
    getTractorModels(),
  ]);
  const model = models.find((m) => m.id === params.model);
  const makes = [...new Set(models.map((m) => m.make))];

  const active = [
    params.q && { label: `Search: “${params.q}”`, href: hrefWith(basePath, params, { q: undefined, page: 1 }) },
    model && { label: `Fits ${model.model}`, href: hrefWith(basePath, params, { model: undefined, page: 1 }) },
    params.stock && { label: "In stock only", href: hrefWith(basePath, params, { stock: undefined, page: 1 }) },
    (params.min !== undefined || params.max !== undefined) && {
      label: `${formatPKR((params.min ?? 0) * 100)} – ${params.max !== undefined ? formatPKR(params.max * 100) : "any"}`,
      href: hrefWith(basePath, params, { min: undefined, max: undefined, page: 1 }),
    },
  ].filter((a): a is { label: string; href: string } => Boolean(a));

  const filters = (
    <form id={FORM_ID} action={basePath} method="get" className="space-y-5">
      {params.q && <input type="hidden" name="q" value={params.q} />}
      <fieldset className="space-y-2">
        <legend className="text-label-md uppercase text-muted-foreground">Fits my tractor</legend>
        <label htmlFor="filter-model" className="sr-only">
          Tractor model
        </label>
        <select id="filter-model" name="model" defaultValue={params.model ?? ""} className={fieldClass}>
          <option value="">All tractor models</option>
          {makes.map((make) => (
            <optgroup key={make} label={make}>
              {models
                .filter((m) => m.make === make)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.model}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-label-md uppercase text-muted-foreground">Availability</legend>
        <label className="flex min-h-11 items-center gap-3 text-body-md">
          <input
            type="checkbox"
            name="stock"
            value="in"
            defaultChecked={params.stock === "in"}
            className="size-5 accent-primary"
          />
          In stock only
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-label-md uppercase text-muted-foreground">Price (Rs)</legend>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="filter-min" className="text-body-sm">
              Min
            </label>
            <input id="filter-min" name="min" type="number" inputMode="numeric" min={0} defaultValue={params.min} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="filter-max" className="text-body-sm">
              Max
            </label>
            <input id="filter-max" name="max" type="number" inputMode="numeric" min={0} defaultValue={params.max} className={fieldClass} />
          </div>
        </div>
      </fieldset>

      <Button type="submit" className="h-11 w-full">
        Apply filters
      </Button>
      <Link href={basePath} className="flex min-h-11 items-center justify-center text-label-md text-primary underline">
        Reset all filters
      </Link>
    </form>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside aria-label="Product filters" className="space-y-4">
        {groups && groups.items.length > 0 && (
          <nav aria-labelledby="listing-groups" className="hidden rounded-lg border border-border bg-card p-4 lg:block">
            <h2 id="listing-groups" className="mb-2 font-sans text-label-md uppercase text-muted-foreground">
              {groups.title}
            </h2>
            <ul className="space-y-0.5">
              {groups.items.map((g) => (
                <li key={g.id}>
                  <Link
                    href={g.href}
                    aria-current={g.current ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center rounded-sm px-2 text-body-md hover:bg-surface-low",
                      g.current && "bg-brand-tint font-semibold text-brand-tint-foreground",
                    )}
                  >
                    {g.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <FiltersPanel activeCount={active.length}>{filters}</FiltersPanel>
      </aside>

      <section aria-labelledby="results-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="results-title" className="font-sans text-label-lg" aria-live="polite">
            {total} {total === 1 ? "product" : "products"}
          </h2>
          <SortSelect formId={FORM_ID} value={params.sort} options={SORT_OPTIONS} />
        </div>

        {active.length > 0 && (
          <ul aria-label="Active filters" className="mb-4 flex flex-wrap gap-2">
            {active.map((a) => (
              <li key={a.label}>
                <Link
                  href={a.href}
                  className="inline-flex min-h-11 items-center gap-1 rounded-sm bg-surface-container px-2 text-label-md hover:bg-surface-high"
                >
                  {a.label}
                  <X className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">(remove filter)</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-input bg-card p-8 text-center">
            <p className="text-label-lg">No products match these filters.</p>
            <Link href={basePath} className="mt-2 inline-flex min-h-11 items-center text-label-md text-primary underline">
              Clear filters
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {items.map((p) => (
              <li key={p.id} className="flex">
                <ProductCard product={p} fitmentLabel={fitmentLabels[p.id]} />
              </li>
            ))}
          </ul>
        )}

        {pageCount > 1 && (
          <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-center gap-1">
            {page > 1 && (
              <Link href={hrefWith(basePath, params, { page: page - 1 })} className="inline-flex h-11 items-center gap-1 rounded-lg border border-border bg-card px-3 text-label-md">
                <ChevronLeft className="size-4" aria-hidden="true" />
                Previous
              </Link>
            )}
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={hrefWith(basePath, params, { page: n })}
                aria-current={n === page ? "page" : undefined}
                aria-label={`Page ${n}`}
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-lg border text-label-md tabular",
                  n === page ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                )}
              >
                {n}
              </Link>
            ))}
            {page < pageCount && (
              <Link href={hrefWith(basePath, params, { page: page + 1 })} className="inline-flex h-11 items-center gap-1 rounded-lg border border-border bg-card px-3 text-label-md">
                Next
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}

export function ProductListingSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]" aria-busy="true">
      <div className="hidden h-96 rounded-lg bg-surface-low lg:block" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="aspect-[3/5] rounded-lg bg-surface-low" />
        ))}
      </div>
      <span className="sr-only">Loading products…</span>
    </div>
  );
}
