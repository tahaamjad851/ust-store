-- Order functions. All money and stock decisions are made here, inside one transaction,
-- from database values only. Callers never supply prices, discounts, shipping or totals.
--
--   place_order()            signed-in customers (authenticated; anonymous sign-ins rejected)
--   place_order_as_guest()   guests, via the Next.js server only (service_role; anon cannot execute)
--   set_order_status()       admin/staff; enforces the lifecycle and stock effects
--   set_payment_status()     admin/staff; never automatic from customer input
--   expire_unpaid_bank_transfers()  scheduled job (service_role / pg_cron)
--   request_return()         customers, for delivered items
--   get_order_by_tracking_token(), get_bank_transfer_details(), submit_bank_transfer_reference()
--
-- Order lifecycle (anything else is rejected):
--   pending -> confirmed | cancelled
--   confirmed -> processing | cancelled
--   processing -> dispatched | cancelled
--   dispatched -> shipped | delivered
--   shipped -> delivered
--   delivered -> returned
-- Bank-transfer and online orders must be paid before processing.
--
-- Stock: reserved by place_order(); released exactly once on cancellation; converted to a
-- sale (on_hand and reserved both reduced) exactly once on shipped/delivered. Guarded by
-- orders.stock_state and the unique (order_id, variant_id, movement_type) ledger index.
--
-- Lock order (prevents deadlocks): advisory locks (idempotency key, customer) -> inventory rows
-- (sorted by variant id) -> product_variants/products (FOR SHARE) -> coupon -> order counter.
-- Status changes lock the order row first, then its inventory rows (sorted).
--
-- Anti-hoarding: a customer (account or phone) may hold at most
-- store_settings.max_open_orders_per_customer pending/confirmed orders.

-- ---------------------------------------------------------------------------
-- Internal helpers (not executable by any API role)
-- ---------------------------------------------------------------------------
create function public._hash_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(sha256(convert_to(p_token, 'UTF8')), 'hex') $$;

create function public._new_token()
returns text
language sql
volatile
set search_path = ''
as $$ select encode(extensions.gen_random_bytes(32), 'hex') $$;

create function public._normalize_pk_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if v ~ '^92' then
    v := '0' || substr(v, 3);
  end if;
  if v !~ '^03[0-9]{9}$' then
    return null;
  end if;
  return v;
end;
$$;

create function public._order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from::text, p_to::text) in (
    ('pending', 'confirmed'), ('pending', 'cancelled'),
    ('confirmed', 'processing'), ('confirmed', 'cancelled'),
    ('processing', 'dispatched'), ('processing', 'cancelled'),
    ('dispatched', 'shipped'), ('dispatched', 'delivered'),
    ('shipped', 'delivered'),
    ('delivered', 'returned')
  );
$$;

create function public._payment_transition_allowed(p_from public.payment_status, p_to public.payment_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from::text, p_to::text) in (
    ('unpaid', 'pending_verification'), ('unpaid', 'paid'), ('unpaid', 'failed'),
    ('pending_verification', 'paid'), ('pending_verification', 'failed'), ('pending_verification', 'unpaid'),
    ('failed', 'unpaid'), ('failed', 'pending_verification'), ('failed', 'paid'),
    ('paid', 'refunded')
  );
$$;

create function public._account_disabled(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
     and exists (select 1 from public.profiles where id = p_user_id and disabled_at is not null);
$$;

-- ---------------------------------------------------------------------------
-- _place_order: shared implementation. p_user_id is NULL for guests.
-- ---------------------------------------------------------------------------
create function public._place_order(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_customer jsonb,
  p_shipping_address jsonb,
  p_delivery_method_id text,
  p_payment_method public.payment_method,
  p_coupon_code text,
  p_customer_notes text
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
  v_rate public.shipping_rates;
  v_free_over bigint;
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
   where o.status in ('pending', 'confirmed')
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
      left join public.products p on p.id = v.product_id and p.status = 'published'
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

  -- 5. Delivery method and rate (validated before any coupon check). ----------------------
  select * into v_method from public.delivery_methods where id = p_delivery_method_id and is_active;
  if not found then
    raise exception 'delivery_method_unavailable' using errcode = 'P0001';
  end if;
  select * into v_rate
    from public.shipping_rates r
   where r.delivery_method_id = v_method.id
     and r.is_active
     and (r.province is null or r.province::text = v_province)
     and (r.city is null or lower(r.city) = lower(v_city))
   order by (r.city is not null) desc, (r.province is not null) desc
   limit 1;
  if not found then
    raise exception 'no_shipping_rate' using errcode = 'P0001';
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

  -- 7. Shipping fee (free when the discounted subtotal reaches the threshold). -------------
  v_free_over := coalesce(v_rate.free_over_paisa, v_settings.free_delivery_threshold_paisa);
  v_shipping := case
    when v_free_over is not null and v_subtotal - v_discount >= v_free_over then 0
    else v_rate.fee_paisa
  end;

  -- 8. Order number UST-<year>-<seq>, restarting each year (Asia/Karachi). ----------------
  v_year := extract(year from (now() at time zone 'Asia/Karachi'))::integer;
  insert into public.order_number_counters as c (year, last_value)
  values (v_year, 1)
  on conflict (year) do update set last_value = c.last_value + 1
  returning last_value into v_seq;
  v_order_number := 'UST-' || v_year || '-' ||
    case when v_seq < 1000000 then lpad(v_seq::text, 6, '0') else v_seq::text end;

  v_token := public._new_token();

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
create function public.place_order(
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
                             p_delivery_method_id, p_payment_method, p_coupon_code, p_customer_notes);
end;
$$;

-- Guests: only the server (service role) may call this, after its own rate limiting.
create function public.place_order_as_guest(
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
begin
  if not (select guest_checkout_enabled from public.store_settings where id) then
    raise exception 'guest_checkout_disabled' using errcode = '42501';
  end if;
  return public._place_order(null, p_idempotency_key, p_items, p_customer, p_shipping_address,
                             p_delivery_method_id, p_payment_method, p_coupon_code, p_customer_notes);
end;
$$;

-- ---------------------------------------------------------------------------
-- Stock effects of status changes (internal; callers hold the order row lock)
-- ---------------------------------------------------------------------------
create function public._release_order_stock(p_order_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.inventory i
   where i.variant_id in (select oi.variant_id from public.order_items oi where oi.order_id = p_order_id)
   order by i.variant_id for update;

  with lines as (
    select oi.variant_id, sum(oi.quantity)::integer as qty
      from public.order_items oi
     where oi.order_id = p_order_id and oi.variant_id is not null
     group by oi.variant_id
  ), released as (
    update public.inventory i
       set reserved = i.reserved - l.qty
      from lines l
     where i.variant_id = l.variant_id
    returning i.variant_id, l.qty, i.on_hand, i.reserved
  )
  insert into public.stock_movements (variant_id, order_id, movement_type, reserved_delta,
                                      on_hand_after, reserved_after, reason, actor_id)
  select variant_id, p_order_id, 'release', -qty, on_hand, reserved, 'Order cancelled', p_actor
    from released;
end;
$$;

create function public._deduct_order_stock(p_order_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.inventory i
   where i.variant_id in (select oi.variant_id from public.order_items oi where oi.order_id = p_order_id)
   order by i.variant_id for update;

  with lines as (
    select oi.variant_id, sum(oi.quantity)::integer as qty
      from public.order_items oi
     where oi.order_id = p_order_id and oi.variant_id is not null
     group by oi.variant_id
  ), sold as (
    update public.inventory i
       set on_hand = i.on_hand - l.qty,
           reserved = i.reserved - l.qty
      from lines l
     where i.variant_id = l.variant_id
    returning i.variant_id, l.qty, i.on_hand, i.reserved
  )
  insert into public.stock_movements (variant_id, order_id, movement_type, on_hand_delta, reserved_delta,
                                      on_hand_after, reserved_after, reason, actor_id)
  select variant_id, p_order_id, 'sale', -qty, -qty, on_hand, reserved, 'Order shipped', p_actor
    from sold;
end;
$$;

create function public._transition_order(p_order_id uuid, p_to public.order_status, p_note text, p_actor uuid)
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
  if p_to in ('processing', 'dispatched', 'shipped', 'delivered')
     and v_order.payment_method in ('bank_transfer', 'online')
     and v_order.payment_status <> 'paid' then
    raise exception 'payment_required' using errcode = 'P0001';
  end if;

  v_stock := v_order.stock_state;
  if p_to = 'cancelled' and v_stock = 'reserved' then
    perform public._release_order_stock(v_order.id, p_actor);
    v_stock := 'released';
  elsif p_to in ('shipped', 'delivered') and v_stock = 'reserved' then
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

  -- Notes are shown to the customer on their order; internal remarks belong in internal_notes.
  insert into public.order_status_history (order_id, from_status, to_status, note, actor_id)
  values (v_order.id, v_from, p_to, left(p_note, 500), p_actor);

  perform public.log_audit('order.status', 'orders', v_order.id::text,
    jsonb_build_object('from', v_from, 'to', p_to, 'note', left(p_note, 500)));
  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin/staff API
-- ---------------------------------------------------------------------------
create function public.set_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return public._transition_order(p_order_id, p_status, p_note, (select auth.uid()));
end;
$$;

create function public.set_payment_status(
  p_order_id uuid,
  p_status public.payment_status,
  p_note text default null,
  p_provider_reference text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_uid uuid := (select auth.uid());
  v_hold integer;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if not public._payment_transition_allowed(v_order.payment_status, p_status) then
    raise exception 'invalid_payment_transition' using errcode = 'P0001',
      detail = v_order.payment_status::text || ' -> ' || p_status::text;
  end if;
  if v_order.status = 'cancelled' and p_status <> 'refunded' then
    raise exception 'order_cancelled' using errcode = 'P0001';
  end if;
  select bank_transfer_hold_hours into v_hold from public.store_settings where id;

  update public.orders
     set payment_status = p_status,
         paid_at = case when p_status = 'paid' then now() else paid_at end,
         reservation_expires_at = case
           when p_status = 'paid' then null
           -- Rejected or reset bank transfers get a fresh hold so the customer can retry,
           -- but the order still expires if nothing arrives.
           when payment_method = 'bank_transfer' and p_status in ('unpaid', 'failed')
             then greatest(coalesce(reservation_expires_at, now()), now() + make_interval(hours => v_hold))
           else reservation_expires_at
         end
   where id = v_order.id
  returning * into v_order;

  update public.payments
     set status = p_status,
         provider_reference = coalesce(left(p_provider_reference, 120), provider_reference),
         verified_by = case when p_status = 'paid' then v_uid else verified_by end,
         verified_at = case when p_status = 'paid' then now() else verified_at end
   where id = (select id from public.payments where order_id = v_order.id order by created_at desc limit 1);

  perform public.log_audit('order.payment_status', 'orders', v_order.id::text,
    jsonb_build_object('to', p_status, 'note', left(p_note, 500)));
  return v_order;
end;
$$;

-- Scheduled job: cancel bank-transfer orders that are still unpaid (or rejected) after their hold.
-- Orders where the customer has submitted a reference (pending_verification) are left for staff.
-- The batch's stock rows are locked up front in one global order, so it cannot deadlock with checkout.
create function public.expire_unpaid_bank_transfers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
begin
  select coalesce(array_agg(id), '{}') into v_ids
    from (
      select id from public.orders
       where payment_method = 'bank_transfer'
         and payment_status in ('unpaid', 'failed')
         and status in ('pending', 'confirmed')
         and reservation_expires_at < now()
       order by reservation_expires_at
       limit 100
       for update skip locked
    ) s;

  perform 1 from public.inventory
   where variant_id in (select oi.variant_id from public.order_items oi where oi.order_id = any (v_ids))
   order by variant_id for update;

  foreach v_id in array v_ids loop
    perform public._transition_order(v_id, 'cancelled', 'Bank transfer not received within the hold period', null);
  end loop;
  return cardinality(v_ids);
end;
$$;

-- ---------------------------------------------------------------------------
-- Customer and guest functions
-- ---------------------------------------------------------------------------
-- Resolves an order the caller may see: by tracking token, or by id for its signed-in owner.
create function public._resolve_customer_order(p_order_id uuid, p_token text)
returns public.orders
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if p_token is not null then
    if p_token !~ '^[0-9a-f]{64}$' then
      return null;
    end if;
    select * into v_order from public.orders where tracking_token_hash = public._hash_token(p_token);
  elsif p_order_id is not null and (select auth.uid()) is not null then
    select * into v_order from public.orders where id = p_order_id and user_id = (select auth.uid());
  end if;
  return v_order;
end;
$$;

create function public.get_order_by_tracking_token(p_token text)
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

-- Bank details are shown only for an open, unpaid bank-transfer order the caller may see.
create function public.get_bank_transfer_details(p_order_id uuid default null, p_token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  v_order := public._resolve_customer_order(p_order_id, p_token);
  if v_order.id is null
     or v_order.payment_method <> 'bank_transfer'
     or v_order.status not in ('pending', 'confirmed')
     or v_order.payment_status not in ('unpaid', 'pending_verification', 'failed') then
    return null;
  end if;
  return jsonb_build_object(
    'order_number', v_order.order_number,
    'amount_paisa', v_order.total_paisa,
    'pay_before', v_order.reservation_expires_at,
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'bank_name', b.bank_name, 'account_title', b.account_title,
               'account_number', b.account_number, 'iban', b.iban, 'branch', b.branch,
               'instructions', b.instructions) order by b.sort_order, b.bank_name)
        from public.bank_accounts b where b.is_active), '[]'::jsonb)
  );
end;
$$;

-- Customer submits a bank-transfer reference (and optionally a proof file already uploaded to
-- the payment-proofs bucket). This only moves the payment to pending_verification; staff verify.
create function public.submit_bank_transfer_reference(
  p_order_id uuid,
  p_token text,
  p_reference text,
  p_proof_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_uid uuid := (select auth.uid());
  v_prefix text;
begin
  if public._account_disabled(v_uid) then
    raise exception 'account_disabled' using errcode = '42501';
  end if;
  v_order := public._resolve_customer_order(p_order_id, p_token);
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  -- Lock, then validate the current state (a concurrent payment update or cancellation wins).
  select * into v_order from public.orders where id = v_order.id for update;
  if v_order.payment_method <> 'bank_transfer' or v_order.status not in ('pending', 'confirmed')
     or v_order.payment_status not in ('unpaid', 'failed') then
    raise exception 'payment_not_awaited' using errcode = 'P0001';
  end if;
  if p_reference is null or length(trim(p_reference)) not between 3 and 64 then
    raise exception 'invalid_reference' using errcode = '22023';
  end if;
  if p_proof_path is not null then
    -- Signed-in uploads live under <user id>/<order id>/; guest uploads (server-side) under guest/<order id>/.
    v_prefix := case when v_uid is not null and v_order.user_id = v_uid then v_uid::text else 'guest' end
                || '/' || v_order.id::text || '/';
    if left(p_proof_path, length(v_prefix)) <> v_prefix
       or substr(p_proof_path, length(v_prefix) + 1) !~ '^[A-Za-z0-9._-]{1,100}$' then
      raise exception 'invalid_proof_path' using errcode = '22023';
    end if;
  end if;

  update public.payments
     set customer_reference = trim(p_reference),
         proof_path = coalesce(p_proof_path, proof_path),
         status = 'pending_verification'
   where id = (select id from public.payments where order_id = v_order.id order by created_at desc limit 1);
  update public.orders set payment_status = 'pending_verification' where id = v_order.id;
end;
$$;

-- Customers request a return for an item of their own delivered order. Checks returnability,
-- the store's return period (from the delivery time) and the quantity not already requested.
create function public.request_return(p_order_item_id uuid, p_quantity integer, p_reason text)
returns public.returns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.order_items;
  v_order public.orders;
  v_delivered_at timestamptz;
  v_period integer;
  v_already integer;
  v_return public.returns;
begin
  if v_uid is null or public._account_disabled(v_uid) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity not between 1 and 999 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 1000 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  select * into v_item from public.order_items where id = p_order_item_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  select * into v_order from public.orders where id = v_item.order_id;
  if v_order.user_id is distinct from v_uid then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'delivered' then
    raise exception 'not_returnable' using errcode = 'P0001', detail = 'order not delivered';
  end if;
  if not coalesce((select p.is_returnable from public.products p where p.id = v_item.product_id), false) then
    raise exception 'not_returnable' using errcode = 'P0001', detail = 'product not returnable';
  end if;

  select return_period_days into v_period from public.store_settings where id;
  select max(created_at) into v_delivered_at
    from public.order_status_history where order_id = v_order.id and to_status = 'delivered';
  if v_period is not null and v_delivered_at + make_interval(days => v_period) < now() then
    raise exception 'not_returnable' using errcode = 'P0001', detail = 'return period ended';
  end if;

  select coalesce(sum(quantity), 0) into v_already
    from public.returns where order_item_id = v_item.id and status <> 'rejected';
  if v_already + p_quantity > v_item.quantity then
    raise exception 'invalid_quantity' using errcode = '22023', detail = 'exceeds quantity bought';
  end if;

  insert into public.returns (order_id, order_item_id, user_id, quantity, reason)
  values (v_order.id, v_item.id, v_uid, p_quantity, trim(p_reason))
  returning * into v_return;
  return v_return;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public._hash_token(text) from public, anon, authenticated, service_role;
revoke all on function public._new_token() from public, anon, authenticated, service_role;
revoke all on function public._normalize_pk_phone(text) from public, anon, authenticated, service_role;
revoke all on function public._order_transition_allowed(public.order_status, public.order_status) from public, anon, authenticated, service_role;
revoke all on function public._payment_transition_allowed(public.payment_status, public.payment_status) from public, anon, authenticated, service_role;
revoke all on function public._account_disabled(uuid) from public, anon, authenticated, service_role;
revoke all on function public._place_order(uuid, uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text) from public, anon, authenticated, service_role;
revoke all on function public._release_order_stock(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public._deduct_order_stock(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public._transition_order(uuid, public.order_status, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public._resolve_customer_order(uuid, text) from public, anon, authenticated, service_role;

revoke all on function public.place_order(uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text) from public, anon;
grant execute on function public.place_order(uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text) to authenticated;

revoke all on function public.place_order_as_guest(uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text) from public, anon, authenticated;
grant execute on function public.place_order_as_guest(uuid, jsonb, jsonb, jsonb, text, public.payment_method, text, text) to service_role;

revoke all on function public.set_order_status(uuid, public.order_status, text) from public, anon;
grant execute on function public.set_order_status(uuid, public.order_status, text) to authenticated;
revoke all on function public.set_payment_status(uuid, public.payment_status, text, text) from public, anon;
grant execute on function public.set_payment_status(uuid, public.payment_status, text, text) to authenticated;

revoke all on function public.expire_unpaid_bank_transfers() from public, anon, authenticated;
grant execute on function public.expire_unpaid_bank_transfers() to service_role;

revoke all on function public.request_return(uuid, integer, text) from public, anon;
grant execute on function public.request_return(uuid, integer, text) to authenticated;

revoke all on function public.get_order_by_tracking_token(text) from public, anon;
grant execute on function public.get_order_by_tracking_token(text) to authenticated, service_role;
revoke all on function public.get_bank_transfer_details(uuid, text) from public, anon;
grant execute on function public.get_bank_transfer_details(uuid, text) to authenticated, service_role;
revoke all on function public.submit_bank_transfer_reference(uuid, text, text, text) from public, anon;
grant execute on function public.submit_bank_transfer_reference(uuid, text, text, text) to authenticated, service_role;
