// Runs once per `playwright test` invocation, before the mobile and desktop projects: creates a test
// administrator, a test staff member and a test customer in the DEV project, signs each in ONCE (from this
// process, with the same call the website makes) and saves the browser sessions. admin.spec.ts then starts
// every test already signed in, so the number of sign-ins does not grow with the number of tests.
// Without the DEV keys it writes nothing and the admin tests skip themselves.
import { mkdirSync, writeFileSync } from "node:fs";
import { test as setup } from "@playwright/test";
import { createTestUser, devProjectStatus, signInWithSession } from "./helpers/dev-project";

export const AUTH_DIR = "tests/e2e/.auth";

setup("sign in the admin, staff and customer test users once", async ({ browser }) => {
  setup.skip(!devProjectStatus().ready, "Needs the DEV Supabase keys in .env.local (or a local Supabase stack).");
  mkdirSync(AUTH_DIR, { recursive: true });
  const users: Record<string, { id: string; email: string }> = {};
  for (const [label, role] of [["admin", "admin"], ["staff", "staff"], ["customer", undefined]] as const) {
    const user = await createTestUser(`adm-${label}`, role);
    users[label] = { id: user.id, email: user.email };
    const context = await browser.newContext();
    const page = await context.newPage();
    await signInWithSession(page, user, "/");
    await context.storageState({ path: `${AUTH_DIR}/${label}.json` });
    await context.close();
  }
  writeFileSync(`${AUTH_DIR}/users.json`, JSON.stringify(users));
});
