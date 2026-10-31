// The order workflow, as the shop owner sees it. The database is the authority (_order_transition_allowed()
// in supabase/migrations/20261102100000_orders.sql refuses anything else); this table only decides which buttons
// to show, and a unit test keeps it in step with the SQL.
//
//   New > Contacted > Confirmed > Dispatched > Delivered        Cancelled (before delivery)
//   New > Confirmed                                              Delivered > Exchange requested > Delivered
//
// "New" is the database status `pending`. `processing`, `shipped` and `returned` are retired: they stay in the
// enum, nothing leads into them, and an old order in one of them is shown with its own name.

export const WORKFLOW_STATUSES = ["pending", "contacted", "confirmed", "dispatched", "delivered", "cancelled", "exchange_requested"] as const;
export const RETIRED_STATUSES = ["processing", "shipped", "returned"] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
export type OrderStatus = WorkflowStatus | (typeof RETIRED_STATUSES)[number];

export const ORDER_STATUS_VALUES: readonly OrderStatus[] = [...WORKFLOW_STATUSES, ...RETIRED_STATUSES];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUS_VALUES as readonly string[]).includes(value);
}

/** What the shop owner reads. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "New",
  contacted: "Contacted",
  confirmed: "Confirmed",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
  exchange_requested: "Exchange requested",
  processing: "Processing",
  shipped: "Shipped",
  returned: "Returned",
};

/** What the customer reads on their order and on the tracking page. */
export const CUSTOMER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Order received",
  contacted: "We have contacted you",
  confirmed: "Confirmed",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
  exchange_requested: "Exchange requested",
  processing: "Being prepared",
  shipped: "Dispatched",
  returned: "Returned",
};

/** Mirror of _order_transition_allowed(). */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["contacted", "confirmed", "cancelled"],
  contacted: ["confirmed", "cancelled"],
  confirmed: ["dispatched", "cancelled"],
  dispatched: ["delivered", "cancelled"],
  delivered: ["exchange_requested"],
  exchange_requested: ["delivered"],
  cancelled: [],
  // Retired statuses can still be left, but nothing leads into them.
  processing: ["dispatched", "cancelled"],
  shipped: ["delivered"],
  returned: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The statuses staff may move an order to next, in the order the buttons are shown. */
export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

/** An order that is finished for stock and money purposes (no more edits to the delivery charge). */
export function isClosed(status: OrderStatus): boolean {
  return status === "delivered" || status === "cancelled" || status === "exchange_requested" || status === "returned";
}

/** Open orders hold reserved stock and count against the customer's open-order limit. */
export function isOpen(status: OrderStatus): boolean {
  return status === "pending" || status === "contacted" || status === "confirmed" || status === "dispatched" || status === "processing" || status === "shipped";
}

export type StatusTone = "new" | "progress" | "done" | "cancelled" | "attention";

export const STATUS_TONE: Record<OrderStatus, StatusTone> = {
  pending: "new",
  contacted: "progress",
  confirmed: "progress",
  dispatched: "progress",
  delivered: "done",
  cancelled: "cancelled",
  exchange_requested: "attention",
  processing: "progress",
  shipped: "progress",
  returned: "attention",
};

// --- the timeline on the tracking page and the customer's order ------------------------------------------------

export type HistoryEntry = { status: OrderStatus; at: string };

export type TimelineStep = {
  status: OrderStatus;
  label: string;
  state: "done" | "current" | "upcoming" | "stopped";
  at: string | null;
};

const RETIRED_POSITION: Partial<Record<OrderStatus, OrderStatus>> = { processing: "confirmed", shipped: "dispatched" };

/**
 * The steps to show for an order: where it has been (with the time) and where it goes next. A cancelled order shows
 * what happened and stops. "Contacted" is shown only if it happened (it is optional). Entries the database did not
 * report are ignored, never invented.
 */
export function buildTimeline(status: OrderStatus, history: readonly HistoryEntry[]): TimelineStep[] {
  const firstAt = (s: OrderStatus) => history.find((h) => h.status === s)?.at ?? null;
  const step = (s: OrderStatus, state: TimelineStep["state"]): TimelineStep => ({ status: s, label: CUSTOMER_STATUS_LABEL[s], state, at: firstAt(s) });

  if (status === "cancelled") {
    const reached = ORDER_PATH.filter((s) => history.some((h) => h.status === s));
    return [...reached.map((s) => step(s, "done")), step("cancelled", "stopped")];
  }

  const hadContact = history.some((h) => h.status === "contacted") || status === "contacted";
  const path: OrderStatus[] = ORDER_PATH.filter((s) => s !== "contacted" || hadContact);
  const position = RETIRED_POSITION[status] ?? (status === "exchange_requested" || status === "returned" ? "delivered" : status);
  const index = Math.max(0, path.indexOf(position));
  const steps = path.map<TimelineStep>((s, i) => step(s, i < index ? "done" : i === index ? (s === "delivered" ? "done" : "current") : "upcoming"));
  if (status === "exchange_requested" || status === "returned") steps.push(step(status, "current"));
  return steps;
}

const ORDER_PATH: readonly OrderStatus[] = ["pending", "contacted", "confirmed", "dispatched", "delivered"];
