"use server";

import { z } from "zod";
import { AdminError, dbCheck, runAdminAction } from "./action";
import type { AdminResult } from "./types";
import { courierSchema, idSchema, orderSchema, settingsSchema } from "@/lib/validation/admin";

// Store settings and the courier list: administrators only (the actions check, and so does row-level security).
// Bank and EasyPaisa details are not part of this phase.

export async function saveSettingsAction(input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: "/admin/settings",
    role: "admin",
    schema: settingsSchema,
    input,
    revalidate: ["settings"],
    async run(values, { supabase }) {
      const { order_notification_emails, ...pub } = values;
      dbCheck(
        await supabase
          .from("store_settings")
          .update({ ...pub, phone_secondary: pub.phone_secondary })
          .eq("id", true)
          .select("id")
          .single(),
        "save store settings",
      );
      dbCheck(
        await supabase.from("store_private_settings").update({ order_notification_emails }).eq("id", true).select("id").single(),
        "save private settings",
      );
      return { message: "Settings saved. The shop shows them now." };
    },
  });
}

export async function saveCourierAction(id: string | null, input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: "/admin/settings",
    role: "admin",
    schema: z.object({ id: idSchema.nullable(), values: courierSchema }),
    input: { id, values: input },
    revalidate: [],
    async run({ id, values }, { supabase }) {
      if (id) {
        dbCheck(await supabase.from("couriers").update(values).eq("id", id).select("id").single(), "update courier");
      } else {
        const last = dbCheck(await supabase.from("couriers").select("sort_order").order("sort_order", { ascending: false }).limit(1), "read couriers") as { sort_order: number }[];
        dbCheck(await supabase.from("couriers").insert({ ...values, sort_order: (last[0]?.sort_order ?? 0) + 10 }), "create courier");
      }
      return { message: id ? "Courier saved." : "Courier added." };
    },
  });
}

export async function deleteCourierAction(id: string): Promise<AdminResult> {
  return runAdminAction({
    next: "/admin/settings",
    role: "admin",
    schema: idSchema,
    input: id,
    revalidate: [],
    async run(id, { supabase }) {
      const rows = dbCheck(await supabase.from("couriers").delete().eq("id", id).select("id"), "delete courier");
      if (!rows || rows.length === 0) throw new AdminError("That courier no longer exists.");
      return { message: "Courier deleted." };
    },
  });
}

export async function reorderCouriersAction(ids: string[]): Promise<AdminResult> {
  return runAdminAction({
    next: "/admin/settings",
    role: "admin",
    schema: orderSchema,
    input: ids,
    revalidate: [],
    async run(ids, { supabase }) {
      dbCheck(await supabase.rpc("catalog_reorder", { p_entity: "couriers", p_ids: ids }), "reorder couriers");
      return { message: "Order saved." };
    },
  });
}

export async function setCourierActiveAction(id: string, isActive: boolean): Promise<AdminResult> {
  return runAdminAction({
    next: "/admin/settings",
    role: "admin",
    schema: z.object({ id: idSchema, isActive: z.boolean() }),
    input: { id, isActive },
    revalidate: [],
    async run({ id, isActive }, { supabase }) {
      dbCheck(await supabase.from("couriers").update({ is_active: isActive }).eq("id", id).select("id").single(), "set courier active");
      return { message: isActive ? "Courier is in use." : "Courier is not used." };
    },
  });
}
