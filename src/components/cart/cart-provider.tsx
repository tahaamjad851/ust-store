"use client";

// DEMO cart: product ids and quantities only, kept in this browser's localStorage.
// Prices are never stored here; they always come from the server catalog.
// Replace with a server-side cart once orders are built.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { z } from "zod";

export const MAX_LINE_QTY = 99;
const STORAGE_KEY = "ust-cart-v1";

const linesSchema = z
  .array(z.object({ product_id: z.string().max(64), quantity: z.number().int().min(1).max(MAX_LINE_QTY) }))
  .max(100);

export type CartLine = z.infer<typeof linesSchema>[number];

type CartContextValue = {
  lines: CartLine[];
  hydrated: boolean;
  count: number;
  add: (productId: string, productName: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string, productName: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function readStorage(): CartLine[] {
  try {
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

export function CartProvider({
  knownProductIds,
  children,
}: {
  /** Products that can currently be sold; stored lines for anything else are dropped. */
  knownProductIds: string[];
  children: React.ReactNode;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    // Read once after mount so server and first client render match.
    const known = new Set(knownProductIds);
    const stored = readStorage();
    const valid = stored.filter((l) => known.has(l.product_id));
    if (valid.length !== stored.length) writeStorage(valid);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(valid);
    setHydrated(true);
  }, [knownProductIds]);

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
      add(productId, productName, quantity = 1) {
        update((prev) => {
          const existing = prev.find((l) => l.product_id === productId);
          if (existing) {
            return prev.map((l) =>
              l.product_id === productId ? { ...l, quantity: clampQty(l.quantity + quantity) } : l,
            );
          }
          return [...prev, { product_id: productId, quantity: clampQty(quantity) }];
        });
        setAnnouncement(`Added ${productName} to cart.`);
      },
      setQuantity(productId, quantity) {
        update((prev) => prev.map((l) => (l.product_id === productId ? { ...l, quantity: clampQty(quantity) } : l)));
      },
      remove(productId, productName) {
        update((prev) => prev.filter((l) => l.product_id !== productId));
        setAnnouncement(`Removed ${productName} from cart.`);
      },
      clear() {
        update(() => []);
        setAnnouncement("Cart cleared.");
      },
    }),
    [lines, hydrated, update],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
