import { STOCK_LABEL, stockStatus } from "@/features/inventory/stock";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/catalog";

const DOT = {
  in_stock: "bg-primary",
  low_stock: "bg-warning",
  out_of_stock: "bg-destructive",
} as const;

export function StockIndicator({
  product,
  className,
}: {
  product: Pick<Product, "stock_qty" | "low_stock_threshold">;
  className?: string;
}) {
  const status = stockStatus(product);
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-label-md", className)}>
      <span className={cn("size-2 rounded-full", DOT[status])} aria-hidden="true" />
      {STOCK_LABEL[status]}
    </p>
  );
}
