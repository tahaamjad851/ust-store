-- Foundation: privilege defaults, extensions, enums, shared helpers, roles, profiles, audit log.
--
-- Security model (applies to every later migration):
--   * RLS is enabled on every table; no policy = no access (default deny).
--   * anon gets no table privileges by default; public catalog tables grant SELECT explicitly.
--   * New functions are not executable by public/anon/authenticated until granted explicitly.
--   * Privileged writes (stock, order status, payments, roles) go through SECURITY DEFINER
--     functions with `set search_path = ''`, an authorization check inside, and explicit grants.

-- ---------------------------------------------------------------------------
-- Privilege defaults for objects created by the migration role (postgres)
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'staff');
create type public.product_status as enum ('draft', 'published', 'archived');
create type public.product_type as enum ('part', 'oil', 'filter', 'accessory', 'tool', 'tyre', 'other');
create type public.stock_movement_type as enum ('receive', 'adjustment', 'damage', 'return', 'reserve', 'release', 'sale');
create type public.order_status as enum ('pending', 'confirmed', 'processing', 'dispatched', 'shipped', 'delivered', 'cancelled', 'returned');
create type public.payment_status as enum ('unpaid', 'pending_verification', 'paid', 'failed', 'refunded');
create type public.payment_method as enum ('cod', 'bank_transfer', 'online');
create type public.order_stock_state as enum ('reserved', 'released', 'deducted');
create type public.discount_type as enum ('percent', 'fixed');
create type public.return_status as enum ('requested', 'approved', 'rejected', 'received', 'refunded', 'closed');
create type public.refund_status as enum ('pending', 'completed', 'failed');
create type public.review_status as enum ('pending', 'approved', 'rejected');
create type public.quote_status as enum ('new', 'in_progress', 'quoted', 'accepted', 'declined', 'closed');
create type public.notification_status as enum ('pending', 'sent', 'failed');

create domain public.pk_province as text
  check (value in (
    'Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan',
    'Islamabad Capital Territory', 'Gilgit-Baltistan', 'Azad Jammu & Kashmir'
  ));

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Append-only tables (audit_log, stock_movements) reject UPDATE and DELETE for everyone.
create function public.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

-- Returns NULL instead of raising for malformed UUID text (used in storage path checks).
create function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;
grant execute on function public.try_uuid(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Roles. A user has at most one staff role; customers have no row.
--   admin: everything, including roles, settings and bank accounts.
--   staff: day-to-day operations (catalog, stock, orders) but not roles/settings/bank accounts.
-- ---------------------------------------------------------------------------
create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.user_roles enable row level security;

-- True for admin and staff. Used by RLS policies, so anon/authenticated may execute it.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role in ('admin', 'staff')
  );
$$;

-- True for admin only: roles, store settings, bank accounts, coupons.
create function public.is_full_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = 'admin'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_full_admin() to anon, authenticated, service_role;

create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Only admins manage roles, and never their own row (no self-promotion or self-demotion).
create policy user_roles_insert on public.user_roles
  for insert to authenticated
  with check ((select public.is_full_admin()) and user_id <> (select auth.uid()));
create policy user_roles_update on public.user_roles
  for update to authenticated
  using ((select public.is_full_admin()) and user_id <> (select auth.uid()))
  with check ((select public.is_full_admin()) and user_id <> (select auth.uid()));
create policy user_roles_delete on public.user_roles
  for delete to authenticated
  using ((select public.is_full_admin()) and user_id <> (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Audit log (append-only). Written only by SECURITY DEFINER functions and triggers.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null check (length(action) between 1 and 80),
  entity_type text not null check (length(entity_type) between 1 and 80),
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id);
alter table public.audit_log enable row level security;

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.prevent_mutation();

create policy audit_log_select on public.audit_log
  for select to authenticated
  using ((select public.is_admin()));

create function public.log_audit(p_action text, p_entity_type text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;
revoke all on function public.log_audit(text, text, text, jsonb) from public, anon, authenticated, service_role;

create function public.audit_user_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.log_audit(
    'role.' || lower(tg_op),
    'user_roles',
    coalesce(new.user_id, old.user_id)::text,
    jsonb_build_object('old_role', old.role, 'new_role', new.role)
  );
  return coalesce(new, old);
end;
$$;
create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function public.audit_user_roles();

-- ---------------------------------------------------------------------------
-- Profiles: one per auth user, created by trigger.
-- Customers may edit only full_name, phone and company_name (column privileges);
-- disabled_at is admin-only (guard trigger).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (full_name is null or length(full_name) between 1 and 120),
  phone text check (phone is null or phone ~ '^03[0-9]{9}$'),
  company_name text check (company_name is null or length(company_name) between 1 and 120),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, company_name, disabled_at) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

create function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.disabled_at is distinct from old.disabled_at then
    if not public.is_full_admin() then
      raise exception 'only an admin can enable or disable accounts' using errcode = '42501';
    end if;
    perform public.log_audit(
      case when new.disabled_at is null then 'account.enable' else 'account.disable' end,
      'profiles', new.id::text, '{}'::jsonb
    );
  end if;
  return new;
end;
$$;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
