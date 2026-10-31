"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lookupCartItems } from "@/features/catalog/cart-actions";
import { cartTotals } from "@/lib/pricing";
import type { CartCatalogItem } from "@/types/catalog";
import { useCart } from "./cart-provider";

type LookupStatus = "loading" | "ready" | "error";

/**
 * Looks the cart's variants up on the server (price, name, image, stock status) and prices the
 * lines with lib/pricing. Variants the server does not return are not for sale any more and are
 * removed from the cart. Lines that are out of stock stay visible but are left out of the totals.
 * Components render these numbers as they are.
 */
export function usePricedLines(freeDeliveryThresholdPaisa: number | null) {
  const { lines, hydrated, drop } = useCart();
  const [items, setItems] = useState<Map<string, CartCatalogItem>>(new Map());
  const [status, setStatus] = useState<LookupStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);
  // The cart object changes with every quantity edit; the lookup must not (it keys on the variant set only).
  const dropRef = useRef(drop);
  useEffect(() => {
    dropRef.current = drop;
  });

  // Quantity changes must not trigger a lookup: only the set of variants does.
  const key = useMemo(() => [...new Set(lines.map((l) => l.variant_id))].sort().join(","), [lines]);

  useEffect(() => {
    if (!hydrated) return;
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems(new Map());
      setStatus("ready");
      return;
    }
    const current = ++request.current;
    setStatus((s) => (s === "ready" ? s : "loading"));
    lookupCartItems(ids)
      .then((res) => {
        if (current !== request.current) return;
        if (!res.ok) {
          setStatus("error");
          return;
        }
        setItems(new Map(res.items.map((i) => [i.variant_id, i])));
        setStatus("ready");
        const found = new Set(res.items.map((i) => i.variant_id));
        dropRef.current(ids.filter((id) => !found.has(id)));
      })
      .catch(() => {
        if (current === request.current) setStatus("error");
      });
  }, [hydrated, key, attempt]);

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  return useMemo(() => {
    const joined = lines.flatMap((l) => {
      const product = items.get(l.variant_id);
      return product ? [{ product, quantity: l.quantity }] : [];
    });
    const sellable = joined.filter((l) => l.product.stock_status !== "out_of_stock");
    const totals = cartTotals(sellable, freeDeliveryThresholdPaisa);
    return {
      priced: cartTotals(joined, freeDeliveryThresholdPaisa).lines,
      totals,
      sellableCount: sellable.reduce((n, l) => n + l.quantity, 0),
      status,
      retry,
    };
  }, [lines, items, freeDeliveryThresholdPaisa, status, retry]);
}
