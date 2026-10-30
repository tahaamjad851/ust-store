// Helpers for e2e tests that need real users in the hosted Supabase DEV project.
// They create users named ust-e2e-<run>-...@example.test (never real customers) and delete them
// afterwards. They refuse to run unless DB_TEST_PROJECT_REF names the project the app points at,
// the same guard as `npm run test:db`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import { randomBytes, randomInt } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const devRef = process.env.DB_TEST_PROJECT_REF;

export type DevProjectStatus = { ready: true } | { ready: false; reason: string };

export function devProjectStatus(): DevProjectStatus {
  if (!url || !anonKey || !serviceKey || !devRef) {
    return {
      ready: false,
      reason:
        "Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and DB_TEST_PROJECT_REF in .env.local (DEV project only).",
    };
  }
  if (!/^[a-z0-9]{20}$/.test(devRef) || new URL(url).hostname !== `${devRef}.supabase.co`) {
    throw new Error("Refusing to run: DB_TEST_PROJECT_REF must be your DEV project ref and match NEXT_PUBLIC_SUPABASE_URL.");
  }
  return { ready: true };
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const run = randomBytes(3).toString("hex");

export const service = () => createClient(url!, serviceKey!, noSession);

export type TestUser = { id: string; email: string; password: string };
const created: string[] = [];

export async function createTestUser(label: string, role?: "admin" | "staff"): Promise<TestUser> {
  const email = `ust-e2e-${run}-${label}-${randomBytes(2).toString("hex")}@example.test`;
  const password = `Aa1-${randomBytes(18).toString("base64url")}`;
  const admin = service();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `E2E ${label}` },
  });
  if (error || !data.user) throw new Error(`createTestUser ${label}: ${error?.message ?? "no user"}`);
  created.push(data.user.id);
  if (role) {
    const r = await admin.from("user_roles").insert({ user_id: data.user.id, role });
    if (r.error) throw new Error(`grant ${role}: ${r.error.message}`);
  }
  return { id: data.user.id, email, password };
}

export async function deleteTestUsers() {
  const admin = service();
  for (const id of created.splice(0)) await admin.auth.admin.deleteUser(id);
}

export async function disableAccount(userId: string) {
  const { error } = await service().from("profiles").update({ disabled_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw new Error(`disableAccount: ${error.message}`);
}

/** A supabase-js client signed in as this user (anon key, so RLS applies exactly as in the app). */
export async function clientFor(user: TestUser): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, noSession);
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`sign-in for ${user.email}: ${error.message}`);
  return client;
}

/** A random address in 203.0.113.0/24 (documentation range): gives each test file its own rate-limit bucket. */
export const randomTestIp = () => `203.0.113.${randomInt(1, 255)}`;

/** Signs in through the real login form and waits for the redirect. */
export async function signInThroughUi(page: Page, user: TestUser, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
