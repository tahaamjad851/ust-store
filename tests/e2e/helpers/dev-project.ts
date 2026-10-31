// Helpers for e2e tests that need real users in the hosted Supabase DEV project.
// They create users named ust-e2e-<run>-...@example.test (never real customers) and delete them
// afterwards. They refuse to run unless DB_TEST_PROJECT_REF names the project the app points at,
// the same guard as `npm run test:db`.
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, type ConsoleMessage, type Page, type Request } from "@playwright/test";
import { randomBytes, randomInt } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const devRef = process.env.DB_TEST_PROJECT_REF;

export type DevProjectStatus = { ready: true } | { ready: false; reason: string };

export function devProjectStatus(): DevProjectStatus {
  const local = url !== undefined && ["127.0.0.1", "localhost"].includes(new URL(url).hostname);
  if (!url || !anonKey || !serviceKey || (!devRef && !local)) {
    return {
      ready: false,
      reason:
        "Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and DB_TEST_PROJECT_REF in .env.local (DEV project only).",
    };
  }
  // A Supabase stack on this machine (`supabase start`, or a local stand-in) cannot be production.
  if (["127.0.0.1", "localhost"].includes(new URL(url).hostname)) return { ready: true };
  if (!devRef || !/^[a-z0-9]{20}$/.test(devRef) || new URL(url).hostname !== `${devRef}.supabase.co`) {
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

/**
 * Signs in through the real login form and waits for the redirect.
 *
 * Signing in is several round trips to the hosted DEV project (rate limits, password check, profile,
 * then the first render of the target page), so it is awaited as a navigation, not as an assertion
 * with the 5 s expect timeout. A refusal shows up as an alert on the form; fail at once with its text
 * instead of waiting for the test to time out.
 */
export async function signInThroughUi(page: Page, user: TestUser, next?: string) {
  // What the browser saw, so a refusal can be explained instead of just reported.
  const seen: string[] = [];
  const onConsole = (m: ConsoleMessage) => m.type() === "error" && seen.push(`console.error: ${m.text().slice(0, 200)}`);
  const onFailed = (r: Request) => seen.push(`request failed: ${r.method()} ${new URL(r.url()).pathname} ${r.failure()?.errorText ?? ""}`);
  page.on("console", onConsole);
  page.on("requestfailed", onFailed);

  try {
    await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);

    const refusal = page.getByRole("alert").filter({ hasText: /\S/ });
    const left = page.waitForURL((url) => !url.pathname.startsWith("/login"));
    const refused = refusal.waitFor().then(async () => {
      const text = await refusal.first().innerText();
      // Ask Supabase directly whether this email and password are valid: tells "the test user is
      // broken" apart from "the website refused a valid user".
      const direct = await clientFor(user).then(
        () => "accepted by Supabase Auth when asked directly",
        (e: Error) => `rejected by Supabase Auth when asked directly (${e.message})`,
      );
      throw new Error(
        `Sign-in for ${user.email} was refused: ${text}\n  The credentials were ${direct}.\n  Browser: ${seen.join("; ") || "nothing unusual"}`,
      );
    });
    // Whichever loses must not become an unhandled rejection when the page closes.
    left.catch(() => {});
    refused.catch(() => {});

    await page.getByRole("button", { name: "Sign in" }).click();
    await Promise.race([left, refused]);
  } finally {
    page.off("console", onConsole);
    page.off("requestfailed", onFailed);
  }
}

/**
 * Starts a signed-in browser session without the login form: signs the user in once from the test
 * process (the same call the website makes) and gives the browser the cookies `@supabase/ssr` would
 * have set, then opens `next` (default /account). For tests where signing in is only the set-up, not
 * the thing being tested; the login form itself is covered by the "sign-in" tests.
 */
export async function signInWithSession(page: Page, user: TestUser, next = "/account") {
  const jar = new Map<string, string>();
  const supabase = createServerClient(url!, anonKey!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) jar.set(name, value);
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`sign-in for ${user.email}: ${error.message} (${error.code ?? error.status})`);
  // Cookies are handed over by a listener; make sure it has run.
  await supabase.auth.getSession();
  if (jar.size === 0) throw new Error(`sign-in for ${user.email} produced no session cookies`);

  const origin = new URL(test.info().project.use.baseURL ?? "http://localhost:3000").origin;
  await page.context().addCookies([...jar].map(([name, value]) => ({ name, value, url: origin })));
  await page.goto(next);
}
