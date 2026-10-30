import type { createClient } from "@/lib/supabase/server";

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * False only when the account is explicitly disabled. Throws when the database cannot be read or
 * there is no profile row (every account has one, so that is a fault, not a disabled account), so
 * callers fail closed instead of treating an outage as "enabled" or a fault as "disabled".
 */
export async function isAccountEnabled(supabase: ServerSupabase, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("disabled_at").eq("id", userId).maybeSingle();
  if (error) {
    // Callers show a generic message; the database's own reason belongs in the server log.
    console.error("account status lookup failed", error.code, error.message);
    throw new Error("Could not check the account status.");
  }
  if (!data) {
    console.error("account status lookup found no profile");
    throw new Error("Could not check the account status.");
  }
  return data.disabled_at === null;
}
