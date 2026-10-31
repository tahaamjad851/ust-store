"use client";

import Link from "next/link";
import { ArrowLeft, Lock, MessageCircle, ShoppingCart, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductImageView } from "@/components/products/product-image";
import { StockIndicator } from "@/components/products/stock-indicator";
import { whatsappHref } from "@/lib/contact";
import { formatPKR } from "@/lib/pricing";
import { MAX_LINE_QTY, useCart } from "./cart-provider";
import { QuantityStepper } from "./quantity-stepper";
import { usePricedLines } from "./use-priced-lines";

export function CartView({
  freeDeliveryThresholdPaisa,
  deliveryNote,
  whatsappNumber,
  aside,
}: {
  freeDeliveryThresholdPaisa: number | null;
  /** From store settings: what is said about the delivery charge instead of a number. */
  deliveryNote: string;
  whatsappNumber: string;
  /** Server-rendered service points shown under the summary. */
  aside?: React.ReactNode;
}) {
  const { hydrated, setQuantity, remove, clear, notice, clearNotice } = useCart();
  const { priced, totals, sellableCount, status, retry } = usePricedLines(freeDeliveryThresholdPaisa);

  if (!hydrated || (status === "loading" && priced.length === 0)) {
    return (
      <p role="status" className="py-16 text-center text-body-lg text-muted-foreground">
        Loading your cart…
      </p>
    );
  }

  if (status === "error" && priced.length === 0) {
    return (
      <div role="alert" className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
        <h2 className="text-headline-md">We couldn&apos;t load your cart</h2>
        <p className="mt-1 text-body-md text-muted-foreground">Your items are saved on this device. Check your connection and try again.</p>
        <Button type="button" className="mt-4 h-11" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  if (priced.length === 0) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        {notice && (
          <p role="status" className="rounded-lg bg-warning-container p-3 text-body-sm text-warning-foreground">
            {notice}
          </p>
        )}
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <ShoppingCart className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-headline-md">Your cart is empty</h2>
          <p className="mt-1 text-body-md text-muted-foreground">Browse parts by category or search by part name.</p>
          <Button asChild className="mt-4 h-11">
            <Link href="/shop">Start shopping</Link>
          </Button>
        </div>
      </div>
    );
  }

  const itemCount = sellableCount;
  const waText =
    "Hello, I'd like to order:\n" +
    priced
      .filter((l) => l.product.stock_status !== "out_of_stock")
      .map((l) => `- ${l.quantity} x ${l.product.name}${l.product.variant_name ? `, ${l.product.variant_name}` : ""} (SKU ${l.product.sku})`)
      .join("\n");
  const threshold = freeDeliveryThresholdPaisa;
  const progress = threshold ? Math.min(100, Math.round((totals.subtotal_paisa / threshold) * 100)) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
      <div className="space-y-4">
        {notice && (
          <p role="status" className="flex items-start justify-between gap-3 rounded-lg bg-warning-container p-3 text-body-sm text-warning-foreground">
            {notice}
            <button type="button" onClick={clearNotice} className="min-h-11 shrink-0 underline">
              Dismiss
            </button>
          </p>
        )}
        {status === "error" && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-body-sm">
            <span>We couldn&apos;t refresh your cart just now, so some lines may be missing.</span>
            <Button type="button" variant="outline" className="h-11 border-input" onClick={retry}>
              Try again
            </Button>
          </div>
        )}
        {threshold !== null && (
          <section aria-label="Free delivery" className="rounded-lg border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-label-lg">
              <Truck className="size-5 text-primary" aria-hidden="true" />
              {totals.free_delivery
                ? "Your order qualifies for free delivery."
                : `Add ${formatPKR(totals.remaining_for_free_delivery_paisa ?? 0)} more for free delivery.`}
            </p>
            <div
              role="progressbar"
              aria-label="Progress to free delivery"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="mt-3 h-2 overflow-hidden rounded-full bg-surface-high"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-body-sm text-muted-foreground">Free delivery over {formatPKR(threshold)}</p>
          </section>
        )}

        <section aria-labelledby="cart-items-title" className="rounded-lg border border-border bg-card">
          <h2 id="cart-items-title" className="sr-only">
            Items in your cart
          </h2>
          <div className="hidden grid-cols-[1fr_110px_140px_110px] gap-4 border-b border-border bg-surface-low px-4 py-2 text-label-sm uppercase text-muted-foreground md:grid" aria-hidden="true">
            <span>Part</span>
            <span className="text-right">Unit price</span>
            <span className="text-center">Quantity</span>
            <span className="text-right">Line total</span>
          </div>
          <ul className="divide-y divide-border">
            {priced.map(({ product, quantity, unit_price_paisa: price, line_total_paisa: lineTotal }) => {
              const unavailable = product.stock_status === "out_of_stock";
              return (
                <li key={product.variant_id} className="grid grid-cols-[72px_1fr] gap-3 p-4 md:grid-cols-[1fr_110px_140px_110px] md:items-center md:gap-4">
                  <div className="contents md:flex md:gap-3">
                    <ProductImageView
                      image={product.image}
                      width={72}
                      height={72}
                      sizes="72px"
                      className="size-18 rounded-lg border border-border bg-surface-low"
                    />
                    <div className="min-w-0 space-y-1">
                      <Link href={`/products/${product.slug}`} className="line-clamp-2 text-label-lg hover:underline">
                        {product.name}
                        {product.variant_name && <span className="font-normal text-muted-foreground">, {product.variant_name}</span>}
                      </Link>
                      <p className="font-mono text-label-sm text-muted-foreground">SKU: {product.sku}</p>
                      <StockIndicator status={product.stock_status} />
                      {unavailable && (
                        <p className="text-body-sm text-destructive">Not included in your total.</p>
                      )}
                      <p className="text-body-sm tabular md:hidden">{formatPKR(price)} each</p>
                    </div>
                  </div>
                  <p className="hidden text-right text-body-md tabular md:block">{formatPKR(price)}</p>
                  <div className="col-span-2 flex items-center justify-between gap-3 md:col-span-1 md:justify-center">
                    <QuantityStepper
                      value={quantity}
                      onChange={(n) => setQuantity(product.variant_id, product.name, n)}
                      max={MAX_LINE_QTY}
                      disabled={unavailable}
                      label={`Quantity for ${product.name}`}
                    />
                    <p className="text-price-md tabular md:hidden">
                      {unavailable ? <span className="text-body-sm text-muted-foreground">Not included</span> : formatPKR(lineTotal)}
                    </p>
                  </div>
                  <p className="hidden text-right text-price-md tabular md:block">
                    {unavailable ? <span className="text-body-sm text-muted-foreground">Not included</span> : formatPKR(lineTotal)}
                  </p>
                  <div className="col-span-2 md:col-span-4">
                    <button
                      type="button"
                      onClick={() => remove(product.variant_id, product.name)}
                      className="inline-flex min-h-11 items-center gap-1 text-label-md text-destructive hover:underline"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Remove<span className="sr-only"> {product.name}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
            <Link href="/shop" className="inline-flex min-h-11 items-center gap-2 text-label-lg text-primary hover:underline">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Continue shopping
            </Link>
            <Button type="button" variant="outline" className="h-11 border-input" onClick={clear}>
              <Trash2 />
              Clear cart
            </Button>
          </div>
        </section>
      </div>

      <div className="space-y-4">
        <section aria-labelledby="summary-title" className="rounded-lg border border-border bg-card p-4 shadow-card lg:p-6">
          <h2 id="summary-title" className="text-headline-md">
            Order summary
          </h2>
          <dl className="mt-4 space-y-2 text-body-md">
            <div className="flex justify-between">
              <dt>Items ({itemCount})</dt>
              <dd className="font-semibold tabular">{formatPKR(totals.subtotal_paisa)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Delivery</dt>
              <dd className="max-w-48 text-right font-semibold">{deliveryNote}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <dt className="text-headline-sm">Total</dt>
              <dd className="text-price-lg text-primary tabular">{formatPKR(totals.subtotal_paisa)}</dd>
            </div>
          </dl>
          <div className="mt-4 space-y-3">
            {sellableCount > 0 ? (
              <Button asChild className="h-12 w-full">
                <Link href="/checkout">
                  <Lock />
                  Proceed to checkout
                </Link>
              </Button>
            ) : (
              <>
                <p id="checkout-blocked" role="status" className="text-body-sm text-muted-foreground">
                  Everything in your cart is out of stock right now. Remove it or check back later.
                </p>
                <Button disabled aria-describedby="checkout-blocked" className="h-12 w-full">
                  <Lock />
                  Proceed to checkout
                </Button>
              </>
            )}
            {sellableCount > 0 && (
              <Button asChild className="h-12 w-full bg-whatsapp hover:bg-whatsapp-hover">
                <a href={whatsappHref(whatsappNumber, waText)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle />
                  Order on WhatsApp
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
            )}
          </div>
        </section>
        {aside}
      </div>
    </div>
  );
}
