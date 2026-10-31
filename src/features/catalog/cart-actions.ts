"use server";

// Server Action behind the cart: the browser sends the variant ids it holds, the server answers
// with what each one costs and whether it can be bought. Read-only and public (anon key, RLS).
import { z } from "zod";
import { getCartItems, MAX_CART_LOOKUP } from "@/services/catalog";
import type { CartCatalogItem } from "@/types/catalog";

// guid: any well-formed id (ids made by md5() in the demo seed are not RFC-4122 versioned).
const idsSchema = z.array(z.guid()).max(MAX_CART_LOOKUP);

export type CartLookupResult = { ok: true; items: CartCatalogItem[] } | { ok: false };

export async function lookupCartItems(variantIds: unknown): Promise<CartLookupResult> {
  const parsed = idsSchema.safeParse(variantIds);
  if (!parsed.success) return { ok: false };
  try {
    return { ok: true, items: await getCartItems(parsed.data) };
  } catch (error) {
    // The visitor sees "could not load"; the cause goes to the server log.
    console.error("cart lookup failed:", error instanceof Error ? error.message : error);
    return { ok: false };
  }
}
