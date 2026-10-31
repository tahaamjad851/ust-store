import { expect as baseExpect, test, type APIRequestContext, type Page } from "@playwright/test";

// `next dev` renders an uncached page (every search, for one) in one to two seconds, and a client-side
// navigation only commits when that render arrives, so the default 5 s is too tight for the steps
// that click through to a new list. Failures are still reported, just after a longer wait.
const expect = baseExpect.configure({ timeout: 15_000 });

// Public catalog, end to end, as an anonymous visitor: nobody signs in here, so these tests never
// touch Supabase Auth and cannot hit its sign-in rate limit.
//
// They read the real catalog from the project in .env.local and assume it holds the DEMO seed
// (supabase/seed.sql) and nothing else. Once the client's real products replace the demo ones, the
// product names below must be changed too (docs/ROADMAP.md, launch checklist).
//
//   npx playwright test tests/e2e/catalog.spec.ts --project=mobile
//   npx playwright test tests/e2e/catalog.spec.ts --project=desktop

const CLUTCH_PLATE = "MF 385 Ceramic Dual Clutch Plate, 12-inch";
const CLUTCH_PLATE_SLUG = "mf-385-dual-clutch-plate-12-inch";
const CLUTCH_PLATE_SKU = "MF-385-CP851";
const CLUTCH_PLATE_PART_NUMBER = "1860005M91";
const BELARUS_PLATE = "Belarus MTZ-50 Clutch Plate, 340 mm";
const OUT_OF_STOCK_NAME = "Clutch Release Finger & Spring Kit (3 sets)";
const OUT_OF_STOCK_SLUG = "clutch-release-finger-spring-kit";
const LOW_STOCK_SLUG = "mf-240-radiator-assembly";
const PAGE_SIZE = 9;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ":visible": while a streamed list is being swapped in, a production page briefly holds a hidden copy of it.
const results = (page: Page) => page.locator("section[aria-labelledby='results-title']:visible");
const cards = (page: Page) => results(page).locator("article");
// A production build shows a skeleton first and streams the list in: read the list only once its heading is there.
const listed = (page: Page) => page.locator("#results-title:visible").waitFor();
const cardNames = async (page: Page) => {
  await listed(page);
  return (await cards(page).locator("h3").allInnerTexts()).map((t) => t.trim());
};
const total = async (page: Page) => {
  await listed(page);
  return Number(/^(\d+)/.exec(await page.locator("#results-title:visible").innerText())?.[1]);
};

/** Rupees of the price shown on each card, in page order. */
async function cardPrices(page: Page) {
  await listed(page);
  const texts = await cards(page).locator("p.tabular").evaluateAll((els) => els.map((e) => e.textContent ?? ""));
  return texts.map((t) => Number(/Rs\s([\d,]+)/.exec(t)?.[1].replace(/,/g, "")));
}

const isSorted = <T,>(items: T[], compare: (a: T, b: T) => number) => items.length > 1 && items.every((x, i) => i === 0 || compare(items[i - 1], x) <= 0);

/** Filters are collapsed behind a button on phones. */
async function openFilters(page: Page) {
  const toggle = page.getByRole("button", { name: /^Filters/ });
  if (await toggle.isVisible()) await toggle.click();
}

/**
 * After a click that navigates (the URL changes before the new list has streamed in, and a skeleton
 * shows meanwhile), wait for the page to settle before reading it. Also makes sure the page is
 * hydrated, which the sort select and the tractor selector need.
 */
async function ready(page: Page) {
  // A production build keeps prefetching links, so the network may never go fully quiet: do not wait forever.
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
}

/**
 * The not-found page for a URL that is not (or no longer) in the catalog. The status is 404; the very
 * first request to a URL that was never generated can still be answered 200 by a production server
 * (the page shell streams before the lookup finishes), which is why the page also says noindex.
 */
async function expectNotFound(request: APIRequestContext, path: string) {
  const res = await request.get(path);
  expect([200, 404], `${path} -> ${res.status()}`).toContain(res.status());
  const html = await res.text();
  expect(html, path).toMatch(/couldn(&#x27;|&apos;|')t find that page/);
  expect(html, path).toMatch(/<meta name="robots" content="noindex"/);
}

/** Anonymous read of the public catalog, the same way the browser would (anon key, RLS). */
async function anonRest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: ANON_KEY!, authorization: `Bearer ${ANON_KEY}` } });
  expect(res.ok, `${path}: ${res.status}`).toBe(true);
  return (await res.json()) as T;
}

test.describe("home page", () => {
  test("shows categories and popular parts from the database, and the demo notice", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Demo catalogue:")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Shop by category" })).toBeVisible();
    for (const name of ["Tractor Parts", "Engine Oils", "Lubricants", "Hydraulic Oils", "Filters"]) {
      await expect(page.getByRole("link", { name: new RegExp(`^${name}`) }).first()).toBeVisible();
    }
    const popular = page.locator("section[aria-labelledby='featured-title']");
    await expect(popular.locator("article").first()).toBeVisible();
    expect(await popular.locator("article").count()).toBeLessThanOrEqual(5);
    await expect(popular.getByText(/^SKU:/).first()).toBeVisible();
  });

  test("the tractor selector lists the makes and models from the database", async ({ page }) => {
    await page.goto("/");
    const make = page.getByLabel("1. Tractor make").first();
    const options = await make.locator("option").allInnerTexts();
    expect(options).toEqual(expect.arrayContaining(["Massey Ferguson", "Fiat / New Holland", "Belarus"]));
    await expect(page.getByLabel("2. Model").first()).toBeDisabled();
  });
});

test.describe("shop", () => {
  test("lists products with server-side pagination", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByRole("heading", { level: 1, name: "All products" })).toBeVisible();
    const count = await total(page);
    expect(count).toBeGreaterThanOrEqual(20);
    await expect(cards(page)).toHaveCount(PAGE_SIZE);

    const pages = Math.ceil(count / PAGE_SIZE);
    const nav = page.getByRole("navigation", { name: "Pagination" });
    await expect(nav.getByRole("link", { name: `Page ${pages}` })).toBeVisible();
    await expect(nav.getByRole("link", { name: `Page ${pages + 1}` })).toHaveCount(0);

    const firstPage = await cardNames(page);
    await nav.getByRole("link", { name: "Page 2" }).click();
    await expect(page).toHaveURL(/page=2/);
    const secondPage = await cardNames(page);
    expect(secondPage).toHaveLength(PAGE_SIZE);
    expect(secondPage.filter((n) => firstPage.includes(n))).toEqual([]);

    await page.goto(`/shop?page=${pages}`);
    await expect(cards(page)).toHaveCount(count - (pages - 1) * PAGE_SIZE);
  });

  test("a page past the end shows the first page instead of an error", async ({ page }) => {
    const res = await page.goto("/shop?page=500");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("navigation", { name: "Pagination" }).getByRole("link", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    await expect(cards(page)).toHaveCount(PAGE_SIZE);
  });

  test("ignores junk in the URL", async ({ page }) => {
    const res = await page.goto("/shop?model=tm-mf-385&sort=zzz&page=-4&min=abc&stock=maybe");
    expect(res?.status()).toBe(200);
    expect(await total(page)).toBeGreaterThanOrEqual(20);
  });
});

test.describe("categories", () => {
  test("a category page shows its subcategories from the database", async ({ page }) => {
    await page.goto("/categories/tractor-parts");
    await expect(page.getByRole("heading", { level: 1, name: "Tractor Parts" })).toBeVisible();
    const groups = page.locator("section[aria-labelledby='subcats-title']");
    for (const name of ["Engine Parts", "Clutch Parts", "Brake Parts", "Gearbox Parts"]) {
      await expect(groups.getByRole("heading", { name })).toBeVisible();
    }
    await groups.getByRole("link", { name: /Shop Clutch Parts/ }).click();
    await expect(page).toHaveURL(/\/categories\/tractor-parts\/clutch-parts$/);
  });

  test("a subcategory lists only its own products", async ({ page }) => {
    await page.goto("/categories/tractor-parts/clutch-parts");
    await expect(page.getByRole("heading", { level: 1, name: "Clutch Parts" })).toBeVisible();
    const names = await cardNames(page);
    expect(names).toContain(CLUTCH_PLATE);
    expect(names).toContain(BELARUS_PLATE);
    expect(names.some((n) => /oil filter|tyre|spanner/i.test(n))).toBe(false);
    const crumbs = page.getByRole("navigation", { name: /breadcrumb/i });
    await expect(crumbs.getByRole("link", { name: "Tractor Parts" })).toBeVisible();
  });

  test("a top-level category without subcategories lists its products directly", async ({ page }) => {
    // Filters has subcategories, so use the listing under it.
    await page.goto("/categories/filters/oil-filters");
    expect(await total(page)).toBeGreaterThanOrEqual(1);
    expect((await cardNames(page)).join(" ")).toMatch(/oil filter/i);
  });

  test("unknown categories and subcategories show the not-found page and are not indexed", async ({ request }) => {
    for (const path of ["/categories/no-such-category", "/categories/tractor-parts/no-such-sub", "/categories/no-such/no-such-sub"]) {
      await expectNotFound(request, path);
    }
  });

  test("the category menu is built from the database (mobile drawer / desktop mega menu)", async ({ page, isMobile }) => {
    await page.goto("/");
    await ready(page);
    if (isMobile) {
      await page.getByRole("navigation", { name: "Quick links" }).getByRole("button", { name: "Categories" }).click();
      const drawer = page.getByRole("dialog");
      await expect(drawer.getByRole("heading", { name: "All Categories" })).toBeVisible();
      await drawer.getByRole("button", { name: "Tractor Parts, show subcategories" }).click();
      await expect(drawer.getByRole("link", { name: "Clutch Parts" })).toBeVisible();
      await drawer.getByRole("link", { name: "Clutch Parts" }).click();
      await expect(page).toHaveURL(/\/categories\/tractor-parts\/clutch-parts$/);
    } else {
      const nav = page.getByRole("navigation", { name: "Main" });
      // The menu opens on hover (a click on the chevron right after the hover would close it again).
      await nav.getByRole("button", { name: "Tractor Parts menu" }).hover();
      await expect(page.getByText("Tractor Parts catalogue")).toBeVisible();
      const panel = page.locator("#" + (await nav.getByRole("button", { name: "Tractor Parts menu" }).getAttribute("aria-controls")));
      await expect(panel.getByRole("link", { name: /Clutch Parts/ })).toBeVisible();
      await expect(panel.getByRole("link", { name: "MF 385" })).toBeVisible();
    }
  });
});

test.describe("search", () => {
  test("the header search finds products by name", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByLabel("Search products").fill("clutch plate");
    await page.getByLabel("Search products").press("Enter");
    await expect(page).toHaveURL(/\/shop\?q=clutch\+plate|\/shop\?q=clutch%20plate/);
    // The list streams in after the URL changes: wait for it rather than reading it once.
    await expect.poll(() => cardNames(page)).toContain(CLUTCH_PLATE);
    const names = await cardNames(page);
    expect(names.length).toBeGreaterThanOrEqual(3);
    // Every word must match somewhere, so nothing unrelated comes back.
    expect(names.some((n) => /tyre|spanner|grease|oil filter/i.test(n))).toBe(false);
    await expect(page.getByRole("list", { name: "Active filters" })).toContainText("clutch plate");
  });

  test("finds a product by SKU, part number, and tractor model", async ({ page }) => {
    await page.goto(`/shop?q=${encodeURIComponent(CLUTCH_PLATE_SKU.toLowerCase())}`);
    expect(await cardNames(page)).toEqual([CLUTCH_PLATE]);

    await page.goto(`/shop?q=${CLUTCH_PLATE_PART_NUMBER}`);
    expect(await cardNames(page)).toEqual([CLUTCH_PLATE]);

    await page.goto("/shop?q=mf+385");
    const names = await cardNames(page);
    expect(names).toContain(CLUTCH_PLATE);
    expect(names).not.toContain(BELARUS_PLATE);
  });

  test("shows a useful empty state when nothing matches", async ({ page }) => {
    await page.goto("/shop?q=zzzzqqqq");
    await expect(results(page).getByText("No products match these filters.")).toBeVisible();
    await expect(results(page).getByRole("link", { name: "Clear filters" })).toBeVisible();
    expect(await total(page)).toBe(0);
  });

  test("search text is plain text: wildcards match nothing, markup is escaped", async ({ page }) => {
    await page.goto("/shop?q=%25");
    expect(await total(page)).toBe(0);
    await page.goto("/shop?q=_");
    expect(await total(page)).toBe(0);

    let dialog = false;
    page.on("dialog", () => (dialog = true));
    await page.goto(`/shop?q=${encodeURIComponent("<img src=x onerror=alert(1)>")}`);
    await expect(page.getByRole("list", { name: "Active filters" })).toContainText("<img src=x onerror=alert(1)>");
    expect(dialog).toBe(false);
  });
});

test.describe("filters and sorting", () => {
  test("the in-stock filter hides out-of-stock products", async ({ page }) => {
    await page.goto("/shop?q=clutch");
    await expect.poll(async () => (await cardNames(page)).includes(OUT_OF_STOCK_NAME)).toBe(true);
    const all = await total(page);

    await openFilters(page);
    await page.getByLabel("In stock only").check();
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/stock=in/);
    await expect.poll(() => total(page)).toBe(all - 1);
    expect(await cardNames(page)).not.toContain(OUT_OF_STOCK_NAME);
    await expect(page.getByRole("list", { name: "Active filters" })).toContainText("In stock only");
  });

  test("the price range filters on the price charged", async ({ page }) => {
    await page.goto("/shop?min=10000&max=20000");
    const prices = await cardPrices(page);
    expect(prices.length).toBeGreaterThan(0);
    expect(prices.every((p) => p >= 10_000 && p <= 20_000)).toBe(true);

    // The same through the form.
    await page.goto("/shop");
    await openFilters(page);
    await page.getByLabel("Min").fill("1000");
    await page.getByLabel("Max").fill("3000");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/min=1000&max=3000|max=3000&min=1000/);
    await expect
      .poll(async () => {
        const narrow = await cardPrices(page);
        return narrow.length > 0 && narrow.every((p) => p >= 1000 && p <= 3000);
      })
      .toBe(true);
  });

  test("sorts by price, both ways, across the whole result set (not just the page)", async ({ page }) => {
    await page.goto("/shop?sort=price-asc");
    const asc = await cardPrices(page);
    expect([...asc].sort((a, b) => a - b)).toEqual(asc);
    await page.goto("/shop?sort=price-desc");
    const desc = await cardPrices(page);
    expect([...desc].sort((a, b) => b - a)).toEqual(desc);
    // The cheapest of everything leads the ascending list and the dearest leads the descending one.
    expect(asc[0]).toBeLessThanOrEqual(desc[desc.length - 1]);
    expect(desc[0]).toBeGreaterThanOrEqual(asc[asc.length - 1]);
  });

  test("the sort control changes the URL and the order", async ({ page }) => {
    await page.goto("/shop");
    await ready(page);
    await page.getByLabel("Sort").selectOption("price-asc");
    await expect(page).toHaveURL(/sort=price-asc/);
    await expect.poll(async () => isSorted(await cardPrices(page), (a, b) => a - b)).toBe(true);
    await ready(page);
    await page.getByLabel("Sort").selectOption("name");
    await expect(page).toHaveURL(/sort=name/);
    await expect.poll(async () => isSorted(await cardNames(page), (a, b) => a.localeCompare(b))).toBe(true);
  });

  test("active filters can be removed one by one and cleared", async ({ page }) => {
    await page.goto("/shop?q=clutch&stock=in&min=1000");
    await ready(page);
    const chips = page.getByRole("list", { name: "Active filters" });
    await expect(chips.getByRole("link")).toHaveCount(3);
    await chips.getByRole("link", { name: /In stock only/ }).click();
    await expect(page).not.toHaveURL(/stock=in/);
    await expect(page).toHaveURL(/q=clutch/);
    await openFilters(page);
    await page.getByRole("link", { name: "Reset all filters" }).click();
    await expect(page).toHaveURL(/\/shop$/);
  });
});

test.describe("tractor selector", () => {
  test("make, then model, then the parts listed for that model", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const make = page.getByLabel("1. Tractor make").first();
    const model = page.getByLabel("2. Model").first();
    await make.selectOption("Massey Ferguson");
    await expect(model).toBeEnabled();
    const options = await model.locator("option").allInnerTexts();
    expect(options.some((o) => o.startsWith("MF 385"))).toBe(true);
    expect(options.some((o) => o.startsWith("Fiat 480"))).toBe(false);
    await model.selectOption({ label: options.find((o) => o.startsWith("MF 385"))! });
    await page.getByRole("button", { name: "Find parts" }).first().click();

    await expect(page).toHaveURL(/\/shop\?model=[0-9a-f-]{36}$/);
    await expect(page.getByRole("list", { name: "Active filters" })).toContainText("Fits MF 385");
    await expect.poll(() => cardNames(page)).toContain(CLUTCH_PLATE);
    const names = await cardNames(page);
    expect(names).not.toContain(BELARUS_PLATE);
    // Every card says what it fits.
    await expect(cards(page).first().getByText(/^Fits /)).toBeVisible();
  });

  test("the model filter combines with the others and works inside a category", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByLabel("1. Tractor make").first().selectOption("Massey Ferguson");
    const model = page.getByLabel("2. Model").first();
    await model.selectOption({ label: (await model.locator("option").allInnerTexts()).find((o) => o.startsWith("MF 385"))! });
    await page.getByRole("button", { name: "Find parts" }).first().click();
    const url = new URL(page.url());
    const modelId = url.searchParams.get("model")!;

    await page.goto(`/categories/tractor-parts/clutch-parts?model=${modelId}`);
    const names = await cardNames(page);
    expect(names).toContain(CLUTCH_PLATE);
    expect(names.every((n) => !/oil filter/i.test(n))).toBe(true);

    await page.goto(`/shop?model=${modelId}&q=clutch&stock=in`);
    expect((await cardNames(page)).every((n) => /clutch/i.test(n))).toBe(true);
  });
});

test.describe("product page", () => {
  test("shows the product from the database", async ({ page }) => {
    const res = await page.goto(`/products/${CLUTCH_PLATE_SLUG}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: CLUTCH_PLATE })).toBeVisible();
    await expect(page.getByText(CLUTCH_PLATE_SKU).first()).toBeVisible();
    await expect(page.getByText(CLUTCH_PLATE_PART_NUMBER).first()).toBeVisible();
    await expect(page.getByText("Price:").first()).toBeVisible();
    await expect(page.getByText("In stock").first()).toBeVisible();
    await expect(page.getByRole("button", { name: `Add ${CLUTCH_PLATE} to cart` })).toBeEnabled();
    // Compatibility: listed models only, never "fits everything".
    const fitment = page.locator("section[aria-labelledby='fitment-title']");
    await expect(fitment.getByText("Massey Ferguson MF 385")).toBeVisible();
    await expect(fitment.getByText("Fiat 480")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Home" }).first()).toBeVisible();
  });

  test("delivery and exchange texts come from the store settings, and no delivery fee is shown", async ({ page }) => {
    await page.goto(`/products/${CLUTCH_PLATE_SLUG}`);
    const info = page.locator("section[aria-labelledby='delivery-title']");
    await expect(info.getByText("Delivery charge confirmed by phone")).toBeVisible();
    await expect(info.getByText("Exchange accepted if the product is not damaged, within 7 days.")).toBeVisible();
    await expect(info.getByText(/Rs\s?\d/)).toHaveCount(0);
  });

  test("an out-of-stock product stays visible, labelled, with Add to cart disabled", async ({ page }) => {
    await page.goto(`/products/${OUT_OF_STOCK_SLUG}`);
    await expect(page.getByRole("heading", { level: 1, name: OUT_OF_STOCK_NAME })).toBeVisible();
    await expect(page.getByText("Out of stock").first()).toBeVisible();
    await expect(page.getByRole("button", { name: `${OUT_OF_STOCK_NAME} is out of stock` })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Buy now" })).toBeDisabled();

    // ...and on the listing card too.
    await page.goto("/shop?q=finger+spring");
    const card = cards(page).filter({ hasText: OUT_OF_STOCK_NAME });
    await expect(card.locator("p", { hasText: "Out of stock" })).toBeVisible();
    await expect(card.getByRole("button", { name: /out of stock/ })).toBeDisabled();
  });

  test("low stock is a label, not a number", async ({ page }) => {
    await page.goto(`/products/${LOW_STOCK_SLUG}`);
    await expect(page.getByText("Low stock").first()).toBeVisible();
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/\b\d+\s*(left|in stock|units?|pcs|pieces|available|remaining)\b/i);
    expect(text).not.toMatch(/only \d+/i);
  });

  test("unknown products show the not-found page and are not indexed", async ({ request, page }) => {
    for (const slug of ["no-such-product", "NOT_A_SLUG", "a".repeat(200)]) {
      await expectNotFound(request, `/products/${slug}`);
    }
    await page.goto("/products/no-such-product");
    await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  });

  test("related products come from the same category", async ({ page }) => {
    await page.goto(`/products/${CLUTCH_PLATE_SLUG}`);
    const related = page.locator("section[aria-labelledby='related-title']");
    await expect(related.locator("article").first()).toBeVisible();
    expect(await related.locator("article").count()).toBeLessThanOrEqual(4);
    await expect(related.locator("article").filter({ hasText: CLUTCH_PLATE })).toHaveCount(0);
  });
});

test.describe("cart", () => {
  test("holds variant ids and quantities only, and shows prices from the server", async ({ page }) => {
    await page.goto(`/products/${CLUTCH_PLATE_SLUG}`);
    await ready(page);
    await page.getByRole("button", { name: `Add ${CLUTCH_PLATE} to cart` }).click();
    await page.getByRole("button", { name: `Add ${CLUTCH_PLATE} to cart` }).click();

    const stored = await page.evaluate(() => localStorage.getItem("ust-cart-v2"));
    const lines = JSON.parse(stored!) as Record<string, unknown>[];
    expect(lines).toHaveLength(1);
    expect(Object.keys(lines[0]).sort()).toEqual(["quantity", "variant_id"]);
    expect(lines[0].quantity).toBe(2);
    expect(String(lines[0].variant_id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(stored).not.toMatch(/price|sku|name|stock/i);

    await page.goto("/cart");
    await expect(page.getByRole("heading", { level: 1, name: "Shopping cart" })).toBeVisible();
    const row = page.locator("li").filter({ hasText: CLUTCH_PLATE });
    await expect(row.getByText(`SKU: ${CLUTCH_PLATE_SKU}`)).toBeVisible();
    await expect(page.getByText("Delivery charge confirmed by phone")).toBeVisible();
    await expect(page.getByText("Calculated at checkout")).toHaveCount(0);
    const subtotal = page.getByText("Items (2)").locator("..");
    await expect(subtotal).toContainText(/Rs\s?[\d,]+/);
  });

  test("a price or quantity edited in the browser changes nothing", async ({ page }) => {
    const variants = await anonRest<{ id: string; sku: string; regular_price_paisa: number; sale_price_paisa: number | null }[]>(
      `product_variants?select=id,sku,regular_price_paisa,sale_price_paisa&sku=eq.${CLUTCH_PLATE_SKU}`,
    );
    test.skip(variants.length !== 1, "needs the DEMO seed");
    const [variant] = variants;
    const charged = (variant.sale_price_paisa ?? variant.regular_price_paisa) / 100;

    await page.goto("/");
    await page.evaluate(
      (id) => localStorage.setItem("ust-cart-v2", JSON.stringify([{ variant_id: id, quantity: 1, price_paisa: 1, name: "Free parts" }])),
      variant.id,
    );
    await page.goto("/cart");
    const row = page.locator("li").filter({ hasText: CLUTCH_PLATE });
    await expect(row).toBeVisible();
    await expect(page.getByText("Items (1)").locator("..")).toContainText(charged.toLocaleString("en-US"));
    await expect(page.getByText("Free parts")).toHaveCount(0);
  });

  test("an unknown or malformed cart entry is dropped", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() =>
      localStorage.setItem("ust-cart-v2", JSON.stringify([{ variant_id: "00000000-0000-4000-8000-000000000000", quantity: 2 }])),
    );
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("ust-cart-v2"))).toBe("[]");

    await page.evaluate(() => localStorage.setItem("ust-cart-v2", JSON.stringify([{ variant_id: "tm-mf-385", quantity: 99999 }])));
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  });

  test("an out-of-stock item is shown but left out of the total, and cannot be checked out", async ({ page }) => {
    const products = await anonRest<{ id: string }[]>(`products?select=id&slug=eq.${OUT_OF_STOCK_SLUG}`);
    test.skip(products.length !== 1, "needs the DEMO seed");
    const kit = await anonRest<{ id: string }[]>(`product_variants?select=id&product_id=eq.${products[0].id}`);
    await page.goto("/");
    await page.evaluate((id) => localStorage.setItem("ust-cart-v2", JSON.stringify([{ variant_id: id, quantity: 1 }])), kit[0].id);
    await page.goto("/cart");
    const row = page.locator("li").filter({ hasText: OUT_OF_STOCK_NAME });
    await expect(row.getByText("Out of stock")).toBeVisible();
    await expect(row.getByText("Not included in your total.")).toBeVisible();
    await expect(page.getByText("Items (0)").locator("..")).toContainText("Rs 0");
    await expect(page.getByRole("button", { name: "Proceed to checkout" })).toBeDisabled();
  });

  test("checkout lists the cart and keeps the delivery note, and stays on the demo path", async ({ page }) => {
    await page.goto(`/products/${CLUTCH_PLATE_SLUG}`);
    await ready(page);
    await page.getByRole("button", { name: "Buy now" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await page.getByRole("link", { name: "Proceed to checkout" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible();
    await expect(page.getByText(CLUTCH_PLATE).first()).toBeVisible();
    await expect(page.getByText("Delivery charge confirmed by phone").first()).toBeVisible();
    await expect(page.getByText("Fee confirmed later")).toHaveCount(0);
  });
});

test.describe("what the pages must never contain", () => {
  // Field names and secrets, not words: the pages legitimately say "wholesale pricing" and "All rights reserved".
  const FORBIDDEN = /cost_paisa|wholesale_price|wholesale_paisa|price_tier|on_hand|stock_qty|low_stock_threshold|"reserved"|service_role|SUPABASE_SERVICE/i;

  test("no cost, wholesale price, stock count or secret in any public page or payload", async ({ request }) => {
    for (const path of ["/", "/shop", "/shop?q=clutch", "/categories/tractor-parts", "/categories/tractor-parts/clutch-parts", `/products/${CLUTCH_PLATE_SLUG}`, "/cart", "/checkout"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expect(await res.text(), path).not.toMatch(FORBIDDEN);
    }
  });

  test("the security policy trusts exactly the project host, not every Supabase project", async ({ request }) => {
    test.skip(!SUPABASE_URL, "needs NEXT_PUBLIC_SUPABASE_URL");
    const res = await request.get("/shop");
    const csp = res.headers()["content-security-policy"];
    const origin = new URL(SUPABASE_URL!).origin;
    expect(csp).toContain(`img-src 'self' data: blob: ${origin}`);
    expect(csp).toContain(`connect-src 'self' ${origin}`);
    expect(csp).not.toContain("*.supabase.co");
    expect(csp).not.toMatch(/https:\/\/\*/);
  });
});

test.describe("layout", () => {
  for (const path of ["/shop", `/products/${CLUTCH_PLATE_SLUG}`, "/categories/tractor-parts/clutch-parts"]) {
    test(`${path} does not jump around while it loads`, async ({ page }) => {
      await page.addInitScript(() => {
        (window as unknown as { __cls: number }).__cls = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as { hadRecentInput: boolean; value: number }[]) {
            if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(path);
      await ready(page);
      await page.waitForTimeout(500);
      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      expect(cls).toBeLessThan(0.1);
    });
  }

  test("product images load (placeholders for products without a photo) and keep their box", async ({ page }) => {
    await page.goto("/shop");
    await ready(page);
    const imgs = cards(page).locator("img");
    const count = await imgs.count();
    expect(count).toBe(PAGE_SIZE);
    for (let i = 0; i < count; i++) {
      const img = imgs.nth(i);
      await img.scrollIntoViewIfNeeded();
      // Images load lazily as they scroll into view: wait for the picture rather than reading it once.
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
      const box = (await img.boundingBox())!;
      expect(Math.abs(box.width - box.height)).toBeLessThan(2); // square box, reserved before the image arrives
      await expect(img).toHaveAttribute("alt", /.+/);
    }
  });
});
