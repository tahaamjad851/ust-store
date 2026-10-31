-- Phase 3A: public catalog support.
--
--   1. store_settings gets two public, admin-editable texts: the delivery-charge note and the
--      return/exchange summary. The storefront reads both from here; nothing is hardcoded in the UI.
--   2. stock_availability() returns the stock STATUS only. It used to return the exact available
--      quantity to anyone (a documented low finding in the Phase 1 report). The storefront never
--      shows counts.
--   3. catalog_search() is the one query the public listing needs that row-level security alone
--      cannot express: it filters and sorts on stock (inventory is not readable by anon) and
--      searches across products, variant SKUs, brands and tractor models. It is SECURITY DEFINER,
--      so it re-applies the public visibility rules itself and returns ids and a status only:
--      no prices, costs or counts. Product details are then read through RLS with the anon key.

-- ---------------------------------------------------------------------------
-- 1. Public texts in store_settings
-- ---------------------------------------------------------------------------
-- The defaults are the client's decision (2026-10-31); the existing row picks them up too.
alter table public.store_settings
  add column delivery_charge_note text not null default 'Delivery charge confirmed by phone'
    check (length(delivery_charge_note) <= 200),
  add column return_policy_note text not null default 'Exchange within 7 days if the product is in original condition.'
    check (length(return_policy_note) <= 300);

-- ---------------------------------------------------------------------------
-- 2. stock_availability(): status only
-- ---------------------------------------------------------------------------
-- The return type changes, so the function is dropped and created again (its grants are re-applied).
drop function public.stock_availability(uuid[]);

create function public.stock_availability(p_variant_ids uuid[])
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
    join public.products p on p.id = v.product_id and p.status = 'published'
   where i.variant_id = any (p_variant_ids[1:200]);
$$;
revoke all on function public.stock_availability(uuid[]) from public;
grant execute on function public.stock_availability(uuid[]) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. catalog_search()
-- ---------------------------------------------------------------------------
-- Visible to the public: published products with at least one active variant, in an active category
-- whose ancestors are all active. A product is represented by its "display variant": the active
-- default variant, otherwise the first active variant. Price and stock filters and sorting use it.
--
--   p_query        words, ALL of which must match somewhere: name, part numbers, viscosity, short
--                  description, a variant SKU, the brand name, a tractor make or model name
--   p_category_id  a category and everything below it (null = whole shop)
--   p_model_id     only products listed as compatible with this tractor model
--   p_in_stock     only products whose display variant is available
--   p_min/max      price range in paisa on the display variant's price
--   p_sort         relevance | price-asc | price-desc | name | newest (anything else = relevance)
--   p_limit        1..48 (default 12), p_offset 0..10000
--
-- total_count is the number of matches, repeated on every row. An offset past the end returns no
-- rows (and so no total); the caller asks again for the first page.
create function public.catalog_search(
  p_query text default null,
  p_category_id uuid default null,
  p_model_id uuid default null,
  p_in_stock boolean default false,
  p_min_paisa bigint default null,
  p_max_paisa bigint default null,
  p_sort text default 'relevance',
  p_limit integer default 12,
  p_offset integer default 0
)
returns table (product_id uuid, variant_id uuid, stock_status text, total_count bigint)
language sql
stable
security definer
set search_path = ''
-- anon can call this directly, so one call may never run long.
set statement_timeout = '3s'
as $$
  with recursive
  params as (
    select left(lower(btrim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g'))), 100) as q,
           least(greatest(coalesce(p_limit, 12), 1), 48) as lim,
           least(greatest(coalesce(p_offset, 0), 0), 10000) as off,
           case when p_sort in ('price-asc', 'price-desc', 'name', 'newest') then p_sort else 'relevance' end as sort
  ),
  -- LIKE wildcards in what the visitor typed are escaped, so "50%" or "a_b" are plain text.
  tokens as (
    select replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') as tok
      from params, unnest(string_to_array(params.q, ' ')) as t
     where params.q <> ''
     limit 6
  ),
  visible as (
    select c.id from public.categories c where c.parent_id is null and c.is_active
    union all
    select c.id from public.categories c join visible v on c.parent_id = v.id where c.is_active
  ),
  scope as (
    select v.id from visible v where v.id = p_category_id
    union all
    select c.id from public.categories c join scope s on c.parent_id = s.id join visible v on v.id = c.id
  ),
  matches as (
    select p.id as product_id,
           dv.id as variant_id,
           case
             when coalesce(i.on_hand - i.reserved, 0) <= 0 then 'out_of_stock'
             when coalesce(i.on_hand - i.reserved, 0) <= i.low_stock_threshold then 'low_stock'
             else 'in_stock'
           end as stock_status,
           (coalesce(i.on_hand - i.reserved, 0) > 0) as available,
           dv.price,
           p.name,
           p.is_featured,
           coalesce(p.published_at, p.created_at) as listed_at,
           case
             when params.q = '' then 0
             when lower(p.part_number) = params.q
               or exists (select 1 from unnest(p.oem_part_numbers) o where lower(o) = params.q)
               or exists (select 1 from public.product_variants sv
                           where sv.product_id = p.id and sv.is_active and lower(sv.sku) = params.q) then 3
             when lower(p.name) like replace(replace(replace(params.q, '\', '\\'), '%', '\%'), '_', '\_') || '%' then 2
             else 1
           end as rank
      from public.products p
      cross join params
      cross join lateral (
        select v.id, public.effective_price_paisa(v.regular_price_paisa, v.sale_price_paisa) as price
          from public.product_variants v
         where v.product_id = p.id and v.is_active
         order by v.is_default desc, v.sort_order, v.created_at, v.id
         limit 1
      ) dv
      left join public.inventory i on i.variant_id = dv.id
     where p.status = 'published'
       and ((p_category_id is null and p.category_id in (select id from visible))
            or p.category_id in (select id from scope))
       and (p_min_paisa is null or dv.price >= p_min_paisa)
       and (p_max_paisa is null or dv.price <= p_max_paisa)
       and (not coalesce(p_in_stock, false) or coalesce(i.on_hand - i.reserved, 0) > 0)
       and (p_model_id is null or exists (
             select 1
               from public.product_compatibility pc
               join public.tractor_models tm on tm.id = pc.tractor_model_id and tm.is_active
               join public.tractor_makes mk on mk.id = tm.make_id and mk.is_active
              where pc.product_id = p.id and pc.tractor_model_id = p_model_id))
       and not exists (
         select 1 from tokens t
          where not (
            p.search_text like '%' || t.tok || '%'
            or exists (select 1 from public.product_variants sv
                        where sv.product_id = p.id and sv.is_active and lower(sv.sku) like '%' || t.tok || '%')
            or exists (select 1 from public.brands b
                        where b.id = p.brand_id and b.is_active and lower(b.name) like '%' || t.tok || '%')
            or exists (select 1
                         from public.product_compatibility pc
                         join public.tractor_models tm on tm.id = pc.tractor_model_id and tm.is_active
                         join public.tractor_makes mk on mk.id = tm.make_id and mk.is_active
                        where pc.product_id = p.id
                          and (lower(tm.name) like '%' || t.tok || '%' or lower(mk.name) like '%' || t.tok || '%'))
          )
       )
  )
  select m.product_id, m.variant_id, m.stock_status, count(*) over () as total_count
    from matches m
    cross join params
   order by
     case when params.sort = 'price-asc' then m.price end asc,
     case when params.sort = 'price-desc' then m.price end desc,
     case when params.sort = 'name' then lower(m.name) end asc,
     case when params.sort = 'newest' then m.listed_at end desc,
     case when params.sort = 'relevance' then m.rank end desc,
     case when params.sort = 'relevance' and m.is_featured then 0 else 1 end asc,
     m.listed_at desc,
     lower(m.name),
     m.product_id
   limit (select lim from params) offset (select off from params);
$$;
revoke all on function public.catalog_search(text, uuid, uuid, boolean, bigint, bigint, text, integer, integer) from public;
grant execute on function public.catalog_search(text, uuid, uuid, boolean, bigint, bigint, text, integer, integer)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Check: the public surface is exactly what this migration intends.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
begin
  -- anon may execute only the functions the storefront needs (same list as the hardening migration,
  -- plus catalog_search).
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
           then array['is_admin', 'is_full_admin', 'try_uuid', 'effective_price_paisa', 'stock_availability', 'catalog_search']
           else array['is_admin', 'is_full_admin', 'try_uuid', 'effective_price_paisa', 'stock_availability', 'catalog_search',
                      'place_order', 'adjust_stock', 'set_stock_thresholds', 'set_order_status', 'set_payment_status',
                      'request_return', 'get_order_by_tracking_token', 'get_bank_transfer_details', 'submit_bank_transfer_reference']
         end)
  loop
    raise exception '% can execute %, which is not in the allowlist', f.rolname, f.sig;
  end loop;

  -- The stock function must not hand out counts.
  if exists (
    select 1 from pg_proc p
     where p.proname = 'stock_availability' and pg_get_function_result(p.oid) like '%available%'
  ) then
    raise exception 'stock_availability still returns a quantity';
  end if;

  -- Cost prices and inventory stay private.
  if has_table_privilege('anon', 'public.product_variant_costs', 'select')
     or has_table_privilege('anon', 'public.inventory', 'select') then
    raise exception 'anon can read cost prices or inventory';
  end if;
end;
$$;
