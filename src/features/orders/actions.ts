"use server";

// Checkout. The browser sends the cart (variant ids and quantities), the form and a key made for this attempt; the
// database prices, checks stock and writes the order in one transaction (place_order()). Nothing the browser says
// about money is used: there is nowhere to say it.
//
//   signed in  ->  place_order() with the customer's own session (the user id comes from their token)
//   guest      ->  rate limit, then place_order_as_guest() with the service role (the only caller allowed to)
//
// The same key always gives the same order, so a double click, a retry or a lost response cannot create two.
import { after } from "next/server";
import { updateTag } from "next/cache";
import { CATALOG_TAGS } from "@/features/catalog/cache";
import { getAuthState } from "@/lib/auth/session";
import { checkRateLimits, clientIp, rateLimitMessage } from "@/lib/auth/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalisePkMobile, placeOrderInputSchema } from "@/lib/validation/checkout";
import { fieldErrorsFrom } from "@/lib/validation/form";
import { notifyOwnerOfNewOrder } from "./owner-notification";
import { buildPlaceOrderArgs } from "./payload";
import { describePlaceOrderError, GENERIC_ORDER_ERROR } from "./place-order-errors";
import { deriveTrackingToken } from "./tracking-token";

export type PlaceOrderResult =
  | { ok: true; redirectTo: string | null; orderNumber: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string>; newKey?: boolean };

type PlacedOrder = { order_id: string; order_number: string; tracking_token: string | null; replayed: boolean };

const isPlacedOrder = (v: unknown): v is PlacedOrder =>
  typeof v === "object" && v !== null && typeof (v as PlacedOrder).order_id === "string" && typeof (v as PlacedOrder).order_number === "string";

export async function placeOrderAction(input: unknown): Promise<PlaceOrderResult> {
  const parsed = placeOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    const errors = fieldErrorsFrom(parsed.error);
    const fieldErrors = Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith("form.")).map(([k, v]) => [k.slice(5), v]));
    return {
      ok: false,
      message: errors.items ? "Your cart looks empty or invalid. Please check your cart and try again." : "Please check the highlighted fields.",
      fieldErrors,
    };
  }
  const { idempotency_key, items, form } = parsed.data;
  const args = buildPlaceOrderArgs(idempotency_key, items, form);

  try {
    const auth = await getAuthState();
    if (auth.status === "disabled") return { ok: false, message: "This account has been disabled. Please contact us." };

    let rpc;
    // The guest's link: derived from this attempt's key, so it is known here whatever the database echoes back.
    let guestToken: string | null = null;
    if (auth.status === "ok") {
      rpc = await (await createClient()).rpc("place_order", args);
    } else {
      const ip = await clientIp();
      const limit = await checkRateLimits([
        ["checkout_ip", ip],
        ["checkout_phone_ip", `${normalisePkMobile(form.phone)}|${ip}`],
        ["checkout_all", "all"],
      ]);
      if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit) };
      const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!secret) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
      guestToken = deriveTrackingToken(idempotency_key, secret);
      rpc = await createAdminClient().rpc("place_order_as_guest", { ...args, p_tracking_token: guestToken });
    }

    if (rpc.error) {
      const failure = describePlaceOrderError(rpc.error);
      // The code only: the database's detail text can hold a SKU or a phone number.
      console.error("place order refused:", failure.code, rpc.error.code ?? "");
      return { ok: false, message: failure.message, fieldErrors: failure.fieldErrors, newKey: failure.newKey };
    }
    if (!isPlacedOrder(rpc.data)) {
      console.error("place order: unexpected response shape");
      return { ok: false, message: GENERIC_ORDER_ERROR };
    }
    const placed = rpc.data;

    // Stock changed: the shop must not keep showing the old status.
    updateTag(CATALOG_TAGS.stock);
    updateTag(CATALOG_TAGS.products);
    // The owner e-mail runs after the response and cannot fail the order. A retry (replayed) never sends again.
    if (!placed.replayed) after(() => notifyOwnerOfNewOrder(placed.order_id));

    const redirectTo =
      auth.status === "ok" ? `/account/orders/${placed.order_id}?placed=1` : guestToken ? `/order/${guestToken}?placed=1` : null;
    return { ok: true, redirectTo, orderNumber: placed.order_number };
  } catch (error) {
    console.error("place order failed:", error instanceof Error ? error.message : error);
    return { ok: false, message: GENERIC_ORDER_ERROR };
  }
}

export type CheckoutPrefill =
  | { signedIn: false }
  | {
      signedIn: true;
      full_name: string;
      phone: string;
      email: string;
      addresses: { id: string; label: string; line1: string; area: string; city: string; province: string }[];
    };

/** What a signed-in customer's checkout can be pre-filled with. Their own rows only (the address query filters by owner too). */
export async function loadCheckoutPrefill(): Promise<CheckoutPrefill> {
  try {
    const auth = await getAuthState();
    if (auth.status !== "ok") return { signedIn: false };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("addresses")
      .select("id,label,line1,area,city,province,is_default")
      .eq("user_id", auth.user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) console.error("checkout prefill: addresses failed", error.code);
    return {
      signedIn: true,
      full_name: auth.user.fullName ?? "",
      phone: auth.user.phone ?? "",
      email: auth.user.email ?? "",
      addresses: (data ?? []).map((a) => ({ id: a.id, label: a.label ?? "", line1: a.line1 ?? "", area: a.area ?? "", city: a.city ?? "", province: a.province ?? "" })),
    };
  } catch (e) {
    console.error("checkout prefill failed:", e instanceof Error ? e.message : e);
    return { signedIn: false };
  }
}
