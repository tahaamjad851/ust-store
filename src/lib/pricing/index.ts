// Retail vs. wholesale pricing and money formatting. All amounts are integer paisa.
import type { Product } from "@/types/catalog";

export type CustomerType = "retail" | "wholesale";

/** Wholesale price is optional so browser-bound snapshots can omit it entirely. */
export type PriceFields = Pick<Product, "retail_price_paisa"> & Partial<Pick<Product, "wholesale_price_paisa">>;

/** Formats integer paisa as "Rs 16,500". Grouping is done by hand so server and browser output match. */
export function formatPKR(paisa: number): string {
  const rupees = Math.round(paisa / 100);
  const sign = rupees < 0 ? "-" : "";
  const grouped = Math.abs(rupees)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}Rs ${grouped}`;
}

/** Unit price for a customer. Wholesale falls back to retail when no wholesale price is set. */
export function unitPrice(product: PriceFields, customer: CustomerType = "retail"): number {
  if (customer === "wholesale" && product.wholesale_price_paisa != null) {
    return product.wholesale_price_paisa;
  }
  return product.retail_price_paisa;
}

/** Saving vs. the compare-at price, or null when there is no genuine discount. */
export function discount(product: Pick<Product, "retail_price_paisa" | "compare_at_price_paisa">) {
  const { compare_at_price_paisa: was, retail_price_paisa: now } = product;
  if (was === null || was <= now) return null;
  return { amount_paisa: was - now, percent: Math.round(((was - now) / was) * 100) };
}

export type PricedLine<P extends PriceFields = PriceFields> = {
  product: P;
  quantity: number;
};

export function cartTotals<P extends PriceFields>(
  lines: PricedLine<P>[],
  freeDeliveryThresholdPaisa: number | null,
  customer: CustomerType = "retail",
) {
  const priced_lines = lines.map((l) => {
    const unit_price_paisa = unitPrice(l.product, customer);
    return { ...l, unit_price_paisa, line_total_paisa: unit_price_paisa * l.quantity };
  });
  const subtotal_paisa = priced_lines.reduce((sum, l) => sum + l.line_total_paisa, 0);
  const free_delivery =
    freeDeliveryThresholdPaisa !== null && subtotal_paisa >= freeDeliveryThresholdPaisa;
  const remaining_for_free_delivery_paisa =
    freeDeliveryThresholdPaisa === null ? null : Math.max(0, freeDeliveryThresholdPaisa - subtotal_paisa);
  return { lines: priced_lines, subtotal_paisa, free_delivery, remaining_for_free_delivery_paisa };
}
