-- DELETES the leftovers of the automated tests (database tests AND Playwright) on the DEV project. DEV ONLY. Never run
-- this on production, and not while a test run is in progress.
-- Run supabase/checks/test_data_preview.sql first and read it; run it again afterwards (every test row should be 0).
--
-- Why a special script: the app never deletes orders. The stock ledger and the status history are append-only, and
-- ledger rows are `on delete restrict`, so a plain `delete from orders` fails by design. This script opens the two
-- append-only triggers, removes only test rows, and closes them again, inside ONE statement: it either removes
-- everything or (on any error, or if a guard below trips) nothing at all, and the triggers are never left open.
-- Test rows are defined in test_data_preview.sql. It refuses to run if:
--   * a selected order has a line that is not a test line (SKU not UST-TEST-% or ZZ-E2E-%),
--   * a selected order has an invoice,
--   * a test product has stock movements for an order that is not a selected test order,
--   * a test product is on a line of an order that is not a selected test order,
--   * a variant of a test product has a SKU that is not a test SKU.
-- The audit log and the price history (append-only) are left as they are. Photo files of deleted products stay in
-- Storage: list them with the commented query at the end of test_data_preview.sql BEFORE running this, and delete them
-- in Dashboard > Storage > product-images.
--
-- Paste the whole file. The last result shows both triggers back on (enabled = O).

do $$
declare
  v_products uuid[];
  v_variants uuid[];
  v_orders   uuid[];
  v_n        bigint;
begin
  select coalesce(array_agg(id), '{}') into v_products
    from public.products where slug like 'ust-test-%' or slug like 'zz-e2e-%';
  select coalesce(array_agg(id), '{}') into v_variants
    from public.product_variants where product_id = any (v_products);
  select coalesce(array_agg(o.id), '{}') into v_orders
    from public.orders o
   where o.delivery_method_id like 'ust\_test\_%' escape '\'
      or o.customer_name like 'E2E Buyer %'
      or exists (select 1 from public.order_items i where i.order_id = o.id and (i.sku like 'UST-TEST-%' or i.sku like 'ZZ-E2E-%'));

  -- Refuse anything that is not clearly a test row.
  if exists (select 1 from public.order_items i
              where i.order_id = any (v_orders) and i.sku not like 'UST-TEST-%' and i.sku not like 'ZZ-E2E-%') then
    raise exception 'refusing: a selected order has a line that is not a test line (preview row 7)';
  end if;
  if exists (select 1 from public.invoices where order_id = any (v_orders)) then
    raise exception 'refusing: a selected order has an invoice (preview row 8)';
  end if;
  if exists (select 1 from public.product_variants v
              where v.id = any (v_variants) and v.sku not like 'UST-TEST-%' and v.sku not like 'ZZ-E2E-%') then
    raise exception 'refusing: a test product has a variant whose SKU is not a test SKU (preview row 11)';
  end if;
  if exists (select 1 from public.stock_movements m
              where m.variant_id = any (v_variants) and m.order_id is not null and not (m.order_id = any (v_orders))) then
    raise exception 'refusing: a test product has stock movements for an order that is not a test order (preview row 13)';
  end if;
  if exists (select 1 from public.order_items i
              where (i.product_id = any (v_products) or i.variant_id = any (v_variants)) and not (i.order_id = any (v_orders))) then
    raise exception 'refusing: a test product is on an order that is not a test order (preview row 14)';
  end if;

  alter table public.stock_movements disable trigger stock_movements_append_only;
  alter table public.order_status_history disable trigger order_status_history_append_only;

  delete from public.notifications where order_id = any (v_orders);
  delete from public.internal_notes where entity_type = 'order' and entity_id = any (v_orders);
  delete from public.stock_movements where order_id = any (v_orders) or variant_id = any (v_variants);
  delete from public.orders where id = any (v_orders);        -- lines, history, payments, shipments cascade
  get diagnostics v_n = row_count;
  delete from public.products where id = any (v_products);    -- variants, stock, costs, photo rows cascade
  delete from public.categories c
   where c.slug = 'ust-test' and c.parent_id is null
     and not exists (select 1 from public.products p where p.category_id = c.id)
     and not exists (select 1 from public.categories k where k.parent_id = c.id);
  delete from public.delivery_methods where id like 'ust\_test\_%' escape '\';

  alter table public.stock_movements enable trigger stock_movements_append_only;
  alter table public.order_status_history enable trigger order_status_history_append_only;

  raise notice 'removed % test orders and % test products', v_n, cardinality(v_products);
end;
$$;

-- Test users that a killed run left behind (their orders are gone above).
delete from auth.users where email like 'ust-test-%@example.test' or email like 'ust-e2e-%@example.test';

-- Both triggers must show enabled = O.
select tgrelid::regclass as "table", tgname, tgenabled as enabled
  from pg_trigger
 where tgname in ('stock_movements_append_only', 'order_status_history_append_only');
