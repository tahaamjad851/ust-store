-- READ-ONLY. Counts what the automated tests left on the DEV project, and whether they left a store setting changed.
-- Nothing is modified. Pair: supabase/checks/test_data_cleanup.sql (deletes them).
--
-- A test row is recognised by what only the tests create:
--   database tests (npm run test:db)
--     * an order whose delivery method id starts with ust_test_ (helpers.ts makes one per run), or with a line whose
--       SKU starts with UST-TEST-
--     * a product whose slug starts with ust-test-, with its variants, stock and ledger rows
--     * the delivery methods ust_test_*, the category ust-test, the users ust-test-*@example.test
--   Playwright (npx playwright test)
--     * a product whose slug starts with zz-e2e- (its variants have SKUs starting ZZ-E2E-)
--     * an order with a ZZ-E2E- line, or placed by the customer "E2E Buyer ..." (these use a REAL delivery method,
--       so the delivery method cannot be used to find them)
--     * the users ust-e2e-*@example.test
-- A "test line" is a line whose SKU starts with UST-TEST- or ZZ-E2E-. Everything real is not matched.
--
-- Rows marked "must be 0" are the safety checks of the cleanup script: if one is not 0, the cleanup refuses to run.
--
-- Paste the whole file; it is one query and returns one row per line below.
with tp as (
  select p.id from public.products p where p.slug like 'ust-test-%' or p.slug like 'zz-e2e-%'
), tv as (
  select v.id, v.sku from public.product_variants v where v.product_id in (select id from tp)
), t as (
  select o.id, o.status::text as status,
         (o.customer_name like 'E2E Buyer %'
          or exists (select 1 from public.order_items i where i.order_id = o.id and i.sku like 'ZZ-E2E-%')) as playwright
    from public.orders o
   where o.delivery_method_id like 'ust\_test\_%' escape '\'
      or o.customer_name like 'E2E Buyer %'
      or exists (select 1 from public.order_items i where i.order_id = o.id and (i.sku like 'UST-TEST-%' or i.sku like 'ZZ-E2E-%'))
)
select 1 as n, 'setting: max_open_orders_per_customer (your value; launch value 3)' as what, s.max_open_orders_per_customer::text as value from public.store_settings s
union all select 2, 'setting: bank_transfer_enabled (launch value false)', s.bank_transfer_enabled::text from public.store_settings s
union all select 3, 'test orders, all (database tests + Playwright)', count(*)::text from t
union all select 4, '  of which Playwright (ZZ-E2E line or "E2E Buyer")', count(*)::text from t where playwright
union all select 5, 'test orders still OPEN (new/contacted/confirmed/dispatched)', count(*)::text from t where status in ('pending', 'contacted', 'confirmed', 'dispatched')
union all select 6, 'test orders: ' || status, count(*)::text from t group by status
union all select 7, 'must be 0: test orders with a NON-test line', count(distinct t.id)::text
  from t join public.order_items i on i.order_id = t.id where i.sku not like 'UST-TEST-%' and i.sku not like 'ZZ-E2E-%'
union all select 8, 'must be 0: test orders with an invoice', count(*)::text from public.invoices v where v.order_id in (select id from t)
union all select 9, 'test products (ust-test-, zz-e2e-)', count(*)::text from tp
union all select 10, '  of which Playwright (zz-e2e-)', count(*)::text from public.products where slug like 'zz-e2e-%'
union all select 11, 'must be 0: variants of test products with a NON-test SKU', count(*)::text from tv where sku not like 'UST-TEST-%' and sku not like 'ZZ-E2E-%'
union all select 12, 'stock movements of test products', count(*)::text from public.stock_movements m where m.variant_id in (select id from tv)
union all select 13, 'must be 0: stock movements of test products for a NON-test order', count(*)::text
  from public.stock_movements m where m.variant_id in (select id from tv) and m.order_id is not null and m.order_id not in (select id from t)
union all select 14, 'must be 0: order lines of test products on a NON-test order', count(*)::text
  from public.order_items i where (i.product_id in (select id from tp) or i.variant_id in (select id from tv)) and i.order_id not in (select id from t)
union all select 15, 'photo rows of test products (the files stay in Storage, see the end of this file)', count(*)::text from public.product_images where product_id in (select id from tp)
union all select 16, 'test delivery methods (ust_test_)', count(*)::text from public.delivery_methods where id like 'ust\_test\_%' escape '\'
union all select 17, 'test category (ust-test)', count(*)::text from public.categories where slug = 'ust-test' and parent_id is null
union all select 18, 'test users, database tests (ust-test-*@example.test)', count(*)::text from auth.users where email like 'ust-test-%@example.test'
union all select 19, 'test users, Playwright (ust-e2e-*@example.test)', count(*)::text from auth.users where email like 'ust-e2e-%@example.test'
order by n, what;

-- Not run with the query above (commented out so the whole file is one query). To list the photo files that the
-- cleanup leaves in Storage (delete them in Dashboard > Storage > product-images), run this BEFORE the cleanup:
--
--   select storage_path from public.product_images
--    where product_id in (select id from public.products where slug like 'ust-test-%' or slug like 'zz-e2e-%')
--    order by storage_path;
--
-- Not covered, on purpose: price_changes (the price history is append-only and has no link to products, so rows of
-- deleted test variants stay readable) and audit_log (append-only).
