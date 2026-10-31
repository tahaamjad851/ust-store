// Schemas for the staff's order forms. Forms hold text; the server parses it again with the same schema (rupees go
// through rupeesToPaisa(), never a float). The database re-checks every rule: these only give early, readable errors.
import { z } from "zod";
import { MAX_DELIVERY_CHARGE_PAISA } from "@/features/orders/totals";
import { ORDER_STATUS_VALUES, type OrderStatus } from "@/features/orders/status";
import { rupeesToPaisa } from "@/lib/pricing/money";

const orderId = z.guid("That order could not be found. Reload the page.");

export const orderStatusSchema = z.object({
  order_id: orderId,
  status: z.enum(ORDER_STATUS_VALUES as readonly [OrderStatus, ...OrderStatus[]], { error: "Choose a status" }),
  // Shown to the customer on the order, so keep it short and polite (internal remarks go in an internal note).
  note: z.string().trim().max(500, "Keep this under 500 characters"),
});
export type OrderStatusInput = z.input<typeof orderStatusSchema>;

export const deliveryChargeSchema = z.object({
  order_id: orderId,
  amount: z
    .string()
    .trim()
    .min(1, "Enter the delivery charge (0 if delivery is free)")
    .transform((v, ctx) => {
      const paisa = rupeesToPaisa(v);
      if (paisa === null || paisa > MAX_DELIVERY_CHARGE_PAISA) {
        ctx.addIssue({ code: "custom", message: "Enter an amount from 0 to 100,000, for example 850" });
        return z.NEVER;
      }
      return paisa;
    }),
});
export type DeliveryChargeInput = z.input<typeof deliveryChargeSchema>;

export const shipmentSchema = z.object({
  order_id: orderId,
  courier: z.string().trim().min(1, "Choose a courier").max(60),
  tracking_number: z
    .string()
    .trim()
    .max(80, "Keep this under 80 characters")
    .refine((v) => v === "" || /^[A-Za-z0-9 ._/#-]{1,80}$/.test(v), "Use letters, numbers, spaces and . _ / # - only"),
});
export type ShipmentInput = z.input<typeof shipmentSchema>;

export const orderNoteSchema = z.object({
  order_id: orderId,
  note: z.string().trim().min(1, "Write a note").max(2000, "Keep this under 2,000 characters"),
});
export type OrderNoteInput = z.input<typeof orderNoteSchema>;

export const orderIdSchema = z.object({ order_id: orderId });

/** The admin list's URL parameters. The URL is untrusted: anything invalid is dropped, never an error. */
export function parseAdminOrderFilters(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const status = one("status");
  const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(one(k)) && !Number.isNaN(Date.parse(one(k))) ? one(k) : "");
  const page = Number.parseInt(one("page"), 10);
  return {
    q: one("q").trim().slice(0, 80),
    status: (ORDER_STATUS_VALUES as readonly string[]).includes(status) ? (status as OrderStatus) : ("" as const),
    from: date("from"),
    to: date("to"),
    page: Number.isInteger(page) && page >= 1 && page <= 4000 ? page : 1,
  };
}
