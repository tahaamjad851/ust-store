"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPurchasable } from "@/features/inventory/stock";
import { AddToCartButton } from "./add-to-cart-button";
import { MAX_LINE_QTY, useCart } from "./cart-provider";
import { QuantityStepper } from "./quantity-stepper";
import { useVariantSelection } from "./variant-selection";

/**
 * Quantity, Add to cart and Buy now for the selected variant. Stock is a status, not a count, so
 * the quantity is capped at the per-line maximum here; the server checks real availability when an
 * order is placed.
 */
export function ProductPurchase({ productName }: { productName: string }) {
  const [qty, setQty] = useState(1);
  const { add } = useCart();
  const router = useRouter();
  const { selected } = useVariantSelection();
  const outOfStock = !isPurchasable(selected.stock_status);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <QuantityStepper value={qty} onChange={setQty} max={MAX_LINE_QTY} disabled={outOfStock} label={`Quantity for ${productName}`} />
      <AddToCartButton
        variantId={selected.id}
        productName={productName}
        quantity={qty}
        disabled={outOfStock}
        className="w-auto min-w-40 flex-1"
      />
      <Button
        type="button"
        variant="outline"
        disabled={outOfStock}
        className="h-11 flex-1 border-input sm:flex-none"
        onClick={() => {
          add(selected.id, productName, qty);
          router.push("/cart");
        }}
      >
        <Zap />
        Buy now
      </Button>
    </div>
  );
}
