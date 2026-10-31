// Cookie-free Supabase client for PUBLIC catalog reads. It carries the anon key only and never a
// user session, so every query is answered by row-level security as an anonymous visitor, and it
// is safe inside `"use cache"` functions (which may not read cookies). Never use the service-role
// client for public pages.
import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { getSupabasePublicEnv } from "./env";

// A stalled database must fail a render (and show the error page) instead of hanging it.
const REQUEST_TIMEOUT_MS = 10_000;

export function createPublicClient() {
  const { url, anonKey } = getSupabasePublicEnv();
  return createSupabaseClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    },
  });
}
