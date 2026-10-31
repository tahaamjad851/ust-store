"use server";

// What staff do to an order. Every action is the pattern in features/admin/action.ts: a staff session checked here,
// the input parsed again on the server, the work done by a database function with the staff member's own session
// (so the database decides: invalid transitions, closed orders, who may do it) and the audit log written inside it.
import { dbCheck, runAdminAction } from "@/features/admin/action";
import type { AdminResult } from "@/features/admin/types";
import { deliveryChargeSchema, orderIdSchema, orderNoteSchema, orderStatusSchema, shipmentSchema } from "@/lib/validation/orders";
import { STATUS_LABEL } from "./status";

export async function setOrderStatusAction(input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: "/admin/orders",
    schema: orderStatusSchema,
    input,
    // Cancelling frees stock and delivering sells it, so the shop's stock labels must refresh.
    revalidate: ["stock"],
    async run({ order_id, status, note }, { supabase }) {
      dbCheck(await supabase.rpc("set_order_status", { p_order_id: order_id, p_status: status, p_note: note || null }), "set order status");
      return { message: `Order marked ${STATUS_LABEL[status].toLowerCase()}.` };
    },
  });
}

export async function setDeliveryChargeAction(input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: "/admin/orders",
    schema: deliveryChargeSchema,
    input,
    revalidate: [],
    async run({ order_id, amount }, { supabase }) {
      // The database recalculates the total from the stored subtotal and discount; only the charge is sent.
      dbCheck(await supabase.rpc("set_order_delivery_charge", { p_order_id: order_id, p_shipping_paisa: amount }), "set delivery charge");
      return { message: "Delivery charge saved. The order total was recalculated." };
    },
  });
}

export async function setShipmentAction(input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: "/admin/orders",
    schema: shipmentSchema,
    input,
    revalidate: [],
    async run({ order_id, courier, tracking_number }, { supabase }) {
      dbCheck(
        await supabase.rpc("set_order_shipment", { p_order_id: order_id, p_courier: courier, p_tracking_number: tracking_number || null }),
        "set shipment",
      );
      return { message: "Courier and tracking number saved." };
    },
  });
}

export async function addOrderNoteAction(input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: "/admin/orders",
    schema: orderNoteSchema,
    input,
    revalidate: [],
    async run({ order_id, note }, { supabase }) {
      dbCheck(await supabase.rpc("add_order_note", { p_order_id: order_id, p_note: note }), "add order note");
      return { message: "Note added. Customers cannot see it." };
    },
  });
}

export async function markCodCollectedAction(input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: "/admin/orders",
    schema: orderIdSchema,
    input,
    revalidate: [],
    async run({ order_id }, { supabase }) {
      dbCheck(await supabase.rpc("mark_cod_collected", { p_order_id: order_id }), "mark cod collected");
      return { message: "Cash on delivery marked as collected." };
    },
  });
}
