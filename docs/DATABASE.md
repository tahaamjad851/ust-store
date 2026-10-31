# Database

Supabase (Postgres 17) schema for Umar Siddique Traders. Everything lives in `supabase/migrations/`; never edit an applied migration, add a new one.

Product decisions that shape the schema are recorded in `docs/ROADMAP.md` (no wholesale pricing, no tax handling, guest checkout via the server, stock lifecycle, order numbers).

## Applying migrations (hosted dev project)

You run these yourself; Claude never handles the database password or keys.

```powershell
npx supabase login                               # opens the browser
npx supabase link --project-ref <your-dev-ref>   # asks for the database password
npx supabase db push --dry-run                   # lists the 9 migrations, applies nothing
npx supabase db push --include-seed              # applies migrations, then supabase/seed.sql
```

**Never use `--include-seed` against production after launch**: re-running the seed resets the store contact details, payment flags and DEMO product prices.

Expected output of the dry run: the nine files `20261029100000_foundation.sql` … `20261029100800_hardening.sql`. The real push prints `Applying migration …` for each, then `Seeding data from supabase/seed.sql…` and `Finished supabase db push.`

If a migration fails, nothing after it is applied; fix the problem in a **new** migration (or, on the dev project only, reset — see below). The last migration also fails on purpose if any table lacks RLS or if `anon`/`authenticated` can execute a function outside the allowlist.

If the push fails with `must be owner of table objects` (Supabase has been tightening storage ownership), create the storage policies from `20261029100700_storage.sql` in the dashboard (Storage → Policies) instead.

Also in the hosted project (Authentication settings): keep **anonymous sign-ins disabled**, keep **email confirmation on**, and set the minimum password length to at least 8.

`.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API). The service-role key is server-only: never prefix it with `NEXT_PUBLIC_`.

## First admin (one time)

No admin account, password or credential is in any migration or seed.

1. Create your account: Supabase dashboard → Authentication → Users → **Add user** (or sign up through the site once Phase 2 is done). Use a strong password and your real email.
2. In the dashboard **SQL Editor** (runs as `postgres`, which bypasses RLS), run, replacing the email:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com'
on conflict (user_id) do update set role = 'admin';

-- Check
select u.email, r.role from public.user_roles r join auth.users u on u.id = r.user_id;
```

After that, admins add staff from the admin panel (Phase 6) or with the same snippet using `'staff'`. Nobody can change their own role, and staff cannot manage roles.

## Running the database tests

```powershell
npm run test:db
```

Runs `tests/integration/db/*.test.ts` against the project in `.env.local`. It refuses to start unless `DB_TEST_PROJECT_REF` (in `.env.local`) is set to your **dev** project ref and matches `NEXT_PUBLIC_SUPABASE_URL`, so it can never write to production. Expected: `Test Files  2 passed (2)` and `Tests  25 passed (25)`, in roughly 1–3 minutes.

The run signs in about 15 test users; if you run it several times in a row and see `Request rate limit reached`, wait a few minutes. The tests temporarily raise `store_settings.max_open_orders_per_customer` and restore it afterwards.

The tests create users named `ust-test-<run>-…@example.test`, products and SKUs labelled `UST TEST <run>` / `UST-TEST-<run>-…`, and a delivery method `ust_test_<run>`. Users are deleted and products archived afterwards, but orders and ledger rows stay (they are append-only by design). **Only run them against the dev project.** Reset it when the leftovers get in the way.

## Resetting the dev database

**Destroys all data in the linked project.** Dev only:

```powershell
npx supabase db reset --linked      # re-applies all migrations, then the seed
```

Then repeat the first-admin snippet if your role was removed.

## Seed (DEMO data)

`supabase/seed.sql` is generated from `src/lib/mock/` so the database and the mock storefront match until Phase 3:

```powershell
npm run db:seed:generate
```

It contains categories, tractor makes and models, 23 DEMO products (one default variant each), opening stock written through the ledger, compatibility rows, the client-approved DEMO contact details, and placeholder shipping rates (cargo terminal Rs 500, courier Rs 300). No customers, orders, staff or bank details. It is safe to run twice.

### Removing demo data

Before launch, in the SQL editor (products with orders cannot be deleted — archive them instead):

```sql
update public.products set status = 'archived'
 where id in (select product_id from public.product_variants where sku in (/* DEMO SKUs */));
```

Since Phase 3B the admin does this: archive any product, and (as an administrator) delete products that were never ordered, with a confirmation. The seed's products were never ordered, so they can be deleted from **Admin > Products**.

## Roles and access

| Who | How identified | Can |
|---|---|---|
| anon | no session | Read active categories, brands, tractor models, published products/variants/images/compatibility, approved reviews, store settings, delivery methods, shipping rates; call `stock_availability()` (status only) and `catalog_search()` (ids and status only). Nothing else. |
| customer | signed in, no role row | The above, plus their own profile, addresses, wishlist, cart, orders (read), returns, reviews (verified purchases), quotes; `place_order()`, tracking and bank-transfer functions for their orders. |
| staff | `user_roles.role = 'staff'` | Catalog, costs, stock (`adjust_stock()`), orders (`set_order_status()`, `set_payment_status()`), shipments, invoices, notes, audit log; read customers' profiles and addresses. Not roles, settings, delivery fees, bank accounts, coupons, refunds or editing customer profiles. |
| admin | `user_roles.role = 'admin'` | Everything staff can, plus roles (not their own), store settings, delivery methods and shipping rates, private settings, bank accounts, coupons, refunds, editing and disabling accounts. |
| service_role | server only | Bypasses RLS. Used for guest checkout (`place_order_as_guest()`), guest tracking, webhooks, notifications, the expiry job. |

`is_admin()` is true for admin and staff; `is_full_admin()` for admin only. Both are false for a disabled account (`profiles.disabled_at`), so disabling a staff member removes their powers at once; also ban the user in Supabase Auth so their session cannot be refreshed.

The staff functions (`adjust_stock`, `set_order_status`, `set_payment_status`) check the caller's JWT, so server code must call them with the signed-in staff member's session, not the service-role key. Every table has RLS enabled (the last migration fails if one does not). anon has no table privileges except the public catalog tables listed above. New functions are not executable by anon/authenticated until a migration grants it.

## Tables

| Area | Tables |
|---|---|
| Users | `profiles` (name, phone, company, disabled flag), `user_roles` |
| Catalog | `categories` (tree), `brands`, `tractor_makes`, `tractor_models` (year range), `products`, `product_variants` (SKU, barcode, regular/sale price), `product_variant_costs` (staff only), `product_images`, `product_compatibility` |
| Stock | `inventory` (per variant: `on_hand`, `reserved`, thresholds), `stock_movements` (append-only ledger) |
| Customers | `addresses`, `wishlist_items`, `carts`, `cart_items` (quantities only) |
| Settings | `store_settings` (public), `store_private_settings`, `delivery_methods`, `shipping_rates`, `bank_accounts` (admin only, never seeded) |
| Promotions | `coupons`, `coupon_products`, `coupon_categories`, `coupon_redemptions` |
| Orders | `orders` (snapshots, idempotency key, tracking-token hash), `order_items` (name/SKU/price snapshots), `order_status_history`, `order_number_counters`, `payments`, `payment_events` (unique provider event id), `shipments`, `returns`, `refunds`, `invoices` |
| Other | `reviews` (verified purchasers, moderated), `quotes` (bulk enquiries), `notifications` (outbox), `internal_notes`, `audit_log` (append-only) |

Conventions: UUID primary keys; money is `*_paisa bigint` with `CHECK >= 0` (Rs 1 = 100 paisa); `created_at`/`updated_at` maintained by trigger; foreign keys with explicit `on delete`; indexes on foreign keys and common filters (trigram search on product text and SKU).

Every product has at least one variant. A product without options has one default variant, so SKU, price and stock always live on `product_variants`. The price charged is `coalesce(sale_price_paisa, regular_price_paisa)`.

## Placing an order

`place_order()` (signed-in) and `place_order_as_guest()` (server only) take **variant ids and quantities only**, plus contact details, address, delivery method, payment method, optional coupon code and notes. In one transaction they:

1. Take an advisory lock on the idempotency key.
2. Validate contact details (Pakistani mobile normalised to `03XXXXXXXXX`), address (province from the fixed list) and items (1–50 lines, quantity 1–999, duplicates merged).
3. Idempotency: if an order with that key exists for the same caller **and the same request** (hash of the normalised cart, contact, address, methods, coupon, notes), return it with `replayed: true` and `tracking_token: null` (the token is only returned by the first call; the server keeps it for the session). A different request or another caller with that key gets `idempotency_key_conflict`.
4. Anti-hoarding: refuse with `too_many_open_orders` if the account or phone already has `store_settings.max_open_orders_per_customer` (default 3) pending/confirmed orders.
5. Lock the inventory rows `FOR UPDATE` in variant-id order, then the variant and product rows `FOR SHARE` (so prices cannot change mid-checkout), check availability, and price every line from the database.
6. Validate the delivery method and pick the most specific active shipping rate (city → province → default).
7. Apply the coupon (locked `FOR UPDATE`): active window, minimum order, total and per-customer limits, product/category targeting (any ancestor category), percentage cap. Every coupon failure returns the same `coupon_invalid`, so codes cannot be probed.
8. Shipping is free when the discounted subtotal reaches the rate's or the store's threshold.
9. Allocate the order number `UST-<year>-<000001>` (counter per year, Asia/Karachi).
10. Insert the order (with snapshots), items, stock reservations and ledger rows, status history, a payment row, and the coupon redemption.

It returns `order_id`, `order_number`, totals and the `tracking_token`. Only the token's SHA-256 is stored; the raw token goes into the guest's tracking link.

Errors are raised with stable messages for the UI: `insufficient_stock` (detail has SKU and available quantity), `item_unavailable`, `invalid_items`, `invalid_phone`, `invalid_name`, `invalid_email`, `invalid_address`, `coupon_invalid`, `delivery_method_unavailable`, `no_shipping_rate`, `payment_method_unavailable`, `guest_checkout_disabled`, `too_many_open_orders`, `idempotency_key_conflict`, `account_disabled`, `not_authenticated` (also for Supabase anonymous sign-ins, which must check out as guests).

## Order lifecycle

```
pending ──► confirmed ──► processing ──► dispatched ──► shipped ──► delivered ──► returned
   │            │              │              └───────────────────────►┘
   └────────────┴──────────────┴──► cancelled
```

Changed only through `set_order_status()` (staff). Any other transition fails with `invalid_transition`. Bank-transfer and online orders must be `paid` before `processing` (`payment_required`). The note passed to `set_order_status()` is shown to the customer in their order history; put internal remarks in `internal_notes`.

Payment status (`set_payment_status()`, staff): `unpaid → pending_verification | paid | failed`, `pending_verification → paid | failed | unpaid`, `failed → unpaid | pending_verification | paid`, `paid → refunded`. A customer's bank-transfer reference or proof (`submit_bank_transfer_reference()`) only moves the payment to `pending_verification`; staff decide `paid`.

## Stock lifecycle

| Event | on_hand | reserved | Ledger type |
|---|---|---|---|
| Stock received / returned to shelf (`adjust_stock`) | +n | | receive / return |
| Damaged (`adjust_stock`) | −n | | damage |
| Stock count correction (`adjust_stock`) | ±n | | adjustment |
| Order placed | | +n | reserve |
| Order cancelled (once) | | −n | release |
| Order shipped or delivered (once) | −n | −n | sale |

`available = on_hand − reserved` never goes negative (`CHECK reserved <= on_hand`). Nobody updates `inventory` directly; every change writes a `stock_movements` row, and for every variant `inventory` equals the sum of its ledger. `orders.stock_state` (reserved → released or deducted) and a unique (order, variant, type) ledger index guarantee release and deduction happen at most once. Returned goods go back on the shelf with `adjust_stock(..., 'return', ...)` once inspected (moving an order to `returned` does not restock by itself).

## Returns

Customers request returns only through `request_return(order_item_id, quantity, reason)`: the order must be theirs and `delivered`, the product `is_returnable`, the request within `store_settings.return_period_days` of delivery, and the total requested for that item (excluding rejected requests) cannot exceed the quantity bought. Staff then update the return's status and record refunds (admins only).

### Unpaid bank transfers (48-hour hold)

Bank-transfer orders get `reservation_expires_at = now() + store_settings.bank_transfer_hold_hours` (48 by default). `expire_unpaid_bank_transfers()` cancels `pending` or `confirmed` orders whose payment is still `unpaid` or `failed` (rejected) after that time, and releases their stock. When staff reject a reference (or reset to unpaid), the hold is extended by the hold period so the customer can retry. Orders where the customer submitted a reference (`pending_verification`) are left for staff. The job works in batches of 100.

COD orders do not expire; staff cancel stale ones. The open-order cap stops one customer from reserving everything.

Enable it later (dashboard → Database → Extensions → enable `pg_cron`), then in the SQL editor:

```sql
select cron.schedule(
  'expire-unpaid-bank-transfers',
  '*/15 * * * *',
  $$ select public.expire_unpaid_bank_transfers(); $$
);
-- Remove: select cron.unschedule('expire-unpaid-bank-transfers');
```

## Guest orders and tracking

Guests never call the database directly. The Next.js server (Phase 4) rate-limits the request and calls `place_order_as_guest()` with the service-role client (`src/lib/supabase/admin.ts`, `server-only`). The guest gets a link containing the tracking token; the server resolves it with `get_order_by_tracking_token()` (no phone, email or full address is returned). Signed-in customers see their orders through RLS.

Bank details are shown only via `get_bank_transfer_details()` for an open, unpaid bank-transfer order the caller owns (or holds the token for).

## Storage

| Bucket | Access | Limits |
|---|---|---|
| `product-images` | Public read by URL; staff upload/replace/delete | 5 MB; JPEG, PNG, WebP, AVIF (no SVG) |
| `payment-proofs` | Private. Customers upload into `<user id>/<order id>/` for their own open bank-transfer order while payment is awaited (`unpaid`/`failed`) and read their own files; staff read all; admin delete. Guest proofs are uploaded by the server under `guest/<order id>/`. Serve PDFs as downloads (`Content-Disposition: attachment`). | 5 MB; JPEG, PNG, WebP, PDF |

## Privacy and retention

Orders keep contact and address snapshots for accounting. Deleting an auth user removes their profile, addresses, wishlist and cart and sets `orders.user_id` to null; the order snapshot stays. `audit_log`, `stock_movements` and `order_status_history` are append-only.
