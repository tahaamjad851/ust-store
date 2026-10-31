// One readable line for an audit-log entry on an order, for the staff history. Only the facts the database function
// recorded (it never stores a note's text or a cost); anything unknown is shown as its plain action name.
import { formatPKRExact } from "@/lib/pricing/money";
import { isOrderStatus, STATUS_LABEL } from "./status";

const label = (v: unknown) => (isOrderStatus(v) ? STATUS_LABEL[v] : String(v ?? ""));
const money = (v: unknown) => (typeof v === "number" ? formatPKRExact(v) : "");

export function describeAudit(action: string, details: Record<string, unknown>): string {
  switch (action) {
    case "order.status":
      return `Status ${label(details.from)} → ${label(details.to)}${details.note ? `. Note: ${String(details.note)}` : ""}`;
    case "order.delivery_charge":
      return `Delivery charge ${money(details.from_paisa)} → ${money(details.to_paisa)} (order total ${money(details.total_paisa)})`;
    case "order.shipment":
      return `Courier ${String(details.courier ?? "")}${details.tracking_number ? `, tracking ${String(details.tracking_number)}` : ""}`;
    case "order.note":
      return "Internal note added";
    case "order.payment_status":
      return `Payment marked ${String(details.to ?? "").replace(/_/g, " ")}`;
    default:
      return action;
  }
}
