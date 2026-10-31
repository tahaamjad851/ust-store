import type { StockStatus } from "@/types/catalog";

// The storefront shows a status, never a count: exact quantities are not sent to browsers.
export const STOCK_LABEL: Record<StockStatus, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
};

export const isPurchasable = (status: StockStatus) => status !== "out_of_stock";
