// Phase 4 in a real browser, against the DEV project (needs the migration 20261102100000_orders.sql applied):
//   1. a guest buys one product, cash on delivery, from the product page to the confirmation page
//   2. the tracking link shows status, courier and tracking number, and nothing private
//   3. an administrator processes an order from New to Delivered
//
//   npx playwright test tests/e2e/orders.spec.ts --project=desktop
//   npx playwright test tests/e2e/orders.spec.ts --project=mobile
//
// The product is a fixture made here (published, in the seeded engine-oils category) and archived afterwards. The administrator
// session comes from admin.setup.ts; an extra administrator, created here, is used to put test orders in a state
// (through the real database functions, as the signed-in staff member).
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { clientFor, createTestUser, deleteTestUsers, devProjectStatus, randomTestIp, service, type TestUser } from "./helpers/dev-project";

// `next dev` compiles a route on its first visit, so the default 5 s is tight for the first navigation to each page.
const expect = baseExpect.configure({ timeout: 15_000 });

const status = devProjectStatus();
const adminSession = "tests/e2e/.auth/admin.json";
const customerSession = "tests/e2e/.auth/customer.json";
const isReady = () => status.ready && existsSync(adminSession);

const PRICE = 150_000; // Rs 1,500
let tag = "";
let fixture: { name: string; slug: string; variantId: string; sku: string };
let staffUser: TestUser;
let staffDb: Awaited<ReturnType<typeof clientFor>>;

const visible = (page: Page, id: string) => page.locator(`[data-testid="${id}"]:visible`);
/** The page must fit the screen: on a phone a wide table or a long unbroken word would make it scroll sideways. */
const fitsScreen = async (page: Page, what: string) => {
  const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll, `${what} scrolls sideways (${scroll}px wide on a ${inner}px screen)`).toBeLessThanOrEqual(inner);
};
const phone = () => `03${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
const token = () => createHmac("sha256", "e2e").update(`${tag}-${Math.random()}`).digest("hex");

/** An order in the database, as a guest would have placed it, with a link token we know. */
async function seedOrder(quantity = 1) {
  const key = crypto.randomUUID();
  const linkToken = token();
  const res = await service().rpc("place_order_as_guest", {
    p_idempotency_key: key,
    p_items: [{ variant_id: fixture.variantId, quantity }],
    p_customer: { full_name: `E2E Buyer ${tag}`, phone: phone(), email: null },
    p_shipping_address: { line1: "Chak 12/4L, near the canal", city: "Okara", province: "Punjab", area: "Behind the school" },
    p_delivery_method_id: await deliveryMethod(),
    p_payment_method: "cod",
    p_coupon_code: null,
    p_customer_notes: "Please call before coming",
    p_tracking_token: linkToken,
  });
  if (res.error) throw new Error(`seedOrder: ${res.error.message}`);
  return { id: res.data.order_id as string, number: res.data.order_number as string, token: linkToken };
}

async function deliveryMethod() {
  const { data } = await service().from("delivery_methods").select("id").eq("is_active", true).order("sort_order").limit(1).single();
  return data!.id as string;
}

async function inventory() {
  const { data } = await service().from("inventory").select("on_hand, reserved").eq("variant_id", fixture.variantId).single();
  return data as { on_hand: number; reserved: number };
}

// Playwright requires a destructuring pattern as the first argument.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
test.beforeAll(async ({ browserName: _browser }, info) => {
  if (!isReady()) return;
  // Each worker makes its own fixture; the random part keeps parallel workers apart.
  tag = `${info.project.name}-${randomBytes(4).toString('hex')}`;
  const db = service();

  // Is the Phase 4 migration there? One clear failure instead of a confusing one halfway through a test.
  const probe = await db.from("orders").select("shipping_confirmed").limit(1);
  if (probe.error) {
    throw new Error(
      `The orders migration is not applied on this project (${probe.error.message}). Apply supabase/migrations/20261102100000_orders.sql and run its verification queries first (docs/ORDERS.md).`,
    );
  }

  staffUser = await createTestUser(`ord-staff-${info.project.name}`, "admin");
  staffDb = await clientFor(staffUser);

  // An existing, active category: the shop caches its category list for minutes, so a category made here would not be
  // visible yet (the same choice as admin.spec.ts, which also relies on the DEMO seed).
  const category = await db.from("categories").select("id").eq("slug", "engine-oils").is("parent_id", null).single();
  if (category.error) throw new Error(`category engine-oils (the DEMO seed): ${category.error.message}`);
  const name = `ZZ E2E Order ${tag}`;
  const slug = `zz-e2e-order-${tag}`;
  const product = await db.from("products").insert({ slug, name, category_id: category.data.id, status: "published" }).select("id").single();
  if (product.error) throw new Error(`product: ${product.error.message}`);
  const sku = `ZZ-E2E-ORD-${tag}`.toUpperCase();
  const variant = await db.from("product_variants").insert({ product_id: product.data.id, sku, regular_price_paisa: PRICE, is_default: true }).select("id").single();
  if (variant.error) throw new Error(`variant: ${variant.error.message}`);
  const stock = await staffDb.rpc("adjust_stock", { p_variant_id: variant.data.id, p_on_hand_delta: 40, p_movement_type: "receive", p_reason: `E2E ${tag} opening stock` });
  if (stock.error) throw new Error(`stock: ${stock.error.message}`);
  fixture = { name, slug, variantId: variant.data.id, sku };
});

test.afterAll(async () => {
  if (!isReady() || !fixture) return;
  const db = service();
  // Ordered products cannot be deleted (by design); archiving takes them out of the shop.
  await db.from("products").update({ status: "archived" }).like("slug", `zz-e2e-order-${tag}%`);
  await deleteTestUsers();
});

test.describe("a guest buys with cash on delivery", () => {
  test.beforeEach(() => test.skip(!isReady(), "Needs the DEV project (or a local Supabase) and the sessions saved by admin.setup.ts"));
  test.use({ extraHTTPHeaders: { "x-forwarded-for": randomTestIp() } });

  test("from the product page to the confirmation page", async ({ page }) => {
    const before = await inventory();
    const myPhone = phone();

    await page.goto(`/products/${fixture.slug}`);
    await page.getByRole("button", { name: `Add ${fixture.name} to cart` }).first().click();
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "Order summary" })).toBeVisible();

    // Only cash on delivery is offered at launch; the delivery charge is not calculated here.
    await expect(page.getByLabel(/Cash on delivery/)).toBeVisible();
    await expect(page.getByText(/Bank transfer|EasyPaisa/)).toHaveCount(0);
    await expect(page.getByText("Delivery charge will be confirmed by phone.").first()).toBeVisible();

    await page.getByLabel("Mobile number").fill(myPhone);
    await page.getByLabel("Full name").fill(`E2E Guest ${tag}`);
    await page.getByLabel("City / tehsil").fill("Okara");
    await page.getByLabel("Address", { exact: true }).fill("Chak 12/4L, near the canal");

    // The review shows what will be sent.
    const review = page.getByTestId("checkout-review");
    await expect(review).toContainText(`E2E Guest ${tag}`);
    await expect(review).toContainText("Chak 12/4L");
    await expect(review).toContainText("Cash on delivery");

    await fitsScreen(page, "the checkout");

    // A double click must not place two orders.
    await page.getByTestId("place-order").dblclick();
    await page.waitForURL(/\/order\/[0-9a-f]{64}\?placed=1/);

    await expect(page.getByTestId("order-placed-banner")).toBeVisible();
    const number = (await page.getByTestId("order-number").innerText()).trim();
    expect(number).toMatch(/^UST-\d{4}-\d{6}$/);
    await expect(page.getByTestId("order-total")).toHaveText("Rs 1,500");
    await expect(page.getByTestId("delivery-line")).toHaveText("Delivery charge will be confirmed by phone");
    await expect(visible(page, "order-status")).toHaveText("Order received");

    // The cart was emptied.
    expect(await page.evaluate(() => window.localStorage.getItem("ust-cart-v2"))).toMatch(/^\[\]$/);

    // The database has exactly one order, priced there, unconfirmed delivery, stock reserved once.
    const db = service();
    const orders = await db.from("orders").select("order_number, status, payment_method, payment_status, subtotal_paisa, shipping_paisa, total_paisa, shipping_confirmed, user_id").eq("customer_phone", myPhone);
    expect(orders.data).toHaveLength(1);
    expect(orders.data![0]).toMatchObject({ order_number: number, status: "pending", payment_method: "cod", payment_status: "unpaid", shipping_paisa: 0, shipping_confirmed: false, user_id: null });
    expect(Number(orders.data![0].total_paisa)).toBe(PRICE);
    expect((await inventory()).reserved).toBe(before.reserved + 1);

    // The owner notification was attempted (sent, or recorded as failed when e-mail is not configured).
    await expect
      .poll(async () => (await db.from("notifications").select("status").eq("template", "owner_new_order").eq("order_id", (await db.from("orders").select("id").eq("order_number", number).single()).data!.id)).data?.length ?? 0, {
        timeout: 20_000,
      })
      .toBe(1);
  });
});

test.describe("the tracking link", () => {
  test.beforeEach(() => test.skip(!isReady(), "Needs the DEV project (or a local Supabase) and the sessions saved by admin.setup.ts"));

  test("shows the status, courier and tracking number, and nothing private", async ({ page }) => {
    const order = await seedOrder(2);
    // Put the order in a state worth tracking, as signed-in staff.
    for (const s of ["confirmed", "dispatched"]) expect((await staffDb.rpc("set_order_status", { p_order_id: order.id, p_status: s })).error).toBeNull();
    expect((await staffDb.rpc("set_order_shipment", { p_order_id: order.id, p_courier: "TCS", p_tracking_number: "E2E-TRK-12345" })).error).toBeNull();
    expect((await staffDb.rpc("add_order_note", { p_order_id: order.id, p_note: "INTERNAL-SECRET-REMARK" })).error).toBeNull();
    const buyerPhone = (await service().from("orders").select("customer_phone").eq("id", order.id).single()).data!.customer_phone as string;

    const response = await page.goto(`/order/${order.token}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("order-number")).toHaveText(order.number);
    await expect(visible(page, "order-status")).toHaveText("Dispatched");
    await expect(page.getByTestId("order-timeline")).toContainText("Confirmed");
    await expect(page.getByTestId("courier-name")).toHaveText("TCS");
    await expect(page.getByTestId("tracking-number")).toHaveText("E2E-TRK-12345");
    await expect(page.getByTestId("delivery-line")).toHaveText("Delivery charge will be confirmed by phone");
    await expect(page.getByTestId("order-lines")).toContainText(fixture.name);
    await fitsScreen(page, "the tracking page");
    // Not a "just placed" visit.
    await expect(page.getByTestId("order-placed-banner")).toHaveCount(0);

    // Nothing the customer should not see: internal notes, the phone number, the full street address, costs.
    const html = await page.content();
    expect(html).not.toContain("INTERNAL-SECRET-REMARK");
    expect(html).not.toContain(buyerPhone);
    expect(html).not.toContain("Chak 12/4L");
    expect(html).not.toContain("Please call before coming");
    expect(html).not.toMatch(/cost_paisa|tracking_token_hash|idempotency/i);
    // The page is not indexable and does not leak its address as a referrer.
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).toMatch(/noindex/);
    expect(await page.locator('meta[name="referrer"]').getAttribute("content")).toBe("no-referrer");

    // A made-up link, a link of the wrong shape and a path trick all give the same not-found page. (`next dev` answers 404;
    // a production server may answer 200 for the first request to an unknown link because the page shell streams first,
    // so the test checks the page, not only the status.)
    for (const bad of [token(), "a".repeat(63), "not-a-token", "%2e%2e%2fadmin", "%27%20or%201%3D1%20--"]) {
      const res = await page.goto(`/order/${bad}`);
      expect([200, 404], bad).toContain(res?.status());
      await expect(page.getByRole("heading", { name: "We couldn't find that page" }), bad).toBeVisible();
      await expect(page.getByTestId("order-number")).toHaveCount(0);
    }
  });
});

test.describe("an administrator processes an order", () => {
  test.beforeEach(() => test.skip(!isReady(), "Needs the DEV project (or a local Supabase) and the sessions saved by admin.setup.ts"));
  test.use({ storageState: adminSession });

  test("New > Contacted > Confirmed, delivery charge, courier, Dispatched, cash collected, Delivered", async ({ page }) => {
    const before = await inventory();
    const order = await seedOrder(2);
    expect((await inventory()).reserved).toBe(before.reserved + 2);

    // Find it in the list by its number.
    await page.goto("/admin/orders");
    await page.getByLabel("Order number, phone or name").fill(order.number);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByTestId("orders-list")).toContainText(order.number);
    await page.getByTestId("orders-list").getByRole("link").first().click();
    await page.waitForURL(`**/admin/orders/${order.id}`);

    await expect(visible(page, "order-status")).toHaveText("New");
    await fitsScreen(page, "the admin order page");
    await expect(page.getByTestId("customer-name")).toContainText(`E2E Buyer ${tag}`);
    await expect(page.getByTestId("call-customer")).toHaveAttribute("href", /^tel:\+92\d{10}$/);
    await expect(page.getByTestId("whatsapp-customer")).toHaveAttribute("href", /^https:\/\/wa\.me\/92\d{10}\?text=/);
    await expect(page.getByTestId("order-address")).toContainText("Okara");
    await expect(page.getByTestId("order-lines")).toContainText(fixture.sku);
    // Invalid moves are not offered: a new order cannot be dispatched or delivered.
    await expect(page.getByRole("button", { name: "Mark as Dispatched" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark as Delivered" })).toHaveCount(0);

    await page.getByRole("button", { name: "Mark as Contacted" }).click();
    await expect(visible(page, "order-status")).toHaveText("Contacted");
    await page.getByRole("button", { name: "Mark as Confirmed" }).click();
    await expect(visible(page, "order-status")).toHaveText("Confirmed");

    // The delivery charge agreed by phone: the total is recalculated (2 x Rs 1,500 + Rs 850).
    await expect(page.getByTestId("delivery-line")).toHaveText("Delivery charge will be confirmed by phone");
    await page.getByLabel("Delivery charge (Rs)").fill("850");
    await expect(page.getByTestId("charge-preview")).toHaveText("Rs 3,850");
    await page.getByRole("button", { name: "Save delivery charge" }).click();
    await expect(page.getByText("Delivery charge saved")).toBeVisible();
    await expect(page.getByTestId("order-total")).toHaveText("Rs 3,850");

    await page.getByLabel("Courier", { exact: true }).selectOption("TCS");
    await page.getByLabel("Tracking number").fill("E2E-ADM-777");
    await page.getByRole("button", { name: "Save courier and tracking" }).click();
    await expect(page.getByText("Courier and tracking number saved")).toBeVisible();

    // Cash cannot be collected before the order has left.
    await expect(page.getByRole("button", { name: "Mark cash as collected" })).toHaveCount(0);
    await page.getByRole("button", { name: "Mark as Dispatched" }).click();
    await expect(visible(page, "order-status")).toHaveText("Dispatched");
    await page.getByRole("button", { name: "Mark cash as collected" }).click();
    await expect(page.getByText("Cash on delivery marked as collected")).toBeVisible();
    await page.getByRole("button", { name: "Mark as Delivered" }).click();
    await expect(visible(page, "order-status")).toHaveText("Delivered");

    // Internal note (staff only).
    await page.getByLabel("Add an internal note").fill("Customer paid the courier");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByTestId("internal-notes")).toContainText("Customer paid the courier");

    // A delivered order offers no cancel and no further delivery-charge change.
    await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
    await expect(page.getByLabel("Delivery charge (Rs)")).toHaveCount(0);
    // The history lists what was done and by whom.
    await expect(page.getByTestId("order-history")).toContainText("Status Confirmed → Dispatched");
    await expect(page.getByTestId("order-history")).toContainText("Delivery charge");

    // The database agrees: status, money, payment, stock deducted once, one audit row per change.
    const db = service();
    const row = await db.from("orders").select("status, shipping_paisa, total_paisa, payment_status, shipping_confirmed, stock_state").eq("id", order.id).single();
    expect(row.data).toMatchObject({ status: "delivered", payment_status: "paid", shipping_confirmed: true, stock_state: "deducted" });
    expect(Number(row.data!.shipping_paisa)).toBe(85_000);
    expect(Number(row.data!.total_paisa)).toBe(2 * PRICE + 85_000);
    const after = await inventory();
    expect(after).toEqual({ on_hand: before.on_hand - 2, reserved: before.reserved });
    const audit = await db.from("audit_log").select("action").eq("entity_type", "orders").eq("entity_id", order.id);
    const actions = (audit.data ?? []).map((a) => a.action);
    expect(actions.filter((a) => a === "order.status")).toHaveLength(4);
    for (const a of ["order.delivery_charge", "order.shipment", "order.payment_status", "order.note"]) expect(actions).toContain(a);

    // The printable slip: the admin chrome is hidden when printing, and nothing internal is on it.
    await page.goto(`/admin/orders/${order.id}/slip`);
    await expect(page.getByTestId("slip-number")).toHaveText(order.number);
    await expect(page.getByTestId("order-slip")).toContainText("Please call before coming");
    await expect(page.getByTestId("order-slip")).not.toContainText("Customer paid the courier");
    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("admin-user-name")).toBeHidden();
    await expect(page.getByTestId("order-slip")).toBeVisible();
  });

  test("a customer cannot open the admin orders, and cannot see another customer's order", async ({ browser }) => {
    const order = await seedOrder(1);
    const context = await browser.newContext({ storageState: customerSession });
    const page: Page = await context.newPage();
    const list = await page.goto("/admin/orders");
    expect(list?.status()).toBe(403);
    const detail = await page.goto(`/admin/orders/${order.id}`);
    expect(detail?.status()).toBe(403);
    // The customer's own account page for an order that is not theirs is a not-found page with none of its data.
    await page.goto(`/account/orders/${order.id}`);
    await expect(page.getByText(order.number)).toHaveCount(0);
    await expect(page.getByText(`E2E Buyer ${tag}`)).toHaveCount(0);
    await context.close();
  });
});
