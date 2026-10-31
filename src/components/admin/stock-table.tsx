"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { History, Search } from "lucide-react";
import { StockLevelBadge } from "@/components/admin/badges";
import { NativeSelect } from "@/components/admin/native-select";
import { Pager } from "@/components/admin/pager";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { Field, fieldInputClass, fieldProps } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VariantListRow } from "@/features/admin/catalog-rows";
import { adjustStockAction, setThresholdsAction } from "@/features/admin/stock-actions";
import type { StockLevel } from "@/features/admin/types";
import { STOCK_KIND_LABELS, STOCK_KINDS, stockAdjustSchema, thresholdsSchema, type StockAdjustInput, type ThresholdsInput } from "@/lib/validation/admin";

const PAGE_SIZE = 25;

function AdjustForm({ row, onDone }: { row: VariantListRow; onDone: (m: string) => void }) {
  const { form, submit, pending, error } = useAdminForm<StockAdjustInput, ReturnType<typeof stockAdjustSchema.parse>>({
    resolver: zodResolver(stockAdjustSchema),
    defaults: { variant_id: row.variantId, kind: "receive", quantity: "", reason: "" },
    action: async (values) => {
      const result = await adjustStockAction(values);
      if (result.ok) onDone(result.message ?? "Saved.");
      return result;
    },
    resetOnSuccess: true,
  });
  const { register, formState: { errors } } = form;
  const idp = `adj-${row.variantId}`;
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      {error && <FormAlert tone="error" className="sm:col-span-2">{error}</FormAlert>}
      <input type="hidden" {...register("variant_id")} />
      <Field id={`${idp}-kind`} label="What happened" error={errors.kind?.message}>
        <NativeSelect {...fieldProps(`${idp}-kind`, { error: errors.kind?.message })} {...register("kind")}>
          {STOCK_KINDS.map((k) => (
            <option key={k} value={k}>
              {STOCK_KIND_LABELS[k]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idp}-qty`} label="Quantity" error={errors.quantity?.message}>
        <Input inputMode="numeric" className={fieldInputClass} {...fieldProps(`${idp}-qty`, { error: errors.quantity?.message })} {...register("quantity")} />
      </Field>
      <Field id={`${idp}-reason`} label="Reason" hint="Required. For example: delivery from supplier, or counted on the shelf." className="sm:col-span-2" error={errors.reason?.message}>
        <Input className={fieldInputClass} {...fieldProps(`${idp}-reason`, { error: errors.reason?.message, hint: true })} {...register("reason")} />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton pending={pending} className="w-auto px-6">Record stock change</SubmitButton>
      </div>
    </form>
  );
}

function ThresholdForm({ row, onDone }: { row: VariantListRow; onDone: (m: string) => void }) {
  const { form, submit, pending, error } = useAdminForm<ThresholdsInput, ReturnType<typeof thresholdsSchema.parse>>({
    resolver: zodResolver(thresholdsSchema),
    defaults: { variant_id: row.variantId, low_stock_threshold: String(row.lowStockThreshold), reorder_level: row.reorderLevel === null ? "" : String(row.reorderLevel) },
    action: async (values) => {
      const result = await setThresholdsAction(values);
      if (result.ok) onDone(result.message ?? "Saved.");
      return result;
    },
  });
  const { register, formState: { errors } } = form;
  const idp = `thr-${row.variantId}`;
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      {error && <FormAlert tone="error" className="sm:col-span-2">{error}</FormAlert>}
      <input type="hidden" {...register("variant_id")} />
      <Field id={`${idp}-low`} label="Low-stock level" hint="At or below this many available, the shop says Low stock." error={errors.low_stock_threshold?.message}>
        <Input inputMode="numeric" className={fieldInputClass} {...fieldProps(`${idp}-low`, { error: errors.low_stock_threshold?.message, hint: true })} {...register("low_stock_threshold")} />
      </Field>
      <Field id={`${idp}-reorder`} label="Reorder level" optional hint="When to order more from your supplier." error={errors.reorder_level?.message}>
        <Input inputMode="numeric" className={fieldInputClass} {...fieldProps(`${idp}-reorder`, { error: errors.reorder_level?.message, hint: true })} {...register("reorder_level")} />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton pending={pending} className="w-auto px-6">Save levels</SubmitButton>
      </div>
    </form>
  );
}

export function StockTable({
  rows,
  categories,
  initialLevel,
}: {
  rows: VariantListRow[];
  categories: { id: string; label: string }[];
  initialLevel: StockLevel | "";
}) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [level, setLevel] = useState<StockLevel | "" | "reorder">(initialLevel);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (level === "reorder" ? r.reorderLevel === null || r.onHand - r.reserved > r.reorderLevel : level && r.level !== level) return false;
      if (categoryId && !r.categoryIds.includes(categoryId)) return false;
      if (words.length === 0) return true;
      const haystack = `${r.productName} ${r.variantName} ${r.sku} ${r.brandName ?? ""}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [rows, query, categoryId, level]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor="stock-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="stock-search" type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Product name, SKU or brand" className="h-11 rounded-lg border-input bg-card pl-9 text-body-lg md:text-body-md" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stock-category">Category</Label>
          <NativeSelect id="stock-category" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stock-level">Stock</Label>
          <NativeSelect id="stock-level" value={level} onChange={(e) => { setLevel(e.target.value as typeof level); setPage(1); }}>
            <option value="">All levels</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
            <option value="ok">In stock</option>
            <option value="reorder">At or below reorder level</option>
          </NativeSelect>
        </div>
      </div>
      <div aria-live="polite" className="empty:hidden">{notice && <FormAlert tone="success">{notice}</FormAlert>}</div>
      {visible.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-8 text-center text-body-md text-muted-foreground">No variants match.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card" aria-label="Stock">
          {visible.map((r) => {
            const label = `${r.productName}${r.variantName !== "Default" ? `, ${r.variantName}` : ""}`;
            return (
              <li key={r.variantId}>
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="text-label-lg break-words">{label}</p>
                    <p className="text-body-sm text-muted-foreground">
                      <span className="font-mono">{r.sku}</span> · {r.onHand} on hand
                      {r.reserved > 0 && <>, {r.reserved} reserved</>} · low at {r.lowStockThreshold}
                      {r.reorderLevel !== null && <>, reorder at {r.reorderLevel}</>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StockLevelBadge level={r.level} />
                    <Button type="button" variant="outline" className="h-11" aria-expanded={open === r.variantId} aria-label={`Change stock of ${label}`} onClick={() => { setOpen(open === r.variantId ? null : r.variantId); setNotice(null); }}>
                      Change stock
                    </Button>
                    <Button asChild variant="outline" className="h-11">
                      <Link href={`/admin/stock/${r.variantId}`} aria-label={`History of ${label}`}>
                        <History className="size-4" aria-hidden="true" />
                        History
                      </Link>
                    </Button>
                  </div>
                </div>
                {open === r.variantId && (
                  <div className="grid gap-6 border-t border-border bg-surface-low p-4 lg:grid-cols-2 lg:p-6">
                    <div>
                      <h3 className="mb-3 text-headline-sm">Record a change</h3>
                      <AdjustForm row={r} onDone={(m) => { setNotice(m); setOpen(null); }} />
                    </div>
                    <div>
                      <h3 className="mb-3 text-headline-sm">Alert levels</h3>
                      <ThresholdForm row={r} onDone={(m) => { setNotice(m); setOpen(null); }} />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={current} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} noun="variants" />
    </div>
  );
}
