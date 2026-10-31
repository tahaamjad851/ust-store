import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerOrderView } from "@/components/orders/customer-order-view";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { getTrackingSummary } from "@/features/orders/queries";
import { isTrackingToken } from "@/features/orders/tracking-token";
import { getStoreSettings } from "@/services/catalog";

// The link is the key to this page: it must not be indexed, and the address (which holds the token) must not
// leak through the Referer header to anything the page links to.
export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

// Read per request: the order changes as staff work on it, and an unknown link must answer a real 404.
export const instant = false;

export default async function TrackingPage({ params, searchParams }: PageProps<"/order/[token]">) {
  const { token } = await params;
  // A malformed token never reaches the database.
  if (!isTrackingToken(token)) notFound();
  const [summary, settings, sp] = await Promise.all([getTrackingSummary(token), getStoreSettings(), searchParams]);
  if (!summary) notFound();

  return (
    <div className="mx-auto max-w-page space-y-6 px-margin py-6 lg:px-margin-desktop">
      <Breadcrumbs items={[{ label: "Your order" }]} />
      <CustomerOrderView
        viaLink
        justPlaced={sp.placed === "1"}
        contact={{ phone_primary: settings.phone_primary, whatsapp_number: settings.whatsapp_number }}
        order={{
          order_number: summary.order_number,
          status: summary.status,
          payment_method: summary.payment_method,
          payment_status: summary.payment_status,
          placed_at: summary.placed_at,
          delivery_method: summary.delivery_method,
          address: { city: summary.city ?? "" },
          subtotal_paisa: summary.subtotal_paisa,
          discount_paisa: summary.discount_paisa,
          shipping_paisa: summary.shipping_paisa,
          shipping_confirmed: summary.shipping_confirmed,
          total_paisa: summary.total_paisa,
          items: summary.items,
          shipments: summary.shipments,
          history: summary.history,
        }}
      />
    </div>
  );
}
