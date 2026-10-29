"use client";

import { useMemo } from "react";
import { cartTotals } from "@/lib/pricing";
import type { CartCatalogItem } from "@/services/catalog";
import { useCart } from "./cart-provider";

/**
 * Joins cart lines with server-provided prices and prices them via lib/pricing.
 * Unknown or inactive products are dropped. Components render these numbers as-is.
 */
export function usePricedLines(catalog: CartCatalogItem[], freeDeliveryThresholdPaisa: number | null) {
  const { lines } = useCart();
  return useMemo(() => {
    const byId = new Map(catalog.map((p) => [p.id, p]));
    const joined = lines.flatMap((l) => {
      const product = byId.get(l.product_id);
      return product ? [{ product, quantity: l.quantity }] : [];
    });
    const totals = cartTotals(joined, freeDeliveryThresholdPaisa);
    return { priced: totals.lines, totals };
  }, [lines, catalog, freeDeliveryThresholdPaisa]);
}
