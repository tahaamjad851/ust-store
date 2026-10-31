# Public catalog (Phase 3A)

The storefront reads categories, tractor makes and models, products, variants, images, compatibility and store settings from Supabase. Admin screens to edit them are Phase 3B; until then the catalog is whatever is in the database (the DEMO seed in development).

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

Only bounded listing shapes are cached (no free text, no price range, a tractor model that exists, the first 10 pages); a malformed product slug is refused before the cached lookup; free-text searches and the cart lookup are never cached, so made-up URLs cannot fill the cache. **Phase 3B** admin actions must call `revalidateTag(tag, "max")` for what they change (categories → `catalog-categories`, products/variants/images/compatibility → `catalog-products`, prices and stock → `catalog-products` and `catalog-stock`, settings → `catalog-settings`). **Phase 4** order placement must revalidate `catalog-stock`. Until then a change shows up within the lifetimes above. Money and stock stay authoritative in the database: `place_order()` re-prices and re-checks everything.

Product and category pages are prerendered for what exists at build time (the 48 newest products, every category) and rendered on first visit for the rest. An unknown or deactivated URL shows the not-found page with `noindex`; the status is 404 (the first request to a URL that was never generated may be answered 200 by a production server, because the page shell streams first).

### Images

`product_images.storage_path` is a path in the public `product-images` bucket; the URL is built from `NEXT_PUBLIC_SUPABASE_URL` (`publicImageUrl()` refuses paths with `..`, a leading slash or empty segments). Products without a photo show a shipped placeholder drawing chosen by product type. `next.config.ts` allows exactly one remote image pattern: this project's host, path `/storage/v1/object/public/product-images/**`. The Content-Security-Policy (`img-src`, `connect-src`) names the same exact origin. **There is no wildcard fallback: `npm run build` and `npm start` stop with an error if `NEXT_PUBLIC_SUPABASE_URL` is missing or is not an https URL** (plain http is accepted only for localhost). `npm run typecheck` runs `next typegen`, which loads the same config, so it needs the variable too (any valid https URL).

Category images (`categories.image_path`) have no bucket yet; only a shipped `/images/...` drawing is used, everything else shows the placeholder.

### Cart

Browser only (`localStorage` key `ust-cart-v2`): `[{ variant_id, quantity }]` and nothing else. The cart and checkout pages send the variant ids to a Server Action (`lookupCartItems`), which returns name, image, price and stock status from the database; unknown or no-longer-sold variants are dropped from the cart, out-of-stock lines stay visible but are left out of the total and block "Proceed to checkout". Checkout is still the DEMO path (nothing is sent) until Phase 4.

Delivery is never calculated on public pages. Product page, cart and checkout show `store_settings.delivery_charge_note`; the product page and FAQ show `store_settings.return_policy_note`. Both are columns of `store_settings` (public, admin-editable in 3B). Until then change them in the SQL editor:

```sql
update public.store_settings
   set delivery_charge_note = 'Delivery charge confirmed by phone',
       return_policy_note   = 'Exchange within 7 days if the product is in original condition.';
```

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
select count(*) from public.catalog_search();                       -- 23 with the DEMO seed
select count(*) from public.catalog_search('clutch plate');         -- a few
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
- **RLS is looser than the pages (open, medium):** the database policies hide drafts and archived products and inactive variants, but not products in a deactivated category; the site and `catalog_search()` hide those, the API does not. Fixed first in Phase 3B (needs the database test fixtures changed too).
- No per-IP rate limit on search and cart lookups; use the host's firewall until one is added.
- If the layout (header, footer, menus) cannot load, for example when the database is unreachable, `src/app/global-error.tsx` shows a plain page; inside the shop, `(store)/error.tsx` shows the normal chrome.
- Free-delivery messages (announcement bar, trust strip, cart progress, FAQ) still show when `store_settings.free_delivery_threshold_paisa` is set. The DEMO seed sets it to Rs 10,000, a placeholder: set it to `null` (`update public.store_settings set free_delivery_threshold_paisa = null;`) unless the client confirms a real offer.
