# Orders (Phase 4)

Checkout, order confirmation and tracking, the admin Orders screens, the customer's order history, the printable slip and the owner's e-mail. Money and stock stay authoritative in the database (`place_order()`); the website never sends or trusts a price.

## What a customer and the owner see

```
product page -> cart (variant ids + quantities, in the browser)
   -> /checkout   1 contact   2 address   3 delivery method   4 payment   5 notes   6 review + Place order
   -> place_order() in ONE transaction  (guest: server only, rate limited / signed in: their own session)
   -> /order/<token>?placed=1   guest: the unguessable tracking link
      /account/orders/<id>      signed-in customer: their own order
   -> owner e-mail (Resend)     admin: /admin/orders
```

- **Payment** is cash on delivery. Bank transfer and EasyPaisa ("online") appear at checkout only when `store_settings.bank_transfer_enabled` / `online_payment_enabled` are true; both are off (the migration switches bank transfer off once). No screen sets them yet; use the SQL Editor (`update public.store_settings set …`). A bank-transfer order would need bank details and proof handling that are not part of this phase.
- **Delivery charge** is not calculated anywhere on the public site. The order total is the items total and says "Delivery charge will be confirmed by phone". Staff enter the agreed charge on the order (`set_order_delivery_charge()`); the database recalculates the total (`subtotal − discount + charge`) and the payment amount. Entering `0` confirms free delivery. After the money is collected, or once the order is finished, the charge is locked.
- **Idempotency.** The browser makes one key per checkout attempt (kept in `sessionStorage` until the order is placed). The same key with the same request always returns the same order (double click, retry, lost response); the same key with a different request is refused (`idempotency_key_conflict`) and the form takes a new key.
- **Tracking link (guests).** The token is 256 bits: HMAC-SHA256 of the key under `SUPABASE_SERVICE_ROLE_KEY`, derived by the server and passed to `place_order_as_guest()`, so a retry returns the same link. The database stores only its SHA-256. The page `/order/<token>` calls `get_order_by_tracking_token()` (service role, one narrow function) and shows status, timeline, courier and tracking number, items, totals and the city: **no phone, e-mail, street address, internal notes, costs or staff names**. It is `noindex` and sends no referrer. A made-up or malformed token is a 404.
- **Status workflow** (checked in the database, `_order_transition_allowed()`; `src/features/orders/status.ts` mirrors it and a unit test compares the two):

  ```
  New ─► Contacted ─► Confirmed ─► Dispatched ─► Delivered ─► Exchange requested ─► Delivered
   │          │            │            │
   └──────────┴────────────┴────────────┴─► Cancelled          (New can also go straight to Confirmed)
  ```

  "New" is the stored status `pending`. `processing`, `shipped` and `returned` are retired (a database enum value cannot be dropped): nothing leads into them, and an old order in one of them can still leave it.
- **Stock** (unchanged rules, `docs/DATABASE.md`): reserved when the order is placed; released **exactly once** when it is cancelled (also from Dispatched, e.g. refused at the door); deducted **exactly once** when it is delivered. An exchange afterwards deducts nothing.
- **Cash on delivery** is marked collected by staff (`mark_cod_collected()`), only for a COD order that has been dispatched.
- **Audit.** Every status change, delivery charge, courier/tracking, internal note and payment change writes `audit_log` inside the database function (who, when, what). Notes are not copied into it (only that one was added). Staff see this history on the order; customers never do.
- **Permissions** (`docs/AUTH.md`): staff and admins both run the order screens; customers get a 403. Staff never see costs (order lines carry none; `product_variant_costs` is admin-only). The functions check `is_admin()` themselves, so a forged request from a customer is refused by the database.

## The owner's e-mail (Resend)

Every new order sends one e-mail to the addresses in **Admin > Settings > order notification e-mails** (`store_private_settings.order_notification_emails`; never hardcoded). It runs after the response (`after()`), so it can never delay or fail an order.

| Variable (server only, never `NEXT_PUBLIC_`) | Meaning |
|---|---|
| `RESEND_API_KEY` | Your Resend API key. Without it the order is still placed and the failure is recorded. |
| `RESEND_FROM_EMAIL` | Sender, for example `Umar Siddique Traders <orders@your-domain.pk>`. The domain must be verified in Resend. If it is not set, Resend's test sender `onboarding@resend.dev` is used, which can only deliver to the address of your own Resend account (fine for a first test, not for launch). |

Each attempt is one row in `notifications` (template `owner_new_order`; a unique index allows one per order). If the key or the recipient is missing, or Resend refuses or is unreachable, the row is `failed` with a short reason (never the key) and the admin order page shows **"Owner notification not sent"** with that reason. Nothing retries automatically; the owner finds the order in the list. A customer e-mail is not part of this phase.

## Applying the migration (no CLI needed)

File: `supabase/migrations/20261102100000_orders.sql`. Safe to paste twice. **Do not record it in `schema_migrations` until the verification queries below pass.**

**Before this**, the project must already have 3A and 3B: run `supabase/checks/schema_check.sql`; only rows with `since = '4'` may appear.

1. Supabase dashboard (**dev** project) > **SQL Editor** > New query. Paste the whole file > **Run**. Expect `Success. No rows returned`. The file ends with a self-check that raises an error (and rolls everything back) if anything is off, so there is no half-applied state. If it errors, copy the message to me; do not record anything.
2. Verification. **Run each block as its own query** (the editor shows only the last result of a query). Every expected value is written under the query.

```sql
-- V1. The statuses.
select string_agg(e.enumlabel, ', ' order by e.enumsortorder) as order_status
  from pg_enum e join pg_type t on t.oid = e.enumtypid
 where t.typname = 'order_status' and t.typnamespace = 'public'::regnamespace;
-- pending, contacted, confirmed, processing, dispatched, shipped, delivered, exchange_requested, cancelled, returned
```

```sql
-- V2. The functions and who may run them (anon = a visitor, signed_in = any logged-in account, customers included).
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('anon', p.oid, 'execute') as anon_can,
       has_function_privilege('authenticated', p.oid, 'execute') as signed_in_can
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('place_order', 'place_order_as_guest', '_place_order', 'set_order_delivery_charge', 'set_order_shipment',
                     'add_order_note', 'mark_cod_collected', 'search_orders', 'get_order_by_tracking_token', 'set_order_status')
 order by 1, 2;
-- 10 rows. anon_can is false on EVERY row. signed_in_can is true on every row except
--   _place_order (10 arguments)        false  (internal)
--   place_order_as_guest (9 arguments) false  (the server only; there must be NO second row with 8 arguments)
-- The staff functions are executable by any logged-in account, but each one checks is_admin() inside and refuses a
-- customer with not_authorized; the database tests prove it.
```

```sql
-- V3. The order function no longer works out a delivery charge and still hides products in hidden categories.
select pg_get_functiondef('public._place_order(uuid, uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text, text)'::regprocedure) !~ 'shipping_rates|free_over|free_delivery' as no_delivery_charge_rule,
       pg_get_functiondef('public._place_order(uuid, uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text, text)'::regprocedure) ~ 'category_is_public' as keeps_hidden_category_rule;
-- true | true
```

```sql
-- V4. New columns, indexes and the payment switches.
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name in ('shipping_confirmed', 'shipping_confirmed_at')) as order_columns,
       (select count(*) from pg_indexes where schemaname = 'public' and indexname in ('notifications_owner_new_order_key', 'orders_number_trgm_idx', 'orders_customer_name_trgm_idx', 'orders_customer_phone_trgm_idx')) as indexes,
       (select cod_enabled from public.store_settings) as cod_enabled,
       (select bank_transfer_enabled from public.store_settings) as bank_transfer_enabled,
       (select online_payment_enabled from public.store_settings) as online_payment_enabled;
-- 2 | 4 | true | false | false
```

```sql
-- V5. A visitor cannot read orders. This MUST fail with "permission denied for table orders". Run the next line afterwards in any case.
set role anon;
select count(*) from public.orders;
```

```sql
reset role;
```

```sql
-- V6. A visitor cannot place an order. This MUST fail with "permission denied for function place_order_as_guest".
set role anon;
select public.place_order_as_guest(gen_random_uuid(), '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, 'x', 'cod'::public.payment_method);
```

```sql
reset role;
```

3. Run `supabase/checks/schema_check.sql` again. **It must return no rows.**
4. Only now record the migration (a separate query):

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20261102100000', 'orders')
on conflict (version) do nothing;
```

Expect `Success. No rows returned`. If any verification step above did not give the expected result, stop and send me the output; do not run this.

5. Create the owner's e-mail setting: **Admin > Settings**, the order e-mail field. Add `RESEND_API_KEY` (and `RESEND_FROM_EMAIL`) to `.env.local`, restart `npm run dev`.

A brand-new project does not use this file by hand: `npm run setup:build` generates all migrations in order, recording each inside its own transaction (`docs/PRODUCTION_SETUP.md`).

## Tests

| What | Command | Needs |
|---|---|---|
| Unit: status workflow (and its match with the SQL), totals, checkout schema/payload, the place-order action, error mapping, owner e-mail, tracking token, audit lines, admin filters | `npm test` | nothing |
| Database: place_order (idempotency, concurrent last unit, no delivery charge), workflow, cancel restores stock once, delivery deducts once, staff functions, audit, search, anon/customer visibility, tracking summary, outbox | `npm run test:db -- tests/integration/db/orders.test.ts` | DEV project, migration applied. It begins by listing anything the project lacks |
| Browser: guest COD checkout, the tracking link, an administrator processes an order, a customer is kept out of admin orders | `npx playwright test tests/e2e/orders.spec.ts --project=desktop` (and `--project=mobile`) | DEV project, migration applied, `.env.local`; first run: `npx playwright install chromium` |

The Phase 1 database tests were updated for this phase (no shipping fee at checkout, the new workflow, bank transfer switched on only inside the one test that needs it).

### Test isolation and the leftovers on DEV

Orders are never deleted, so what a test run leaves behind is still there for the next run. `orders.test.ts` is written for that: every test uses its own new customer (the open-order limit counts by phone and by user), every tracking token and key it stores is random (`orders.tracking_token_hash` is unique for ever), only one test changes a store setting (the limit itself, restored in `finally`), and `afterAll` cancels the run's open orders even after failures (`cancelOpenOrders` in `tests/integration/db/helpers.ts`), then archives the fixtures and deletes the users.

Runs made before that change left open test orders and test fixtures on DEV. `supabase/checks/test_data_preview.sql` (read-only) counts them and shows whether a killed run left a setting changed; `supabase/checks/test_data_cleanup.sql` removes them. Dev only: the cleanup opens the two append-only triggers inside one statement, deletes only rows that are recognisably test rows (database tests: `ust_test_` delivery methods, `UST-TEST-` SKUs, `ust-test-` products; Playwright: `zz-e2e-` products, `ZZ-E2E-` lines, customers named "E2E Buyer ...", users `ust-e2e-...@example.test`), and closes the triggers again. It refuses to run if a selected order has a line that is not a test line or an invoice, if a test product has stock movements for, or is on a line of, an order that is not a test order, or if a test product has a variant with a non-test SKU. Photo files of deleted products stay in Storage (the preview file has a query that lists them), and the audit log and price history are left alone. It was run against a local Postgres 17 with the real migrations, not against Supabase.

## Known limits

- Bank transfer, EasyPaisa/online and payment proofs are not built (the switches exist and the database enforces "paid before dispatch" for them, but there is no payment screen).
- No customer e-mail or SMS, no invoice or PDF (the slip prints through the browser), no coupons at checkout (the database still supports them), no courier APIs, no returns or refunds screen.
- Order search covers order number, phone and name; the list is paged 25 at a time and ordered newest first.
- The owner e-mail is not retried automatically.
- A guest who loses the tracking link cannot look the order up by number and phone (by design: no enumeration); they call the shop.
- The 10-address saved-address picker in checkout fills address, city, province and landmark; the receiver name and phone come from the profile.
