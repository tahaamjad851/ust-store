-- Phase 2 (auth & accounts) support:
--   1. Postgres-backed rate limiter for server actions (login, register, password reset, contact).
--   2. Staff identity columns on customer-readable order tables are no longer readable by API roles.
--   3. Address integrity: one default per customer, first address becomes the default, a cap per customer.

-- ---------------------------------------------------------------------------
-- 1. Rate limiter
--
-- Fixed-window counters keyed by (bucket, key). The server hashes the subject (IP address, email)
-- before it gets here, so no raw email or IP is stored. Only the server (service_role) may call
-- check_rate_limit(): if anon or authenticated could, anyone could burn another person's bucket
-- and lock them out of signing in.
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  bucket text not null check (length(bucket) between 1 and 40),
  key text not null check (length(key) between 1 and 128),
  window_start timestamptz not null default now(),
  hits integer not null default 0 check (hits >= 0),
  primary key (bucket, key)
);
create index rate_limits_window_idx on public.rate_limits (window_start);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

-- Counts one attempt. Returns whether it is within the limit and, when it is not, how many
-- seconds until the window resets. Attempts over the limit do not extend the window.
create function public.check_rate_limit(
  p_bucket text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window interval;
  v_hits integer;
  v_start timestamptz;
begin
  if p_bucket is null or length(p_bucket) not between 1 and 40
     or p_key is null or length(p_key) not between 1 and 128
     or p_limit is null or p_limit not between 1 and 10000
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid_rate_limit_arguments' using errcode = '22023';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  insert into public.rate_limits as r (bucket, key, window_start, hits)
  values (p_bucket, p_key, now(), 1)
  on conflict (bucket, key) do update
    set hits = case when r.window_start <= now() - v_window then 1 else r.hits + 1 end,
        window_start = case when r.window_start <= now() - v_window then now() else r.window_start end
  returning r.hits, r.window_start into v_hits, v_start;

  -- Housekeeping: windows are at most one day long, so older rows are dead.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  allowed := v_hits <= p_limit;
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (v_start + v_window - now())))::integer)
  end;
  return next;
end;
$$;
revoke all on function public.check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Staff-only columns on customer-readable tables
--
-- Customers read their own orders through these tables, so they must not receive the identity of
-- the staff member who changed a status, verified a payment, created a shipment or a refund.
-- Customers and staff share the `authenticated` role, so this is done with column privileges: no
-- API role can read these four columns. Staff see who did what in audit_log (order.status and
-- order.payment_status entries carry the actor). The service role and SQL editor are unaffected.
--
-- Consequence: API queries on these four tables must list columns; `select *` fails with
-- "permission denied". Staff-only notes live in internal_notes (admin/staff RLS only).
-- ---------------------------------------------------------------------------
revoke select on public.order_status_history from authenticated;
grant select (id, order_id, from_status, to_status, note, created_at)
  on public.order_status_history to authenticated;

revoke select on public.payments from authenticated;
grant select (id, order_id, method, amount_paisa, status, provider, provider_reference,
              customer_reference, proof_path, verified_at, created_at, updated_at)
  on public.payments to authenticated;

revoke select on public.shipments from authenticated;
grant select (id, order_id, courier, tracking_number, tracking_url, dispatched_at,
              estimated_delivery, delivery_notes, created_at, updated_at)
  on public.shipments to authenticated;

revoke select on public.refunds from authenticated;
grant select (id, order_id, return_id, amount_paisa, status, method, reference, note,
              created_at, updated_at)
  on public.refunds to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Address integrity
--
-- The unique index addresses_one_default allows one default per customer. These triggers keep the
-- rule without the client juggling two writes: marking an address as default clears the old one,
-- the first address is the default, and deleting the default promotes the newest remaining one.
-- A customer may keep at most 10 addresses.
-- ---------------------------------------------------------------------------
create function public.addresses_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.addresses a where a.user_id = new.user_id) >= 10 then
      raise exception 'address_limit_reached' using errcode = '54000';
    end if;
    if not new.is_default
       and not exists (select 1 from public.addresses a where a.user_id = new.user_id) then
      new.is_default := true;
    end if;
  end if;

  if new.is_default then
    update public.addresses
       set is_default = false
     where user_id = new.user_id and is_default and id <> new.id;
  end if;
  return new;
end;
$$;

create trigger addresses_default_guard
  before insert or update of is_default on public.addresses
  for each row execute function public.addresses_before_write();

create function public.addresses_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_default then
    update public.addresses
       set is_default = true
     where id = (
       select a.id from public.addresses a
        where a.user_id = old.user_id
        order by a.created_at desc, a.id
        limit 1
     );
  end if;
  return old;
end;
$$;

create trigger addresses_promote_default
  after delete on public.addresses
  for each row execute function public.addresses_after_delete();
