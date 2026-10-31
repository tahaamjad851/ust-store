// Tells the owner about a new order by e-mail. Runs after the order is placed and can never undo or delay it: every
// failure is caught, logged (without secrets), and written to the `notifications` outbox, where the admin order page
// reads it ("owner notification not sent"). One row per order (unique index), so a retry cannot send twice.
//
//   RESEND_API_KEY       server only, never NEXT_PUBLIC_
//   RESEND_FROM_EMAIL    "Name <address@your-verified-domain>"; falls back to Resend's test sender, which only
//                        delivers to the Resend account owner's own address (fine for testing, not for launch)
//   recipients           store_private_settings.order_notification_emails (Admin > Settings), never hardcoded
import "server-only";

import { renderOwnerOrderEmail, sendWithResend, type OwnerOrderEmail } from "@/lib/notifications/owner-order-email";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

const TEMPLATE = "owner_new_order";
const FALLBACK_FROM = "Orders <onboarding@resend.dev>";
const PAYMENT_LABEL: Record<string, string> = { cod: "Cash on delivery", bank_transfer: "Bank transfer", online: "Online payment" };

type OrderRow = {
  id: string;
  order_number: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  company_name: string | null;
  shipping_address: OwnerOrderEmail["address"];
  delivery_method_name: string;
  payment_method: string;
  customer_notes: string | null;
  subtotal_paisa: number;
};

export type NotifyOutcome = "sent" | "failed" | "skipped";

export async function notifyOwnerOfNewOrder(orderId: string): Promise<NotifyOutcome> {
  try {
    const db = createAdminClient();
    const [order, items, privateSettings, settings] = await Promise.all([
      db
        .from("orders")
        .select("id,order_number,created_at,customer_name,customer_phone,customer_email,company_name,shipping_address,delivery_method_name,payment_method,customer_notes,subtotal_paisa")
        .eq("id", orderId)
        .single<OrderRow>(),
      db.from("order_items").select("product_name,variant_name,sku,quantity,unit_price_paisa,line_total_paisa").eq("order_id", orderId).order("created_at").order("sku"),
      db.from("store_private_settings").select("order_notification_emails").eq("id", true).single<{ order_notification_emails: string[] }>(),
      db.from("store_settings").select("business_name").eq("id", true).single<{ business_name: string }>(),
    ]);
    if (order.error || !order.data || items.error) {
      console.error("owner notification: could not read the order", order.error?.code ?? items.error?.code);
      return "failed";
    }
    const recipients = privateSettings.data?.order_notification_emails ?? [];

    // The outbox row first: it is the record that this order has been handled, and its unique index stops a second send.
    const claimed = await db
      .from("notifications")
      .insert({ channel: "email", recipient: (recipients.join(", ") || "(none set)").slice(0, 254), template: TEMPLATE, order_id: orderId, status: "pending" })
      .select("id")
      .single<{ id: string }>();
    if (claimed.error) {
      if (claimed.error.code === "23505") return "skipped";
      console.error("owner notification: outbox insert failed", claimed.error.code);
      return "failed";
    }
    const finish = async (status: "sent" | "failed", lastError: string | null) => {
      const update = await db
        .from("notifications")
        .update({ status, attempts: 1, last_error: lastError, sent_at: status === "sent" ? new Date().toISOString() : null })
        .eq("id", claimed.data.id);
      if (update.error) console.error("owner notification: could not update the outbox", update.error.code);
      return status;
    };

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (recipients.length === 0) return await finish("failed", "No owner email address is set in Admin > Settings.");
    if (!apiKey) return await finish("failed", "RESEND_API_KEY is not set on the server.");

    const email = renderOwnerOrderEmail(
      {
        order_id: order.data.id,
        order_number: order.data.order_number,
        placed_at: new Date(order.data.created_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" }),
        customer_name: order.data.customer_name,
        customer_phone: order.data.customer_phone,
        customer_email: order.data.customer_email,
        company_name: order.data.company_name,
        address: order.data.shipping_address,
        delivery_method: order.data.delivery_method_name,
        payment_label: PAYMENT_LABEL[order.data.payment_method] ?? order.data.payment_method,
        customer_notes: order.data.customer_notes,
        subtotal_paisa: Number(order.data.subtotal_paisa),
        items: (items.data ?? []).map((i) => ({ ...i, unit_price_paisa: Number(i.unit_price_paisa), line_total_paisa: Number(i.line_total_paisa) })),
      },
      `${getSiteUrl()}/admin/orders/${order.data.id}`,
      settings.data?.business_name ?? "Umar Siddique Traders",
    );
    const sent = await sendWithResend({ apiKey, from: process.env.RESEND_FROM_EMAIL?.trim() || FALLBACK_FROM, to: recipients, ...email });
    if (!sent.ok) console.error("owner notification: send failed:", sent.error);
    return await finish(sent.ok ? "sent" : "failed", sent.ok ? null : sent.error);
  } catch (e) {
    console.error("owner notification: unexpected failure", e instanceof Error ? e.message : e);
    return "failed";
  }
}
