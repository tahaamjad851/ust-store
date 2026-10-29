-- Customer-owned data: addresses, wishlist, carts. Customers read and write only their own rows.
-- Carts hold quantities only; prices are always recomputed from the database.

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text check (label is null or length(label) between 1 and 40),
  full_name text not null check (length(full_name) between 2 and 80),
  phone text not null check (phone ~ '^03[0-9]{9}$'),
  line1 text not null check (length(line1) between 1 and 120),
  street text check (street is null or length(street) <= 120),
  area text check (area is null or length(area) <= 120),
  city text not null check (length(city) between 2 and 60),
  province public.pk_province not null,
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{5}$'),
  instructions text check (instructions is null or length(instructions) <= 500),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);
create unique index addresses_one_default on public.addresses (user_id) where is_default;
alter table public.addresses enable row level security;
create trigger addresses_set_updated_at before update on public.addresses
  for each row execute function public.set_updated_at();

create policy addresses_select on public.addresses for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy addresses_insert on public.addresses for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy addresses_update on public.addresses for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy addresses_delete on public.addresses for delete to authenticated
  using (user_id = (select auth.uid()));

-- One wishlist per user.
create table public.wishlist_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index wishlist_items_product_idx on public.wishlist_items (product_id);
alter table public.wishlist_items enable row level security;

create policy wishlist_items_select on public.wishlist_items for select to authenticated
  using (user_id = (select auth.uid()));
create policy wishlist_items_insert on public.wishlist_items for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy wishlist_items_delete on public.wishlist_items for delete to authenticated
  using (user_id = (select auth.uid()));

-- A cart belongs to a signed-in user, or to a guest identified by a hashed cookie token.
-- Guest carts are only touched by the server (service role); RLS gives guests no access.
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete cascade,
  guest_token_hash text unique check (guest_token_hash is null or guest_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carts_one_owner check (num_nonnulls(user_id, guest_token_hash) = 1)
);
alter table public.carts enable row level security;
create trigger carts_set_updated_at before update on public.carts
  for each row execute function public.set_updated_at();

create table public.cart_items (
  cart_id uuid not null references public.carts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity integer not null check (quantity between 1 and 999),
  added_at timestamptz not null default now(),
  primary key (cart_id, variant_id)
);
create index cart_items_variant_idx on public.cart_items (variant_id);
alter table public.cart_items enable row level security;

create policy carts_select on public.carts for select to authenticated
  using (user_id = (select auth.uid()));
create policy carts_insert on public.carts for insert to authenticated
  with check (user_id = (select auth.uid()) and guest_token_hash is null);
create policy carts_delete on public.carts for delete to authenticated
  using (user_id = (select auth.uid()));

create policy cart_items_select on public.cart_items for select to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));
create policy cart_items_insert on public.cart_items for insert to authenticated
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));
create policy cart_items_update on public.cart_items for update to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));
create policy cart_items_delete on public.cart_items for delete to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));
