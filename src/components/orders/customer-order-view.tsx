import { CheckCircle2, MessageCircle, Phone, Truck } from "lucide-react";
import { OrderLines, OrderTotals } from "@/components/orders/order-lines";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/orders/status-badge";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { Button } from "@/components/ui/button";
import type { HistoryEntry, OrderStatus } from "@/features/orders/status";
import { PAYMENT_METHOD_LABEL, type AddressSnapshot, type OrderLine, type PaymentMethodValue, type PaymentStatusValue, type ShipmentInfo } from "@/features/orders/types";
import { telLink, whatsappLink } from "@/lib/contact";
import { formatDate, formatDateTime } from "@/lib/format-date";

export type CustomerOrderData = {
  order_number: string;
  status: OrderStatus;
  payment_method: PaymentMethodValue;
  payment_status: PaymentStatusValue;
  placed_at: string;
  delivery_method: string;
  /** The tracking link shows the city only; a signed-in customer sees their whole address. */
  address: Pick<AddressSnapshot, "city"> & Partial<AddressSnapshot>;
  subtotal_paisa: number;
  discount_paisa: number;
  shipping_paisa: number;
  shipping_confirmed: boolean;
  total_paisa: number;
  items: readonly OrderLine[];
  shipments: readonly ShipmentInfo[];
  history: readonly HistoryEntry[];
};

type Props = {
  order: CustomerOrderData;
  /** Shown right after the order was placed. */
  justPlaced?: boolean;
  contact: { phone_primary: string; whatsapp_number: string };
  /** True on the tracking link: the page explains that the link itself is the key. */
  viaLink?: boolean;
};

export function CustomerOrderView({ order, justPlaced, contact, viaLink }: Props) {
  const addressLines = [order.address.line1, order.address.area, order.address.city, order.address.province].filter(Boolean);
  return (
    <div className="space-y-6">
      {justPlaced && (
        <section role="status" className="rounded-lg border border-primary/30 bg-brand-tint/40 p-4 lg:p-6" data-testid="order-placed-banner">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-headline-md">Thank you, we have received your order</h2>
              <p className="mt-1 text-body-md">
                Your order number is <strong data-testid="order-number-banner">{order.order_number}</strong>. We will call you to confirm the order and agree the delivery charge. You pay nothing now.
              </p>
            </div>
          </div>
        </section>
      )}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-headline-lg-mobile break-words lg:text-headline-lg" data-testid="order-number">
            {order.order_number}
          </h1>
          <p className="text-body-md text-muted-foreground">Placed {formatDateTime(order.placed_at)}</p>
        </div>
        <OrderStatusBadge status={order.status} audience="customer" className="px-3 py-1 text-label-md" />
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
        <div className="space-y-6">
          <section aria-labelledby="progress-title" className="rounded-lg border border-border bg-card p-4 lg:p-6">
            <h2 id="progress-title" className="mb-4 text-headline-sm">
              Order progress
            </h2>
            <OrderTimeline status={order.status} history={order.history} />
          </section>

          {order.shipments.length > 0 && (
            <section aria-labelledby="courier-title" className="rounded-lg border border-border bg-card p-4 lg:p-6" data-testid="shipment">
              <h2 id="courier-title" className="mb-3 flex items-center gap-2 text-headline-sm">
                <Truck className="size-5" aria-hidden="true" />
                Courier
              </h2>
              <ul className="space-y-3">
                {order.shipments.map((s, i) => (
                  <li key={i} className="text-body-md">
                    <p>
                      <span className="text-muted-foreground">Courier: </span>
                      <strong data-testid="courier-name">{s.courier}</strong>
                    </p>
                    {s.tracking_number && (
                      <p>
                        <span className="text-muted-foreground">Tracking number: </span>
                        <strong className="tabular break-all" data-testid="tracking-number">
                          {s.tracking_number}
                        </strong>
                      </p>
                    )}
                    {s.dispatched_at && <p className="text-body-sm text-muted-foreground">Dispatched {formatDate(s.dispatched_at)}</p>}
                    {s.estimated_delivery && <p className="text-body-sm text-muted-foreground">Expected {formatDate(s.estimated_delivery)}</p>}
                    {s.delivery_notes && <p className="text-body-sm">{s.delivery_notes}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="items-title" className="rounded-lg border border-border bg-card p-4 lg:p-6">
            <h2 id="items-title" className="text-headline-sm">
              Items
            </h2>
            <OrderLines items={order.items} />
          </section>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="totals-title" className="rounded-lg border border-border bg-card p-4 shadow-card lg:p-6">
            <h2 id="totals-title" className="mb-3 text-headline-sm">
              Total
            </h2>
            <OrderTotals
              subtotal_paisa={order.subtotal_paisa}
              discount_paisa={order.discount_paisa}
              shipping_paisa={order.shipping_paisa}
              shipping_confirmed={order.shipping_confirmed}
              total_paisa={order.total_paisa}
            />
          </section>

          <section aria-labelledby="details-title" className="space-y-3 rounded-lg border border-border bg-card p-4 lg:p-6">
            <h2 id="details-title" className="text-headline-sm">
              Delivery and payment
            </h2>
            <dl className="space-y-3 text-body-md">
              <div>
                <dt className="text-label-md text-muted-foreground">Delivery</dt>
                <dd>
                  {order.delivery_method}
                  <br />
                  <span className="break-words">{addressLines.join(", ")}</span>
                </dd>
              </div>
              <div>
                <dt className="text-label-md text-muted-foreground">Payment</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  {PAYMENT_METHOD_LABEL[order.payment_method]}
                  <PaymentStatusBadge status={order.payment_status} />
                </dd>
              </div>
            </dl>
            {viaLink && <p className="text-body-sm text-muted-foreground">Anyone with this page&apos;s link can see this order. Keep the link to yourself.</p>}
          </section>

          {(telLink(contact.phone_primary) || whatsappLink(contact.whatsapp_number)) && (
            <section aria-labelledby="help-title" className="rounded-lg border border-border bg-surface-container p-4">
              <h2 id="help-title" className="text-headline-sm">
                Questions about your order?
              </h2>
              <p className="mt-1 text-body-md text-muted-foreground">Quote the order number {order.order_number}.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {telLink(contact.phone_primary) && (
                  <Button asChild variant="outline" className="h-11">
                    <a href={telLink(contact.phone_primary) ?? undefined}>
                      <Phone aria-hidden="true" />
                      Call {contact.phone_primary}
                    </a>
                  </Button>
                )}
                {whatsappLink(contact.whatsapp_number) && (
                  <Button asChild className="h-11 bg-whatsapp hover:bg-whatsapp-hover">
                    <a href={whatsappLink(contact.whatsapp_number, `Hello, my order number is ${order.order_number}.`) ?? undefined} target="_blank" rel="noopener noreferrer">
                      <MessageCircle aria-hidden="true" />
                      WhatsApp us
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </Button>
                )}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
