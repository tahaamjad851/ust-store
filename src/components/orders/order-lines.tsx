import type { OrderLine } from "@/features/orders/types";
import { formatPKRExact } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

/** The lines of an order: what was bought, at the price charged then. Plain markup, so it prints. */
export function OrderLines({ items, className }: { items: readonly OrderLine[]; className?: string }) {
  return (
    <ul className={cn("divide-y divide-border", className)} data-testid="order-lines">
      {items.map((i) => (
        <li key={`${i.sku}-${i.variant_name}`} className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-label-lg break-words">
              {i.product_name}
              {i.variant_name && `, ${i.variant_name}`}
            </p>
            <p className="text-body-sm text-muted-foreground">
              SKU {i.sku} · {formatPKRExact(i.unit_price_paisa)} × {i.quantity}
            </p>
          </div>
          <p className="shrink-0 text-label-lg tabular">{formatPKRExact(i.line_total_paisa)}</p>
        </li>
      ))}
    </ul>
  );
}

type TotalsProps = {
  subtotal_paisa: number;
  discount_paisa: number;
  shipping_paisa: number;
  shipping_confirmed: boolean;
  total_paisa: number;
  className?: string;
};

/**
 * Totals. Until staff have agreed the delivery charge by phone the delivery line says so, and the total is the items
 * total: nothing is shown as a charge that was never set.
 */
export function OrderTotals({ subtotal_paisa, discount_paisa, shipping_paisa, shipping_confirmed, total_paisa, className }: TotalsProps) {
  return (
    <dl className={cn("space-y-2 text-body-md", className)} data-testid="order-totals">
      <div className="flex justify-between gap-3">
        <dt>Items</dt>
        <dd className="tabular">{formatPKRExact(subtotal_paisa)}</dd>
      </div>
      {discount_paisa > 0 && (
        <div className="flex justify-between gap-3">
          <dt>Discount</dt>
          <dd className="tabular">−{formatPKRExact(discount_paisa)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-3">
        <dt>Delivery</dt>
        <dd className="text-right" data-testid="delivery-line">
          {shipping_confirmed ? <span className="tabular">{shipping_paisa === 0 ? "Free" : formatPKRExact(shipping_paisa)}</span> : "Delivery charge will be confirmed by phone"}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
        <dt className="text-headline-sm">{shipping_confirmed ? "Total" : "Total so far"}</dt>
        <dd className="text-price-lg text-primary tabular" data-testid="order-total">
          {formatPKRExact(total_paisa)}
        </dd>
      </div>
    </dl>
  );
}
