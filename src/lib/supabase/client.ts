import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "./env";

// Browser client for Client Components. Uses the anon key only; all access is governed by RLS.
export function createClient() {
  const { url, anonKey } = getSupabasePublicEnv();
  return createBrowserClient(url, anonKey);
}
