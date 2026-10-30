// Needs the hosted Supabase DEV project (see docs/AUTH.md, "Running the e2e tests"). Skipped, with the
// reason shown, when the keys are not in .env.local. Creates test users named ust-e2e-*@example.test.
import { expect, test } from "@playwright/test";
import { MESSAGES } from "../../src/features/customers/types";
import {
  clientFor,
  createTestUser,
  deleteTestUsers,
  devProjectStatus,
  disableAccount,
  randomTestIp,
  signInThroughUi,
} from "./helpers/dev-project";

const dev = devProjectStatus();

test.skip(!dev.ready, dev.ready ? "" : dev.reason);
// Each worker gets its own pretend visitor address, so the login rate limit of one test file never
// affects another.
test.use({ extraHTTPHeaders: { "x-forwarded-for": randomTestIp() } });
test.afterAll(async () => {
  if (dev.ready) await deleteTestUsers();
});

const alertWith = (page: import("@playwright/test").Page, text: string) =>
  page.getByRole("alert").filter({ hasText: text });

// The badge only. A plain getByText("Default") is a case-insensitive substring match, so it also finds
// the "Make default" button on every address that is not the default.
const defaultBadge = (card: import("@playwright/test").Locator) => card.getByText("Default", { exact: true });

test.describe("sign-in", () => {
  test("a wrong password shows the generic error, and an unknown email shows the very same one", async ({ page }) => {
    const user = await createTestUser("wrongpw");

    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(alertWith(page, MESSAGES.invalidCredentials)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.test`);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(alertWith(page, MESSAGES.invalidCredentials)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("too many wrong attempts for one email are refused", async ({ page }) => {
    const user = await createTestUser("ratelimit");
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password-1");
    // login_email allows 8 attempts per 15 minutes.
    for (let i = 0; i < 8; i++) {
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(alertWith(page, MESSAGES.invalidCredentials)).toBeVisible();
    }
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(alertWith(page, "Too many attempts")).toBeVisible();
    // Even the right password is refused while the limit applies.
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(alertWith(page, "Too many attempts")).toBeVisible();
  });

  test("a disabled user cannot sign in", async ({ page }) => {
    const user = await createTestUser("disabled");
    await disableAccount(user.id);

    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(alertWith(page, MESSAGES.accountDisabled)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    // No session was left behind.
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
  });

  test("an account disabled while signed in is blocked on the next protected request", async ({ page }) => {
    const user = await createTestUser("disabled-later");
    await signInThroughUi(page, user);
    await expect(page).toHaveURL(/\/account$/);

    await disableAccount(user.id);
    await page.goto("/account/addresses");
    await expect(page).toHaveURL(/\/login\?error=disabled/);
    await expect(alertWith(page, MESSAGES.accountDisabled)).toBeVisible();

    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
  });

  test("goes to the page the visitor wanted, but never to another site", async ({ page }) => {
    const user = await createTestUser("redirect");
    await signInThroughUi(page, user, "/account/addresses");
    await expect(page).toHaveURL(/\/account\/addresses$/);
    await page.getByRole("button", { name: "Sign out" }).click();

    await signInThroughUi(page, user, "//evil.example/steal");
    await expect(page).toHaveURL(/localhost:\d+\/account$/);
    await page.getByRole("button", { name: "Sign out" }).click();

    await signInThroughUi(page, user, "https://evil.example");
    await expect(page).toHaveURL(/localhost:\d+\/account$/);
  });

  test("signing out ends the session", async ({ page }) => {
    const user = await createTestUser("logout");
    await signInThroughUi(page, user);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
  });
});

test.describe("/admin", () => {
  test("a customer gets a 403 and no admin content", async ({ page }) => {
    const user = await createTestUser("customer-admin");
    await signInThroughUi(page, user);
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { name: "You do not have access to this page" })).toBeVisible();
    await expect(page.getByText("Admin panel")).toHaveCount(0);
  });

  test("a customer cannot open deeper admin URLs either", async ({ page }) => {
    const user = await createTestUser("customer-admin2");
    await signInThroughUi(page, user);
    const response = await page.goto("/admin/anything");
    expect([403, 404]).toContain(response?.status());
    await expect(page.getByTestId("admin-user-name")).toHaveCount(0);
  });

  test("a staff member sees the shell with their name and role", async ({ page }) => {
    const staff = await createTestUser("staff", "staff");
    await signInThroughUi(page, staff, "/admin");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("admin-user-name")).toHaveText("E2E staff");
    await expect(page.getByTestId("admin-user-role")).toHaveText("Staff");
  });

  test("an admin is labelled as such", async ({ page }) => {
    const admin = await createTestUser("admin", "admin");
    await signInThroughUi(page, admin, "/admin");
    await expect(page.getByTestId("admin-user-role")).toHaveText("Admin");
  });
});

test.describe("addresses", () => {
  test("a customer cannot read, change or delete another customer's address", async ({ page }) => {
    const alice = await createTestUser("alice");
    const bob = await createTestUser("bob");

    const aliceClient = await clientFor(alice);
    const inserted = await aliceClient
      .from("addresses")
      .insert({ full_name: "Alice Owner", phone: "03001234567", line1: "Alice's farm", city: "Okara", province: "Punjab" })
      .select("id")
      .single();
    expect(inserted.error).toBeNull();
    const aliceAddressId = inserted.data!.id as string;

    // Through the API as Bob (RLS is the only thing between them).
    const bobClient = await clientFor(bob);
    const read = await bobClient.from("addresses").select("id, line1").eq("id", aliceAddressId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
    const readAll = await bobClient.from("addresses").select("id");
    expect(readAll.data ?? []).toEqual([]);
    const update = await bobClient.from("addresses").update({ city: "Hacked" }).eq("id", aliceAddressId).select("id");
    expect(update.data ?? []).toEqual([]);
    const del = await bobClient.from("addresses").delete().eq("id", aliceAddressId).select("id");
    expect(del.data ?? []).toEqual([]);
    const forged = await bobClient
      .from("addresses")
      .insert({ user_id: alice.id, full_name: "Evil", phone: "03001234567", line1: "x", city: "Lahore", province: "Punjab" });
    expect(forged.error).not.toBeNull();

    // Alice's address is untouched.
    const still = await aliceClient.from("addresses").select("city").eq("id", aliceAddressId).single();
    expect(still.data?.city).toBe("Okara");

    // Through the website as Bob.
    await signInThroughUi(page, bob);
    const response = await page.goto(`/account/addresses/${aliceAddressId}/edit`);
    expect(response?.status()).toBe(404);
    await page.goto("/account/addresses");
    await expect(page.getByText("Alice's farm")).toHaveCount(0);
    await expect(page.getByText("No saved addresses yet")).toBeVisible();
  });

  test("a staff member's own address list does not show customers' addresses", async ({ page }) => {
    const customer = await createTestUser("addr-customer");
    const staff = await createTestUser("addr-staff", "staff");
    const customerClient = await clientFor(customer);
    const r = await customerClient
      .from("addresses")
      .insert({ full_name: "Customer", phone: "03001234567", line1: "Customer-only street", city: "Okara", province: "Punjab" });
    expect(r.error).toBeNull();

    await signInThroughUi(page, staff);
    await page.goto("/account/addresses");
    await expect(page.getByText("Customer-only street")).toHaveCount(0);
  });

  test("a customer can add, edit, set the default and delete addresses", async ({ page }) => {
    const user = await createTestUser("journey");
    await signInThroughUi(page, user);

    // Profile
    await expect(page.getByLabel("Full name")).toHaveValue("E2E journey");
    await page.getByLabel("Mobile number").fill("+92 300 7654321");
    await page.getByLabel("Business or shop name").fill("Journey Traders");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Your details have been saved." })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Mobile number")).toHaveValue("03007654321");
    await expect(page.getByLabel("Business or shop name")).toHaveValue("Journey Traders");

    // First address becomes the default on its own.
    await page.goto("/account/addresses/new");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Label").fill("Farm");
    await page.getByLabel("Receiver's name").fill("Ali Khan");
    await page.getByLabel("Mobile number").fill("0300 1234567");
    await page.getByLabel("Address", { exact: true }).fill("Chak 12/4L");
    await page.getByLabel("City").fill("Okara");
    await page.getByRole("button", { name: "Add address" }).click();
    await expect(page).toHaveURL(/\/account\/addresses$/);
    const farm = page.getByRole("listitem").filter({ hasText: "Chak 12/4L" });
    await expect(defaultBadge(farm)).toBeVisible();

    // Second address marked as default takes over.
    await page.getByRole("link", { name: "Add address" }).click();
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Label").fill("Workshop");
    await page.getByLabel("Receiver's name").fill("Ali Khan");
    await page.getByLabel("Mobile number").fill("0300 1234567");
    await page.getByLabel("Address", { exact: true }).fill("Shop 4, Main Bazaar");
    await page.getByLabel("City").fill("Depalpur");
    await page.getByLabel("Use this as my default delivery address").click();
    await page.getByRole("button", { name: "Add address" }).click();
    const workshop = page.getByRole("listitem").filter({ hasText: "Shop 4, Main Bazaar" });
    await expect(defaultBadge(workshop)).toBeVisible();
    await expect(defaultBadge(farm)).toHaveCount(0);

    // Make the first one the default again.
    await farm.getByRole("button", { name: /Make default/ }).click();
    await expect(defaultBadge(farm)).toBeVisible();
    await expect(defaultBadge(workshop)).toHaveCount(0);

    // Edit
    await farm.getByRole("link", { name: /Edit/ }).click();
    await page.waitForLoadState("networkidle");
    await page.getByLabel("City").fill("Renala Khurd");
    await page.getByRole("button", { name: "Save address" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Renala Khurd" })).toBeVisible();

    // Delete needs a second click; deleting the default promotes the other address.
    await farm.getByRole("button", { name: /Delete/ }).click();
    await farm.getByRole("button", { name: "Yes, delete" }).click();
    await expect(page.getByText("Chak 12/4L")).toHaveCount(0);
    await expect(defaultBadge(workshop)).toBeVisible();
  });

  // This is the form's own check (the same Zod schema, run in the browser). That the server action
  // re-validates is covered by tests/unit/account-actions.test.ts.
  test("the address form says what to fix before anything is saved", async ({ page }) => {
    const user = await createTestUser("invalid-address");
    await signInThroughUi(page, user);
    await page.goto("/account/addresses/new");
    await page.waitForLoadState("networkidle");
    // The receiver's name starts out as the account's name; empty it so that it is missing too.
    await page.getByLabel("Receiver's name").fill("");
    await page.getByRole("button", { name: "Add address" }).click();
    await expect(page.getByText("Enter the receiver's name")).toBeVisible();
    await expect(page.getByText("Enter a Pakistani mobile number, e.g. 0300 1234567")).toBeVisible();
  });
});
