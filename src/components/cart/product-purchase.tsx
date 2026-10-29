"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddToCartButton } from "./add-to-cart-button";
import { MAX_LINE_QTY, useCart } from "./cart-provider";
import { QuantityStepper } from "./quantity-stepper";

export function ProductPurchase({
  productId,
  productName,
  stockQty,
}: {
  productId: string;
  productName: string;
  stockQty: number;
}) {
  const [qty, setQty] = useState(1);
  const { add } = useCart();
  const router = useRouter();
  const outOfStock = stockQty <= 0;
  const max = Math.max(1, Math.min(MAX_LINE_QTY, stockQty));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <QuantityStepper value={qty} onChange={setQty} max={max} label={`Quantity for ${productName}`} />
      <AddToCartButton
        productId={productId}
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
          add(productId, productName, qty);
          router.push("/cart");
        }}
      >
        <Zap />
        Buy now
      </Button>
    </div>
  );
}
