// Server-side session and authorization guards. The proxy only does an optimistic redirect;
// these are the checks that count. Call them in every protected layout, page and server action,
// close to the data: layouts do not re-render on client navigation, so a layout check alone
// is not enough.
import "server-only";

import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { connection } from "next/server";
import { loginUrl } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

export type StaffRole = "admin" | "staff";

export type SessionUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  companyName: string | null;
  /** null for customers. */
  role: StaffRole | null;
};

export type AuthState = { status: "anonymous" } | { status: "disabled" } | { status: "ok"; user: SessionUser };

/**
 * Asks Supabase Auth to verify the session (not just decode the cookie), then loads the profile
 * and role through RLS. Memoised per request. Anonymous Supabase users never count as signed in.
 */
export const getAuthState = cache(async (): Promise<AuthState> => {
  // supabase-js reads the clock to see whether the session has expired. Cache Components treats that
  // as an unstable value in any prerender, including the dev-time validation render where cookies are
  // already available. Whose session this is can only be known for a real request, so wait for one.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user || user.is_anonymous) return { status: "anonymous" };

  const [profile, role] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, company_name, disabled_at").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
  ]);
  // A database outage must not look like "signed out" or "customer": fail closed with an error page.
  if (profile.error || role.error) {
    console.error("account lookup failed", profile.error?.code ?? role.error?.code, profile.error?.message ?? role.error?.message);
    throw new Error("Could not load the account.");
  }

  if (!profile.data || profile.data.disabled_at) return { status: "disabled" };

  return {
    status: "ok",
    user: {
      id: user.id,
      email: user.email ?? null,
      fullName: profile.data.full_name,
      phone: profile.data.phone,
      companyName: profile.data.company_name,
      role: role.data?.role ?? null,
    },
  };
});

type GuardOptions = {
  /** Where to send the visitor after signing in. Defaults to /account. */
  next?: string;
};

/** Signed-in, enabled customer or staff. Visitors go to /login, disabled accounts are signed out. */
export async function requireUser(options: GuardOptions = {}): Promise<SessionUser> {
  const state = await getAuthState();
  if (state.status === "anonymous") redirect(loginUrl(options.next));
  if (state.status === "disabled") redirect("/auth/disabled");
  return state.user;
}

/** Admin or staff. Customers get a 403 page. */
export async function requireStaff(options: GuardOptions = {}): Promise<SessionUser> {
  const user = await requireUser(options);
  if (!user.role) forbidden();
  return user;
}

/** Admin only (roles, settings, bank accounts, refunds). */
export async function requireAdmin(options: GuardOptions = {}): Promise<SessionUser> {
  const user = await requireUser(options);
  if (user.role !== "admin") forbidden();
  return user;
}
