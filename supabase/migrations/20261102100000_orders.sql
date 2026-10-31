-- Phase 4: orders.
--
-- What this migration does
--   1. Order workflow New > Contacted > Confirmed > Dispatched > Delivered, plus Cancelled and Exchange requested.
--      "New" is the existing status 'pending'; 'contacted' and 'exchange_requested' are added. Invalid transitions
--      are refused in the database (_order_transition_allowed), not only in the UI. processing / shipped / returned
--      stay in the enum (a type value cannot be dropped) but nothing leads into them any more.
--   2. The delivery charge is NOT calculated at checkout. place_order() no longer looks up a shipping rate or applies
--      a free-delivery rule: shipping starts at 0 and orders.shipping_confirmed is false until staff enter the
--      agreed charge (set_order_delivery_charge(), which recalculates the total).
--   3. Guest checkout can return the same tracking link on a retry: the server derives the token from the
--      idempotency key (HMAC) and passes it in; the database still stores only its hash.
--   4. Staff functions, each audited: set_order_delivery_charge, set_order_shipment, add_order_note, mark_cod_collected;
--      search_orders (order number, phone, name; status and date filters). Customers get the tracking summary through
--      get_order_by_tracking_token (never internal notes or costs).
--   5. One owner notification per order (unique index on the outbox) and trigram indexes for the admin search.
--   6. Bank transfer is switched off (store setting); it appears at checkout only when an admin enables it.
--
-- Run this file in the SQL Editor (running it a second time is harmless), then run the verification queries in
-- docs/ORDERS.md. Only after those pass, record the version in supabase_migrations.schema_migrations.

-- ---------------------------------------------------------------------------
-- 1. Statuses
-- ---------------------------------------------------------------------------
-- A new enum value cannot be used in the transaction that adds it, so nothing below refers to 'contacted' or
-- 'exchange_requested' as an enum literal (the functions compare text and are resolved when they run).
alter type public.order_status add value if not exists 'contacted' after 'pending';
alter type public.order_status add value if not exists 'exchange_requested' after 'delivered';

create or replace function public._order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from::text, p_to::text) in (
    ('pending', 'contacted'), ('pending', 'confirmed'), ('pending', 'cancelled'),
    ('contacted', 'confirmed'), ('contacted', 'cancelled'),
    ('confirmed', 'dispatched'), ('confirmed', 'cancelled'),
    ('dispatched', 'delivered'), ('dispatched', 'cancelled'),
    ('delivered', 'exchange_requested'),
    ('exchange_requested', 'delivered'),
    -- Orders that were already in a retired status can still leave it.
    ('processing', 'dispatched'), ('processing', 'cancelled'),
    ('shipped', 'delivered')
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Columns and indexes
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists shipping_confirmed boolean not null default false,
  add column if not exists shipping_confirmed_at timestamptz;

-- Orders placed before this migration had a calculated charge; keep them as they were.
update public.orders
   set shipping_confirmed = true, shipping_confirmed_at = created_at
 where shipping_paisa > 0 and not shipping_confirmed;

-- One owner e-mail per order, however many times the placing request is retried.
create unique index if not exists notifications_owner_new_order_key
  on public.notifications (order_id) where template = 'owner_new_order' and order_id is not null;

create index if not exists orders_number_trgm_idx on public.orders using gin (order_number extensions.gin_trgm_ops);
create index if not exists orders_customer_name_trgm_idx on public.orders using gin (lower(customer_name) extensions.gin_trgm_ops);
create index if not exists orders_customer_phone_trgm_idx on public.orders using gin (customer_phone extensions.gin_trgm_ops);

-- Payment methods other than cash on delivery are off until an admin turns them on. The existing row is switched off
-- only the first time this file runs (the old _place_order() still exists then), so running it again never undoes
-- a choice made since.
alter table public.store_settings alter column bank_transfer_enabled set default false;
do $$
begin
  if to_regprocedure('public._place_order(uuid, uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text)') is not null then
    update public.store_settings set bank_transfer_enabled = false;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Status changes (the stock rules are unchanged: reserved at checkout, released once on cancellation,
--    deducted once on delivery)
-- ---------------------------------------------------------------------------
create or replace function public._transition_order(p_order_id uuid, p_to public.order_status, p_note text, p_actor uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_from public.order_status;
  v_stock public.order_stock_state;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  v_from := v_order.status;
  if not public._order_transition_allowed(v_order.status, p_to) then
    raise exception 'invalid_transition' using errcode = 'P0001',
      detail = v_order.status::text || ' -> ' || p_to::text;
  end if;
  if p_to::text in ('processing', 'dispatched', 'shipped', 'delivered')
     and v_order.payment_method in ('bank_transfer', 'online')
     and v_order.payment_status <> 'paid' then
    raise exception 'payment_required' using errcode = 'P0001';
  end if;

  v_stock := v_order.stock_state;
  if p_to = 'cancelled' and v_stock = 'reserved' then
    perform public._release_order_stock(v_order.id, p_actor);
    v_stock := 'released';
  elsif p_to::text in ('shipped', 'delivered') and v_stock = 'reserved' then
    perform public._deduct_order_stock(v_order.id, p_actor);
    v_stock := 'deducted';
  end if;

  update public.orders
     set status = p_to,
         stock_state = v_stock,
         cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end,
         cancel_reason = case when p_to = 'cancelled' then left(p_note, 500) else cancel_reason end,
         reservation_expires_at = case when p_to = 'cancelled' then null else reservation_expires_at end
   where id = v_order.id
  returning * into v_order;

  if p_to::text = 'dispatched' then
    update public.shipments set dispatched_at = coalesce(dispatched_at, now()) where order_id = v_order.id;
  end if;

  -- Notes are shown to the customer on their order; internal remarks belong in internal_notes.
  insert into public.order_status_history (order_id, from_status, to_status, note, actor_id)
  values (v_order.id, v_from, p_to, left(p_note, 500), p_actor);

  perform public.log_audit('order.status', 'orders', v_order.id::text,
    jsonb_build_object('from', v_from, 'to', p_to, 'note', left(p_note, 500)));
  return v_order;
end;
$$;

-- The bank-transfer functions test `status in ('pending', 'confirmed')`; an order that staff marked Contacted must
-- count as open too (otherwise its hold never expires and the customer cannot see the bank details).
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select * from (values
      ('public.expire_unpaid_bank_transfers()', 'status in (''pending'', ''confirmed'')', 'status::text in (''pending'', ''contacted'', ''confirmed'')'),
      ('public.get_bank_transfer_details(uuid, text)', 'v_order.status not in (''pending'', ''confirmed'')', 'v_order.status::text not in (''pending'', ''contacted'', ''confirmed'')'),
      ('public.submit_bank_transfer_reference(uuid, text, text, text)', 'v_order.status not in (''pending'', ''confirmed'')', 'v_order.status::text not in (''pending'', ''contacted'', ''confirmed'')')
    ) as t (fn, needle, replacement)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.replacement in v_def) > 0 then
      continue; -- already patched (this file was run before)
    end if;
    if (length(v_def) - length(replace(v_def, r.needle, ''))) / length(r.needle) <> 1 then
      raise exception '% no longer has exactly one open-status test; update this migration', r.fn;
    end if;
    v_new := replace(v_def, r.needle, r.replacement);
    execute v_new;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Placing an order (no delivery charge, no shipping rate, no free-delivery rule)
-- ---------------------------------------------------------------------------
-- The old function had no tracking-token parameter; remove it and the guest wrapper, then recreate both.
drop function if exists public.place_order_as_guest(uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text);
drop function if exists public._place_order(uuid, uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text);

create or replace function public._place_order(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_customer jsonb,
  p_shipping_address jsonb,
  p_delivery_method_id text,
  p_payment_method public.payment_method,
  p_coupon_code text,
  p_customer_notes text,
  -- Guests only: the server derives the token from the idempotency key, so a retry can return the same link.
  p_tracking_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.store_settings;
  v_existing public.orders;
  v_order public.orders;
  v_phone text;
  v_name text;
  v_email text;
  v_company text;
  v_notes text;
  v_address jsonb;
  v_city text;
  v_province text;
  v_variant_ids uuid[];
  v_quantities integer[];
  v_request_hash text;
  v_open integer;
  v_line record;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_shipping bigint := 0;
  v_coupon public.coupons;
  v_coupon_code text;
  v_used integer;
  v_has_targets boolean;
  v_method public.delivery_methods;
  v_year integer;
  v_seq integer;
  v_order_number text;
  v_token text;
begin
  if p_idempotency_key is null then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;
  if p_payment_method is null then
    raise exception 'payment_method_unavailable' using errcode = '22023';
  end if;

  -- Serialise concurrent retries of the same request; the second waits and then replays.
  perform pg_advisory_xact_lock(hashtextextended('place_order:' || p_idempotency_key::text, 0));
  if p_tracking_token is not null and p_tracking_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_tracking_token' using errcode = '22023';
  end if;

  -- 1. Validate and normalise the request (no table locks yet). ---------------------------
  if jsonb_typeof(p_customer) is distinct from 'object' then
    raise exception 'invalid_customer' using errcode = '22023';
  end if;
  v_phone := public._normalize_pk_phone(p_customer ->> 'phone');
  if v_phone is null then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  v_name := trim(coalesce(p_customer ->> 'full_name', ''));
  if length(v_name) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  v_email := nullif(lower(trim(coalesce(p_customer ->> 'email', ''))), '');
  if v_email is not null and (length(v_email) > 254 or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  v_company := nullif(trim(coalesce(p_customer ->> 'company_name', '')), '');
  if v_company is not null and length(v_company) > 120 then
    raise exception 'invalid_company' using errcode = '22023';
  end if;
  v_notes := nullif(trim(coalesce(p_customer_notes, '')), '');
  if v_notes is not null and length(v_notes) > 1000 then
    raise exception 'invalid_notes' using errcode = '22023';
  end if;

  if jsonb_typeof(p_shipping_address) is distinct from 'object' then
    raise exception 'invalid_address' using errcode = '22023';
  end if;
  v_city := trim(coalesce(p_shipping_address ->> 'city', ''));
  v_province := trim(coalesce(p_shipping_address ->> 'province', ''));
  if length(trim(coalesce(p_shipping_address ->> 'line1', ''))) not between 1 and 120
     or length(v_city) not between 2 and 60
     or v_province not in ('Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan',
                           'Islamabad Capital Territory', 'Gilgit-Baltistan', 'Azad Jammu & Kashmir')
     or length(coalesce(p_shipping_address ->> 'street', '')) > 120
     or length(coalesce(p_shipping_address ->> 'area', '')) > 120
     or coalesce(p_shipping_address ->> 'postal_code', '') !~ '^([0-9]{5})?$'
     or length(coalesce(p_shipping_address ->> 'instructions', '')) > 500 then
    raise exception 'invalid_address' using errcode = '22023';
  end if;
  v_address := jsonb_strip_nulls(jsonb_build_object(
    'line1', trim(p_shipping_address ->> 'line1'),
    'street', nullif(trim(coalesce(p_shipping_address ->> 'street', '')), ''),
    'area', nullif(trim(coalesce(p_shipping_address ->> 'area', '')), ''),
    'city', v_city,
    'province', v_province,
    'postal_code', nullif(trim(coalesce(p_shipping_address ->> 'postal_code', '')), ''),
    'instructions', nullif(trim(coalesce(p_shipping_address ->> 'instructions', '')), '')
  ));

  -- Cart lines: variant ids and quantities only; duplicates are merged.
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  begin
    if exists (
      select 1 from jsonb_array_elements(p_items) e
       where jsonb_typeof(e) <> 'object'
          or (e ->> 'variant_id') is null
          or (e ->> 'quantity') is null
          or (e ->> 'quantity')::integer not between 1 and 999
    ) then
      raise exception 'invalid_items' using errcode = '22023';
    end if;
    select array_agg(variant_id order by variant_id), array_agg(qty order by variant_id)
      into v_variant_ids, v_quantities
      from (
        select (e ->> 'variant_id')::uuid as variant_id, sum((e ->> 'quantity')::integer) as qty
          from jsonb_array_elements(p_items) e
         group by 1
      ) s;
    if exists (select 1 from unnest(v_quantities) q where q > 999) then
      raise exception 'invalid_items' using errcode = '22023';
    end if;
  exception
    when invalid_text_representation or numeric_value_out_of_range or datatype_mismatch then
      raise exception 'invalid_items' using errcode = '22023';
  end;

  v_coupon_code := nullif(upper(trim(coalesce(p_coupon_code, ''))), '');

  -- 2. Idempotency: same caller + same request => same order. ------------------------------
  v_request_hash := public._hash_token(jsonb_build_object(
    'items', (select jsonb_agg(jsonb_build_array(q.variant_id, q.qty) order by q.variant_id)
                from unnest(v_variant_ids, v_quantities) as q (variant_id, qty)),
    'customer', jsonb_build_object('name', v_name, 'phone', v_phone, 'email', v_email, 'company', v_company),
    'address', v_address,
    'delivery', p_delivery_method_id,
    'payment', p_payment_method,
    'coupon', v_coupon_code,
    'notes', v_notes
  )::text);

  select * into v_existing from public.orders where idempotency_key = p_idempotency_key;
  if found then
    if ((p_user_id is not null and v_existing.user_id = p_user_id)
        or (p_user_id is null and v_existing.user_id is null and v_existing.customer_phone = v_phone))
       and v_existing.request_hash = v_request_hash then
      -- The tracking token is only returned by the first call; the server keeps it for the session.
      return jsonb_build_object(
        'order_id', v_existing.id,
        'order_number', v_existing.order_number,
        'subtotal_paisa', v_existing.subtotal_paisa,
        'discount_paisa', v_existing.discount_paisa,
        'shipping_paisa', v_existing.shipping_paisa,
        'total_paisa', v_existing.total_paisa,
        'payment_method', v_existing.payment_method,
        'reservation_expires_at', v_existing.reservation_expires_at,
        'tracking_token', null,
        'replayed', true
      );
    end if;
    raise exception 'idempotency_key_conflict' using errcode = '23505';
  end if;

  -- 3. Settings, payment method, open-order cap. ------------------------------------------
  select * into v_settings from public.store_settings where id;

  if (p_payment_method = 'cod' and not v_settings.cod_enabled)
     or (p_payment_method = 'bank_transfer' and not v_settings.bank_transfer_enabled)
     or (p_payment_method = 'online' and not v_settings.online_payment_enabled) then
    raise exception 'payment_method_unavailable' using errcode = '22023';
  end if;

  -- Serialise orders per customer so the cap cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended('open_orders:phone:' || v_phone, 0));
  if p_user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('open_orders:user:' || p_user_id::text, 0));
  end if;
  select count(*) into v_open
    from public.orders o
   where o.status::text in ('pending', 'contacted', 'confirmed')
     and (o.customer_phone = v_phone or (p_user_id is not null and o.user_id = p_user_id));
  if v_open >= v_settings.max_open_orders_per_customer then
    raise exception 'too_many_open_orders' using errcode = 'P0001';
  end if;

  -- 4. Lock stock rows (sorted), then the price rows they depend on. ----------------------
  perform 1 from public.inventory where variant_id = any (v_variant_ids) order by variant_id for update;
  perform 1 from public.product_variants where id = any (v_variant_ids) order by id for share;
  perform 1 from public.products
   where id in (select product_id from public.product_variants where id = any (v_variant_ids))
   order by id for share;

  -- Validate availability and price every line from the database.
  for v_line in
    select q.variant_id as requested_id, q.qty, v.id as variant_id, p.id as product_id,
           public.effective_price_paisa(v.regular_price_paisa, v.sale_price_paisa) as unit_price,
           coalesce(i.on_hand, 0) - coalesce(i.reserved, 0) as available, v.sku
      from unnest(v_variant_ids, v_quantities) as q (variant_id, qty)
      left join public.product_variants v on v.id = q.variant_id and v.is_active
      left join public.products p on p.id = v.product_id and p.status = 'published' and public.category_is_public(p.category_id)
      left join public.inventory i on i.variant_id = v.id
     order by q.variant_id
  loop
    if v_line.variant_id is null or v_line.product_id is null then
      raise exception 'item_unavailable' using errcode = 'P0001', detail = v_line.requested_id::text;
    end if;
    if v_line.available < v_line.qty then
      raise exception 'insufficient_stock' using errcode = 'P0001',
        detail = jsonb_build_object('variant_id', v_line.variant_id, 'sku', v_line.sku, 'available', greatest(v_line.available, 0))::text;
    end if;
    v_subtotal := v_subtotal + v_line.unit_price * v_line.qty;
  end loop;

  -- 5. Delivery method. The delivery charge is NOT calculated here: it is quoted by phone and entered by staff
  --    later (set_order_delivery_charge()), so shipping starts at 0 and orders.shipping_confirmed is false.
  select * into v_method from public.delivery_methods where id = p_delivery_method_id and is_active;
  if not found then
    raise exception 'delivery_method_unavailable' using errcode = 'P0001';
  end if;

  -- 6. Coupon. Every failure is the same generic error so codes cannot be probed. -----------
  if v_coupon_code is not null then
    select * into v_coupon from public.coupons where code = v_coupon_code for update;
    if not found or not v_coupon.is_active
       or (v_coupon.starts_at is not null and v_coupon.starts_at > now())
       or (v_coupon.ends_at is not null and v_coupon.ends_at <= now())
       or v_subtotal < v_coupon.min_order_paisa then
      raise exception 'coupon_invalid' using errcode = 'P0001';
    end if;
    if v_coupon.usage_limit is not null then
      select count(*) into v_used
        from public.coupon_redemptions r join public.orders o on o.id = r.order_id
       where r.coupon_id = v_coupon.id and o.status <> 'cancelled';
      if v_used >= v_coupon.usage_limit then
        raise exception 'coupon_invalid' using errcode = 'P0001';
      end if;
    end if;
    if v_coupon.per_customer_limit is not null then
      select count(*) into v_used
        from public.coupon_redemptions r join public.orders o on o.id = r.order_id
       where r.coupon_id = v_coupon.id and o.status <> 'cancelled'
         and ((p_user_id is not null and r.user_id = p_user_id) or r.customer_phone = v_phone);
      if v_used >= v_coupon.per_customer_limit then
        raise exception 'coupon_invalid' using errcode = 'P0001';
      end if;
    end if;

    v_has_targets := exists (select 1 from public.coupon_products where coupon_id = v_coupon.id)
                  or exists (select 1 from public.coupon_categories where coupon_id = v_coupon.id);
    if v_has_targets then
      -- A product matches if it is targeted directly or any ancestor of its category is targeted.
      select coalesce(sum(public.effective_price_paisa(v.regular_price_paisa, v.sale_price_paisa) * q.qty), 0)
        into v_eligible
        from unnest(v_variant_ids, v_quantities) as q (variant_id, qty)
        join public.product_variants v on v.id = q.variant_id
        join public.products p on p.id = v.product_id
       where exists (select 1 from public.coupon_products cp where cp.coupon_id = v_coupon.id and cp.product_id = p.id)
          or exists (
               with recursive ancestors as (
                 select c.id, c.parent_id from public.categories c where c.id = p.category_id
                 union all
                 select c.id, c.parent_id from public.categories c join ancestors a on c.id = a.parent_id
               )
               select 1 from ancestors a
                 join public.coupon_categories cc on cc.category_id = a.id and cc.coupon_id = v_coupon.id
             );
    else
      v_eligible := v_subtotal;
    end if;

    if v_coupon.discount_type = 'percent' then
      v_discount := (v_eligible * v_coupon.percent_bps) / 10000;
    else
      v_discount := least(v_coupon.amount_paisa, v_eligible);
    end if;
    if v_coupon.max_discount_paisa is not null then
      v_discount := least(v_discount, v_coupon.max_discount_paisa);
    end if;
    v_discount := least(v_discount, v_subtotal);
    if v_discount <= 0 then
      raise exception 'coupon_invalid' using errcode = 'P0001';
    end if;
  end if;

  -- 7. No shipping fee at checkout (see step 5) and no free-delivery rule.
  v_shipping := 0;

  -- 8. Order number UST-<year>-<seq>, restarting each year (Asia/Karachi). ----------------
  v_year := extract(year from (now() at time zone 'Asia/Karachi'))::integer;
  insert into public.order_number_counters as c (year, last_value)
  values (v_year, 1)
  on conflict (year) do update set last_value = c.last_value + 1
  returning last_value into v_seq;
  v_order_number := 'UST-' || v_year || '-' ||
    case when v_seq < 1000000 then lpad(v_seq::text, 6, '0') else v_seq::text end;

  v_token := coalesce(p_tracking_token, public._new_token());

  -- 9. Write the order, lines, reservations, history, payment and coupon redemption. -------
  insert into public.orders (
    order_number, user_id, idempotency_key, request_hash, tracking_token_hash, status, payment_status,
    payment_method, stock_state, customer_name, customer_phone, customer_email, company_name,
    shipping_address, delivery_method_id, delivery_method_name, subtotal_paisa, discount_paisa,
    shipping_paisa, total_paisa, coupon_id, coupon_code, customer_notes, reservation_expires_at
  ) values (
    v_order_number, p_user_id, p_idempotency_key, v_request_hash, public._hash_token(v_token), 'pending', 'unpaid',
    p_payment_method, 'reserved', v_name, v_phone, v_email, v_company,
    v_address, v_method.id, v_method.name, v_subtotal, v_discount,
    v_shipping, v_subtotal - v_discount + v_shipping, v_coupon.id, v_coupon.code, v_notes,
    case when p_payment_method = 'bank_transfer'
         then now() + make_interval(hours => v_settings.bank_transfer_hold_hours) end
  )
  returning * into v_order;

  insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name, sku,
                                  unit_price_paisa, quantity, line_total_paisa)
  select v_order.id, p.id, v.id, p.name, v.name, v.sku,
         public.effective_price_paisa(v.regular_price_paisa, v.sale_price_paisa), q.qty,
         public.effective_price_paisa(v.regular_price_paisa, v.sale_price_paisa) * q.qty
    from unnest(v_variant_ids, v_quantities) as q (variant_id, qty)
    join public.product_variants v on v.id = q.variant_id
    join public.products p on p.id = v.product_id;

  with reserved as (
    update public.inventory i
       set reserved = i.reserved + q.qty
      from unnest(v_variant_ids, v_quantities) as q (variant_id, qty)
     where i.variant_id = q.variant_id
    returning i.variant_id, q.qty, i.on_hand, i.reserved
  )
  insert into public.stock_movements (variant_id, order_id, movement_type, reserved_delta,
                                      on_hand_after, reserved_after, reason, actor_id)
  select variant_id, v_order.id, 'reserve', qty, on_hand, reserved, 'Order ' || v_order_number, p_user_id
    from reserved;

  insert into public.order_status_history (order_id, from_status, to_status, note, actor_id)
  values (v_order.id, null, 'pending', 'Order placed', p_user_id);

  insert into public.payments (order_id, method, amount_paisa, status)
  values (v_order.id, p_payment_method, v_order.total_paisa, 'unpaid');

  if v_coupon.id is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id, customer_phone, discount_paisa)
    values (v_coupon.id, v_order.id, p_user_id, v_phone, v_discount);
  end if;

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'subtotal_paisa', v_order.subtotal_paisa,
    'discount_paisa', v_order.discount_paisa,
    'shipping_paisa', v_order.shipping_paisa,
    'total_paisa', v_order.total_paisa,
    'payment_method', v_order.payment_method,
    'reservation_expires_at', v_order.reservation_expires_at,
    'tracking_token', v_token,
    'replayed', false
  );
end;
$$;

-- Signed-in customers. The user id always comes from the JWT, never from the caller.
create or replace function public.place_order(
  p_idempotency_key uuid,
  p_items jsonb,
  p_customer jsonb,
  p_shipping_address jsonb,
  p_delivery_method_id text,
  p_payment_method public.payment_method,
  p_coupon_code text default null,
  p_customer_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  -- Supabase anonymous sign-ins get an authenticated JWT; they must check out as guests.
  if coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if public._account_disabled(v_uid) then
    raise exception 'account_disabled' using errcode = '42501';
  end if;
  return public._place_order(v_uid, p_idempotency_key, p_items, p_customer, p_shipping_address,
                             p_delivery_method_id, p_payment_method, p_coupon_code, p_customer_notes, null);
end;
$$;

-- Guests: only the server (service role) may call this, after its own rate limiting. The tracking token is derived by
-- the server from the idempotency key, so a retry of the same request gets the same link back.
create or replace function public.place_order_as_guest(
  p_idempotency_key uuid,
  p_items jsonb,
  p_customer jsonb,
  p_shipping_address jsonb,
  p_delivery_method_id text,
  p_payment_method public.payment_method,
  p_coupon_code text default null,
  p_customer_notes text default null,
  p_tracking_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not (select guest_checkout_enabled from public.store_settings where id) then
    raise exception 'guest_checkout_disabled' using errcode = '42501';
  end if;
  v_result := public._place_order(null, p_idempotency_key, p_items, p_customer, p_shipping_address,
                                  p_delivery_method_id, p_payment_method, p_coupon_code, p_customer_notes, p_tracking_token);
  -- A retry replays the order without a token; the caller derived it, so hand it back.
  if (v_result ->> 'replayed')::boolean and p_tracking_token is not null
     and exists (select 1 from public.orders o
                  where o.id = (v_result ->> 'order_id')::uuid and o.tracking_token_hash = public._hash_token(p_tracking_token)) then
    v_result := v_result || jsonb_build_object('tracking_token', p_tracking_token);
  end if;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Staff functions (each one checks the caller, locks the order, and writes the audit log)
-- ---------------------------------------------------------------------------
-- The agreed delivery charge. The total is recalculated here from the stored subtotal and discount.
create or replace function public.set_order_delivery_charge(p_order_id uuid, p_shipping_paisa bigint)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_old bigint;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_shipping_paisa is null or p_shipping_paisa < 0 or p_shipping_paisa > 10000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status::text in ('delivered', 'cancelled', 'exchange_requested', 'returned') then
    raise exception 'order_closed' using errcode = 'P0001';
  end if;
  -- Once the money is collected the total is fixed.
  if v_order.payment_status in ('paid', 'refunded', 'pending_verification') then
    raise exception 'order_paid' using errcode = 'P0001';
  end if;
  v_old := v_order.shipping_paisa;
  update public.orders
     set shipping_paisa = p_shipping_paisa,
         total_paisa = subtotal_paisa - discount_paisa + p_shipping_paisa,
         shipping_confirmed = true,
         shipping_confirmed_at = now()
   where id = v_order.id
  returning * into v_order;
  update public.payments set amount_paisa = v_order.total_paisa
   where order_id = v_order.id and status <> 'paid';
  perform public.log_audit('order.delivery_charge', 'orders', v_order.id::text,
    jsonb_build_object('from_paisa', v_old, 'to_paisa', p_shipping_paisa, 'total_paisa', v_order.total_paisa));
  return v_order;
end;
$$;

-- Courier (from the couriers list) and tracking number. One shipment per order: calling it again edits it.
create or replace function public.set_order_shipment(p_order_id uuid, p_courier text, p_tracking_number text default null)
returns public.shipments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_courier text;
  v_tracking text;
  v_ship public.shipments;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select c.name into v_courier from public.couriers c
   where c.is_active and lower(c.name) = lower(trim(coalesce(p_courier, '')));
  if v_courier is null then
    raise exception 'courier_unavailable' using errcode = '22023';
  end if;
  v_tracking := nullif(trim(coalesce(p_tracking_number, '')), '');
  if v_tracking is not null and v_tracking !~ '^[A-Za-z0-9 ._/#-]{1,80}$' then
    raise exception 'invalid_tracking_number' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status::text in ('cancelled', 'returned') then
    raise exception 'order_closed' using errcode = 'P0001';
  end if;

  select * into v_ship from public.shipments where order_id = v_order.id order by created_at desc limit 1 for update;
  if found then
    update public.shipments set courier = v_courier, tracking_number = v_tracking
     where id = v_ship.id returning * into v_ship;
  else
    insert into public.shipments (order_id, courier, tracking_number, created_by, dispatched_at)
    values (v_order.id, v_courier, v_tracking, (select auth.uid()),
            case when v_order.status::text in ('dispatched', 'delivered') then now() end)
    returning * into v_ship;
  end if;
  perform public.log_audit('order.shipment', 'orders', v_order.id::text,
    jsonb_build_object('courier', v_courier, 'tracking_number', v_tracking));
  return v_ship;
end;
$$;

-- An internal note: staff only, never shown to the customer. The audit entry records that a note was added, not its text.
create or replace function public.add_order_note(p_order_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := trim(coalesce(p_note, ''));
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if length(v_note) not between 1 and 2000 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;
  perform 1 from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  insert into public.internal_notes (entity_type, entity_id, note, author_id)
  values ('order', p_order_id, v_note, (select auth.uid()))
  returning id into v_id;
  perform public.log_audit('order.note', 'orders', p_order_id::text,
    jsonb_build_object('note_id', v_id, 'length', length(v_note)));
end;
$$;

-- Cash on delivery collected. Only for a COD order that has left the shop.
create or replace function public.mark_cod_collected(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.payment_method <> 'cod' then
    raise exception 'cod_only' using errcode = 'P0001';
  end if;
  if v_order.payment_status = 'paid' then
    raise exception 'already_paid' using errcode = 'P0001';
  end if;
  if v_order.status::text not in ('dispatched', 'delivered', 'exchange_requested') then
    raise exception 'not_dispatched' using errcode = 'P0001';
  end if;
  return public.set_payment_status(p_order_id, 'paid', 'Cash on delivery collected');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Admin list: search and filters. Runs as the caller, so row-level security applies as well.
-- ---------------------------------------------------------------------------
create or replace function public.search_orders(
  p_query text default null,
  p_status public.order_status default null,
  p_from date default null,
  p_to date default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  order_number text,
  created_at timestamptz,
  status public.order_status,
  payment_method public.payment_method,
  payment_status public.payment_status,
  customer_name text,
  customer_phone text,
  city text,
  total_paisa bigint,
  shipping_confirmed boolean,
  total_count bigint
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := nullif(trim(coalesce(p_query, '')), '');
  v_like text;
  v_digits text;
  v_phone_like text;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_q is not null then
    v_q := left(v_q, 80);
    -- % and _ typed by the user are plain text.
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_digits := regexp_replace(v_q, '[^0-9]', '', 'g');
    if length(v_digits) >= 3 then
      if v_digits ~ '^92' then
        v_digits := '0' || substr(v_digits, 3);
      end if;
      v_phone_like := '%' || v_digits || '%';
    end if;
  end if;

  return query
  select o.id, o.order_number, o.created_at, o.status, o.payment_method, o.payment_status,
         o.customer_name, o.customer_phone, o.shipping_address ->> 'city', o.total_paisa,
         o.shipping_confirmed, count(*) over ()
    from public.orders o
   where (v_q is null
          or o.order_number ilike v_like
          or o.customer_name ilike v_like
          or (v_phone_like is not null and o.customer_phone like v_phone_like))
     and (p_status is null or o.status = p_status)
     and (p_from is null or o.created_at >= (p_from::timestamp at time zone 'Asia/Karachi'))
     and (p_to is null or o.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Karachi'))
   order by o.created_at desc, o.id
   limit greatest(1, least(coalesce(p_limit, 25), 100))
   offset greatest(0, least(coalesce(p_offset, 0), 100000));
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. What a customer with the tracking link may see. No phone, e-mail, full address, notes, costs or staff identity.
-- ---------------------------------------------------------------------------
create or replace function public.get_order_by_tracking_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  v_order := public._resolve_customer_order(null, p_token);
  if v_order.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'order_number', v_order.order_number,
    'status', v_order.status,
    'payment_status', v_order.payment_status,
    'payment_method', v_order.payment_method,
    'placed_at', v_order.created_at,
    'delivery_method', v_order.delivery_method_name,
    'city', v_order.shipping_address ->> 'city',
    'subtotal_paisa', v_order.subtotal_paisa,
    'discount_paisa', v_order.discount_paisa,
    'shipping_paisa', v_order.shipping_paisa,
    'shipping_confirmed', v_order.shipping_confirmed,
    'total_paisa', v_order.total_paisa,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_name', oi.product_name, 'variant_name', oi.variant_name, 'sku', oi.sku,
               'quantity', oi.quantity, 'unit_price_paisa', oi.unit_price_paisa,
               'line_total_paisa', oi.line_total_paisa) order by oi.created_at, oi.sku)
        from public.order_items oi where oi.order_id = v_order.id), '[]'::jsonb),
    'shipments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'courier', s.courier, 'tracking_number', s.tracking_number, 'tracking_url', s.tracking_url,
               'dispatched_at', s.dispatched_at, 'estimated_delivery', s.estimated_delivery,
               'delivery_notes', s.delivery_notes) order by s.created_at)
        from public.shipments s where s.order_id = v_order.id), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('status', h.to_status, 'at', h.created_at) order by h.id)
        from public.order_status_history h where h.order_id = v_order.id), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public._place_order(uuid, uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text, text)
  from public, anon, authenticated, service_role;

revoke all on function public.place_order(uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text) from public, anon;
grant execute on function public.place_order(uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text) to authenticated;

revoke all on function public.place_order_as_guest(uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text, text)
  from public, anon, authenticated;
grant execute on function public.place_order_as_guest(uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text, text)
  to service_role;

revoke all on function public.set_order_delivery_charge(uuid, bigint) from public, anon;
grant execute on function public.set_order_delivery_charge(uuid, bigint) to authenticated;
revoke all on function public.set_order_shipment(uuid, text, text) from public, anon;
grant execute on function public.set_order_shipment(uuid, text, text) to authenticated;
revoke all on function public.add_order_note(uuid, text) from public, anon;
grant execute on function public.add_order_note(uuid, text) to authenticated;
revoke all on function public.mark_cod_collected(uuid) from public, anon;
grant execute on function public.mark_cod_collected(uuid) to authenticated;
revoke all on function public.search_orders(text, public.order_status, date, date, integer, integer) from public, anon;
grant execute on function public.search_orders(text, public.order_status, date, date, integer, integer) to authenticated;

-- PostgREST caches the schema: tell it about the new and changed functions.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Self-check. Any failure raises an error and rolls this whole file back, so a project can never end up half-migrated.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  v_bad text := '';
  v_def text;
begin
  -- 1. The statuses exist (looked up by name: the new values cannot be used as literals in this transaction).
  if (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
       where t.typname = 'order_status' and e.enumlabel in ('contacted', 'exchange_requested')) <> 2 then
    raise exception 'order_status is missing contacted or exchange_requested';
  end if;

  -- 2. The transition table and the order function have the intended shape.
  v_def := pg_get_functiondef('public._order_transition_allowed(public.order_status, public.order_status)'::regprocedure);
  if v_def !~ 'contacted' or v_def !~ 'exchange_requested' or v_def ~ '''confirmed'', ''processing''' or v_def ~ '''dispatched'', ''shipped''' then
    raise exception '_order_transition_allowed() does not describe the Phase 4 workflow';
  end if;
  v_def := pg_get_functiondef('public._place_order(uuid, uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text, text)'::regprocedure);
  if v_def ~ 'shipping_rates' or v_def ~ 'free_over' or v_def ~ 'free_delivery' then
    raise exception '_place_order() still calculates a delivery charge';
  end if;
  if v_def !~ 'category_is_public' then
    raise exception '_place_order() lost the hidden-category rule from Phase 3B';
  end if;

  -- 2b. 'contacted' counts as open everywhere an open order is tested.
  if pg_get_functiondef('public.expire_unpaid_bank_transfers()'::regprocedure) !~ 'contacted'
     or pg_get_functiondef('public.get_bank_transfer_details(uuid, text)'::regprocedure) !~ 'contacted'
     or pg_get_functiondef('public.submit_bank_transfer_reference(uuid, text, text, text)'::regprocedure) !~ 'contacted'
     or pg_get_functiondef('public._place_order(uuid, uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text, text)'::regprocedure) !~ 'contacted' then
    raise exception 'an open-order test does not count Contacted orders';
  end if;

  -- 3. New columns and the owner-notification index.
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'orders' and column_name in ('shipping_confirmed', 'shipping_confirmed_at')) <> 2 then
    raise exception 'orders is missing shipping_confirmed / shipping_confirmed_at';
  end if;
  if to_regclass('public.notifications_owner_new_order_key') is null then
    raise exception 'notifications_owner_new_order_key is missing';
  end if;

  -- 4. Nothing may be executable by anon or authenticated outside this list.
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
                      'set_primary_image', 'set_order_delivery_charge', 'set_order_shipment', 'add_order_note',
                      'mark_cod_collected', 'search_orders']
         end)
  loop
    v_bad := v_bad || format(E'\n  %s can execute %s', f.rolname, f.sig);
  end loop;
  if v_bad <> '' then
    raise exception 'these functions are executable by anon or authenticated but are not in the allowlist:%', v_bad;
  end if;

  -- 5. Guests cannot place orders directly, and only the server can.
  if has_function_privilege('anon', 'public.place_order_as_guest(uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.place_order_as_guest(uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text, text)', 'execute')
     or not has_function_privilege('service_role', 'public.place_order_as_guest(uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text, text)', 'execute') then
    raise exception 'place_order_as_guest() must be executable by service_role only';
  end if;

  -- 6. anon reads no order data.
  if has_table_privilege('anon', 'public.orders', 'select')
     or has_table_privilege('anon', 'public.order_items', 'select')
     or has_table_privilege('anon', 'public.payments', 'select')
     or has_table_privilege('anon', 'public.shipments', 'select')
     or has_table_privilege('anon', 'public.internal_notes', 'select')
     or has_table_privilege('anon', 'public.notifications', 'select') then
    raise exception 'anon can read order data';
  end if;

  -- 7. Bank transfer is off by default (a new project, or a row an admin has not switched on).
  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'store_settings' and column_name = 'bank_transfer_enabled') is distinct from 'false' then
    raise exception 'store_settings.bank_transfer_enabled must default to false';
  end if;
end;
$$;
