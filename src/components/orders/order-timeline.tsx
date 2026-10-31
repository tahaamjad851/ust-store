import { Check, Circle, X } from "lucide-react";
import { buildTimeline, type HistoryEntry, type OrderStatus } from "@/features/orders/status";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

/** Where the order is: what has happened (with the time) and what comes next. State is text as well as colour and icon. */
export function OrderTimeline({ status, history }: { status: OrderStatus; history: readonly HistoryEntry[] }) {
  const steps = buildTimeline(status, history);
  return (
    <ol aria-label="Order progress" className="space-y-0" data-testid="order-timeline">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const Icon = step.state === "done" ? Check : step.state === "stopped" ? X : Circle;
        return (
          <li key={step.status} className="relative flex gap-3 pb-5 last:pb-0" aria-current={step.state === "current" ? "step" : undefined}>
            {!last && <span className={cn("absolute top-7 bottom-0 left-[13px] w-0.5", step.state === "done" ? "bg-primary" : "bg-border")} aria-hidden="true" />}
            <span
              className={cn(
                "relative flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                step.state === "done" && "border-primary bg-primary text-primary-foreground",
                step.state === "current" && "border-primary bg-card text-primary",
                step.state === "upcoming" && "border-border bg-card text-muted-foreground",
                step.state === "stopped" && "border-destructive bg-destructive text-white",
              )}
              aria-hidden="true"
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn("text-label-lg", step.state === "upcoming" && "text-muted-foreground")}>
                {step.label}
                <span className="sr-only">
                  {step.state === "done" ? " (done)" : step.state === "current" ? " (current step)" : step.state === "stopped" ? " (stopped)" : " (not yet)"}
                </span>
              </p>
              {step.at && <p className="text-body-sm text-muted-foreground">{formatDateTime(step.at)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
