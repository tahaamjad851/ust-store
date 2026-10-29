// Retail vs. wholesale pricing and money formatting. All amounts are integer paisa.
import type { Product } from "@/types/catalog";

export type CustomerType = "retail" | "wholesale";

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
export function unitPrice(product: Pick<Product, "retail_price_paisa" | "wholesale_price_paisa">, customer: CustomerType = "retail"): number {
  if (customer === "wholesale" && product.wholesale_price_paisa !== null) {
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

export type PricedLine = {
  product: Pick<Product, "retail_price_paisa" | "wholesale_price_paisa">;
  quantity: number;
};

export function cartTotals(
  lines: PricedLine[],
  freeDeliveryThresholdPaisa: number | null,
  customer: CustomerType = "retail",
) {
  const subtotal_paisa = lines.reduce((sum, l) => sum + unitPrice(l.product, customer) * l.quantity, 0);
  const free_delivery =
    freeDeliveryThresholdPaisa !== null && subtotal_paisa >= freeDeliveryThresholdPaisa;
  const remaining_for_free_delivery_paisa =
    freeDeliveryThresholdPaisa === null ? null : Math.max(0, freeDeliveryThresholdPaisa - subtotal_paisa);
  return { subtotal_paisa, free_delivery, remaining_for_free_delivery_paisa };
}
