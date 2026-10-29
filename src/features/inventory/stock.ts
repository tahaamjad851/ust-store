import type { Product, StockStatus } from "@/types/catalog";

export function stockStatus(product: Pick<Product, "stock_qty" | "low_stock_threshold">): StockStatus {
  if (product.stock_qty <= 0) return "out_of_stock";
  if (product.stock_qty <= product.low_stock_threshold) return "low_stock";
  return "in_stock";
}

export const STOCK_LABEL: Record<StockStatus, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
};
