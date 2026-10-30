import { expect, test } from "@playwright/test";

// No Supabase project needed: a visitor has no session, so the proxy redirects before any lookup.
test.describe("visitors", () => {
  test("are redirected from /account to the sign-in page", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("are redirected from /admin to the sign-in page", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
  });

  test("are redirected from deeper account pages and keep the destination", async ({ page }) => {
    await page.goto("/account/addresses/new");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Faddresses%2Fnew$/);
  });

  test("get a real 307 redirect (not a page that hides content with JavaScript)", async ({ request }) => {
    for (const path of ["/account", "/account/addresses", "/admin"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(res.headers().location, path).toContain("/login?next=");
    }
  });

  test("see the sign-in, register and reset pages", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  });

  test("get field errors from the browser check before anything is sent", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter a valid email address").or(page.getByText("Enter your email address"))).toBeVisible();
    await expect(page.getByText("Enter your password")).toBeVisible();
  });

  test("cannot be sent to another site through ?next=", async ({ request }) => {
    // A visitor who is not signed in just gets the page; the destination is only used after sign-in
    // and is covered by the unit tests and the signed-in e2e test.
    const res = await request.get("/login?next=https://evil.example", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });
});
