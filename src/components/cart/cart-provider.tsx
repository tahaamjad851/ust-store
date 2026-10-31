"use client";

// The cart lives in this browser's localStorage and holds variant ids and quantities only. No
// name, price or stock is ever stored: those come from the server each time the cart is shown
// (see use-priced-lines.ts), so a stale or edited value in storage can change nothing but what
// the customer asked for. Orders re-check everything on the server.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { z } from "zod";

export const MAX_LINE_QTY = 99;
const STORAGE_KEY = "ust-cart-v2";
// Version 1 stored demo product ids; those mean nothing now.
const LEGACY_STORAGE_KEY = "ust-cart-v1";

const linesSchema = z
  .array(z.object({ variant_id: z.guid(), quantity: z.number().int().min(1).max(MAX_LINE_QTY) }))
  .max(100);

export type CartLine = z.infer<typeof linesSchema>[number];

type CartContextValue = {
  lines: CartLine[];
  hydrated: boolean;
  count: number;
  add: (variantId: string, productName: string, quantity?: number) => void;
  setQuantity: (variantId: string, productName: string, quantity: number) => void;
  remove: (variantId: string, productName: string) => void;
  clear: () => void;
  /** Drops the lines of variants the server says can no longer be bought. Lines added since are untouched. */
  drop: (variantIds: string[]) => void;
  /** Set when lines were dropped, so the cart can say so instead of items vanishing silently. */
  notice: string | null;
  clearNotice: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function readStorage(): CartLine[] {
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = linesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function writeStorage(lines: CartLine[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Storage blocked (private mode etc.): the cart still works for this page view.
  }
}

const clampQty = (n: number) => Math.min(MAX_LINE_QTY, Math.max(1, Math.trunc(n)));

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // id changes on every message so identical messages ("Added X") are re-announced.
  const [announcement, setAnnouncementState] = useState({ id: 0, text: "" });
  const setAnnouncement = useCallback(
    (text: string) => setAnnouncementState((prev) => ({ id: prev.id + 1, text })),
    [],
  );

  useEffect(() => {
    // Read once after mount so server and first client render match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(readStorage());
    setHydrated(true);
  }, []);

  const update = useCallback((next: (prev: CartLine[]) => CartLine[]) => {
    setLines((prev) => {
      const result = next(prev);
      writeStorage(result);
      return result;
    });
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      hydrated,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      add(variantId, productName, quantity = 1) {
        update((prev) => {
          const existing = prev.find((l) => l.variant_id === variantId);
          if (existing) {
            return prev.map((l) =>
              l.variant_id === variantId ? { ...l, quantity: clampQty(l.quantity + quantity) } : l,
            );
          }
          return [...prev, { variant_id: variantId, quantity: clampQty(quantity) }];
        });
        setAnnouncement(`Added ${productName} to cart.`);
      },
      setQuantity(variantId, productName, quantity) {
        update((prev) => prev.map((l) => (l.variant_id === variantId ? { ...l, quantity: clampQty(quantity) } : l)));
        setAnnouncement(`Quantity for ${productName} set to ${clampQty(quantity)}.`);
      },
      remove(variantId, productName) {
        update((prev) => prev.filter((l) => l.variant_id !== variantId));
        setAnnouncement(`Removed ${productName} from cart.`);
      },
      clear() {
        update(() => []);
        setAnnouncement("Cart cleared.");
      },
      drop(variantIds) {
        const gone = new Set(variantIds);
        if (variantIds.length > 0) setNotice("Some items are no longer available and were removed from your cart.");
        update((prev) => (prev.some((l) => gone.has(l.variant_id)) ? prev.filter((l) => !gone.has(l.variant_id)) : prev));
      },
      notice,
      clearNotice: () => setNotice(null),
    }),
    [lines, hydrated, notice, update, setAnnouncement],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      <p role="status" aria-live="polite" className="sr-only">
        <span key={announcement.id}>{announcement.text}</span>
      </p>
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
