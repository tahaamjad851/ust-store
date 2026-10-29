"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCart } from "./cart-provider";

export function CartLink() {
  const { count, hydrated } = useCart();
  const label = hydrated ? `Cart, ${count} ${count === 1 ? "item" : "items"}` : "Cart";
  return (
    <Link
      href="/cart"
      aria-label={label}
      className="relative inline-flex size-11 items-center justify-center rounded-lg hover:bg-surface-low md:w-auto md:gap-2 md:border md:border-border md:px-3"
    >
      <ShoppingCart className="size-5" aria-hidden="true" />
      <span className="hidden text-label-lg md:inline">Cart</span>
      {hydrated && count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-warning px-1 text-label-sm text-white tabular"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
