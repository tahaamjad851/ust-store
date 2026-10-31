import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { Button } from "@/components/ui/button";
import { listMyOrders } from "@/features/orders/queries";
import { formatDate } from "@/lib/format-date";
import { requireUser } from "@/lib/auth/session";
import { formatPKRExact } from "@/lib/pricing/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your orders" };

// Blocking, like the layout: the page reads the signed-in customer's data for every request.
export const instant = false;

export default async function OrdersPage() {
  const user = await requireUser({ next: "/account/orders" });
  // Row-level security limits this to the customer's own orders; the owner filter inside listMyOrders() says so again
  // (staff can read every order through RLS, so a staff member's own page must not list them all).
  const orders = await listMyOrders(await createClient(), user.id);

  return (
    <section aria-labelledby="orders-heading" className="space-y-4">
      <div>
        <h2 id="orders-heading" className="text-headline-sm">
          Your orders
        </h2>
        <p className="text-body-md text-muted-foreground">Orders placed while you were signed in.</p>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Package className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-headline-sm">No orders yet</h3>
          <p className="mt-1 text-body-md text-muted-foreground">When you order while signed in, it will be listed here.</p>
          <Button asChild className="mt-4 h-11">
            <Link href="/shop">Browse parts</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3" data-testid="my-orders">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/account/orders/${o.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 hover:bg-surface-low"
              >
                <span className="min-w-0">
                  <span className="block text-label-lg">{o.order_number}</span>
                  <span className="block text-body-sm text-muted-foreground">Placed {formatDate(o.created_at)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <OrderStatusBadge status={o.status} audience="customer" />
                  <span className="text-label-lg tabular">
                    {formatPKRExact(o.total_paisa)}
                    {!o.shipping_confirmed && <span className="block text-body-sm font-normal text-muted-foreground">+ delivery</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
