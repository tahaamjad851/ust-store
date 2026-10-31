// The one door for every admin write. An admin server action is:
//
//   1. a staff (or admin) session, checked here on every call: requireStaff() / requireAdmin(). The
//      layout's check is not enough, a server action can be called without ever rendering the page;
//   2. Zod validation of the input, on the server;
//   3. the work itself, done with the SIGNED-IN USER's Supabase client (anon key + session cookie), never the
//      service-role key. Row-level security and the database functions are therefore the final word: a
//      customer who forges a request is refused by the database even if every check above were missing;
//   4. cache invalidation for the public site (`revalidate` is declared up front and only runs on success);
//   5. a result the browser can show. Database errors are logged here and turned into plain sentences.
//
// The audit log is written by database triggers on every catalog table (audit_row_change()), by
// apply_daily_changes() and import_catalog(), so it also covers writes that bypass the website.
import "server-only";

import { revalidatePath, updateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { CATALOG_TAGS } from "@/features/catalog/cache";
import { requireAdmin, requireStaff, type SessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom } from "@/lib/validation/form";
import { describeDbError, type DbErrorLike } from "./db-errors";
import type { AdminResult } from "./types";

/**
 * What a change touches on the public site. A change to a category or a tractor model decides what is
 * visible, so it also expires the product listings; stock and price changes expire the product caches
 * (every cached product entry carries both tags).
 */
const PUBLIC_TAGS = {
  categories: [CATALOG_TAGS.categories, CATALOG_TAGS.products],
  tractors: [CATALOG_TAGS.tractors, CATALOG_TAGS.products],
  products: [CATALOG_TAGS.products, CATALOG_TAGS.stock],
  stock: [CATALOG_TAGS.stock, CATALOG_TAGS.products],
  settings: [CATALOG_TAGS.settings],
} as const;

export type PublicArea = keyof typeof PUBLIC_TAGS;

/** A failure with a message that is safe to show. Thrown inside `run`, turned into `{ ok: false }`. */
export class AdminError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string>,
    readonly code?: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

export type AdminContext = { user: SessionUser; supabase: SupabaseClient };

/** Returns the data of a Supabase response, or throws an AdminError with a plain-language message. */
export function dbCheck<T>(res: { data: T; error: DbErrorLike | null }, what: string): T {
  if (res.error) {
    const described = describeDbError(res.error);
    console.error(`admin: ${what} failed`, res.error.code ?? "no code", res.error.message);
    throw new AdminError(described.message, undefined, described.code, res.error.details ?? undefined);
  }
  return res.data;
}

type Options<S extends z.ZodType, T> = {
  /** Where to send a signed-out visitor after they sign in. */
  next: string;
  /** "admin" for settings, costs-only screens and deletes; staff otherwise. */
  role?: "staff" | "admin";
  schema: S;
  input: unknown;
  /** Public-site caches to expire when this succeeds. */
  revalidate: readonly PublicArea[];
  run: (input: z.output<S>, ctx: AdminContext) => Promise<{ message?: string; data?: T } | void>;
};

export async function runAdminAction<S extends z.ZodType, T = undefined>(options: Options<S, T>): Promise<AdminResult<T>> {
  const user = options.role === "admin" ? await requireAdmin({ next: options.next }) : await requireStaff({ next: options.next });

  const parsed = options.schema.safeParse(options.input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), message: "Check the highlighted fields." };

  try {
    const supabase = await createClient();
    const outcome = (await options.run(parsed.data, { user, supabase })) ?? {};
    for (const area of options.revalidate) for (const tag of PUBLIC_TAGS[area]) updateTag(tag);
    // The admin pages read the database directly on every request; this refreshes what the browser kept.
    revalidatePath("/admin", "layout");
    return { ok: true, message: outcome.message, data: outcome.data };
  } catch (error) {
    // redirect(), notFound() and forbidden() are thrown by Next and must pass through.
    unstable_rethrow(error);
    if (error instanceof AdminError) {
      return { ok: false, message: error.message, fieldErrors: error.fieldErrors, code: error.code, detail: error.detail };
    }
    console.error("admin: unexpected failure", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
