"use client";

import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCart } from "./cart-provider";

export function AddToCartButton({
  productId,
  productName,
  quantity = 1,
  disabled = false,
  className,
}: {
  productId: string;
  productName: string;
  quantity?: number;
  disabled?: boolean;
  className?: string;
}) {
  const { add } = useCart();
  return (
    <Button
      type="button"
      disabled={disabled}
      onClick={() => add(productId, productName, quantity)}
      className={cn("h-11 w-full", className)}
      aria-label={disabled ? `${productName} is out of stock` : `Add ${productName} to cart`}
    >
      <ShoppingCart />
      {disabled ? "Out of stock" : "Add to cart"}
    </Button>
  );
}
