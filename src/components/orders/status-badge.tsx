import { Badge } from "@/components/ui/badge";
import { CUSTOMER_STATUS_LABEL, STATUS_LABEL, STATUS_TONE, type OrderStatus, type StatusTone } from "@/features/orders/status";
import { PAYMENT_STATUS_LABEL, type PaymentStatusValue } from "@/features/orders/types";
import { cn } from "@/lib/utils";

const TONE: Record<StatusTone, string> = {
  new: "border-transparent bg-warning-container text-warning-foreground",
  progress: "border-transparent bg-brand-tint text-brand-tint-foreground",
  done: "border-transparent bg-primary text-primary-foreground",
  cancelled: "border-transparent bg-destructive/10 text-destructive",
  attention: "border-transparent bg-warning-container text-warning-foreground",
};

/** The status as a label, never as colour alone. `audience` picks the owner's words ("New") or the customer's ("Order received"). */
export function OrderStatusBadge({ status, audience = "staff", className }: { status: OrderStatus; audience?: "staff" | "customer"; className?: string }) {
  const label = audience === "customer" ? CUSTOMER_STATUS_LABEL[status] : STATUS_LABEL[status];
  return (
    <Badge className={cn("font-medium", TONE[STATUS_TONE[status]], className)} data-testid="order-status">
      {label}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatusValue }) {
  const tone = status === "paid" ? TONE.done : status === "failed" ? TONE.cancelled : status === "unpaid" ? "border-border bg-surface-low text-muted-foreground" : TONE.attention;
  return <Badge className={cn("font-medium", tone)}>{PAYMENT_STATUS_LABEL[status]}</Badge>;
}
