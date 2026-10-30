import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "./env";

/**
 * Refreshes the Supabase session cookies for a request (called from src/proxy.ts) and says who
 * the visitor is according to their verified token. This is an optimistic check for redirects
 * only; authorization is done by the guards in src/lib/auth/session.ts.
 */
export async function updateSession(request: NextRequest) {
  const { url, anonKey } = getSupabasePublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, cacheHeaders) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // Responses that set auth cookies must not be cached by a CDN.
        for (const [key, value] of Object.entries(cacheHeaders)) response.headers.set(key, value);
      },
    },
  });

  // Verifies the JWT (and refreshes it when it has expired). No network call when there is no session.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  const signedIn = claims !== null && claims.is_anonymous !== true;

  return { response, signedIn };
}

/** A redirect that keeps the session cookies and cache headers the refresh just set. */
export function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) redirect.headers.set(header, value);
  }
  return redirect;
}
