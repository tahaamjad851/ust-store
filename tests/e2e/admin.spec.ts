// The admin journey, in a real browser, against the DEV project. Sessions come from admin.setup.ts (one
// sign-in per run, not per test). Everything the tests create is a DRAFT named after the project and run,
// so the public shop and the catalog tests never see it, and it is deleted afterwards.
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { devProjectStatus, service } from "./helpers/dev-project";

const status = devProjectStatus();
const sessions = { admin: "tests/e2e/.auth/admin.json", staff: "tests/e2e/.auth/staff.json", customer: "tests/e2e/.auth/customer.json" };
// Checked when a test runs, not when the file loads: admin.setup.ts writes the sessions in between.
const isReady = () => status.ready && existsSync(sessions.admin);

// A valid 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let tag = "";
let draft: { productId: string; variantId: string; sku: string; name: string };

// Playwright requires a destructuring pattern as the first argument.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
test.beforeAll(async ({ browserName: _browser }, info) => {
  if (!isReady()) return;
  tag = `${info.project.name}-${Date.now().toString(36)}`;
  const db = service();
  const category = await db.from("categories").select("id").eq("slug", "engine-oils").is("parent_id", null).single();
  const name = `ZZ E2E ${tag}`;
  const product = await db.from("products").insert({ slug: `zz-e2e-${tag}`, name, category_id: category.data!.id, status: "draft" }).select("id").single();
  const sku = `ZZ-E2E-${tag}`.toUpperCase();
  const variant = await db.from("product_variants").insert({ product_id: product.data!.id, sku, regular_price_paisa: 100_000, is_default: true }).select("id").single();
  // A cost that only an administrator may ever see (777.77 in an export).
  await db.from("product_variant_costs").insert({ variant_id: variant.data!.id, cost_paisa: 77_777 });
  draft = { productId: product.data!.id, variantId: variant.data!.id, sku, name };
});

test.afterAll(async () => {
  if (!isReady()) return;
  await service().from("products").delete().like("slug", `zz-e2e-${tag}%`);
});

async function openPrices(page: Page) {
  await page.goto("/admin/prices");
  await page.getByLabel("Search").fill(draft.sku);
  await expect(page.locator(`[data-row="${draft.variantId}"]`)).toBeVisible();
}

test.describe("administrator", () => {
  test.beforeEach(() => test.skip(!isReady(), "Needs the DEV project (or a local Supabase) and the sessions saved by admin.setup.ts"));
  test.use({ storageState: sessions.admin });

  test("daily prices: edit, save in one go, log, and confirm a large change", async ({ page }) => {
    await openPrices(page);
    const row = page.locator(`[data-row="${draft.variantId}"]`);
    await row.locator("input[id^=reg-]").fill("1050");
    await expect(page.getByTestId("save-bar")).toContainText("1 change not saved");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/Saved: 1 price/)).toBeVisible();

    const db = service();
    const now = await db.from("product_variants").select("regular_price_paisa").eq("id", draft.variantId).single();
    expect(Number(now.data!.regular_price_paisa)).toBe(105_000);
    const log = await db.from("price_changes").select("old_regular_paisa, new_regular_paisa, changed_by, source").eq("variant_id", draft.variantId).order("id", { ascending: false }).limit(1).single();
    expect(log.data).toMatchObject({ old_regular_paisa: 100_000, new_regular_paisa: 105_000, source: "daily_prices" });
    expect(log.data!.changed_by).not.toBeNull();

    // A change above the alert percentage needs a second confirmation; going back saves nothing.
    await openPrices(page);
    await page.locator(`[data-row="${draft.variantId}"] input[id^=reg-]`).fill("5000");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: "Large price change" })).toBeVisible();
    await page.getByRole("button", { name: "Go back and check" }).click();
    const same = await db.from("product_variants").select("regular_price_paisa").eq("id", draft.variantId).single();
    expect(Number(same.data!.regular_price_paisa)).toBe(105_000);
  });

  test("daily prices: a wrong value is shown on its row and nothing is saved", async ({ page }) => {
    await openPrices(page);
    await page.locator(`[data-row="${draft.variantId}"] input[id^=sale-]`).fill("999999");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("The sale price must be lower than the regular price")).toBeVisible();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(page.getByTestId("save-bar")).toContainText("No unsaved changes");
  });

  test("add a product with a photo and a second variant, archive it, delete it", async ({ page }) => {
    const name = `ZZ E2E created ${tag}`;
    const sku = `ZZ-E2E-NEW-${tag}`.toUpperCase();
    await page.goto("/admin/products/new");
    await page.locator("#p-product-name").fill(name);
    await page.locator("#p-product-category_id").selectOption({ label: "Engine Oils" });
    await page.locator("#p-product-description").fill("First line.\n\nSecond line.");
    await expect(page.getByTestId("description-preview")).toContainText("Second line.");
    await page.locator("#v-variant-name").fill("Default");
    await page.locator("#v-variant-sku").fill(sku);
    await page.locator("#v-variant-regular_price").fill("1,250.50");
    await page.locator("#v-variant-initial_stock").fill("6");
    await page.getByRole("button", { name: "Add product" }).click();
    await page.waitForURL(/\/admin\/products\/[0-9a-f-]+\?created=1/);
    const id = page.url().match(/products\/([0-9a-f-]+)/)![1];

    const db = service();
    const stored = await db.from("product_variants").select("sku, regular_price_paisa").eq("product_id", id).single();
    expect(stored.data).toMatchObject({ sku, regular_price_paisa: 125_050 });
    expect((await db.from("products").select("status").eq("id", id).single()).data!.status).toBe("draft");

    await page.locator("#new-photo").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByTestId("photo-preview")).toBeVisible();
    await page.getByLabel("Describe the photo").fill("A test photo");
    await page.getByRole("button", { name: "Upload photo" }).click();
    await expect(page.getByText("Photo added.")).toBeVisible({ timeout: 20_000 });
    const photo = await db.from("product_images").select("storage_path, is_primary, alt_text").eq("product_id", id).single();
    expect(photo.data).toMatchObject({ is_primary: true, alt_text: "A test photo" });
    expect(photo.data!.storage_path).toMatch(new RegExp(`^products/${id}/[a-f0-9]{32}\\.(png|webp|jpg)$`));

    // A text file that only claims to be a photo is refused by the server.
    await page.locator("#new-photo").setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
    await page.getByRole("button", { name: "Upload photo" }).click();
    // An upload is a server round trip (and a cold compile on the first run), so more than the default 5 s.
    await expect(page.getByText("That file is not a JPEG, PNG, WebP or AVIF photo.")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Add a variant" }).click();
    await page.locator("#v-name").fill("Large");
    await page.locator("#v-sku").fill(`${sku}-L`);
    await page.locator("#v-regular_price").fill("2000");
    await page.getByRole("button", { name: "Add variant" }).click();
    await expect(page.getByText("Variant added.")).toBeVisible();

    await page.getByRole("button", { name: "Archive this product" }).click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.getByText(/Product archived/)).toBeVisible();
    // Saving the details afterwards must not bring the status back.
    await page.locator("#p-name").fill(`${name} renamed`);
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByText("Product saved.")).toBeVisible();
    expect((await db.from("products").select("status").eq("id", id).single()).data!.status).toBe("archived");

    await page.getByRole("button", { name: "Delete this product" }).click();
    await page.getByRole("button", { name: "Delete for good" }).click();
    await page.waitForURL(/\/admin\/products$/);
    expect((await db.from("products").select("id").eq("id", id)).data).toEqual([]);
    expect((await db.from("product_images").select("id").eq("product_id", id)).data).toEqual([]);
  });

  test("stock: a reason is required and the change is in the history", async ({ page }) => {
    await page.goto("/admin/stock");
    await page.getByLabel("Search").fill(draft.sku);
    await page.getByRole("button", { name: /^Change stock of/ }).first().click();
    await page.getByLabel("Quantity").fill("3");
    await page.getByRole("button", { name: "Record stock change" }).click();
    await expect(page.getByText(/short reason/)).toBeVisible();
    await page.getByLabel("Reason").fill("E2E delivery");
    await page.getByRole("button", { name: "Record stock change" }).click();
    await expect(page.getByText("Added 3 to stock.")).toBeVisible();
    await page.goto(`/admin/stock/${draft.variantId}`);
    await expect(page.getByText("E2E delivery")).toBeVisible();
  });

  test("CSV: the check writes nothing, the import is applied once confirmed, an unknown category is refused", async ({ page }) => {
    const slug = `zz-e2e-${tag}-csv`;
    const header = "sku,product_slug,product_name,category,regular_price,status";
    const good = `${header}\r\n${`ZZ-E2E-${tag}-CSV`.toUpperCase()},${slug},ZZ E2E csv ${tag},engine-oils,1500,draft\r\n`;
    const bad = `${header}\r\n${`ZZ-E2E-${tag}-CSV`.toUpperCase()},${slug},ZZ E2E csv ${tag},no-such-category,abc,draft\r\n`;
    await page.goto("/admin/import-export");
    await page.locator("#csv-file").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from(bad) });
    await page.getByRole("button", { name: "Check the file" }).click();
    await expect(page.getByText("The file has problems")).toBeVisible();
    await expect(page.getByTestId("import-report")).toContainText("Unknown category");
    await expect(page.getByRole("button", { name: "Import these rows" })).toHaveCount(0);

    await page.locator("#csv-file").setInputFiles({ name: "good.csv", mimeType: "text/csv", buffer: Buffer.from(good) });
    await page.getByRole("button", { name: "Check the file" }).click();
    await expect(page.getByText("The file is ready to import")).toBeVisible();
    const db = service();
    expect((await db.from("products").select("id").eq("slug", slug)).data).toEqual([]);
    await page.getByRole("button", { name: "Import these rows" }).click();
    await expect(page.getByText(/Imported 1 variant in 1 product/)).toBeVisible();
    expect((await db.from("products").select("status").eq("slug", slug).single()).data!.status).toBe("draft");
  });

  test("the export includes cost prices for an administrator", async ({ page }) => {
    const res = await page.request.get("/admin/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toContain("attachment");
    expect(await res.text()).toContain("777.77");
  });

  test("the settings page validates", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Couriers" })).toBeVisible();
    await expect(page.locator("#s-whatsapp_number")).toBeVisible();
    await page.locator("#s-whatsapp_number").fill("123");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Enter a Pakistani mobile number").first()).toBeVisible();
  });
});

test.describe("staff", () => {
  test.beforeEach(() => test.skip(!isReady(), "Needs the DEV project (or a local Supabase) and the sessions saved by admin.setup.ts"));
  test.use({ storageState: sessions.staff });

  test("can work on prices and products but never sees costs, deletes or settings", async ({ page }) => {
    const settings = await page.goto("/admin/settings");
    expect(settings!.status()).toBe(403);

    await page.goto(`/admin/products/${draft.productId}`);
    await expect(page.locator("#p-name")).toHaveValue(draft.name);
    await expect(page.getByLabel("Cost price")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete this product" })).toHaveCount(0);
    await expect(page.getByText("Only an administrator can delete products.")).toBeVisible();

    await openPrices(page);
    await page.locator(`[data-row="${draft.variantId}"] input[id^=reg-]`).fill("1060");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/Saved: 1 price/)).toBeVisible();
  });

  test("the export does not contain cost prices", async ({ page }) => {
    const res = await page.request.get("/admin/export");
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain(draft.sku);
    expect(text).not.toContain("777.77");
  });
});

test.describe("customer", () => {
  test.beforeEach(() => test.skip(!isReady(), "Needs the DEV project (or a local Supabase) and the sessions saved by admin.setup.ts"));
  test.use({ storageState: sessions.customer });

  test("gets a 403 on every admin page and on the export", async ({ page }) => {
    for (const path of ["/admin", "/admin/prices", "/admin/products", "/admin/stock", "/admin/import-export", "/admin/settings"]) {
      const res = await page.goto(path);
      expect(res!.status(), path).toBe(403);
    }
    const exportRes = await page.request.get("/admin/export");
    expect(exportRes.status()).toBe(403);
  });
});
