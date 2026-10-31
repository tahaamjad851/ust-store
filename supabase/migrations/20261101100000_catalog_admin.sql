-- Phase 3B: catalog admin.
--
--   1. Closes the Phase 3A RLS gap: products (and their variants, images and compatibility) in a
--      deactivated category are no longer readable through the API.
--   2. Cost prices are admin-only (staff lose access); only an admin may really delete catalog rows.
--   3. "Never delete anything an order refers to" is enforced by the database for every caller:
--      BEFORE DELETE guards on products, variants, categories and brands, and a controlled purge of a
--      never-ordered variant's stock ledger.
--   4. price_changes: who changed which price, from what to what, when. Written by a trigger, so no
--      code path (daily prices, product editor, CSV import, SQL editor) can skip it.
--   5. apply_daily_changes(): the "Save changes" button of the Daily prices page, one transaction.
--   6. import_catalog(): applies a validated CSV import, one transaction.
--   7. Catalog rules: two category levels, at most 8 images per product with a fixed storage path,
--      one primary image, reordering.
--   8. Every catalog write is audited by a trigger (changed column names only, never cost values).
--   9. Settings: announcement text, price-change alert percentage, courier list, exchange text,
--      free-delivery threshold set to NULL (no free-delivery offer).
--
-- Staff (user_roles.role = 'staff') keep day-to-day catalog work; the admin additionally has costs,
-- real deletes and the settings.

-- ---------------------------------------------------------------------------
-- 1. RLS gap: a product is public only while its category and every ancestor are active
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because anon cannot read inactive categories (RLS hides them) and the walk up
-- needs to see them. It returns a boolean only.
create function public.category_is_public(p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chain as (
    select c.id, c.parent_id, c.is_active from public.categories c where c.id = p_category_id
    union all
    select c.id, c.parent_id, c.is_active from public.categories c join chain ch on c.id = ch.parent_id
  )
  select exists (select 1 from chain where id = p_category_id)
     and not exists (select 1 from chain where not is_active);
$$;
revoke all on function public.category_is_public(uuid) from public;
grant execute on function public.category_is_public(uuid) to anon, authenticated, service_role;

drop policy products_select on public.products;
create policy products_select on public.products for select to anon, authenticated
  using (
    (select public.is_admin())
    or (status = 'published' and public.category_is_public(category_id))
  );

drop policy product_variants_select on public.product_variants;
create policy product_variants_select on public.product_variants for select to anon, authenticated
  using (
    (select public.is_admin())
    or (is_active and exists (
      select 1 from public.products p
       where p.id = product_variants.product_id and p.status = 'published' and public.category_is_public(p.category_id)
    ))
  );

drop policy product_images_select on public.product_images;
create policy product_images_select on public.product_images for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.products p
       where p.id = product_images.product_id and p.status = 'published' and public.category_is_public(p.category_id)
    )
  );

drop policy product_compatibility_select on public.product_compatibility;
create policy product_compatibility_select on public.product_compatibility for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.products p
       where p.id = product_compatibility.product_id and p.status = 'published' and public.category_is_public(p.category_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Costs are admin-only; only an admin deletes catalog rows
-- ---------------------------------------------------------------------------
drop policy product_variant_costs_select on public.product_variant_costs;
drop policy product_variant_costs_insert on public.product_variant_costs;
drop policy product_variant_costs_update on public.product_variant_costs;
drop policy product_variant_costs_delete on public.product_variant_costs;
create policy product_variant_costs_select on public.product_variant_costs for select to authenticated
  using ((select public.is_full_admin()));
create policy product_variant_costs_insert on public.product_variant_costs for insert to authenticated
  with check ((select public.is_full_admin()));
create policy product_variant_costs_update on public.product_variant_costs for update to authenticated
  using ((select public.is_full_admin())) with check ((select public.is_full_admin()));
create policy product_variant_costs_delete on public.product_variant_costs for delete to authenticated
  using ((select public.is_full_admin()));

do $$
declare
  t text;
begin
  foreach t in array array['categories', 'brands', 'tractor_makes', 'tractor_models', 'products', 'product_variants'] loop
    execute format('drop policy %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_full_admin()))', t || '_delete', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Nothing an order refers to can be deleted
-- ---------------------------------------------------------------------------
-- The stock ledger is append-only, with one exception: when a variant that was never ordered is
-- deleted, its ledger goes with it (the guard below sets ust.purge_variant for that one variant and
-- only inside the delete). Nobody can reach set_config through the API.
drop trigger stock_movements_append_only on public.stock_movements;
create function public.stock_movements_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('ust.purge_variant', true) = old.variant_id::text then
    return old;
  end if;
  raise exception 'stock_movements is append-only' using errcode = '42501';
end;
$$;
create trigger stock_movements_append_only before update or delete on public.stock_movements
  for each row execute function public.stock_movements_guard();

create function public.products_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.order_items where product_id = old.id) then
    raise exception 'product_has_orders' using errcode = '23503',
      detail = 'This product is on an order. Archive it instead.';
  end if;
  -- Removing the row would silently widen a coupon (a coupon without targets applies to everything).
  if exists (select 1 from public.coupon_products where product_id = old.id) then
    raise exception 'product_in_coupon' using errcode = '23503',
      detail = 'A coupon is limited to this product. Archive it instead.';
  end if;
  return old;
end;
$$;
create trigger products_guard_delete before delete on public.products
  for each row execute function public.products_guard_delete();

create function public.product_variants_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- place_order() locks inventory first; taking the same lock makes "was it ordered?" race-free.
  perform 1 from public.inventory where variant_id = old.id for update;
  if exists (select 1 from public.order_items where variant_id = old.id)
     or exists (select 1 from public.stock_movements where variant_id = old.id and order_id is not null) then
    raise exception 'variant_has_orders' using errcode = '23503',
      detail = 'This variant is on an order. Turn it off instead.';
  end if;
  perform set_config('ust.purge_variant', old.id::text, true);
  delete from public.stock_movements where variant_id = old.id;
  perform set_config('ust.purge_variant', '', true);
  return old;
end;
$$;
create trigger product_variants_guard_delete before delete on public.product_variants
  for each row execute function public.product_variants_guard_delete();

create function public.categories_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.categories where parent_id = old.id) then
    raise exception 'category_has_children' using errcode = '23503';
  end if;
  if exists (select 1 from public.products where category_id = old.id) then
    raise exception 'category_has_products' using errcode = '23503';
  end if;
  if exists (select 1 from public.coupon_categories where category_id = old.id) then
    raise exception 'category_in_coupon' using errcode = '23503';
  end if;
  return old;
end;
$$;
create trigger categories_guard_delete before delete on public.categories
  for each row execute function public.categories_guard_delete();

create function public.brands_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- products.brand_id would silently become NULL.
  if exists (select 1 from public.products where brand_id = old.id) then
    raise exception 'brand_has_products' using errcode = '23503';
  end if;
  return old;
end;
$$;
create trigger brands_guard_delete before delete on public.brands
  for each row execute function public.brands_guard_delete();

create function public.tractor_makes_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.tractor_models where make_id = old.id) then
    raise exception 'make_has_models' using errcode = '23503';
  end if;
  return old;
end;
$$;
create trigger tractor_makes_guard_delete before delete on public.tractor_makes
  for each row execute function public.tractor_makes_guard_delete();

create function public.tractor_models_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.product_compatibility where tractor_model_id = old.id) then
    raise exception 'model_has_products' using errcode = '23503';
  end if;
  return old;
end;
$$;
create trigger tractor_models_guard_delete before delete on public.tractor_models
  for each row execute function public.tractor_models_guard_delete();

-- ---------------------------------------------------------------------------
-- 4. Price history
-- ---------------------------------------------------------------------------
-- No foreign key on purpose: the history of a variant that was deleted (never ordered) stays readable.
create table public.price_changes (
  id bigint generated always as identity primary key,
  variant_id uuid not null,
  sku text not null,
  product_name text not null,
  old_regular_paisa bigint not null,
  new_regular_paisa bigint not null,
  old_sale_paisa bigint,
  new_sale_paisa bigint,
  changed_by uuid,
  source text not null default 'direct' check (source in ('direct', 'daily_prices', 'csv_import')),
  batch_id uuid,
  created_at timestamptz not null default now()
);
create index price_changes_variant_idx on public.price_changes (variant_id, created_at desc);
create index price_changes_created_at_idx on public.price_changes (created_at desc);
create index price_changes_batch_idx on public.price_changes (batch_id);
alter table public.price_changes enable row level security;
create trigger price_changes_append_only before update or delete on public.price_changes
  for each row execute function public.prevent_mutation();

revoke all on public.price_changes from anon, authenticated;
grant select on public.price_changes to authenticated;
grant all on public.price_changes to service_role;
create policy price_changes_select on public.price_changes for select to authenticated
  using ((select public.is_admin()));

create function public.log_price_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := coalesce(nullif(current_setting('ust.price_source', true), ''), 'direct');
begin
  if new.regular_price_paisa is distinct from old.regular_price_paisa
     or new.sale_price_paisa is distinct from old.sale_price_paisa then
    insert into public.price_changes (variant_id, sku, product_name, old_regular_paisa, new_regular_paisa,
                                      old_sale_paisa, new_sale_paisa, changed_by, source, batch_id)
    values (new.id, new.sku,
            coalesce((select p.name from public.products p where p.id = new.product_id), ''),
            old.regular_price_paisa, new.regular_price_paisa, old.sale_price_paisa, new.sale_price_paisa,
            (select auth.uid()),
            case when v_source in ('daily_prices', 'csv_import') then v_source else 'direct' end,
            nullif(current_setting('ust.price_batch', true), '')::uuid);
  end if;
  return new;
end;
$$;
create trigger product_variants_price_log after update of regular_price_paisa, sale_price_paisa on public.product_variants
  for each row execute function public.log_price_change();

-- ---------------------------------------------------------------------------
-- 5. Settings added for the admin
-- ---------------------------------------------------------------------------
alter table public.store_settings
  add column announcement_text text not null default '' check (length(announcement_text) <= 200),
  -- A price change above this many percent needs a second confirmation (enforced in apply_daily_changes).
  add column price_change_alert_percent integer not null default 20 check (price_change_alert_percent between 1 and 500);

-- Keep today's top bar text: it was the value statement.
update public.store_settings set announcement_text = value_statement where announcement_text = '';

-- No free-delivery offer: delivery is quoted by phone. (place_order() still honours a threshold if one
-- is ever set again; nothing in the admin or on public pages can set or show one.)
update public.store_settings set free_delivery_threshold_paisa = null;

-- Exchange text as decided by the client's brief (to be confirmed by the client).
alter table public.store_settings alter column return_policy_note
  set default 'Exchange accepted if the product is not damaged, within 7 days.';
update public.store_settings
   set return_policy_note = 'Exchange accepted if the product is not damaged, within 7 days.'
 where return_policy_note = 'Exchange within 7 days if the product is in original condition.';

-- Couriers (for shipments on orders, Phase 4+). Staff read, admin edits.
create table public.couriers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index couriers_name_key on public.couriers (lower(name));
alter table public.couriers enable row level security;
create trigger couriers_set_updated_at before update on public.couriers
  for each row execute function public.set_updated_at();
revoke all on public.couriers from anon;
grant select, insert, update, delete on public.couriers to authenticated;
grant all on public.couriers to service_role;
create policy couriers_select on public.couriers for select to authenticated
  using ((select public.is_admin()));
create policy couriers_insert on public.couriers for insert to authenticated
  with check ((select public.is_full_admin()));
create policy couriers_update on public.couriers for update to authenticated
  using ((select public.is_full_admin())) with check ((select public.is_full_admin()));
create policy couriers_delete on public.couriers for delete to authenticated
  using ((select public.is_full_admin()));
insert into public.couriers (name, sort_order) values
  ('TCS', 10), ('Daewoo', 20), ('Leopards', 30), ('M&P', 40), ('Trax', 50), ('Pakistan Post', 60), ('Other', 70);

-- ---------------------------------------------------------------------------
-- 6. Catalog rules
-- ---------------------------------------------------------------------------
-- Two category levels: a subcategory cannot have children, a category with children cannot move under another.
do $$
begin
  if exists (select 1 from public.categories c join public.categories p on p.id = c.parent_id where p.parent_id is not null) then
    raise exception 'existing categories are nested more than two levels deep; flatten them first';
  end if;
end;
$$;

create function public.categories_two_levels()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    if exists (select 1 from public.categories p where p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'category_depth' using errcode = '23514', detail = 'Categories have two levels: a category and its subcategories.';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.categories c where c.parent_id = new.id) then
      raise exception 'category_depth' using errcode = '23514', detail = 'A category with subcategories cannot become a subcategory.';
    end if;
  end if;
  return new;
end;
$$;
create trigger categories_two_levels before insert or update of parent_id on public.categories
  for each row execute function public.categories_two_levels();

-- Images: at most 8 per product, files live under products/<product id>/, the first one is primary,
-- and removing the primary promotes the next one.
create function public.product_images_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if new.storage_path !~ ('^products/' || new.product_id::text || '/[A-Za-z0-9_-]{8,64}\.(jpg|png|webp|avif)$') then
    raise exception 'invalid_image_path' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    -- Serialise concurrent uploads of one product.
    perform 1 from public.products where id = new.product_id for update;
    if (select count(*) from public.product_images where product_id = new.product_id) >= 8 then
      raise exception 'image_limit' using errcode = '23514', detail = 'A product can have up to 8 images.';
    end if;
    if not exists (select 1 from public.product_images where product_id = new.product_id and is_primary) then
      new.is_primary := true;
    end if;
    if new.sort_order = 0 then
      new.sort_order := coalesce((select max(sort_order) + 10 from public.product_images where product_id = new.product_id), 10);
    end if;
  elsif new.product_id is distinct from old.product_id then
    raise exception 'invalid_image_path' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger product_images_before_write before insert or update of storage_path, product_id on public.product_images
  for each row execute function public.product_images_before_write();

create function public.product_images_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_primary then
    update public.product_images
       set is_primary = true
     where id = (select i.id from public.product_images i where i.product_id = old.product_id
                  order by i.sort_order, i.created_at, i.id limit 1);
  end if;
  return old;
end;
$$;
create trigger product_images_after_delete after delete on public.product_images
  for each row execute function public.product_images_after_delete();

-- Makes an image the primary one (the unique index allows one per product, so the old one goes first).
create function public.set_primary_image(p_image_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_product uuid;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select product_id into v_product from public.product_images where id = p_image_id;
  if not found then
    raise exception 'image_not_found' using errcode = 'P0002';
  end if;
  update public.product_images set is_primary = false where product_id = v_product and is_primary and id <> p_image_id;
  update public.product_images set is_primary = true where id = p_image_id;
end;
$$;
revoke all on function public.set_primary_image(uuid) from public, anon;
grant execute on function public.set_primary_image(uuid) to authenticated;

-- Writes a new order for the given ids (10, 20, 30, ...). Runs with the caller's rights, so row-level
-- security still decides which rows they may change.
create function public.catalog_reorder(p_entity text, p_ids uuid[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_entity not in ('categories', 'tractor_makes', 'tractor_models', 'couriers', 'product_images', 'product_variants') then
    raise exception 'invalid_entity' using errcode = '22023';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'invalid_ids' using errcode = '22023';
  end if;
  execute format(
    'update public.%I t set sort_order = (o.pos * 10)::integer from unnest($1) with ordinality as o(id, pos) where t.id = o.id',
    p_entity
  ) using p_ids;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.catalog_reorder(text, uuid[]) from public, anon;
grant execute on function public.catalog_reorder(text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Audit every catalog write (column names only; never values, so costs stay private)
-- ---------------------------------------------------------------------------
create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed text[];
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into v_changed
      from jsonb_object_keys(v_new) as k
     where k not in ('updated_at', 'search_text') and (v_new -> k) is distinct from (v_old -> k);
    if cardinality(v_changed) = 0 then
      return new;
    end if;
  end if;
  perform public.log_audit(
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'variant_id'),
    jsonb_strip_nulls(jsonb_build_object(
      'label', coalesce(v_row ->> 'sku', v_row ->> 'name', v_row ->> 'slug'),
      'changed', to_jsonb(v_changed)
    ))
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'brands', 'tractor_makes', 'tractor_models', 'products', 'product_variants',
    'product_variant_costs', 'product_images', 'product_compatibility', 'couriers', 'store_private_settings'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
      t || '_audit', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Daily prices: one transaction for every edit on the page
-- ---------------------------------------------------------------------------
-- p_changes: [{ variant_id, expected_updated_at?, regular_price_paisa?, sale_price_paisa? (null = no sale),
--               is_active?, set_on_hand?, expected_on_hand? }]. A key that is absent is left alone.
-- Refuses when someone else changed the same variant since the page was loaded (stale_data), and when
-- a change moves the price the customer pays by more than store_settings.price_change_alert_percent
-- unless p_confirm_large is true (large_change_unconfirmed, detail = the affected variants as JSON).
-- Existing orders keep their prices (order_items store snapshots).
create function public.apply_daily_changes(p_changes jsonb, p_confirm_large boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c jsonb;
  v public.product_variants;
  v_inv public.inventory;
  v_batch uuid := gen_random_uuid();
  v_threshold integer;
  v_count integer;
  v_new_reg bigint;
  v_new_sale bigint;
  v_new_active boolean;
  v_old_eff bigint;
  v_new_eff bigint;
  v_pct numeric;
  v_target integer;
  v_large jsonb := '[]'::jsonb;
  v_prices integer := 0;
  v_stock integer := 0;
  v_avail integer := 0;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_changes);
  if v_count = 0 or v_count > 500 then
    raise exception 'invalid_changes' using errcode = '22023', detail = 'between 1 and 500 changes';
  end if;
  if (select count(distinct e.value ->> 'variant_id') from jsonb_array_elements(p_changes) as e) <> v_count then
    raise exception 'invalid_changes' using errcode = '22023', detail = 'a variant appears twice';
  end if;

  select s.price_change_alert_percent into v_threshold from public.store_settings s where s.id;
  perform set_config('ust.price_source', 'daily_prices', true);
  perform set_config('ust.price_batch', v_batch::text, true);

  -- Pass 1: lock every variant (in id order, so two saves cannot deadlock), check, collect large changes.
  for c in select e.value from jsonb_array_elements(p_changes) as e order by e.value ->> 'variant_id' loop
    select * into v from public.product_variants where id = (c ->> 'variant_id')::uuid for update;
    if not found then
      raise exception 'variant_not_found' using errcode = 'P0002';
    end if;
    if c ? 'expected_updated_at' and v.updated_at <> (c ->> 'expected_updated_at')::timestamptz then
      raise exception 'stale_data' using errcode = 'P0001', detail = v.sku;
    end if;

    v_new_reg := case when c ? 'regular_price_paisa' then (c ->> 'regular_price_paisa')::bigint else v.regular_price_paisa end;
    v_new_sale := case when c ? 'sale_price_paisa' then (c ->> 'sale_price_paisa')::bigint else v.sale_price_paisa end;
    if v_new_reg is null or v_new_reg <= 0 or v_new_reg > 100000000000
       or (v_new_sale is not null and (v_new_sale <= 0 or v_new_sale >= v_new_reg)) then
      raise exception 'invalid_price' using errcode = '22023', detail = v.sku;
    end if;

    v_old_eff := coalesce(v.sale_price_paisa, v.regular_price_paisa);
    v_new_eff := coalesce(v_new_sale, v_new_reg);
    if v_new_eff <> v_old_eff then
      v_pct := abs(v_new_eff - v_old_eff) * 100.0 / v_old_eff;
      if v_pct > v_threshold then
        v_large := v_large || jsonb_build_object('variant_id', v.id, 'sku', v.sku,
                                                 'old_paisa', v_old_eff, 'new_paisa', v_new_eff, 'percent', round(v_pct, 1));
      end if;
    end if;

    if c ? 'set_on_hand' then
      v_target := (c ->> 'set_on_hand')::integer;
      if v_target < 0 or v_target > 1000000 then
        raise exception 'invalid_quantity' using errcode = '22023', detail = v.sku;
      end if;
      select * into v_inv from public.inventory where variant_id = v.id for update;
      if c ? 'expected_on_hand' and v_inv.on_hand <> (c ->> 'expected_on_hand')::integer then
        raise exception 'stale_data' using errcode = 'P0001', detail = v.sku;
      end if;
    end if;
  end loop;

  if jsonb_array_length(v_large) > 0 and not coalesce(p_confirm_large, false) then
    raise exception 'large_change_unconfirmed' using errcode = 'P0001', detail = v_large::text;
  end if;

  -- Pass 2: write.
  for c in select e.value from jsonb_array_elements(p_changes) as e order by e.value ->> 'variant_id' loop
    select * into v from public.product_variants where id = (c ->> 'variant_id')::uuid;
    v_new_reg := case when c ? 'regular_price_paisa' then (c ->> 'regular_price_paisa')::bigint else v.regular_price_paisa end;
    v_new_sale := case when c ? 'sale_price_paisa' then (c ->> 'sale_price_paisa')::bigint else v.sale_price_paisa end;
    v_new_active := case when c ? 'is_active' then (c ->> 'is_active')::boolean else v.is_active end;

    if v_new_reg is distinct from v.regular_price_paisa or v_new_sale is distinct from v.sale_price_paisa
       or v_new_active is distinct from v.is_active then
      update public.product_variants
         set regular_price_paisa = v_new_reg, sale_price_paisa = v_new_sale, is_active = v_new_active
       where id = v.id;
      if v_new_reg is distinct from v.regular_price_paisa or v_new_sale is distinct from v.sale_price_paisa then
        v_prices := v_prices + 1;
      end if;
      if v_new_active is distinct from v.is_active then
        v_avail := v_avail + 1;
      end if;
    end if;

    if c ? 'set_on_hand' then
      v_target := (c ->> 'set_on_hand')::integer;
      select * into v_inv from public.inventory where variant_id = v.id;
      if v_target <> v_inv.on_hand then
        perform public.adjust_stock(v.id, v_target - v_inv.on_hand, 'adjustment',
                                    'Quick edit on Daily prices: stock set to ' || v_target);
        v_stock := v_stock + 1;
      end if;
    end if;
  end loop;

  perform public.log_audit('prices.batch', 'product_variants', v_batch::text,
    jsonb_build_object('variants', v_count, 'prices', v_prices, 'stock', v_stock, 'availability', v_avail));
  return jsonb_build_object('batch_id', v_batch, 'variants', v_count, 'prices', v_prices, 'stock', v_stock, 'availability', v_avail);
end;
$$;
revoke all on function public.apply_daily_changes(jsonb, boolean) from public, anon;
grant execute on function public.apply_daily_changes(jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. CSV import: one transaction
-- ---------------------------------------------------------------------------
-- p_products: [{ slug, <product fields that are present>, variants: [{ sku, <variant fields>, cost_paisa?, stock? }] }]
-- The application has already parsed and validated the file and resolved category and brand ids; this
-- function applies it all-or-nothing and re-checks what only the database can (uniqueness, foreign
-- keys, constraints, SKU ownership, stock above the reserved quantity). A field that is absent keeps its
-- current value; a field present as JSON null clears it. New products start as drafts unless status is given.
create function public.import_catalog(p_products jsonb, p_label text default 'csv_import')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr jsonb;
  vr jsonb;
  v_batch uuid := gen_random_uuid();
  v_pid uuid;
  v_vid uuid;
  v_owner uuid;
  v_target integer;
  v_on_hand integer;
  v_products_new integer := 0;
  v_products_updated integer := 0;
  v_variants_new integer := 0;
  v_variants_updated integer := 0;
  v_stock integer := 0;
  v_total_variants integer := 0;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_products is null or jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) = 0
     or jsonb_array_length(p_products) > 2000 then
    raise exception 'invalid_import' using errcode = '22023', detail = 'between 1 and 2000 products';
  end if;
  perform set_config('ust.price_source', 'csv_import', true);
  perform set_config('ust.price_batch', v_batch::text, true);

  for pr in select e.value from jsonb_array_elements(p_products) as e loop
    if jsonb_typeof(pr -> 'variants') <> 'array' or jsonb_array_length(pr -> 'variants') = 0 then
      raise exception 'invalid_import' using errcode = '22023', detail = 'product without variants: ' || (pr ->> 'slug');
    end if;
    v_total_variants := v_total_variants + jsonb_array_length(pr -> 'variants');
    if v_total_variants > 5000 then
      raise exception 'invalid_import' using errcode = '22023', detail = 'at most 5000 variants';
    end if;

    select id into v_pid from public.products where slug = pr ->> 'slug' for update;
    if not found then
      insert into public.products (slug, name, category_id)
      values (pr ->> 'slug', pr ->> 'name', (pr ->> 'category_id')::uuid)
      returning id into v_pid;
      v_products_new := v_products_new + 1;
    else
      v_products_updated := v_products_updated + 1;
    end if;

    update public.products set
      name = case when pr ? 'name' then pr ->> 'name' else name end,
      category_id = case when pr ? 'category_id' then (pr ->> 'category_id')::uuid else category_id end,
      brand_id = case when pr ? 'brand_id' then nullif(pr ->> 'brand_id', '')::uuid else brand_id end,
      product_type = case when pr ? 'product_type' then (pr ->> 'product_type')::public.product_type else product_type end,
      status = case when pr ? 'status' then (pr ->> 'status')::public.product_status else status end,
      short_description = case when pr ? 'short_description' then pr ->> 'short_description' else short_description end,
      description = case when pr ? 'description' then pr ->> 'description' else description end,
      part_number = case when pr ? 'part_number' then pr ->> 'part_number' else part_number end,
      oem_part_numbers = case when pr ? 'oem_part_numbers'
        then coalesce(array(select jsonb_array_elements_text(pr -> 'oem_part_numbers')), '{}'::text[]) else oem_part_numbers end,
      viscosity_grade = case when pr ? 'viscosity_grade' then pr ->> 'viscosity_grade' else viscosity_grade end,
      oil_specifications = case when pr ? 'oil_specifications'
        then coalesce(array(select jsonb_array_elements_text(pr -> 'oil_specifications')), '{}'::text[]) else oil_specifications end,
      origin = case when pr ? 'origin' then pr ->> 'origin' else origin end,
      warranty_info = case when pr ? 'warranty_info' then pr ->> 'warranty_info' else warranty_info end,
      packaging_info = case when pr ? 'packaging_info' then pr ->> 'packaging_info' else packaging_info end,
      is_returnable = case when pr ? 'is_returnable' then (pr ->> 'is_returnable')::boolean else is_returnable end,
      is_featured = case when pr ? 'is_featured' then (pr ->> 'is_featured')::boolean else is_featured end,
      seo_title = case when pr ? 'seo_title' then pr ->> 'seo_title' else seo_title end,
      seo_description = case when pr ? 'seo_description' then pr ->> 'seo_description' else seo_description end
    where id = v_pid;

    for vr in select e.value from jsonb_array_elements(pr -> 'variants') as e loop
      select id, product_id into v_vid, v_owner from public.product_variants where sku = vr ->> 'sku' for update;
      if found then
        if v_owner <> v_pid then
          raise exception 'sku_belongs_to_other_product' using errcode = '23505', detail = vr ->> 'sku';
        end if;
        v_variants_updated := v_variants_updated + 1;
      else
        if not (vr ? 'regular_price_paisa') or vr -> 'regular_price_paisa' = 'null'::jsonb then
          raise exception 'missing_price' using errcode = '22023', detail = vr ->> 'sku';
        end if;
        insert into public.product_variants (product_id, sku, regular_price_paisa, is_default)
        values (v_pid, vr ->> 'sku', (vr ->> 'regular_price_paisa')::bigint,
                not exists (select 1 from public.product_variants x where x.product_id = v_pid))
        returning id into v_vid;
        v_variants_new := v_variants_new + 1;
      end if;

      update public.product_variants set
        name = case when vr ? 'name' and vr ->> 'name' is not null then vr ->> 'name' else name end,
        barcode = case when vr ? 'barcode' then vr ->> 'barcode' else barcode end,
        regular_price_paisa = case when vr ? 'regular_price_paisa' then (vr ->> 'regular_price_paisa')::bigint else regular_price_paisa end,
        sale_price_paisa = case when vr ? 'sale_price_paisa' then (vr ->> 'sale_price_paisa')::bigint else sale_price_paisa end,
        weight_grams = case when vr ? 'weight_grams' then (vr ->> 'weight_grams')::integer else weight_grams end,
        length_mm = case when vr ? 'length_mm' then (vr ->> 'length_mm')::integer else length_mm end,
        width_mm = case when vr ? 'width_mm' then (vr ->> 'width_mm')::integer else width_mm end,
        height_mm = case when vr ? 'height_mm' then (vr ->> 'height_mm')::integer else height_mm end,
        is_active = case when vr ? 'is_active' then (vr ->> 'is_active')::boolean else is_active end
      where id = v_vid;

      if vr ? 'cost_paisa' then
        if not public.is_full_admin() then
          raise exception 'cost_requires_admin' using errcode = '42501';
        end if;
        if vr -> 'cost_paisa' = 'null'::jsonb then
          delete from public.product_variant_costs where variant_id = v_vid;
        else
          insert into public.product_variant_costs (variant_id, cost_paisa)
          values (v_vid, (vr ->> 'cost_paisa')::bigint)
          on conflict (variant_id) do update set cost_paisa = excluded.cost_paisa;
        end if;
      end if;

      if vr ? 'stock' and vr -> 'stock' <> 'null'::jsonb then
        v_target := (vr ->> 'stock')::integer;
        select on_hand into v_on_hand from public.inventory where variant_id = v_vid for update;
        if v_target <> v_on_hand then
          perform public.adjust_stock(v_vid, v_target - v_on_hand, 'adjustment', 'CSV import ' || left(coalesce(p_label, ''), 80));
          v_stock := v_stock + 1;
        end if;
      end if;
    end loop;
  end loop;

  perform public.log_audit('catalog.import', 'products', v_batch::text,
    jsonb_build_object('label', left(coalesce(p_label, ''), 80), 'products_new', v_products_new,
                       'products_updated', v_products_updated, 'variants_new', v_variants_new,
                       'variants_updated', v_variants_updated, 'stock_changes', v_stock));
  return jsonb_build_object('batch_id', v_batch, 'products_new', v_products_new, 'products_updated', v_products_updated,
                            'variants_new', v_variants_new, 'variants_updated', v_variants_updated, 'stock_changes', v_stock);
exception
  when unique_violation then
    raise exception 'duplicate_value' using errcode = '23505', detail = sqlerrm;
end;
$$;
revoke all on function public.import_catalog(jsonb, text) from public, anon;
grant execute on function public.import_catalog(jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A hidden category also stops ordering and stock status (not only what RLS shows)
-- ---------------------------------------------------------------------------
-- A customer can still hold a variant id (cart, wishlist, old page). _place_order() and stock_availability()
-- are SECURITY DEFINER and bypass RLS, so they need the same rule.
create or replace function public.stock_availability(p_variant_ids uuid[])
returns table (variant_id uuid, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.variant_id,
         case
           when i.on_hand - i.reserved <= 0 then 'out_of_stock'
           when i.on_hand - i.reserved <= i.low_stock_threshold then 'low_stock'
           else 'in_stock'
         end
    from public.inventory i
    join public.product_variants v on v.id = i.variant_id and v.is_active
    join public.products p on p.id = v.product_id and p.status = 'published' and public.category_is_public(p.category_id)
   where i.variant_id = any (p_variant_ids[1:200]);
$$;

do $$
declare
  v_oid oid;
  v_def text;
  v_needle constant text := 'and p.status = ''published''';
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_place_order';
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_needle, ''))) / length(v_needle) <> 1 then
    raise exception '_place_order() no longer has exactly one published-product check; update this migration';
  end if;
  execute replace(v_def, v_needle, v_needle || ' and public.category_is_public(p.category_id)');
end;
$$;

-- ---------------------------------------------------------------------------
-- Check: the public surface is exactly what this migration intends
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, r.rolname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join (values ('anon'), ('authenticated')) as r (rolname)
     where n.nspname = 'public'
       and p.prorettype <> 'trigger'::regtype
       and has_function_privilege(r.rolname, p.oid, 'execute')
       and p.proname <> all (
         case when r.rolname = 'anon'
           then array['is_admin', 'is_full_admin', 'try_uuid', 'effective_price_paisa', 'stock_availability', 'catalog_search',
                      'category_is_public']
           else array['is_admin', 'is_full_admin', 'try_uuid', 'effective_price_paisa', 'stock_availability', 'catalog_search',
                      'category_is_public', 'place_order', 'adjust_stock', 'set_stock_thresholds', 'set_order_status',
                      'set_payment_status', 'request_return', 'get_order_by_tracking_token', 'get_bank_transfer_details',
                      'submit_bank_transfer_reference', 'apply_daily_changes', 'import_catalog', 'catalog_reorder',
                      'set_primary_image']
         end)
  loop
    raise exception '% can execute %, which is not in the allowlist', f.rolname, f.sig;
  end loop;

  if has_table_privilege('anon', 'public.price_changes', 'select')
     or has_table_privilege('anon', 'public.couriers', 'select')
     or has_table_privilege('anon', 'public.product_variant_costs', 'select')
     or has_table_privilege('anon', 'public.inventory', 'select') then
    raise exception 'anon can read price history, couriers, costs or inventory';
  end if;

  if exists (select 1 from public.store_settings where free_delivery_threshold_paisa is not null) then
    raise exception 'free_delivery_threshold_paisa is still set';
  end if;
end;
$$;
