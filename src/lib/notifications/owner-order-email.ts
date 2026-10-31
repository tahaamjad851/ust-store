// The e-mail the owner gets for every new order, and the call to Resend that sends it. Pure rendering plus one
// `fetch`: no SDK. Every value that came from a customer is HTML-escaped. The API key is read by the caller from a
// server-only environment variable and is never put in a message, a log line or an error.
import { formatPKR } from "@/lib/pricing";

export type OwnerOrderEmail = {
  order_id: string;
  order_number: string;
  placed_at: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  company_name: string | null;
  address: { line1: string; area?: string | null; city: string; province: string; instructions?: string | null };
  delivery_method: string;
  payment_label: string;
  customer_notes: string | null;
  subtotal_paisa: number;
  items: { product_name: string; variant_name: string; sku: string; quantity: number; unit_price_paisa: number; line_total_paisa: number }[];
};

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** A subject line cannot carry a line break (header injection) whatever the customer typed. */
const oneLine = (value: string) => value.replace(/[\r\n\p{Zl}\p{Zp}]+/gu, " ").trim();

export function renderOwnerOrderEmail(order: OwnerOrderEmail, adminUrl: string, businessName: string) {
  const subject = oneLine(`New order ${order.order_number} from ${order.customer_name} (${formatPKR(order.subtotal_paisa)})`).slice(0, 200);
  const addressLines = [order.address.line1, order.address.area, `${order.address.city}, ${order.address.province}`, order.address.instructions]
    .filter((x): x is string => !!x);

  const rows = order.items
    .map(
      (i) =>
        `<tr><td style="padding:4px 8px 4px 0">${escapeHtml(i.product_name)}${i.variant_name ? `, ${escapeHtml(i.variant_name)}` : ""}<br><span style="color:#666">${escapeHtml(i.sku)}</span></td>` +
        `<td style="padding:4px 8px;text-align:right">${i.quantity}</td><td style="padding:4px 0 4px 8px;text-align:right">${escapeHtml(formatPKR(i.line_total_paisa))}</td></tr>`,
    )
    .join("");

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111;max-width:560px">` +
    `<h2 style="margin:0 0 8px">New order ${escapeHtml(order.order_number)}</h2>` +
    `<p style="margin:0 0 16px;color:#555">${escapeHtml(businessName)} · ${escapeHtml(order.placed_at)}</p>` +
    `<p style="margin:0 0 4px"><strong>${escapeHtml(order.customer_name)}</strong>${order.company_name ? ` (${escapeHtml(order.company_name)})` : ""}</p>` +
    `<p style="margin:0 0 4px">Phone: ${escapeHtml(order.customer_phone)}${order.customer_email ? ` · ${escapeHtml(order.customer_email)}` : ""}</p>` +
    `<p style="margin:0 0 16px">${addressLines.map(escapeHtml).join("<br>")}</p>` +
    `<table style="width:100%;border-collapse:collapse;margin-bottom:12px"><thead><tr><th style="text-align:left;border-bottom:1px solid #ddd;padding:4px 8px 4px 0">Item</th>` +
    `<th style="text-align:right;border-bottom:1px solid #ddd;padding:4px 8px">Qty</th><th style="text-align:right;border-bottom:1px solid #ddd;padding:4px 0 4px 8px">Total</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<p style="margin:0 0 4px">Items total: <strong>${escapeHtml(formatPKR(order.subtotal_paisa))}</strong></p>` +
    `<p style="margin:0 0 4px">Delivery (${escapeHtml(order.delivery_method)}): charge to be confirmed by phone</p>` +
    `<p style="margin:0 0 16px">Payment: ${escapeHtml(order.payment_label)}</p>` +
    (order.customer_notes ? `<p style="margin:0 0 16px;padding:8px;background:#f5f5f5">Customer note: ${escapeHtml(order.customer_notes).replace(/\n/g, "<br>")}</p>` : "") +
    `<p style="margin:0"><a href="${escapeHtml(adminUrl)}">Open the order in the admin</a></p></div>`;

  const text = [
    `New order ${order.order_number}`,
    `${businessName} · ${order.placed_at}`,
    "",
    `${order.customer_name}${order.company_name ? ` (${order.company_name})` : ""}`,
    `Phone: ${order.customer_phone}${order.customer_email ? ` · ${order.customer_email}` : ""}`,
    ...addressLines,
    "",
    ...order.items.map((i) => `${i.quantity} x ${i.product_name}${i.variant_name ? `, ${i.variant_name}` : ""} (${i.sku}) ${formatPKR(i.line_total_paisa)}`),
    "",
    `Items total: ${formatPKR(order.subtotal_paisa)}`,
    `Delivery (${order.delivery_method}): charge to be confirmed by phone`,
    `Payment: ${order.payment_label}`,
    order.customer_notes ? `Customer note: ${order.customer_notes}` : "",
    "",
    `Open the order: ${adminUrl}`,
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");

  return { subject, html, text };
}

export type SendResult = { ok: true } | { ok: false; error: string };

type SendOptions = { apiKey: string; from: string; to: string[]; subject: string; html: string; text: string; fetchImpl?: typeof fetch };

/** One message through Resend's HTTP API. Returns a short, key-free reason on failure; never throws. */
export async function sendWithResend({ apiKey, from, to, subject, html, text, fetchImpl = fetch }: SendOptions): Promise<SendResult> {
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    let reason = "";
    try {
      const body = (await res.json()) as { message?: unknown };
      if (typeof body.message === "string") reason = body.message;
    } catch {
      // The body was not JSON; the status is enough.
    }
    return { ok: false, error: `Resend answered ${res.status}${reason ? `: ${reason}` : ""}`.replaceAll(apiKey, "[key]").slice(0, 300) };
  } catch (e) {
    const name = e instanceof Error ? e.name : "Error";
    return { ok: false, error: `Could not reach Resend (${name})` };
  }
}
