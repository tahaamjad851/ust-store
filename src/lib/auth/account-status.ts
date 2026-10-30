import type { createClient } from "@/lib/supabase/server";

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * False when the profile is missing or the account is disabled. Throws when the database cannot
 * be read, so callers fail closed instead of treating an outage as "enabled".
 */
export async function isAccountEnabled(supabase: ServerSupabase, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("disabled_at").eq("id", userId).maybeSingle();
  if (error) {
    // Callers show a generic message; the database's own reason belongs in the server log.
    console.error("account status lookup failed", error.code, error.message);
    throw new Error("Could not check the account status.");
  }
  return data !== null && data.disabled_at === null;
}
