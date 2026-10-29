"use client";

import { useMemo } from "react";
import { cartTotals } from "@/lib/pricing";
import type { CartCatalogItem } from "@/services/catalog";
import { useCart } from "./cart-provider";

/** Joins cart lines with server-provided prices. Unknown or inactive products are dropped. */
export function usePricedLines(catalog: CartCatalogItem[], freeDeliveryThresholdPaisa: number | null) {
  const { lines } = useCart();
  return useMemo(() => {
    const byId = new Map(catalog.map((p) => [p.id, p]));
    const priced = lines.flatMap((l) => {
      const product = byId.get(l.product_id);
      return product ? [{ product, quantity: l.quantity }] : [];
    });
    return { priced, totals: cartTotals(priced, freeDeliveryThresholdPaisa) };
  }, [lines, catalog, freeDeliveryThresholdPaisa]);
}
