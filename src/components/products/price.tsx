import { discount, formatPKR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/catalog";

export function Price({
  product,
  size = "md",
  className,
}: {
  product: Pick<Product, "retail_price_paisa" | "compare_at_price_paisa">;
  size?: "md" | "lg";
  className?: string;
}) {
  const saving = discount(product);
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2 tabular", className)}>
      <span className={size === "lg" ? "text-price-lg" : "text-price-md"}>
        <span className="sr-only">Price: </span>
        {formatPKR(product.retail_price_paisa)}
      </span>
      {saving && product.compare_at_price_paisa !== null && (
        <s className="text-body-sm text-muted-foreground">
          <span className="sr-only">Was </span>
          {formatPKR(product.compare_at_price_paisa)}
        </s>
      )}
    </p>
  );
}
