"use server";

import { AdminError, dbCheck, runAdminAction } from "./action";
import { describeDbError } from "./db-errors";
import type { AdminResult } from "./types";
import { dailyChangesSchema } from "@/lib/validation/admin";

export type DailyChangesSummary = { variants: number; prices: number; stock: number; availability: number };
/** What the database reports when a change is larger than the alert percentage and was not confirmed. */
export type LargeChangeDetail = { variant_id: string; sku: string; old_paisa: number; new_paisa: number; percent: number }[];

function parseDetail(details: string | null | undefined): unknown {
  try {
    return details ? JSON.parse(details) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * "Save changes" on the Daily prices page: every price, sale price, stock and availability edit in one
 * database transaction (apply_daily_changes). All of it is saved or none of it. Each price change is
 * logged with who, the old and the new price, and when. Existing orders keep their prices (order lines
 * store snapshots).
 */
export async function applyDailyChangesAction(input: unknown): Promise<AdminResult<DailyChangesSummary>> {
  return runAdminAction({
    next: "/admin/prices",
    schema: dailyChangesSchema,
    input,
    revalidate: ["products"],
    async run({ changes, confirm_large }, { supabase }) {
      const { data, error } = await supabase.rpc("apply_daily_changes", { p_changes: changes, p_confirm_large: confirm_large });
      if (error) {
        console.error("admin: apply_daily_changes failed", error.code, error.message);
        if (error.message === "large_change_unconfirmed") {
          throw new AdminError("Some prices change by a lot. Please confirm them.", undefined, "large_change_unconfirmed", parseDetail(error.details));
        }
        const described = describeDbError(error);
        // The database names the SKU in `details` for these.
        const sku = ["stale_data", "invalid_price", "invalid_quantity", "insufficient_stock"].includes(error.message) ? error.details : null;
        throw new AdminError(sku ? `${described.message} (${sku})` : described.message, undefined, described.code);
      }
      const summary = dbCheck({ data, error: null }, "daily prices") as DailyChangesSummary;
      const parts = [
        summary.prices && `${summary.prices} price${summary.prices === 1 ? "" : "s"}`,
        summary.stock && `${summary.stock} stock level${summary.stock === 1 ? "" : "s"}`,
        summary.availability && `${summary.availability} availability`,
      ].filter(Boolean);
      return { message: parts.length ? `Saved: ${parts.join(", ")}.` : "Nothing needed to change.", data: summary };
    },
  });
}
