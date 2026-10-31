import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { CustomerOrderView } from "@/components/orders/customer-order-view";
import { getMyOrder } from "@/features/orders/queries";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getStoreSettings } from "@/services/catalog";

export const metadata: Metadata = { title: "Your order", referrer: "no-referrer" };

// Blocking, so that notFound() decides the status before anything streams.
export const instant = false;

export default async function MyOrderPage({ params, searchParams }: PageProps<"/account/orders/[id]">) {
  const user = await requireUser({ next: "/account/orders" });
  const [{ id }, sp, settings] = await Promise.all([params, searchParams, getStoreSettings()]);
  // Another customer's order, an unknown id and a malformed id all end here, with the same page.
  const order = await getMyOrder(await createClient(), user.id, id);
  if (!order) notFound();

  return (
    <div className="space-y-4">
      <Link href="/account/orders" className="inline-flex min-h-11 items-center gap-1 text-label-md text-primary underline">
        <ChevronLeft className="size-4" aria-hidden="true" />
        All orders
      </Link>
      <CustomerOrderView
        justPlaced={sp.placed === "1"}
        contact={{ phone_primary: settings.phone_primary, whatsapp_number: settings.whatsapp_number }}
        order={{
          order_number: order.order_number,
          status: order.status,
          payment_method: order.payment_method,
          payment_status: order.payment_status,
          placed_at: order.created_at,
          delivery_method: order.delivery_method_name,
          address: order.shipping_address,
          subtotal_paisa: order.subtotal_paisa,
          discount_paisa: order.discount_paisa,
          shipping_paisa: order.shipping_paisa,
          shipping_confirmed: order.shipping_confirmed,
          total_paisa: order.total_paisa,
          items: order.items,
          shipments: order.shipments,
          history: order.history.map((h) => ({ status: h.to_status, at: h.created_at })),
        }}
      />
    </div>
  );
}
