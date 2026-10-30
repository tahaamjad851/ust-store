import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicEnv } from "./env";

// Server client for Server Components, Server Actions and Route Handlers (src/proxy.ts refreshes the session).
// Acts as the signed-in user (anon key + session cookie), so RLS still applies.
export async function createClient() {
  const { url, anonKey } = getSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. Safe to ignore: the proxy has already refreshed the session cookies for the request.
        }
      },
    },
  });
}
