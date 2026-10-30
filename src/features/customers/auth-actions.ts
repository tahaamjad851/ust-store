"use server";

import type { AuthError } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAccountEnabled } from "@/lib/auth/account-status";
import { checkRateLimits, clientIp, rateLimitMessage } from "@/lib/auth/rate-limit";
import { safeNextPath } from "@/lib/auth/redirect";
import { RECOVERY_COOKIE } from "@/lib/auth/recovery";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { fieldErrorsFrom } from "@/lib/validation/form";
import { MESSAGES, type ActionResult } from "./types";

function isRateLimited(error: AuthError) {
  return error.status === 429 || error.code === "over_request_rate_limit";
}

export async function loginAction(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const { email, password, next } = parsed.data;

  const ip = await clientIp();
  const limit = await checkRateLimits([
    ["login_ip", ip],
    ["login_email_ip", `${email}|${ip}`],
    ["login_email", email],
  ]);
  if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") return { ok: false, message: MESSAGES.emailNotConfirmed };
    if (error && isRateLimited(error)) return { ok: false, message: rateLimitMessage({ allowed: false, reason: "limited", retryAfterSeconds: 300 }) };
    // Wrong password, unknown email, banned user: all look the same.
    return { ok: false, message: MESSAGES.invalidCredentials };
  }

  // Correct credentials, but a disabled account (or an anonymous user) must not get a session.
  let enabled = false;
  try {
    enabled = !data.user.is_anonymous && (await isAccountEnabled(supabase, data.user.id));
  } catch {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false, message: MESSAGES.unexpected };
  }
  if (!enabled) {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false, message: MESSAGES.accountDisabled };
  }

  redirect(safeNextPath(next));
}

export async function registerAction(input: unknown): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const { full_name, email, password } = parsed.data;

  const limit = await checkRateLimits([["register_ip", await clientIp()]]);
  if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name },
      emailRedirectTo: `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent("/account")}`,
    },
  });

  if (error) {
    if (error.code === "weak_password") {
      return { ok: false, fieldErrors: { password: "Choose a stronger password" } };
    }
    // An address that is already registered looks exactly like a new one.
    if (error.code !== "user_already_exists") {
      console.error("sign-up failed", error.code ?? error.status);
      return { ok: false, message: "We could not create your account. Please try again in a few minutes." };
    }
  }

  // Only when email confirmation is switched off in Supabase does sign-up return a session.
  if (data?.session) redirect("/account");
  return { ok: true, message: MESSAGES.registerSent };
}

export async function forgotPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const { email } = parsed.data;

  const ip = await clientIp();
  const limit = await checkRateLimits([
    ["forgot_ip", ip],
    ["forgot_email_ip", `${email}|${ip}`],
    ["forgot_email", email],
  ]);
  if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit) };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent("/reset-password")}`,
  });
  // The answer is the same whether or not the address has an account, and whether or not sending
  // worked, so this cannot be used to look up accounts. Failures are only logged.
  if (error) console.error("password reset request failed", error.code ?? error.status);

  return { ok: true, message: MESSAGES.forgotSent };
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const limit = await checkRateLimits([["reset_ip", await clientIp()]]);
  if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit) };

  // The reset page only works right after following a reset link: the confirm route sets this
  // short-lived cookie holding the id of the user who followed it. This guards the website's own
  // form; the Supabase "Secure password change" setting guards the Auth API itself (docs/AUTH.md).
  const cookieStore = await cookies();
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user || userData.user.is_anonymous || cookieStore.get(RECOVERY_COOKIE)?.value !== userData.user.id) {
    return { ok: false, message: MESSAGES.linkExpired };
  }

  try {
    if (!(await isAccountEnabled(supabase, userData.user.id))) {
      await supabase.auth.signOut({ scope: "local" });
      cookieStore.delete(RECOVERY_COOKIE);
      return { ok: false, message: MESSAGES.accountDisabled };
    }
  } catch {
    return { ok: false, message: MESSAGES.unexpected };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "weak_password") return { ok: false, fieldErrors: { password: "Choose a stronger password" } };
    if (error.code === "same_password") {
      return { ok: false, fieldErrors: { password: "Choose a password you have not used before" } };
    }
    console.error("password update failed", error.code ?? error.status);
    return { ok: false, message: MESSAGES.unexpected };
  }

  cookieStore.delete(RECOVERY_COOKIE);
  // Anyone else holding an old session for this account is signed out.
  await supabase.auth.signOut({ scope: "others" });
  redirect("/account");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(RECOVERY_COOKIE);
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
