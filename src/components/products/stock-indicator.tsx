import { STOCK_LABEL } from "@/features/inventory/stock";
import { cn } from "@/lib/utils";
import type { StockStatus } from "@/types/catalog";

const DOT = {
  in_stock: "bg-primary",
  low_stock: "bg-warning",
  out_of_stock: "bg-destructive",
} as const;

export function StockIndicator({ status, className }: { status: StockStatus; className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-label-md", className)}>
      <span className={cn("size-2 rounded-full", DOT[status])} aria-hidden="true" />
      {STOCK_LABEL[status]}
    </p>
  );
}
