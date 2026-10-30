import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { isAccountEnabled } from "@/lib/auth/account-status";
import { RECOVERY_COOKIE, RECOVERY_MAX_AGE_SECONDS } from "@/lib/auth/recovery";
import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

// Landing point of the emailed links (confirm email, reset password). Supports both flows Supabase
// can send: `token_hash` + `type` (works on any device; recommended email templates, see docs/AUTH.md)
// and `code` (the default templates; works in the browser that requested the email).
const ALLOWED_TYPES: EmailOtpType[] = ["signup", "email", "recovery"];

function redirectTo(request: NextRequest, path: string) {
  const url = request.nextUrl.clone();
  const target = new URL(path, "http://placeholder");
  url.pathname = target.pathname;
  url.search = target.search;
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const code = params.get("code");
  const next = params.get("next");

  const supabase = await createClient();
  let verified = false;

  if (tokenHash && type && ALLOWED_TYPES.includes(type as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    verified = !error;
  } else if (code && code.length <= 256) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  }
  if (!verified) return redirectTo(request, "/login?error=link");

  const { data } = await supabase.auth.getUser();
  if (!data.user || data.user.is_anonymous || !(await isAccountEnabled(supabase, data.user.id))) {
    await supabase.auth.signOut({ scope: "local" });
    return redirectTo(request, "/login?error=disabled");
  }

  // Recovery is recognised by the link type, or by the destination our reset email asks for.
  const recovery = type === "recovery" || next === "/reset-password";
  if (recovery) {
    (await cookies()).set(RECOVERY_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: RECOVERY_MAX_AGE_SECONDS,
    });
    return redirectTo(request, "/reset-password");
  }
  return redirectTo(request, safeNextPath(next));
}
