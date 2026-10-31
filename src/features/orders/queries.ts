// Reads for the order pages. Each one says which door it uses:
//   tracking link       service role, one narrow database function that returns only the customer-safe summary
//   customer's orders   the signed-in customer's own session (row-level security) AND an explicit owner filter
//   admin               the signed-in staff member's session (row-level security + is_admin() inside the functions)
// Columns are always listed: no `select *`, so a column added later (a hash, a note) cannot reach a page unnoticed.
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOrderStatus, type OrderStatus } from "./status";
import { isTrackingToken } from "./tracking-token";
import type {
  AdminOrderDetail,
  AdminOrderListRow,
  OrderDetail,
  OrderListRow,
  OwnerNotificationState,
  TrackingSummary,
} from "./types";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isOrderId = (value: unknown): value is string => typeof value === "string" && GUID.test(value);

const LIST_COLUMNS = "id,order_number,created_at,status,payment_method,payment_status,total_paisa,shipping_confirmed";
const DETAIL_COLUMNS =
  `${LIST_COLUMNS},customer_name,customer_phone,customer_email,company_name,shipping_address,delivery_method_name,subtotal_paisa,discount_paisa,shipping_paisa,customer_notes,cancel_reason,user_id`;
// No created_by: staff identity columns are not readable by API roles.
const SHIPMENT_COLUMNS = "id,courier,tracking_number,tracking_url,dispatched_at,estimated_delivery,delivery_notes";
const ITEM_COLUMNS = "product_name,variant_name,sku,quantity,unit_price_paisa,line_total_paisa";
// No actor_id for the same reason.
const HISTORY_COLUMNS = "id,from_status,to_status,note,created_at";

function fail(what: string, error: { code?: string; message?: string } | null): never {
  // The code and the table, never the row text.
  console.error(`orders: ${what} failed`, error?.code ?? "");
  throw new Error(`Could not load ${what}.`);
}

const num = (v: unknown) => Number(v);
const statusOf = (v: unknown): OrderStatus => (isOrderStatus(v) ? v : "pending");

// --- tracking link --------------------------------------------------------------------------------------------------

export async function getTrackingSummary(token: string): Promise<TrackingSummary | null> {
  if (!isTrackingToken(token)) return null;
  const { data, error } = await createAdminClient().rpc("get_order_by_tracking_token", { p_token: token });
  if (error) fail("the order", error);
  if (!data) return null;
  const t = data as TrackingSummary;
  return {
    ...t,
    status: statusOf(t.status),
    history: (t.history ?? []).map((h) => ({ status: statusOf(h.status), at: h.at })),
  };
}

// --- a signed-in customer's own orders ------------------------------------------------------------------------------

function listRow(r: Record<string, unknown>): OrderListRow {
  return {
    id: r.id as string,
    order_number: r.order_number as string,
    created_at: r.created_at as string,
    status: statusOf(r.status),
    payment_method: r.payment_method as OrderListRow["payment_method"],
    payment_status: r.payment_status as OrderListRow["payment_status"],
    total_paisa: num(r.total_paisa),
    shipping_confirmed: Boolean(r.shipping_confirmed),
  };
}

export async function listMyOrders(db: SupabaseClient, userId: string): Promise<OrderListRow[]> {
  const { data, error } = await db.from("orders").select(LIST_COLUMNS).eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
  if (error) fail("your orders", error);
  return (data ?? []).map((r) => listRow(r as Record<string, unknown>));
}

async function loadDetail(db: SupabaseClient, orderId: string, owner?: string): Promise<OrderDetail | null> {
  let query = db.from("orders").select(DETAIL_COLUMNS).eq("id", orderId);
  if (owner) query = query.eq("user_id", owner);
  const { data: order, error } = await query.maybeSingle();
  if (error) fail("the order", error);
  if (!order) return null;
  const [items, shipments, history] = await Promise.all([
    db.from("order_items").select(ITEM_COLUMNS).eq("order_id", orderId).order("created_at").order("sku"),
    db.from("shipments").select(SHIPMENT_COLUMNS).eq("order_id", orderId).order("created_at"),
    db.from("order_status_history").select(HISTORY_COLUMNS).eq("order_id", orderId).order("id"),
  ]);
  if (items.error) fail("the order lines", items.error);
  if (shipments.error) fail("the shipments", shipments.error);
  if (history.error) fail("the order history", history.error);
  const o = order as unknown as Record<string, unknown>;
  return {
    ...listRow(o),
    customer_name: o.customer_name as string,
    customer_phone: o.customer_phone as string,
    customer_email: (o.customer_email as string | null) ?? null,
    company_name: (o.company_name as string | null) ?? null,
    shipping_address: o.shipping_address as OrderDetail["shipping_address"],
    delivery_method_name: o.delivery_method_name as string,
    subtotal_paisa: num(o.subtotal_paisa),
    discount_paisa: num(o.discount_paisa),
    shipping_paisa: num(o.shipping_paisa),
    customer_notes: (o.customer_notes as string | null) ?? null,
    cancel_reason: (o.cancel_reason as string | null) ?? null,
    user_id: (o.user_id as string | null) ?? null,
    items: (items.data ?? []).map((i) => ({ ...(i as object), unit_price_paisa: num(i.unit_price_paisa), line_total_paisa: num(i.line_total_paisa), quantity: num(i.quantity) })) as OrderDetail["items"],
    shipments: (shipments.data ?? []) as OrderDetail["shipments"],
    history: (history.data ?? []).map((h) => ({ ...h, from_status: h.from_status ? statusOf(h.from_status) : null, to_status: statusOf(h.to_status) })) as OrderDetail["history"],
  };
}

/** One of the customer's own orders. Another customer's id gives null, from row-level security and from the owner filter. */
export async function getMyOrder(db: SupabaseClient, userId: string, orderId: string): Promise<OrderDetail | null> {
  if (!isOrderId(orderId)) return null;
  return loadDetail(db, orderId, userId);
}

// --- admin ----------------------------------------------------------------------------------------------------------

export type AdminOrderFilters = { q: string; status: OrderStatus | ""; from: string; to: string; page: number };
export const ADMIN_PAGE_SIZE = 25;

export async function searchAdminOrders(db: SupabaseClient, f: AdminOrderFilters): Promise<{ rows: AdminOrderListRow[]; total: number }> {
  const { data, error } = await db.rpc("search_orders", {
    p_query: f.q || null,
    p_status: f.status || null,
    p_from: f.from || null,
    p_to: f.to || null,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: (Math.max(1, f.page) - 1) * ADMIN_PAGE_SIZE,
  });
  if (error) fail("the orders", error);
  const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...listRow(r),
    customer_name: r.customer_name as string,
    customer_phone: r.customer_phone as string,
    city: (r.city as string | null) ?? null,
    total_count: num(r.total_count),
  }));
  return { rows, total: rows[0]?.total_count ?? 0 };
}

async function namesOf(db: SupabaseClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const { data } = await db.from("profiles").select("id,full_name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id as string, (p.full_name as string) || "Staff"]));
}

function ownerNotification(rows: { status: string; last_error: string | null; sent_at: string | null; created_at: string }[]): OwnerNotificationState {
  const row = rows[0];
  if (!row) return { state: "missing", error: null, at: null };
  if (row.status === "sent") return { state: "sent", error: null, at: row.sent_at };
  return { state: row.status === "failed" ? "failed" : "pending", error: row.last_error, at: row.created_at };
}

export async function getAdminOrder(db: SupabaseClient, orderId: string): Promise<AdminOrderDetail | null> {
  if (!isOrderId(orderId)) return null;
  const base = await loadDetail(db, orderId);
  if (!base) return null;
  const [notes, audit, notification, couriers, count] = await Promise.all([
    db.from("internal_notes").select("id,note,author_id,created_at").eq("entity_type", "order").eq("entity_id", orderId).order("created_at", { ascending: false }),
    db.from("audit_log").select("id,action,actor_id,details,created_at").eq("entity_type", "orders").eq("entity_id", orderId).order("id", { ascending: false }).limit(50),
    db.from("notifications").select("status,last_error,sent_at,created_at").eq("order_id", orderId).eq("template", "owner_new_order").order("created_at", { ascending: false }).limit(1),
    db.from("couriers").select("name").eq("is_active", true).order("sort_order").order("name"),
    db.from("orders").select("id", { count: "exact", head: true }).eq("customer_phone", base.customer_phone),
  ]);
  for (const [what, res] of [["notes", notes], ["history", audit], ["notification status", notification], ["couriers", couriers]] as const) {
    if (res.error) fail(what, res.error);
  }
  const names = await namesOf(db, [...(notes.data ?? []).map((n) => n.author_id as string | null), ...(audit.data ?? []).map((a) => a.actor_id as string | null)]);
  return {
    ...base,
    notes: (notes.data ?? []).map((n) => ({ id: n.id, note: n.note, author_name: n.author_id ? (names.get(n.author_id) ?? "Staff") : null, created_at: n.created_at })),
    audit: (audit.data ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      actor_name: a.actor_id ? (names.get(a.actor_id) ?? "Staff") : "System",
      details: (a.details ?? {}) as Record<string, unknown>,
      created_at: a.created_at,
    })),
    owner_notification: ownerNotification((notification.data ?? []) as { status: string; last_error: string | null; sent_at: string | null; created_at: string }[]),
    couriers: (couriers.data ?? []).map((c) => c.name as string),
    customer_orders_count: count.count ?? 1,
  };
}
