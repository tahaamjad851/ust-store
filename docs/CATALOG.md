# Public catalog (Phase 3A)

The storefront reads categories, tractor makes and models, products, variants, images, compatibility and store settings from Supabase. The admin screens that edit them are described under "Admin (Phase 3B)" below.

## How a page gets its data

```
page (src/app)  ->  src/services/catalog.ts  ->  createPublicClient()  ->  Supabase (anon key, RLS)
                       "use cache" + tags         no cookies, no session
```

- `src/services/catalog.ts` is the only door. It never uses the service-role client and never `select *`: column lists live in `src/features/catalog/columns.ts`.
- Rows become storefront shapes in `src/features/catalog/mappers.ts` (pure, unit-tested). Those shapes (`src/types/catalog.ts`) have **no** cost, wholesale price or stock count field, so none can reach a page.
- A product is shown by its **display variant**: the active default variant, otherwise the first active one. Its SKU, price and stock status are on the card; the product page lists every variant with its own price and status, and the cart holds the chosen **variant id**.
- Price charged = sale price if there is one (and it is lower), else the regular price; the regular price is shown crossed out only while a sale price is active.
- Stock is a **status** (`in_stock`, `low_stock`, `out_of_stock`) from `stock_availability()` / `catalog_search()`. Exact quantities are never sent to a browser. Out-of-stock products stay listed with "Out of stock" and a disabled Add to cart.
- A product is public when it is `published`, has an active variant, and its category and all ancestors are active. A deactivated category hides its products everywhere (listings, search, product pages).

### Search, filters, sorting, paging

All of it runs in the database: `public.catalog_search()` (migration `20261031100000_catalog_public.sql`). It is `SECURITY DEFINER` only because anon cannot read `inventory`; it re-applies the public visibility rules itself and returns product id, variant id, stock status and the total count. Cards are then read through RLS.

- Words: every word must match somewhere in name, part numbers, OEM numbers, viscosity, short description, a variant SKU, the brand name, or a tractor make/model name. `%` and `_` typed by a visitor are plain text.
- Filters: category (includes subcategories), tractor model, in stock only, price range (on the price charged). Sort: relevance (exact SKU/part number first, then name prefix, featured, newest), price, name, newest. Page size 9.
- A page past the end falls back to page 1. The URL is untrusted: invalid values are dropped, empty form fields count as "not set".
- Not built yet (needs 3B data): brand filter and brand pages, specification filters, grid/list switch, items per page, wishlist.

### Caching

`"use cache"` with tags (`src/features/catalog/cache.ts`):

| Data | Lifetime (`stale / revalidate / expire`) | Tags |
|---|---|---|
| Settings, categories, tractor models | 5 min / 15 min / 1 day | `catalog`, `catalog-settings`, `catalog-categories`, `catalog-tractors` |
| Listings, product pages | 1 min / 2 min / 15 min | `catalog`, `catalog-products`, `catalog-stock` |
| Home page cards | 5 min / 2 min / 15 min | same |

Only bounded listing shapes are cached (no free text, no price range, a tractor model that exists, the first 10 pages); a malformed product slug is refused before the cached lookup; free-text searches and the cart lookup are never cached, so made-up URLs cannot fill the cache. Since **Phase 3B** the admin actions expire the tags for what they change with `updateTag()`, so a change shows on the next request (categories → `catalog-categories`, products/variants/images/compatibility → `catalog-products`, prices and stock → `catalog-products` and `catalog-stock`, settings → `catalog-settings`). **Phase 4** order placement must revalidate `catalog-stock`; until then a stock change caused by an order shows within the lifetimes above. Money and stock stay authoritative in the database: `place_order()` re-prices and re-checks everything.

Product and category pages are prerendered for what exists at build time (the 48 newest products, every category) and rendered on first visit for the rest. An unknown or deactivated URL shows the not-found page with `noindex`; the status is 404 (the first request to a URL that was never generated may be answered 200 by a production server, because the page shell streams first).

### Images

`product_images.storage_path` is a path in the public `product-images` bucket; the URL is built from `NEXT_PUBLIC_SUPABASE_URL` (`publicImageUrl()` refuses paths with `..`, a leading slash or empty segments). Products without a photo show a shipped placeholder drawing chosen by product type. `next.config.ts` allows exactly one remote image pattern: this project's host, path `/storage/v1/object/public/product-images/**`. The Content-Security-Policy (`img-src`, `connect-src`) names the same exact origin. **There is no wildcard fallback: `npm run build` and `npm start` stop with an error if `NEXT_PUBLIC_SUPABASE_URL` is missing or is not an https URL** (plain http is accepted only for localhost). `npm run typecheck` runs `next typegen`, which loads the same config, so it needs the variable too (any valid https URL).

Category images (`categories.image_path`) have no bucket yet; only a shipped `/images/...` drawing is used, everything else shows the placeholder.

### Cart

Browser only (`localStorage` key `ust-cart-v2`): `[{ variant_id, quantity }]` and nothing else. The cart and checkout pages send the variant ids to a Server Action (`lookupCartItems`), which returns name, image, price and stock status from the database; unknown or no-longer-sold variants are dropped from the cart, out-of-stock lines stay visible but are left out of the total and block "Proceed to checkout". Checkout is still the DEMO path (nothing is sent) until Phase 4.

Delivery is never calculated on public pages, and there is no free-delivery offer. Product page, cart and checkout show `store_settings.delivery_charge_note`; the product page and FAQ show `store_settings.return_policy_note` (since 3B: "Exchange accepted if the product is not damaged, within 7 days.", to be confirmed by the client). The top bar shows `store_settings.announcement_text`. All three are edited in **Admin > Settings**.

`store_settings.return_period_days` is still what `request_return()` enforces; keep it in step with the note (7 days).

## Applying the migration (no CLI needed)

`supabase db push` is not possible from every network, so apply `supabase/migrations/20261031100000_catalog_public.sql` by hand. Order matters; the file changes one function's return type, so do not run it twice.

1. Supabase dashboard of the **dev** project → **SQL Editor** → **New query**. Paste the whole file → **Run**. Expect `Success. No rows returned`. (It ends with a self-check that raises an error if anon can execute an unexpected function, can read costs or inventory, or if `stock_availability` still returns a quantity; an error rolls the whole file back.)
2. **New query** (separate), record it so `db push` knows it is applied:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20261031100000', 'catalog_public')
on conflict (version) do nothing;
```

Expect `Success. No rows returned`.

3. **New query**, verify:

```sql
select p.proname,
       pg_get_function_result(p.oid) as returns,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('catalog_search', 'stock_availability')
 order by 1;
-- catalog_search     | TABLE(product_id uuid, variant_id uuid, stock_status text, total_count bigint) | true
-- stock_availability | TABLE(variant_id uuid, status text)                                           | true

select delivery_charge_note, return_policy_note from public.store_settings;
-- Delivery charge confirmed by phone | Exchange within 7 days if the product is in original condition.

select version, name from supabase_migrations.schema_migrations order by version desc limit 2;
-- 20261031100000 | catalog_public   then   20261030100000 | auth_support

set role anon;
select count(*) from public.catalog_search(p_limit => 48);          -- 23 with the DEMO seed (a page is 12 rows by default)
select count(*) from public.catalog_search('clutch plate', p_limit => 48);  -- a few
select count(*) from public.product_variant_costs;                  -- ERROR: permission denied (that is the point)
reset role;
```

The last `select` must fail with `permission denied for table product_variant_costs`; run `reset role;` afterwards in any case.

## `src/types/database.ts` (hand-written)

The types were written from the migrations because the CLI cannot reach the database from the developer's network. They list only the columns the public pages read. To check them:

1. **Against the real project (this is the check that matters):**

   ```powershell
   npm run test:db -- tests/integration/db/catalog-public.test.ts
   ```

   The first block of that test selects every column listed in `src/features/catalog/columns.ts` from the project, one table at a time. A misspelt or missing column fails there. Expect all of its tests to pass (32 at the time of writing: 10 column checks plus 22 behaviour checks).
2. **Compare by eye (optional):** in the SQL editor,

   ```sql
   select table_name, column_name, data_type, is_nullable
     from information_schema.columns
    where table_schema = 'public'
      and table_name in ('categories','tractor_makes','tractor_models','brands','products','product_variants',
                         'product_images','product_compatibility','store_settings','delivery_methods')
    order by table_name, ordinal_position;
   ```

3. **Generate over HTTPS (optional, replaces the file later):** the CLI's own source of types is the Management API. With a personal access token (dashboard → Account → Access Tokens), which is a secret: use it in the shell only, never in a file.

   ```powershell
   $env:SUPABASE_ACCESS_TOKEN = "<token>"
   curl.exe -s -H "Authorization: Bearer $env:SUPABASE_ACCESS_TOKEN" "https://api.supabase.com/v1/projects/<project-ref>/types/typescript" -o $env:TEMP\supabase-types.json
   ```

   The response is JSON with the generated TypeScript in its `types` field. (I could not run this from here; if it errors, rely on step 1.) Generated types would replace `src/types/database.ts` and the row aliases in the mappers.

## Tests

| What | Command | Needs |
|---|---|---|
| Unit: mappers, listing parameters | `npm test` | nothing |
| Database: draft/archived invisible, cost/inventory never returned, search, filters, sort, paging, column lists | `npm run test:db -- tests/integration/db/catalog-public.test.ts` (or `npm run test:db` for all) | DEV project, migration applied, `.env.local` with the four Supabase variables and `DB_TEST_PROJECT_REF` |
| Browser: home, shop, categories, search, filters, sorting, tractor selector, product page, cart, security and layout checks | `npm run test:e2e:catalog` (both projects), `npm run test:e2e:mobile`, `npm run test:e2e:desktop` (all e2e files, one project); one file and one project: `npx playwright test tests/e2e/catalog.spec.ts --project=mobile` | DEV project with the migration and the DEMO seed (and nothing else in the catalog), `.env.local`; first run on a machine: `npx playwright install chromium` |

The catalog e2e tests never sign in, so they cannot hit the Supabase sign-in rate limit; the mobile and desktop projects are independent. A short global setup (`tests/e2e/global-setup.ts`) visits the public routes once, one after the other, because `next dev` can answer a few concurrent first requests to a dynamic route with `500 Unexpected end of JSON input` (it rewrites `prerender-manifest.json` per request; a development-server race, not seen in a production build). The tests wait up to 15 s for navigations, because `next dev` takes one to two seconds to render an uncached page.

## Known limitations

- Only two category levels are shown in menus and the category tree (parent and children). Deeper levels would be searched correctly but have no pages; 3B should restrict the category depth to two.
- A product with several variants is listed with its display variant's price and stock; filters and sorting use that variant too.
- The product page gallery shows the first image large and the others as small static images (no zoom or switching yet).
- Reviews, wishlist, recently viewed, brand pages, offers, new-arrivals and best-sellers pages are not part of 3A.
- ~~RLS looser than the pages~~ Closed in 3B: products, variants, images and compatibility in a deactivated category (or under a deactivated parent) are no longer readable through the API (`category_is_public()`).
- No per-IP rate limit on search and cart lookups; use the host's firewall until one is added.
- If the layout (header, footer, menus) cannot load, for example when the database is unreachable, `src/app/global-error.tsx` shows a plain page; inside the shop, `(store)/error.tsx` shows the normal chrome.

## Admin (Phase 3B)

Everything under `/admin`, for staff and admins. Pages read and write with the **signed-in user's** Supabase session (never the service-role key), so row-level security and the database functions decide. The pattern: `src/features/admin/action.ts`.

| Screen | What it does | Who |
|---|---|---|
| Daily prices (`/admin/prices`) | Table of every variant: search, category filter, inline regular and sale price, quick stock, available/unavailable. **Save changes** sends everything to `apply_daily_changes()`: one transaction, all or nothing. Each price change is logged (who, old, new, when, source). A change above `store_settings.price_change_alert_percent` (20 by default) must be confirmed; the database enforces this, not only the page. A page that went stale (someone else changed the row) is refused. Existing orders keep their prices (order lines are snapshots). | staff, admin |
| Products (`/admin/products`) | List and editor: every section-7 field the schema has, description with preview, specifications, variants (SKU, barcode, prices, size, default, available), photos, tractor compatibility, archive, delete. New products start as drafts. | staff, admin |
| Cost prices | Variant cost field, export column, CSV `cost` column. | **admin only** (database policy, not just hidden) |
| Real delete of a product or variant | Only for things **never ordered** (the database refuses otherwise: `product_has_orders`, `variant_has_orders`). A never-ordered variant's stock ledger is deleted with it and the audit log records the delete. Archive is the normal way to stop selling. | admin only |
| Categories, brands, tractor makes and models | Create, rename, reorder, show/hide, delete. Two category levels (a trigger enforces it). Delete is refused while anything uses it (products, subcategories, coupon targets, models). | staff edit, admin deletes |
| Stock (`/admin/stock`) | Overview with filters, change stock (reason required, through `adjust_stock()`), low-stock and reorder levels, history per variant. | staff, admin |
| Import / export | See below. | staff, admin (costs: admin) |
| Settings (`/admin/settings`) | Business name, tagline, top bar text, phones, WhatsApp (typed as 0321 8219594, stored as 923218219594), email, address, hours, delivery note, exchange text, price-alert percentage, the private email for new orders, and the courier list. | **admin only** |

Every catalog table has an audit trigger (`audit_row_change()`): action, entity and the **names of changed columns, never values**, so a cost cannot leak into the log. Price changes are in `price_changes`, stock in `stock_movements`.

### Photos

Up to 8 per product, in the public `product-images` bucket at `products/<product id>/<random>.<ext>` (the database refuses any other path, and a 9th photo). The browser shrinks a photo to 1600 px and re-encodes it (WebP) before upload, which also drops its metadata (for example GPS). The server accepts up to 4 MB and decides the type from the file's first bytes (JPEG, PNG, WebP, AVIF only; no SVG). The first photo is the main one; reorder, replace, remove and alt text are on the product page. Removing a photo deletes the row first and the file after; a file that could not be deleted is only an orphan in the bucket (logged).

### CSV (one row per variant, keyed by SKU)

The columns are listed on the Import page (`src/features/catalog/csv/columns.ts`). A blank cell keeps the current value; a single `-` clears a field. Step 1 **checks** the file and writes nothing: every problem is listed with its line number (unknown category or brand, bad price, sale not below regular, duplicate SKU or barcode in the file or the catalogue, a SKU that belongs to another product, stock below what is reserved, and so on). Step 2 applies the **same file** (its hash must match) through `import_catalog()` in one transaction, after validating it again against the catalogue as it is at that moment. Exports are UTF-8 with a byte-order mark (Excel); cells that could run as a formula are prefixed with an apostrophe; the cost column is filled for admins only. Limits: 2 MB, 5,000 rows. Specifications, tractor compatibility and photos are not in the CSV.

### Cache

Each admin action declares what it touches and expires the matching tags with `updateTag()` (`PUBLIC_TAGS` in `action.ts`), so a price, stock or visibility change shows on the public site on the next request, not after the cache lifetime.

## Applying the 3B migration (no CLI needed)

File: `supabase/migrations/20261101100000_catalog_admin.sql`. Run it **once**.

**Before this, make sure 3A is really applied** on the project: run `supabase/checks/schema_check.sql` (only `since = 3b` rows may appear). If rows with `since = 3a` appear, follow "If 3A is recorded but missing" below first.

1. Supabase dashboard (**dev** project) > **SQL Editor** > New query. Paste the whole file > **Run**. Expect `Success. No rows returned`. It ends with a self-check that raises an error (and rolls everything back) if anon or a customer can execute an unexpected function, if anon can read costs, price history, couriers or inventory, or if a free-delivery threshold is still set.
2. New query (separate), record it:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20261101100000', 'catalog_admin')
on conflict (version) do nothing;
```

3. New query, verify:

```sql
select free_delivery_threshold_paisa, return_policy_note, price_change_alert_percent, announcement_text from public.store_settings;
-- null | Exchange accepted if the product is not damaged, within 7 days. | 20 | (your top bar text)
select count(*) from public.couriers;                          -- 7
select to_regclass('public.price_changes');                    -- price_changes
select proname from pg_proc
 where proname in ('apply_daily_changes','import_catalog','category_is_public','catalog_reorder','set_primary_image')
 order by 1;                                                   -- 5 rows
select policyname, qual from pg_policies
 where tablename = 'product_variant_costs' and cmd = 'SELECT'; -- the condition uses is_full_admin()
set role anon;
select count(*) from public.price_changes;                      -- ERROR: permission denied (that is the point)
reset role;
select version, name from supabase_migrations.schema_migrations order by version desc limit 2;
-- 20261101100000 | catalog_admin   then   20261031100000 | catalog_public
```

The last `select` before `reset role` must fail; run `reset role;` afterwards in any case. To bring the DEMO data in line (top bar text, WhatsApp 0321 8219594) either edit them in **Admin > Settings** or re-run the seed on the dev project only.

First admin and staff accounts: `docs/DATABASE.md`.

## If 3A is recorded but missing (the 3A repair)

**What happened on one dev project.** `schema_migrations` listed `20261031100000 catalog_public`, but `store_settings` had no `delivery_charge_note` / `return_policy_note` and `catalog_search()` did not exist, so Phase 3B failed with `42703: column "return_policy_note" of relation "store_settings" does not exist`. `stock_availability()` *did* exist, but that is the Phase 1 version (it returns a quantity); it is not evidence that 3A partly applied. The SQL Editor runs a pasted script as one transaction, so a script either applies completely or not at all. The record in `schema_migrations` is a **separate** statement that is run by hand, and nothing stops it being run after a script that failed or never ran. The likeliest reasons the 3A script did not take effect: the script's own final check raised an error (it fails loudly if anon or a customer can run a function outside the allowlist, and rolls everything back), another statement failed, only part of the text was selected when running, or it was not run at all. Which one is not knowable from the project afterwards; the repair prints the real reason if there is one.

Repair file: `supabase/migrations/20261031100100_catalog_public_repair.sql`. Its version sorts **after** 3A and **before** 3B, so the order everywhere is `…100000` (3A), `…100100` (repair), `20261101100000` (3B). On a project where 3A is complete it changes nothing that matters; on a broken one it creates what is missing: the two columns (`add column if not exists`, an existing text is kept), `stock_availability()` (only if it is missing or still the quantity-returning Phase 1 version) and `catalog_search()` (only if missing), repeats their grants, and ends with the same check as 3A, listing **every** offending function at once. It can be run again at any time, including after 3B, without replacing 3B's newer `stock_availability()`.

### Steps (dev project, SQL Editor)

1. **Look first (read-only).** New query:

```sql
select pg_get_function_result('public.stock_availability(uuid[])'::regprocedure);
-- TABLE(variant_id uuid, available integer, status text)  = the Phase 1 version: 3A never took effect
```

   Then paste `supabase/checks/schema_check.sql` and run it. It lists everything the migrations should have created and this project lacks (rows with `since = 3b` are expected until 3B is applied). If it shows missing objects from **other** migrations than 3A, stop and tell me before going on: the same "recorded but not applied" problem would be wider.

2. **Run the repair.** New query: paste the whole file `20261031100100_catalog_public_repair.sql` and **Run once**. Expect `Success. No rows returned`. If it errors, copy the full message to me; it names the cause (for example the functions anon can run that it should not).

3. **Record it** (a separate query, only after step 2 succeeded):

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20261031100100', 'catalog_public_repair')
on conflict (version) do nothing;
```

4. **Verify 3A** (each in its own query, or one after the other):

```sql
-- both texts exist, with their 3A values
select delivery_charge_note, return_policy_note from public.store_settings;
-- Delivery charge confirmed by phone | Exchange within 7 days if the product is in original condition.

-- the two functions, their result shape and the anon grant
select p.proname, pg_get_function_result(p.oid) as returns, has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('catalog_search', 'stock_availability') order by 1;
-- catalog_search     | TABLE(product_id uuid, variant_id uuid, stock_status text, total_count bigint) | true
-- stock_availability | TABLE(variant_id uuid, status text)                                           | true

-- anon can search (a page is at most 12 rows unless p_limit is given), and cannot read costs or inventory
set role anon;
select count(*) from public.catalog_search(p_limit => 48);      -- 23 with the DEMO seed
select count(*) from public.product_variant_costs;              -- ERROR: permission denied (that is the point)
reset role;
```

   The `product_variant_costs` select must fail; run `reset role;` afterwards in any case. Then tell PostgREST about the new objects: `notify pgrst, 'reload schema';` and run `schema_check.sql` again: only `since = 3b` rows may remain.

5. **Run the 3A tests** (this is the first time they prove the privacy of 3A on the real project): `npm run test:db -- tests/integration/db/catalog-public.test.ts`. Note: this file now also expects the 3B column `store_settings.announcement_text`, so run it **after** step 6, or expect its first check to list that column as missing.

6. **Apply 3B**: paste `20261101100000_catalog_admin.sql`, **Run once**, then record it in a separate query and verify (see "Applying the 3B migration" above). Then `schema_check.sql` must return **no rows**, and `npm run test:db` for `catalog-public.test.ts` and `catalog-admin.test.ts` must pass.

### The tests now check the project first

`tests/integration/db/catalog-public.test.ts` and `catalog-admin.test.ts` start with `assertProjectHas()` (`helpers.ts`): it asks the project whether every column and function the file needs exists and fails once, with a list of everything missing and the migrations that create it, before any fixture is created. `supabase/checks/schema_check.sql` is the same idea for the whole schema (713 objects), generated from the migrations; regenerate it when a migration is added.

## Production setup: how to avoid this

The cause was not the migration text; it was **applying by hand and recording by hand**. For production:

1. **Never record a migration separately from applying it.** Preferred: `supabase db push` from a machine that can reach the database (a laptop on another network, or CI). It runs each file and records its version only if the file succeeded, and it stops at the first error.
2. If the SQL Editor has to be used, the setup file must be **generated from `supabase/migrations/` in order** (never hand-assembled or hand-edited), start with `begin;`, contain each migration followed by its own `insert into supabase_migrations.schema_migrations …` **inside the same file**, and end with `commit;`. One transaction means the first error rolls back everything and **records nothing**, so a project can never say "applied" about something that is not there. If a statement cannot run inside a transaction on the hosted project (for example the storage policies that need table ownership, see `docs/DATABASE.md`), split the file at that statement and give that part its own generated file, with the same rules.
3. **End every setup with the checks**, as the last thing: `supabase/checks/schema_check.sql` must return no rows; then run the database tests against the project (`npm run test:db`, which now begins by listing anything missing). A production release is not done until both are clean.
4. Do not run the seed on production, and do not paste a migration from chat or from an old copy: always from the committed file at the release commit.

The generator for these setup files is `npm run setup:build` (`scripts/build-setup-sql.mjs`); the exact steps for a new project are in `docs/PRODUCTION_SETUP.md`.

## Tests (3B)

| What | Command | Needs |
|---|---|---|
| Unit: money parsing, daily-price logic, error messages, CSV parser/validator/export, image type check, schemas, row builders | `npm test` | nothing |
| Database: every admin write refused for anon and customers, cost privacy, never-ordered delete rule, price log and confirmation, import atomicity, photo and category rules | `npm run test:db -- tests/integration/db/catalog-admin.test.ts` | DEV project, migration applied. The fixtures use an active category `ust-test` while the tests run and deactivate it afterwards: do not run them while browsing the shop |
| Browser: the admin journey (daily prices, add product with photo, variants, archive, delete, stock, CSV, settings, staff and customer limits) | `npm run test:e2e:mobile`, `npm run test:e2e:desktop` (each on its own), or `npx playwright test tests/e2e/admin.spec.ts --project=desktop` | DEV project and `.env.local`; first run: `npx playwright install chromium` |

The admin tests do **not** use the login form. A setup project (`tests/e2e/admin.setup.ts`) creates an administrator, a staff member and a customer, signs each in **once per run** from the test process and saves the sessions in `tests/e2e/.auth/` (git-ignored); a teardown project deletes the users. The number of sign-ins therefore does not grow with the number of tests, and Supabase's sign-in rate limit is not touched. The login form itself is still tested by `auth.spec.ts`. The admin tests create only **draft** products named `ZZ E2E ...`, which the shop never shows, and delete them afterwards. If the base URL's Supabase is a stack on this machine (`127.0.0.1`), `DB_TEST_PROJECT_REF` is not needed.

## Known limitations (3B)

- The list pages (Daily prices, Products, Stock) load the whole catalogue and filter in the browser. Fine for a few thousand variants; beyond about 20,000 rows they stop with an error and would need server-side paging.
- Staff cannot delete anything and cannot see or set costs; an admin must do both. Settings, couriers and costs are admin only.
- The quick stock edit on Daily prices records a fixed reason ("Quick edit on Daily prices"); the Stock page asks for a real one.
- Creating a product and its first variant is two database calls. If the second fails the product stays as a draft and the page says so (a staff member cannot delete the draft; an admin can).
- CSV does not cover specifications, tractor compatibility or photos.
- Category and brand images and logos are not part of 3B.
- `place_order()` still contains the free-shipping rule. It stays off because the threshold is null and no screen can set it; remove the rule in Phase 4.
