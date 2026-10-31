import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PrintButton } from "@/components/admin/print-button";
import { getAdminOrder } from "@/features/orders/queries";
import { PAYMENT_METHOD_LABEL } from "@/features/orders/types";
import { requireStaff } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format-date";
import { formatPKRExact } from "@/lib/pricing/money";
import { createClient } from "@/lib/supabase/server";
import { getStoreSettings } from "@/services/catalog";

export const metadata: Metadata = { title: "Order slip" };

// Who is signed in is only known for a real request, so the page is never prerendered (see the layout).
export const instant = false;

/**
 * A packing and delivery slip for one order. It prints through the browser (the admin header and menu carry
 * `print:hidden`). It holds what the packer and the courier need and nothing internal: no internal notes, no costs.
 */
export default async function OrderSlipPage({ params }: PageProps<"/admin/orders/[id]/slip">) {
  const { id } = await params;
  await requireStaff({ next: `/admin/orders/${id}/slip` });
  const [order, settings] = await Promise.all([getAdminOrder(await createClient(), id), getStoreSettings()]);
  if (!order) notFound();

  const a = order.shipping_address;
  const shipment = order.shipments.at(-1);
  const cashDue = order.payment_method === "cod" && order.payment_status !== "paid";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/admin/orders/${order.id}`} className="inline-flex min-h-11 items-center gap-1 text-label-md text-primary underline">
          <ChevronLeft className="size-4" aria-hidden="true" />
          Back to the order
        </Link>
        <PrintButton />
      </div>

      <article
        className="mx-auto w-full max-w-3xl space-y-5 rounded-lg border border-border bg-card p-6 text-body-md print:max-w-none print:space-y-4 print:rounded-none print:border-0 print:p-0 print:text-[11pt] print:text-black"
        data-testid="order-slip"
      >
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4 print:border-black">
          <div>
            <p className="font-display text-headline-sm">{settings.business_name}</p>
            <p className="text-body-sm text-muted-foreground print:text-black">
              {settings.address_line}, {settings.city} · {settings.phone_primary}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-headline-md" data-testid="slip-number">
              {order.order_number}
            </p>
            <p className="text-body-sm text-muted-foreground print:text-black">{formatDateTime(order.created_at)}</p>
          </div>
        </header>

        <section aria-labelledby="slip-to" className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <h2 id="slip-to" className="text-label-lg uppercase">
              Deliver to
            </h2>
            <p className="font-semibold break-words">{order.customer_name}</p>
            <p className="tabular">{order.customer_phone}</p>
            <address className="not-italic break-words">
              {[a.line1, a.street, a.area].filter(Boolean).join(", ")}
              <br />
              {a.city}, {a.province}
              {a.postal_code ? ` ${a.postal_code}` : ""}
            </address>
            {a.instructions && <p className="break-words">{a.instructions}</p>}
          </div>
          <div>
            <h2 className="text-label-lg uppercase">Shipping</h2>
            <p>{order.delivery_method_name}</p>
            {shipment ? (
              <p>
                Courier: <strong>{shipment.courier}</strong>
                {shipment.tracking_number && (
                  <>
                    <br />
                    Tracking: <strong className="tabular">{shipment.tracking_number}</strong>
                  </>
                )}
              </p>
            ) : (
              <p className="text-muted-foreground print:text-black">Courier not entered yet</p>
            )}
            <p>Payment: {PAYMENT_METHOD_LABEL[order.payment_method]}</p>
          </div>
        </section>

        <section aria-labelledby="slip-items">
          <h2 id="slip-items" className="sr-only">
            Items
          </h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-left print:border-black">
                <th className="py-2 pr-2 font-semibold">Item</th>
                <th className="px-2 py-2 text-right font-semibold">Qty</th>
                <th className="px-2 py-2 text-right font-semibold">Price</th>
                <th className="py-2 pl-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={`${i.sku}-${i.variant_name}`} className="border-b border-border align-top print:border-gray-400">
                  <td className="py-2 pr-2 break-words">
                    {i.product_name}
                    {i.variant_name && `, ${i.variant_name}`}
                    <span className="block text-body-sm text-muted-foreground print:text-black">SKU {i.sku}</span>
                  </td>
                  <td className="px-2 py-2 text-right tabular">{i.quantity}</td>
                  <td className="px-2 py-2 text-right tabular">{formatPKRExact(i.unit_price_paisa)}</td>
                  <td className="py-2 pl-2 text-right tabular">{formatPKRExact(i.line_total_paisa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-3 ml-auto w-full max-w-xs space-y-1">
            <div className="flex justify-between">
              <dt>Items</dt>
              <dd className="tabular">{formatPKRExact(order.subtotal_paisa)}</dd>
            </div>
            {order.discount_paisa > 0 && (
              <div className="flex justify-between">
                <dt>Discount</dt>
                <dd className="tabular">−{formatPKRExact(order.discount_paisa)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Delivery</dt>
              <dd className="tabular">{order.shipping_confirmed ? (order.shipping_paisa === 0 ? "Free" : formatPKRExact(order.shipping_paisa)) : "To be confirmed"}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1 text-headline-sm print:border-black">
              <dt>Total</dt>
              <dd className="tabular">{formatPKRExact(order.total_paisa)}</dd>
            </div>
          </dl>
        </section>

        {cashDue && (
          <p className="rounded-lg border-2 border-foreground p-3 text-center text-headline-sm print:border-black" data-testid="slip-cod">
            Cash to collect on delivery: {formatPKRExact(order.total_paisa)}
            {!order.shipping_confirmed && <span className="block text-body-md font-normal">Delivery charge not entered yet</span>}
          </p>
        )}
        {order.customer_notes && (
          <p className="break-words whitespace-pre-line">
            <strong>Customer&apos;s note:</strong> {order.customer_notes}
          </p>
        )}
      </article>
    </>
  );
}
