-- Store configuration: public settings (readable by everyone), private settings (admin only),
-- delivery methods, shipping rates, bank accounts (never seeded) and coupons.
-- Nothing private lives in a publicly readable table.

-- ---------------------------------------------------------------------------
-- Public settings: single row.
-- ---------------------------------------------------------------------------
create table public.store_settings (
  id boolean primary key default true check (id),
  business_name text not null check (length(business_name) between 1 and 120),
  tagline text not null default '' check (length(tagline) <= 200),
  value_statement text not null default '' check (length(value_statement) <= 200),
  phone_primary text not null default '' check (length(phone_primary) <= 30),
  phone_secondary text check (phone_secondary is null or length(phone_secondary) <= 30),
  whatsapp_number text not null default '' check (whatsapp_number ~ '^([0-9]{10,15})?$'),
  email text not null default '' check (length(email) <= 254),
  address_line text not null default '' check (length(address_line) <= 200),
  city text not null default '' check (length(city) <= 80),
  province text not null default '' check (length(province) <= 80),
  business_hours text not null default '' check (length(business_hours) <= 120),
  social_links jsonb not null default '{}'::jsonb check (jsonb_typeof(social_links) = 'object'),
  currency text not null default 'PKR' check (currency = 'PKR'),
  -- NULL = no free-delivery offer. Shipping rates may override per rate.
  free_delivery_threshold_paisa bigint check (free_delivery_threshold_paisa >= 0),
  return_period_days integer check (return_period_days between 0 and 365),
  guest_checkout_enabled boolean not null default true,
  cod_enabled boolean not null default true,
  bank_transfer_enabled boolean not null default true,
  online_payment_enabled boolean not null default false,
  bank_transfer_hold_hours integer not null default 48 check (bank_transfer_hold_hours between 1 and 720),
  updated_at timestamptz not null default now()
);
alter table public.store_settings enable row level security;
create trigger store_settings_set_updated_at before update on public.store_settings
  for each row execute function public.set_updated_at();
grant select on public.store_settings to anon;

create policy store_settings_select on public.store_settings for select to anon, authenticated using (true);
create policy store_settings_update on public.store_settings for update to authenticated
  using ((select public.is_full_admin())) with check ((select public.is_full_admin()));

-- The row always exists so the app works before the seed; contact details are filled in by the admin.
insert into public.store_settings (business_name) values ('Umar Siddique Traders');

-- ---------------------------------------------------------------------------
-- Private settings: admin only.
-- ---------------------------------------------------------------------------
create table public.store_private_settings (
  id boolean primary key default true check (id),
  order_notification_emails text[] not null default '{}' check (cardinality(order_notification_emails) <= 10),
  low_stock_alert_emails text[] not null default '{}' check (cardinality(low_stock_alert_emails) <= 10),
  notes text check (notes is null or length(notes) <= 2000),
  updated_at timestamptz not null default now()
);
alter table public.store_private_settings enable row level security;
create trigger store_private_settings_set_updated_at before update on public.store_private_settings
  for each row execute function public.set_updated_at();
insert into public.store_private_settings default values;

create policy store_private_settings_select on public.store_private_settings for select to authenticated
  using ((select public.is_full_admin()));
create policy store_private_settings_update on public.store_private_settings for update to authenticated
  using ((select public.is_full_admin())) with check ((select public.is_full_admin()));

-- ---------------------------------------------------------------------------
-- Delivery methods and shipping rates
-- ---------------------------------------------------------------------------
create table public.delivery_methods (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null check (length(name) between 1 and 80),
  description text not null default '' check (length(description) <= 300),
  is_pickup boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.delivery_methods enable row level security;
create trigger delivery_methods_set_updated_at before update on public.delivery_methods
  for each row execute function public.set_updated_at();

-- Rate lookup in place_order(): most specific active match wins (city, then province, then default).
create table public.shipping_rates (
  id uuid primary key default gen_random_uuid(),
  delivery_method_id text not null references public.delivery_methods (id) on delete cascade,
  province public.pk_province,
  city text check (city is null or length(city) between 1 and 80),
  fee_paisa bigint not null check (fee_paisa >= 0),
  -- Overrides store_settings.free_delivery_threshold_paisa for this rate when set.
  free_over_paisa bigint check (free_over_paisa >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_rates_city_needs_province check (city is null or province is not null)
);
create unique index shipping_rates_scope_key
  on public.shipping_rates (delivery_method_id, coalesce(province::text, ''), coalesce(lower(city), ''));
alter table public.shipping_rates enable row level security;
create trigger shipping_rates_set_updated_at before update on public.shipping_rates
  for each row execute function public.set_updated_at();

grant select on public.delivery_methods, public.shipping_rates to anon;

create policy delivery_methods_select on public.delivery_methods for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy shipping_rates_select on public.shipping_rates for select to anon, authenticated
  using (is_active or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Bank accounts: private, admin-only, never seeded. Customers see them only through
-- get_bank_transfer_details() for their own bank-transfer order.
-- ---------------------------------------------------------------------------
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null check (length(bank_name) between 1 and 120),
  account_title text not null check (length(account_title) between 1 and 120),
  account_number text check (account_number is null or length(account_number) between 4 and 40),
  iban text check (iban is null or iban ~ '^PK[0-9]{2}[A-Z0-9]{20}$'),
  branch text check (branch is null or length(branch) <= 120),
  instructions text check (instructions is null or length(instructions) <= 1000),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_accounts_has_number check (account_number is not null or iban is not null)
);
alter table public.bank_accounts enable row level security;
create trigger bank_accounts_set_updated_at before update on public.bank_accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Coupons (admin only; validated and applied inside place_order()).
-- ---------------------------------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  description text check (description is null or length(description) <= 300),
  discount_type public.discount_type not null,
  percent_bps integer check (percent_bps between 1 and 10000),
  amount_paisa bigint check (amount_paisa > 0),
  max_discount_paisa bigint check (max_discount_paisa > 0),
  min_order_paisa bigint not null default 0 check (min_order_paisa >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer check (usage_limit > 0),
  per_customer_limit integer check (per_customer_limit > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_value check (
    (discount_type = 'percent' and percent_bps is not null and amount_paisa is null)
    or (discount_type = 'fixed' and amount_paisa is not null and percent_bps is null)
  ),
  constraint coupons_window check (ends_at is null or starts_at is null or ends_at > starts_at)
);
alter table public.coupons enable row level security;
create trigger coupons_set_updated_at before update on public.coupons
  for each row execute function public.set_updated_at();

-- Optional targeting: if a coupon has no product or category rows it applies to the whole cart.
create table public.coupon_products (
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (coupon_id, product_id)
);
create index coupon_products_product_idx on public.coupon_products (product_id);
alter table public.coupon_products enable row level security;

create table public.coupon_categories (
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (coupon_id, category_id)
);
create index coupon_categories_category_idx on public.coupon_categories (category_id);
alter table public.coupon_categories enable row level security;

-- Write policies: delivery methods and shipping rates for admin/staff; bank accounts and coupons admin only.
do $$
declare
  t text;
  fn text;
begin
  foreach t in array array['delivery_methods', 'shipping_rates', 'bank_accounts', 'coupons', 'coupon_products', 'coupon_categories'] loop
    fn := case when t in ('delivery_methods', 'shipping_rates') then 'is_admin' else 'is_full_admin' end;
    if t in ('bank_accounts', 'coupons', 'coupon_products', 'coupon_categories') then
      execute format('create policy %I on public.%I for select to authenticated using ((select public.%I()))', t || '_select', t, fn);
    end if;
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.%I()))', t || '_insert', t, fn);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.%I())) with check ((select public.%I()))', t || '_update', t, fn, fn);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.%I()))', t || '_delete', t, fn);
  end loop;
end;
$$;

-- Audit changes to money-sensitive configuration.
create function public.audit_config_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.log_audit(
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
    '{}'::jsonb
  );
  return coalesce(new, old);
end;
$$;
create trigger store_settings_audit after update on public.store_settings
  for each row execute function public.audit_config_change();
create trigger bank_accounts_audit after insert or update or delete on public.bank_accounts
  for each row execute function public.audit_config_change();
create trigger coupons_audit after insert or update or delete on public.coupons
  for each row execute function public.audit_config_change();
create trigger shipping_rates_audit after insert or update or delete on public.shipping_rates
  for each row execute function public.audit_config_change();
