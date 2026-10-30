// Runs once, before the other e2e tests (a Playwright "setup" project, see playwright.config.ts).
//
// `npm run dev` compiles a route the first time somebody asks for it. The signed-in pages (/account,
// /admin, the 403 page) and the sign-in action are only ever reached by signing in, and the test
// workers would otherwise all compile them at the same moment, in the middle of their first sign-in.
// That, not the rate limiter, is what made early sign-ins stay on /login. Visiting each route once
// here moves that one-time cost out of the tests. (It does nothing against a production build.)
import { randomUUID } from "node:crypto";
import { test } from "@playwright/test";
import { createTestUser, deleteTestUsers, devProjectStatus, randomTestIp, signInThroughUi } from "./helpers/dev-project";

const dev = devProjectStatus();

test.skip(!dev.ready, dev.ready ? "" : dev.reason);
test.use({ extraHTTPHeaders: { "x-forwarded-for": randomTestIp() } });
test.afterAll(async () => {
  if (dev.ready) await deleteTestUsers();
});

test("compile the signed-in routes once", async ({ page }) => {
  // Cold compiles of several routes in a row: allow for them here, where it is a one-off cost.
  test.setTimeout(240_000);

  // Staff: login page and action, /admin, and every /account page.
  const staff = await createTestUser("warmup-staff", "staff");
  await signInThroughUi(page, staff, "/admin");
  for (const path of [
    "/account/addresses",
    "/account/addresses/new",
    `/account/addresses/${randomUUID()}/edit`, // not found: compiles the not-found page too
    "/account",
  ]) {
    await page.goto(path);
  }
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  // Customer on /admin: compiles the 403 page.
  const customer = await createTestUser("warmup-customer");
  await signInThroughUi(page, customer, "/admin");
});
