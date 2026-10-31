"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import { FormAlert } from "@/components/forms/form-alert";
import { NativeSelect } from "@/components/admin/native-select";
import { Pager } from "@/components/admin/pager";
import { ProductStatusBadge, StockLevelBadge } from "@/components/admin/badges";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  checkRowEdit,
  findLargeChanges,
  type DailyChange,
  type LargeChange,
  type PriceRow,
  type RowEdit,
} from "@/features/admin/price-changes";
import { applyDailyChangesAction, type LargeChangeDetail } from "@/features/admin/price-actions";
import type { VariantListRow } from "@/features/admin/catalog-rows";
import { formatPKRExact, paisaToRupeesInput } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;
const GRID = "md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]";
const cellInput = "h-11 rounded-lg border-input bg-card text-body-lg tabular md:text-body-md";

type Filter = "all" | "changed" | "unavailable" | "low";

function toPriceRow(r: VariantListRow): PriceRow {
  return { variantId: r.variantId, regularPaisa: r.regularPaisa, salePaisa: r.salePaisa, isActive: r.isActive, onHand: r.onHand, updatedAt: r.updatedAt };
}

export function DailyPricesTable({
  rows,
  categories,
  alertPercent,
}: {
  rows: VariantListRow[];
  categories: { id: string; label: string }[];
  alertPercent: number;
}) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ large: LargeChange[]; changes: DailyChange[] } | null>(null);
  const [serverLarge, setServerLarge] = useState<{ detail: LargeChangeDetail; changes: DailyChange[] } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // After a save the page's data is refreshed from the server; the edits that were saved are cleared then.
  const priceRows = useMemo(() => new Map(rows.map((r) => [r.variantId, toPriceRow(r)])), [rows]);
  const checks = useMemo(() => {
    const out = new Map<string, ReturnType<typeof checkRowEdit>>();
    for (const [id, edit] of Object.entries(edits)) {
      const row = priceRows.get(id);
      if (row) out.set(id, checkRowEdit(row, edit));
    }
    return out;
  }, [edits, priceRows]);

  const pendingChanges = useMemo(() => [...checks.values()].flatMap((c) => (c.change ? [c.change] : [])), [checks]);
  const invalidCount = useMemo(() => [...checks.values()].filter((c) => Object.keys(c.errors).length > 0).length, [checks]);
  const dirty = pendingChanges.length + invalidCount > 0;

  // Leaving with unsaved edits would lose them.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (categoryId && !r.categoryIds.includes(categoryId)) return false;
      if (filter === "changed" && !checks.get(r.variantId)?.change && !(checks.get(r.variantId) && Object.keys(checks.get(r.variantId)!.errors).length)) return false;
      if (filter === "unavailable" && r.isActive) return false;
      if (filter === "low" && r.level === "ok") return false;
      if (words.length === 0) return true;
      const haystack = `${r.productName} ${r.variantName} ${r.sku} ${r.partNumber ?? ""} ${r.categoryName} ${r.brandName ?? ""}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [rows, query, categoryId, filter, checks]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function edit(variantId: string, patch: RowEdit) {
    setResult(null);
    setEdits((prev) => ({ ...prev, [variantId]: { ...prev[variantId], ...patch } }));
  }

  function discard() {
    setEdits({});
    setResult(null);
  }

  function show(tone: "error" | "success", text: string) {
    setResult({ tone, text });
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ block: "nearest" }));
  }

  async function send(changes: DailyChange[], confirmLarge: boolean) {
    setSaving(true);
    try {
      const res = await applyDailyChangesAction({ changes, confirm_large: confirmLarge });
      if (res.ok) {
        setEdits({});
        setConfirm(null);
        setServerLarge(null);
        show("success", res.message ?? "Saved.");
      } else if (res.code === "large_change_unconfirmed" && Array.isArray(res.detail)) {
        setServerLarge({ detail: res.detail as LargeChangeDetail, changes });
      } else {
        setConfirm(null);
        show("error", res.fieldErrors ? "Some values are not valid. Check the highlighted rows." : (res.message ?? "Could not save."));
      }
    } catch {
      show("error", "Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (invalidCount > 0) {
      show("error", `${invalidCount} row${invalidCount === 1 ? " has" : "s have"} a value that is not valid. Fix ${invalidCount === 1 ? "it" : "them"} first.`);
      const firstBad = [...checks].find(([, c]) => Object.keys(c.errors).length > 0)?.[0];
      if (firstBad) {
        const index = filtered.findIndex((r) => r.variantId === firstBad);
        if (index >= 0) setPage(Math.floor(index / PAGE_SIZE) + 1);
        requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-row="${firstBad}"] [aria-invalid="true"]`)?.focus());
      }
      return;
    }
    if (pendingChanges.length === 0) {
      show("success", "Nothing has changed.");
      return;
    }
    const large = findLargeChanges(rows.map(toPriceRow), pendingChanges, alertPercent);
    if (large.length > 0) setConfirm({ large, changes: pendingChanges });
    else void send(pendingChanges, false);
  }

  const nameOf = (variantId: string) => {
    const r = rows.find((x) => x.variantId === variantId);
    return r ? `${r.productName}${r.variantName !== "Default" ? `, ${r.variantName}` : ""}` : variantId;
  };

  const dialogItems: { variantId: string; label: string; from: number; to: number; percent: number }[] = serverLarge
    ? serverLarge.detail.map((d) => ({ variantId: d.variant_id, label: `${nameOf(d.variant_id)} (${d.sku})`, from: d.old_paisa, to: d.new_paisa, percent: d.percent }))
    : (confirm?.large ?? []).map((l) => ({ variantId: l.variantId, label: nameOf(l.variantId), from: l.fromPaisa, to: l.toPaisa, percent: l.percent }));
  const dialogChanges = serverLarge?.changes ?? confirm?.changes ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor="price-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="price-search"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Product name, SKU or part number"
              className="h-11 rounded-lg border-input bg-card pl-9 text-body-lg md:text-body-md"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="price-category">Category</Label>
          <NativeSelect
            id="price-category"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="price-filter">Show</Label>
          <NativeSelect
            id="price-filter"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as Filter);
              setPage(1);
            }}
          >
            <option value="all">Everything</option>
            <option value="changed">Only rows I changed</option>
            <option value="unavailable">Unavailable items</option>
            <option value="low">Low or out of stock</option>
          </NativeSelect>
        </div>
      </div>

      <div ref={resultRef} className="empty:hidden">
        {result && <FormAlert tone={result.tone}>{result.text}</FormAlert>}
      </div>

      <div role="table" aria-label="Prices, stock and availability" aria-rowcount={filtered.length + 1} className="rounded-lg border border-border bg-card">
        <div role="rowgroup" className="hidden md:block">
          <div role="row" className={cn("grid items-end gap-3 border-b border-border bg-surface-low px-4 py-2 text-label-md uppercase text-muted-foreground", GRID)}>
            <div role="columnheader">Product</div>
            <div role="columnheader">Regular price (Rs)</div>
            <div role="columnheader">Sale price (Rs)</div>
            <div role="columnheader">Stock</div>
            <div role="columnheader">Available</div>
          </div>
        </div>
        <div role="rowgroup" className="divide-y divide-border">
          {visible.length === 0 && (
            <p role="row" className="p-8 text-center text-body-md text-muted-foreground">
              <span role="cell">{rows.length === 0 ? "There are no products yet." : "No products match. Clear the search or the filters."}</span>
            </p>
          )}
          {visible.map((r) => {
            const check = checks.get(r.variantId);
            const e = edits[r.variantId];
            const errors = check?.errors ?? {};
            const changed = Boolean(check?.change);
            const label = `${r.productName}${r.variantName !== "Default" ? `, ${r.variantName}` : ""}`;
            const regularText = e?.regular ?? paisaToRupeesInput(r.regularPaisa);
            const saleText = e?.sale ?? (r.salePaisa === null ? "" : paisaToRupeesInput(r.salePaisa));
            const stockText = e?.onHand ?? String(r.onHand);
            const active = e?.isActive ?? r.isActive;
            return (
              <div
                key={r.variantId}
                role="row"
                data-row={r.variantId}
                className={cn("grid grid-cols-2 items-start gap-3 p-4", GRID, changed && "border-l-4 border-l-primary bg-brand-tint/40", Object.keys(errors).length > 0 && "border-l-4 border-l-destructive")}
              >
                <div role="cell" className="col-span-2 min-w-0 space-y-1 md:col-span-1">
                  <Link href={`/admin/products/${r.productId}`} className="block text-label-lg break-words hover:underline">
                    {r.productName}
                    {r.variantName !== "Default" && <span className="font-normal text-muted-foreground">, {r.variantName}</span>}
                  </Link>
                  <p className="font-mono text-label-sm break-all text-muted-foreground">{r.sku}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ProductStatusBadge status={r.productStatus} />
                    <StockLevelBadge level={r.level} />
                    {r.reserved > 0 && <span className="text-body-sm text-muted-foreground">{r.reserved} reserved</span>}
                    {changed && <span className="text-label-md text-primary">Changed</span>}
                  </div>
                </div>
                <div role="cell" className="space-y-1">
                  <label htmlFor={`reg-${r.variantId}`} className="text-label-md text-muted-foreground md:sr-only">
                    Regular price (Rs)
                  </label>
                  <Input
                    id={`reg-${r.variantId}`}
                    aria-label={`Regular price in rupees for ${label}`}
                    inputMode="decimal"
                    value={regularText}
                    onChange={(ev) => edit(r.variantId, { regular: ev.target.value })}
                    aria-invalid={errors.regular ? true : undefined}
                    aria-describedby={errors.regular ? `reg-${r.variantId}-err` : undefined}
                    className={cellInput}
                  />
                  {errors.regular && (
                    <p id={`reg-${r.variantId}-err`} className="text-body-sm text-destructive">
                      {errors.regular}
                    </p>
                  )}
                </div>
                <div role="cell" className="space-y-1">
                  <label htmlFor={`sale-${r.variantId}`} className="text-label-md text-muted-foreground md:sr-only">
                    Sale price (Rs)
                  </label>
                  <Input
                    id={`sale-${r.variantId}`}
                    aria-label={`Sale price in rupees for ${label}, empty for no sale`}
                    inputMode="decimal"
                    placeholder="No sale"
                    value={saleText}
                    onChange={(ev) => edit(r.variantId, { sale: ev.target.value })}
                    aria-invalid={errors.sale ? true : undefined}
                    aria-describedby={errors.sale ? `sale-${r.variantId}-err` : undefined}
                    className={cellInput}
                  />
                  {errors.sale && (
                    <p id={`sale-${r.variantId}-err`} className="text-body-sm text-destructive">
                      {errors.sale}
                    </p>
                  )}
                </div>
                <div role="cell" className="space-y-1">
                  <label htmlFor={`stock-${r.variantId}`} className="text-label-md text-muted-foreground md:sr-only">
                    Stock on hand
                  </label>
                  <Input
                    id={`stock-${r.variantId}`}
                    aria-label={`Stock on hand for ${label}`}
                    inputMode="numeric"
                    value={stockText}
                    onChange={(ev) => edit(r.variantId, { onHand: ev.target.value })}
                    aria-invalid={errors.onHand ? true : undefined}
                    aria-describedby={errors.onHand ? `stock-${r.variantId}-err` : undefined}
                    className={cellInput}
                  />
                  {errors.onHand && (
                    <p id={`stock-${r.variantId}-err`} className="text-body-sm text-destructive">
                      {errors.onHand}
                    </p>
                  )}
                </div>
                <div role="cell" className="flex min-h-11 items-center gap-2">
                  <input
                    id={`active-${r.variantId}`}
                    type="checkbox"
                    checked={active}
                    onChange={(ev) => edit(r.variantId, { isActive: ev.target.checked })}
                    className="size-5 accent-primary"
                    aria-label={`Available in the shop: ${label}`}
                  />
                  <label htmlFor={`active-${r.variantId}`} className="text-body-md">
                    {active ? "Available" : "Unavailable"}
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Pager page={currentPage} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} noun="variants" />

      <div className="sticky bottom-0 z-10 -mx-margin flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/95 px-margin py-3 backdrop-blur lg:mx-0 lg:rounded-lg lg:border" data-testid="save-bar">
        <p role="status" className="text-body-md">
          {dirty ? (
            <>
              <strong className="tabular">{pendingChanges.length}</strong> change{pendingChanges.length === 1 ? "" : "s"} not saved
              {invalidCount > 0 && <span className="text-destructive"> · {invalidCount} to fix</span>}
            </>
          ) : (
            <span className="text-muted-foreground">No unsaved changes</span>
          )}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-11" disabled={!dirty || saving} onClick={discard}>
            Discard changes
          </Button>
          <Button type="button" className="h-11" disabled={!dirty || saving} onClick={save}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Save changes
          </Button>
        </div>
      </div>

      <AlertDialog
        open={Boolean(confirm || serverLarge)}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setConfirm(null);
            setServerLarge(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Large price change</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {dialogItems.length === 1 ? "This price moves" : `These ${dialogItems.length} prices move`} by more than {alertPercent}%. Check that
                  {dialogItems.length === 1 ? " it is" : " they are"} right before saving.
                </p>
                <ul className="max-h-64 space-y-2 overflow-y-auto">
                  {dialogItems.map((d) => (
                    <li key={d.variantId} className="rounded-lg bg-surface-low p-3 text-body-md text-foreground">
                      <span className="block font-medium break-words">{d.label}</span>
                      <span className="tabular">
                        {formatPKRExact(d.from)} → {formatPKRExact(d.to)}
                      </span>{" "}
                      <span className="font-medium text-destructive">({d.to > d.from ? "+" : "−"}{d.percent}%)</span>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline" className="h-11" disabled={saving}>
                Go back and check
              </Button>
            </AlertDialogCancel>
            <Button type="button" className="h-11" disabled={saving} onClick={() => void send(dialogChanges, true)}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Save these changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
