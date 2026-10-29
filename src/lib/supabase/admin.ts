// Service-role client: bypasses RLS. Server-only: importing this from a Client Component
// fails the build (`server-only`). Use only in Server Actions / Route Handlers / jobs that have
// already checked authorization, e.g. guest checkout calling place_order() after rate limiting.
import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "./env";

export function createAdminClient() {
  const { url } = getSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY. Set it in .env.local (server only, never NEXT_PUBLIC_).");
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
