// Shapes shared by the order pages, queries and components. No server-only imports here.
import type { HistoryEntry, OrderStatus } from "./status";

export type PaymentMethodValue = "cod" | "bank_transfer" | "online";
export type PaymentStatusValue = "unpaid" | "pending_verification" | "paid" | "failed" | "refunded";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethodValue, string> = {
  cod: "Cash on delivery",
  bank_transfer: "Bank transfer",
  online: "EasyPaisa / online",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatusValue, string> = {
  unpaid: "Not paid yet",
  pending_verification: "Waiting for verification",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded",
};

export type OrderLine = {
  product_name: string;
  variant_name: string;
  sku: string;
  quantity: number;
  unit_price_paisa: number;
  line_total_paisa: number;
};

export type ShipmentInfo = {
  courier: string;
  tracking_number: string | null;
  tracking_url: string | null;
  dispatched_at: string | null;
  estimated_delivery: string | null;
  delivery_notes: string | null;
};

/** What the tracking link shows. get_order_by_tracking_token() returns exactly this and nothing more. */
export type TrackingSummary = {
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatusValue;
  payment_method: PaymentMethodValue;
  placed_at: string;
  delivery_method: string;
  city: string | null;
  subtotal_paisa: number;
  discount_paisa: number;
  shipping_paisa: number;
  shipping_confirmed: boolean;
  total_paisa: number;
  items: OrderLine[];
  shipments: ShipmentInfo[];
  history: HistoryEntry[];
};

export type AddressSnapshot = {
  line1: string;
  street?: string | null;
  area?: string | null;
  city: string;
  province: string;
  postal_code?: string | null;
  instructions?: string | null;
};

/** A row of the customer's order history, or of the admin list. */
export type OrderListRow = {
  id: string;
  order_number: string;
  created_at: string;
  status: OrderStatus;
  payment_method: PaymentMethodValue;
  payment_status: PaymentStatusValue;
  total_paisa: number;
  shipping_confirmed: boolean;
};

export type AdminOrderListRow = OrderListRow & { customer_name: string; customer_phone: string; city: string | null; total_count: number };

/** A whole order for its owner or for staff. No cost, no hash, no staff identity column. */
export type OrderDetail = OrderListRow & {
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  company_name: string | null;
  shipping_address: AddressSnapshot;
  delivery_method_name: string;
  subtotal_paisa: number;
  discount_paisa: number;
  shipping_paisa: number;
  customer_notes: string | null;
  cancel_reason: string | null;
  user_id: string | null;
  items: OrderLine[];
  shipments: (ShipmentInfo & { id: string })[];
  history: { id: number; from_status: OrderStatus | null; to_status: OrderStatus; note: string | null; created_at: string }[];
};

export type OwnerNotificationState = { state: "sent" | "failed" | "pending" | "missing"; error: string | null; at: string | null };

export type AdminOrderDetail = OrderDetail & {
  notes: { id: string; note: string; author_name: string | null; created_at: string }[];
  audit: { id: number; action: string; actor_name: string | null; details: Record<string, unknown>; created_at: string }[];
  owner_notification: OwnerNotificationState;
  couriers: string[];
  customer_orders_count: number;
};
