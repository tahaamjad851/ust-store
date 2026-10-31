import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, FileSpreadsheet, PackagePlus, Wallet } from "lucide-react";
import { Panel, PageHeader } from "@/components/admin/page-header";
import { buildProductRows, buildVariantRows } from "@/features/admin/catalog-rows";
import { loadCatalogIndex, loadPriceChanges } from "@/features/admin/queries";
import { requireStaff } from "@/lib/auth/session";
import { formatPKRExact } from "@/lib/pricing/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

// Who is signed in is only known for a real request, so the page is never prerendered (see the layout).
export const instant = false;

function Stat({ label, value, href, tone }: { label: string; value: number; href?: string; tone?: "warn" }) {
  const body = (
    <>
      <dt className="text-body-md text-muted-foreground">{label}</dt>
      <dd className={tone === "warn" && value > 0 ? "text-headline-lg text-destructive tabular" : "text-headline-lg tabular"}>{value}</dd>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-lg border border-border bg-card p-4 shadow-card transition-colors hover:bg-surface-low">
      <dl>{body}</dl>
    </Link>
  ) : (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <dl>{body}</dl>
    </div>
  );
}

export default async function AdminHomePage() {
  const user = await requireStaff({ next: "/admin" });
  const db = await createClient();
  const [index, changes] = await Promise.all([loadCatalogIndex(db), loadPriceChanges(db, { limit: 5 })]);
  const products = buildProductRows(index);
  const variants = buildVariantRows(index);
  const sellable = variants.filter((v) => v.isActive && v.productStatus === "published");
  const count = (fn: (p: (typeof products)[number]) => boolean) => products.filter(fn).length;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.fullName ?? user.email ?? "there"}`}
        description="Run the catalogue from here: prices, products, stock and photos. Orders, customers and payments come in later phases."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin/prices" className="flex min-h-16 items-center gap-3 rounded-lg bg-primary p-4 text-primary-foreground hover:bg-primary/90">
          <Wallet className="size-6" aria-hidden="true" />
          <span>
            <span className="block text-label-lg">Daily prices</span>
            <span className="block text-body-sm opacity-90">Change prices and stock in one table</span>
          </span>
        </Link>
        <Link href="/admin/products/new" className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-surface-low">
          <PackagePlus className="size-6 text-primary" aria-hidden="true" />
          <span>
            <span className="block text-label-lg">Add a product</span>
            <span className="block text-body-sm text-muted-foreground">With photos, prices and the tractors it fits</span>
          </span>
        </Link>
        <Link href="/admin/import-export" className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-surface-low">
          <FileSpreadsheet className="size-6 text-primary" aria-hidden="true" />
          <span>
            <span className="block text-label-lg">Import or export</span>
            <span className="block text-body-sm text-muted-foreground">Work on the whole catalogue in a spreadsheet</span>
          </span>
        </Link>
      </div>

      <Panel title="Catalogue" id="catalogue">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Products" value={products.length} href="/admin/products" />
          <Stat label="Published" value={count((p) => p.status === "published")} href="/admin/products?status=published" />
          <Stat label="Drafts" value={count((p) => p.status === "draft")} href="/admin/products?status=draft" />
          <Stat label="Archived" value={count((p) => p.status === "archived")} href="/admin/products?status=archived" />
          <Stat label="Variants for sale" value={sellable.length} />
          <Stat label="Low stock" value={sellable.filter((v) => v.level === "low").length} href="/admin/stock?level=low" tone="warn" />
          <Stat label="Out of stock" value={sellable.filter((v) => v.level === "out").length} href="/admin/stock?level=out" tone="warn" />
          <Stat label="Unavailable variants" value={variants.filter((v) => !v.isActive).length} />
        </dl>
        {products.length === 0 && (
          <p className="mt-4 flex items-start gap-2 text-body-md text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            The catalogue is empty. Add a product, or import a CSV file.
          </p>
        )}
      </Panel>

      <Panel title="Latest price changes" id="latest-price-changes" description="Who changed what, and when. Orders already placed keep the price they were placed at.">
        {changes.length === 0 ? (
          <p className="text-body-md text-muted-foreground">No price has been changed yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {changes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-body-md">
                <span className="min-w-0 break-words">
                  {c.product_name} <span className="font-mono text-label-sm text-muted-foreground">{c.sku}</span>
                </span>
                <span className="tabular">
                  {formatPKRExact(c.old_sale_paisa ?? c.old_regular_paisa)} → {formatPKRExact(c.new_sale_paisa ?? c.new_regular_paisa)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3">
          <Link href="/admin/prices#price-history" className="text-label-lg text-primary hover:underline">
            See the full history
          </Link>
        </p>
      </Panel>
    </>
  );
}
