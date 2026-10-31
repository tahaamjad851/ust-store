"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { ProductStatusBadge, StockLevelBadge } from "@/components/admin/badges";
import { NativeSelect } from "@/components/admin/native-select";
import { Pager } from "@/components/admin/pager";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductListRow } from "@/features/admin/catalog-rows";
import type { ProductStatus } from "@/features/admin/types";
import { formatPKRExact } from "@/lib/pricing/money";

const PAGE_SIZE = 25;

const priceText = (p: ProductListRow) =>
  p.priceFromPaisa === null ? "No active variant" : p.priceFromPaisa === p.priceToPaisa ? formatPKRExact(p.priceFromPaisa) : `${formatPKRExact(p.priceFromPaisa)} – ${formatPKRExact(p.priceToPaisa!)}`;

export function ProductsTable({
  rows,
  categories,
  initialStatus,
}: {
  rows: ProductListRow[];
  categories: { id: string; label: string }[];
  initialStatus: ProductStatus | "";
}) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<ProductStatus | "">(initialStatus);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((p) => {
      if (status && p.status !== status) return false;
      if (categoryId && !p.categoryIds.includes(categoryId)) return false;
      if (words.length === 0) return true;
      const haystack = `${p.name} ${p.slug} ${p.partNumber ?? ""} ${p.categoryName} ${p.brandName ?? ""} ${p.skus.join(" ")}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [rows, query, categoryId, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor="product-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="product-search"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Name, SKU, part number or brand"
              className="h-11 rounded-lg border-input bg-card pl-9 text-body-lg md:text-body-md"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-category">Category</Label>
          <NativeSelect id="product-category" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-status">Status</Label>
          <NativeSelect id="product-status" value={status} onChange={(e) => { setStatus(e.target.value as ProductStatus | ""); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
            <option value="archived">Archived</option>
          </NativeSelect>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-8 text-center text-body-md text-muted-foreground">
          {rows.length === 0 ? "There are no products yet. Add the first one." : "No products match. Clear the search or the filters."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card" aria-label="Products">
          {visible.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/products/${p.id}`} className="grid gap-2 p-4 hover:bg-surface-low md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-4">
                <span className="min-w-0 space-y-1">
                  <span className="block text-label-lg break-words">{p.name}</span>
                  <span className="block text-body-sm text-muted-foreground">
                    <span className="font-mono">{p.skus[0] ?? "No SKU"}</span>
                    {p.skus.length > 1 && <> +{p.skus.length - 1} more</>} · {p.categoryName}
                    {p.brandName && <> · {p.brandName}</>}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <ProductStatusBadge status={p.status} />
                  {p.isFeatured && <span className="rounded-sm bg-brand-tint px-2 py-0.5 text-label-md text-brand-tint-foreground">Featured</span>}
                </span>
                <span className="text-body-md tabular">{priceText(p)}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <StockLevelBadge level={p.level} />
                  <span className="text-body-sm text-muted-foreground">
                    {p.variantCount} variant{p.variantCount === 1 ? "" : "s"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager page={current} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} noun="products" />
    </div>
  );
}
