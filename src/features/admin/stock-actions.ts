"use server";

import { dbCheck, runAdminAction } from "./action";
import type { AdminResult } from "./types";
import { stockAdjustSchema, stockMovement, thresholdsSchema } from "@/lib/validation/admin";

// Stock goes through adjust_stock() only: it locks the row, refuses to go below what customers have
// reserved, requires a reason, and writes the ledger row with the signed-in user.

export async function adjustStockAction(input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: "/admin/stock",
    schema: stockAdjustSchema,
    input,
    revalidate: ["stock"],
    async run({ variant_id, kind, quantity, reason }, { supabase }) {
      const { type, delta } = stockMovement(kind, quantity);
      dbCheck(
        await supabase.rpc("adjust_stock", { p_variant_id: variant_id, p_on_hand_delta: delta, p_movement_type: type, p_reason: reason }),
        "adjust stock",
      );
      return { message: delta > 0 ? `Added ${quantity} to stock.` : `Removed ${quantity} from stock.` };
    },
  });
}

export async function setThresholdsAction(input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: "/admin/stock",
    schema: thresholdsSchema,
    input,
    revalidate: ["stock"],
    async run({ variant_id, low_stock_threshold, reorder_level }, { supabase }) {
      dbCheck(
        await supabase.rpc("set_stock_thresholds", { p_variant_id: variant_id, p_low_stock_threshold: low_stock_threshold, p_reorder_level: reorder_level }),
        "set thresholds",
      );
      return { message: "Stock levels saved." };
    },
  });
}
