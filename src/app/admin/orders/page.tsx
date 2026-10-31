import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { NativeSelect } from "@/components/admin/native-select";
import { PageHeader, Panel } from "@/components/admin/page-header";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_PAGE_SIZE, searchAdminOrders } from "@/features/orders/queries";
import { isOpen, STATUS_LABEL, WORKFLOW_STATUSES } from "@/features/orders/status";
import { PAYMENT_METHOD_LABEL } from "@/features/orders/types";
import { requireStaff } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format-date";
import { formatPKRExact } from "@/lib/pricing/money";
import { createClient } from "@/lib/supabase/server";
import { parseAdminOrderFilters } from "@/lib/validation/orders";

export const metadata: Metadata = { title: "Orders" };

// Who is signed in is only known for a real request, so the page is never prerendered (see the layout).
export const instant = false;

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireStaff({ next: "/admin/orders" });
  const filters = parseAdminOrderFilters(await searchParams);
  const { rows, total } = await searchAdminOrders(await createClient(), filters);
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);

  const link = (p: number) => {
    const qs = new URLSearchParams();
    if (filters.q) qs.set("q", filters.q);
    if (filters.status) qs.set("status", filters.status);
    if (filters.from) qs.set("from", filters.from);
    if (filters.to) qs.set("to", filters.to);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return `/admin/orders${s ? `?${s}` : ""}`;
  };
  const filtered = Boolean(filters.q || filters.status || filters.from || filters.to);

  return (
    <>
      <PageHeader title="Orders" description="Every order, newest first. Search by order number, phone number or the customer's name." />

      <Panel>
        <form method="get" action="/admin/orders" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end" role="search" aria-label="Find orders">
          <div className="space-y-1.5">
            <Label htmlFor="orders-q">Order number, phone or name</Label>
            <Input id="orders-q" name="q" defaultValue={filters.q} maxLength={80} placeholder="UST-2026-000123, 0300 1234567 or Ali" className="h-11 rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orders-status">Status</Label>
            <NativeSelect id="orders-status" name="status" defaultValue={filters.status}>
              <option value="">All statuses</option>
              {WORKFLOW_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orders-from">From date</Label>
            <Input id="orders-from" name="from" type="date" defaultValue={filters.from} className="h-11 rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orders-to">To date</Label>
            <Input id="orders-to" name="to" type="date" defaultValue={filters.to} className="h-11 rounded-lg" />
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <Button type="submit" className="h-11 flex-1">
              <Search className="size-4" aria-hidden="true" />
              Search
            </Button>
            {filtered && (
              <Button asChild variant="outline" className="h-11">
                <Link href="/admin/orders">Clear</Link>
              </Button>
            )}
          </div>
        </form>
      </Panel>

      <p className="text-body-md text-muted-foreground" aria-live="polite" data-testid="orders-count">
        {total === 0 ? "No orders found." : `${total} ${total === 1 ? "order" : "orders"}${filtered ? " match" : ""}`}
      </p>

      {rows.length > 0 && (
        <ul className="space-y-3" data-testid="orders-list">
          {rows.map((o) => (
            <li key={o.id}>
              <Link
                href={`/admin/orders/${o.id}`}
                className="grid gap-2 rounded-lg border border-border bg-card p-4 shadow-card hover:bg-surface-low sm:grid-cols-[1.2fr_1.5fr_1fr_auto] sm:items-center"
              >
                <span className="min-w-0">
                  <span className="block text-label-lg">{o.order_number}</span>
                  <span className="block text-body-sm text-muted-foreground">{formatDateTime(o.created_at)}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-label-lg">{o.customer_name}</span>
                  <span className="block text-body-sm text-muted-foreground tabular">
                    {o.customer_phone}
                    {o.city ? ` · ${o.city}` : ""}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-label-lg tabular">{formatPKRExact(o.total_paisa)}</span>
                  <span className="block text-body-sm text-muted-foreground">
                    {PAYMENT_METHOD_LABEL[o.payment_method]}
                    {!o.shipping_confirmed && isOpen(o.status) ? " · delivery to confirm" : ""}
                  </span>
                </span>
                <OrderStatusBadge status={o.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={link(page - 1)}>
                <ChevronLeft className="size-4" aria-hidden="true" />
                Previous
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-body-md text-muted-foreground tabular">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={link(page + 1)}>
                Next
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
