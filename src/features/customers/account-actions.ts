"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addressIdSchema, addressSchema, profileSchema } from "@/lib/validation/auth";
import { fieldErrorsFrom } from "@/lib/validation/form";
import { MESSAGES, type ActionResult } from "./types";

// Every action authorizes itself (requireUser) and talks to the database as the signed-in user,
// never with the service role, so RLS is the final word: a customer cannot read or change
// another customer's profile or addresses even by sending a forged id.

const NOT_FOUND = "We could not find that address.";
const ADDRESS_LIMIT = "You can save up to 10 addresses. Delete one to add another.";

function refreshAccount() {
  revalidatePath("/account", "layout");
}

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser({ next: "/account" });
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone,
      company_name: parsed.data.company_name,
    })
    .eq("id", user.id)
    .select("id");
  if (error || !data || data.length === 0) {
    console.error("profile update failed", error?.code);
    return { ok: false, message: MESSAGES.unexpected };
  }

  refreshAccount();
  return { ok: true, message: "Your details have been saved." };
}

export async function createAddressAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser({ next: "/account/addresses" });
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("addresses").insert({ ...parsed.data, user_id: user.id });
  if (error) {
    if (error.message.includes("address_limit_reached")) return { ok: false, message: ADDRESS_LIMIT };
    console.error("address insert failed", error.code);
    return { ok: false, message: MESSAGES.unexpected };
  }

  refreshAccount();
  redirect("/account/addresses");
}

export async function updateAddressAction(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser({ next: "/account/addresses" });
  const addressId = addressIdSchema.safeParse(id);
  if (!addressId.success) return { ok: false, message: NOT_FOUND };
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.from("addresses").update(parsed.data).eq("id", addressId.data).eq("user_id", user.id).select("id");
  if (error) {
    console.error("address update failed", error.code);
    return { ok: false, message: MESSAGES.unexpected };
  }
  // RLS hides other customers' rows, so someone else's id looks exactly like a missing one.
  if (!data || data.length === 0) return { ok: false, message: NOT_FOUND };

  refreshAccount();
  redirect("/account/addresses");
}

export async function deleteAddressAction(id: unknown): Promise<ActionResult> {
  const user = await requireUser({ next: "/account/addresses" });
  const addressId = addressIdSchema.safeParse(id);
  if (!addressId.success) return { ok: false, message: NOT_FOUND };

  const supabase = await createClient();
  const { data, error } = await supabase.from("addresses").delete().eq("id", addressId.data).eq("user_id", user.id).select("id");
  if (error) {
    console.error("address delete failed", error.code);
    return { ok: false, message: MESSAGES.unexpected };
  }
  if (!data || data.length === 0) return { ok: false, message: NOT_FOUND };

  refreshAccount();
  return { ok: true, message: "Address deleted." };
}

export async function setDefaultAddressAction(id: unknown): Promise<ActionResult> {
  const user = await requireUser({ next: "/account/addresses" });
  const addressId = addressIdSchema.safeParse(id);
  if (!addressId.success) return { ok: false, message: NOT_FOUND };

  // A database trigger clears the previous default in the same statement.
  const supabase = await createClient();
  const { data, error } = await supabase.from("addresses").update({ is_default: true }).eq("id", addressId.data).eq("user_id", user.id).select("id");
  if (error) {
    console.error("set default address failed", error.code);
    return { ok: false, message: MESSAGES.unexpected };
  }
  if (!data || data.length === 0) return { ok: false, message: NOT_FOUND };

  refreshAccount();
  return { ok: true, message: "Default address updated." };
}
