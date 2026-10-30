import type { NextRequest } from "next/server";
import { loginUrl, safeNextPath } from "@/lib/auth/redirect";
import { redirectWithCookies, updateSession } from "@/lib/supabase/proxy";

const isUnder = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

// Session refresh on every request that can depend on the signed-in user, plus a first,
// optimistic redirect for visitors. The real authorization checks are the guards in
// src/lib/auth/session.ts, called by the /account and /admin layouts, pages and server actions.
export async function proxy(request: NextRequest) {
  const { response, signedIn } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && (isUnder(pathname, "/account") || isUnder(pathname, "/admin"))) {
    const target = new URL(loginUrl(`${pathname}${search}`), request.url);
    return redirectWithCookies(target, response);
  }

  // Already signed in: skip the sign-in pages. (Not when an error is shown, e.g. a disabled account.)
  const guestOnly = ["/login", "/register", "/forgot-password"].includes(pathname);
  if (signedIn && guestOnly && !request.nextUrl.searchParams.has("error")) {
    const target = new URL(safeNextPath(request.nextUrl.searchParams.get("next")), request.url);
    return redirectWithCookies(target, response);
  }

  return response;
}

export const config = {
  matcher: ["/account/:path*", "/admin/:path*", "/login", "/register", "/forgot-password", "/reset-password"],
};
