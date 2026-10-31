import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BellOff, ChevronLeft, MessageCircle, Phone, Printer } from "lucide-react";
import { CodPanel, DeliveryChargePanel, NoteForm, ShipmentPanel, StatusPanel } from "@/components/admin/order-panels";
import { PageHeader, Panel } from "@/components/admin/page-header";
import { OrderLines, OrderTotals } from "@/components/orders/order-lines";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/orders/status-badge";
import { Button } from "@/components/ui/button";
import { describeAudit } from "@/features/orders/audit";
import { getAdminOrder } from "@/features/orders/queries";
import { isClosed } from "@/features/orders/status";
import { PAYMENT_METHOD_LABEL } from "@/features/orders/types";
import { requireStaff } from "@/lib/auth/session";
import { telHref, whatsappHrefForPkMobile } from "@/lib/contact";
import { formatDateTime } from "@/lib/format-date";
import { formatPKRExact } from "@/lib/pricing/money";
import { createClient } from "@/lib/supabase/server";
import { getStoreSettings } from "@/services/catalog";

export const metadata: Metadata = { title: "Order" };

// Who is signed in is only known for a real request, so the page is never prerendered (see the layout).
export const instant = false;

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  await requireStaff({ next: `/admin/orders/${id}` });
  const [order, settings] = await Promise.all([getAdminOrder(await createClient(), id), getStoreSettings()]);
  if (!order) notFound();

  const a = order.shipping_address;
  const shipment = order.shipments.at(-1);
  const paid = order.payment_status === "paid" || order.payment_status === "refunded";
  const lockedReason = isClosed(order.status)
    ? "This order is finished, so the charge can no longer change."
    : paid
      ? "The payment was already collected, so the total is fixed."
      : null;
  const codCollectable = order.payment_method === "cod" && order.payment_status === "unpaid" && ["dispatched", "delivered", "exchange_requested"].includes(order.status);
  const notification = order.owner_notification;
  const greeting = `Assalam o Alaikum ${order.customer_name}, this is ${settings.business_name} about your order ${order.order_number}.`;

  return (
    <>
      <Link href="/admin/orders" className="inline-flex min-h-11 items-center gap-1 text-label-md text-primary underline">
        <ChevronLeft className="size-4" aria-hidden="true" />
        All orders
      </Link>
      <PageHeader
        title={order.order_number}
        description={
          <>
            Placed {formatDateTime(order.created_at)} · {order.user_id ? "registered customer" : "guest checkout"}
          </>
        }
        actions={
          <>
            <OrderStatusBadge status={order.status} className="px-3 py-1 text-label-md" />
            <Button asChild variant="outline" className="h-11">
              <Link href={`/admin/orders/${order.id}/slip`}>
                <Printer className="size-4" aria-hidden="true" />
                Print slip
              </Link>
            </Button>
          </>
        }
      />

      {notification.state !== "sent" && (
        <div role="status" className="flex gap-3 rounded-lg border border-warning-foreground/30 bg-warning-container p-4 text-warning-foreground" data-testid="owner-notification-warning">
          <BellOff className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="text-body-md">
            <p className="font-semibold">Owner notification not sent</p>
            <p>
              {notification.state === "pending"
                ? "The e-mail to the owner has not gone out yet (or did not finish)."
                : notification.state === "missing"
                  ? "No e-mail was attempted for this order."
                  : (notification.error ?? "The e-mail could not be sent.")}{" "}
              The order itself was placed normally.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:items-start">
        <div className="space-y-6">
          <Panel title="Customer" id="customer">
            <dl className="space-y-2 text-body-md">
              <div>
                <dt className="sr-only">Name</dt>
                <dd className="text-headline-sm break-words" data-testid="customer-name">
                  {order.customer_name}
                  {order.company_name && <span className="block text-body-md font-normal text-muted-foreground">{order.company_name}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-label-md text-muted-foreground">Phone</dt>
                <dd className="tabular" data-testid="customer-phone">
                  {order.customer_phone}
                </dd>
              </div>
              {order.customer_email && (
                <div>
                  <dt className="text-label-md text-muted-foreground">Email</dt>
                  <dd className="break-all">{order.customer_email}</dd>
                </div>
              )}
              <div>
                <dt className="text-label-md text-muted-foreground">Orders from this number</dt>
                <dd>{order.customer_orders_count}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild className="h-11">
                <a href={telHref(order.customer_phone)} data-testid="call-customer">
                  <Phone className="size-4" aria-hidden="true" />
                  Call
                </a>
              </Button>
              <Button asChild className="h-11 bg-whatsapp hover:bg-whatsapp-hover">
                <a href={whatsappHrefForPkMobile(order.customer_phone, greeting)} target="_blank" rel="noopener noreferrer" data-testid="whatsapp-customer">
                  <MessageCircle className="size-4" aria-hidden="true" />
                  WhatsApp
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
            </div>
            {order.customer_notes && (
              <div className="mt-4 rounded-lg bg-surface-low p-3">
                <p className="text-label-md text-muted-foreground">Customer&apos;s note</p>
                <p className="text-body-md break-words whitespace-pre-line">{order.customer_notes}</p>
              </div>
            )}
          </Panel>

          <Panel title="Delivery address" description="Copied when the order was placed. Later changes to the customer's saved addresses do not change it.">
            <address className="text-body-md not-italic break-words" data-testid="order-address">
              {[a.line1, a.street, a.area].filter(Boolean).join(", ")}
              <br />
              {a.city}, {a.province}
              {a.postal_code ? ` ${a.postal_code}` : ""}
              {a.instructions && <span className="mt-1 block text-muted-foreground">{a.instructions}</span>}
            </address>
            <p className="mt-2 text-body-md text-muted-foreground">Delivery method: {order.delivery_method_name}</p>
          </Panel>

          <Panel title="Items">
            <OrderLines items={order.items} />
            <OrderTotals
              className="mt-2 border-t border-border pt-3"
              subtotal_paisa={order.subtotal_paisa}
              discount_paisa={order.discount_paisa}
              shipping_paisa={order.shipping_paisa}
              shipping_confirmed={order.shipping_confirmed}
              total_paisa={order.total_paisa}
            />
          </Panel>

          <Panel title="History" description="Status changes are visible to the customer; the activity log below is for staff only.">
            <ol className="space-y-2 text-body-md" data-testid="order-history">
              {order.audit.length === 0 && <li className="text-muted-foreground">Nothing recorded yet.</li>}
              {order.audit.map((e) => (
                <li key={e.id} className="border-b border-border pb-2 last:border-0">
                  <span className="block">{describeAudit(e.action, e.details)}</span>
                  <span className="block text-body-sm text-muted-foreground">
                    {e.actor_name} · {formatDateTime(e.created_at)}
                  </span>
                </li>
              ))}
              <li className="text-body-sm text-muted-foreground">
                Order placed {formatDateTime(order.created_at)}
              </li>
            </ol>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Status" id="status">
            <StatusPanel orderId={order.id} status={order.status} paymentBlocked={order.payment_method !== "cod" && order.payment_status !== "paid"} />
          </Panel>

          <Panel title="Delivery charge" id="delivery-charge-panel">
            <DeliveryChargePanel
              orderId={order.id}
              subtotalPaisa={order.subtotal_paisa}
              discountPaisa={order.discount_paisa}
              shippingPaisa={order.shipping_paisa}
              confirmed={order.shipping_confirmed}
              lockedReason={lockedReason}
            />
          </Panel>

          <Panel title="Courier and tracking" id="courier-panel">
            <ShipmentPanel
              orderId={order.id}
              couriers={order.couriers}
              courier={shipment?.courier ?? ""}
              tracking={shipment?.tracking_number ?? ""}
              closed={order.status === "cancelled"}
            />
          </Panel>

          <Panel title="Payment" id="payment-panel">
            <p className="mb-3 flex flex-wrap items-center gap-2 text-body-md">
              {PAYMENT_METHOD_LABEL[order.payment_method]}
              <PaymentStatusBadge status={order.payment_status} />
            </p>
            {order.payment_method === "cod" ? (
              <CodPanel
                orderId={order.id}
                amountLabel={order.shipping_confirmed ? formatPKRExact(order.total_paisa) : `${formatPKRExact(order.total_paisa)} + delivery charge`}
                canCollect={codCollectable}
                hint={
                  order.payment_status === "paid"
                    ? "The cash has been collected."
                    : codCollectable
                      ? "Press the button when the courier or driver has handed over the cash."
                      : "You can mark the cash as collected once the order is dispatched."
                }
              />
            ) : (
              <p className="text-body-md text-muted-foreground">This order is not cash on delivery. It must be marked paid before it can be dispatched.</p>
            )}
          </Panel>

          <Panel title="Internal notes" id="notes-panel" description="Staff only. Customers never see these.">
            <ul className="mb-4 space-y-3" data-testid="internal-notes">
              {order.notes.length === 0 && <li className="text-body-md text-muted-foreground">No notes yet.</li>}
              {order.notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-surface-low p-3">
                  <p className="text-body-md break-words whitespace-pre-line">{n.note}</p>
                  <p className="mt-1 text-body-sm text-muted-foreground">
                    {n.author_name ?? "Staff"} · {formatDateTime(n.created_at)}
                  </p>
                </li>
              ))}
            </ul>
            <NoteForm orderId={order.id} />
          </Panel>
        </div>
      </div>
    </>
  );
}
