// Runs once, before the other e2e tests (a Playwright "setup" project, see playwright.config.ts).
//
// `npm run dev` compiles a route the first time somebody asks for it. The signed-in pages (/account,
// /admin) are only ever reached by signing in, and the test workers would otherwise all compile them
// at the same moment, in the middle of their first sign-in. Visiting each route once here moves that
// one-time cost out of the tests. (It does nothing against a production build.)
//
// It signs in with a session (no login form): the form's own tests cover the form, and this test's job
// is compiling routes, so it must not be able to fail because of a sign-in race.
import { randomUUID } from "node:crypto";
import { test } from "@playwright/test";
import { createTestUser, deleteTestUsers, devProjectStatus, randomTestIp, signInWithSession } from "./helpers/dev-project";

const dev = devProjectStatus();

test.skip(!dev.ready, dev.ready ? "" : dev.reason);
test.use({ extraHTTPHeaders: { "x-forwarded-for": randomTestIp() } });
test.afterAll(async () => {
  if (dev.ready) await deleteTestUsers();
});

test("compile the signed-in routes once", async ({ page }) => {
  // Cold compiles of several routes in a row: allow for them here, where it is a one-off cost.
  test.setTimeout(240_000);

  // Staff, so that /admin renders its shell (no expected 403 in the dev log) and /account works too.
  const staff = await createTestUser("warmup-staff", "staff");
  await signInWithSession(page, staff, "/admin");
  for (const path of [
    "/account",
    "/account/addresses",
    "/account/addresses/new",
    `/account/addresses/${randomUUID()}/edit`, // not found: compiles the not-found page too
  ]) {
    await page.goto(path);
  }
});
