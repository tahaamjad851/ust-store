-- Orders and everything hanging off them.
--
-- Orders are created only by place_order() and changed only by set_order_status() /
-- set_payment_status() (SECURITY DEFINER). There are no INSERT/UPDATE/DELETE policies on
-- orders, order_items, payments or order_status_history, so customers cannot change totals,
-- status, payment status or stock. Customers can read their own orders; admin/staff read all.
--
-- Snapshots: order_items keep name, SKU and unit price; orders keep the customer contact and
-- delivery address as JSON, so later product or address changes never alter history.

create table public.order_number_counters (
  year integer primary key check (year between 2000 and 2999),
  last_value integer not null check (last_value >= 0)
);
alter table public.order_number_counters enable row level security;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique check (order_number ~ '^UST-[0-9]{4}-[0-9]{6,}$'),
  user_id uuid references auth.users (id) on delete set null,
  -- Same key returns the same order (double clicks, retries). Unique per order, scoped to the caller in place_order().
  idempotency_key uuid not null unique,
  -- SHA-256 of the normalised request; replaying a key with a different request is rejected.
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  -- SHA-256 (hex) of the tracking token. The raw token is returned once, by the first call only.
  tracking_token_hash text not null unique check (tracking_token_hash ~ '^[0-9a-f]{64}$'),
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'unpaid',
  payment_method public.payment_method not null,
  stock_state public.order_stock_state not null default 'reserved',
  customer_name text not null check (length(customer_name) between 2 and 80),
  customer_phone text not null check (customer_phone ~ '^03[0-9]{9}$'),
  customer_email text check (customer_email is null or customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  company_name text check (company_name is null or length(company_name) <= 120),
  shipping_address jsonb not null check (
    jsonb_typeof(shipping_address) = 'object'
    and shipping_address ? 'line1' and shipping_address ? 'city' and shipping_address ? 'province'
  ),
  delivery_method_id text references public.delivery_methods (id) on delete set null,
  delivery_method_name text not null check (length(delivery_method_name) between 1 and 80),
  subtotal_paisa bigint not null check (subtotal_paisa >= 0),
  discount_paisa bigint not null default 0 check (discount_paisa >= 0),
  shipping_paisa bigint not null default 0 check (shipping_paisa >= 0),
  total_paisa bigint not null check (total_paisa >= 0),
  coupon_id uuid references public.coupons (id) on delete set null,
  coupon_code text check (coupon_code is null or length(coupon_code) <= 32),
  customer_notes text check (customer_notes is null or length(customer_notes) <= 1000),
  -- Bank-transfer orders not paid by this time are cancelled (expire_unpaid_bank_transfers()).
  reservation_expires_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_discount_within_subtotal check (discount_paisa <= subtotal_paisa),
  constraint orders_total_matches check (total_paisa = subtotal_paisa - discount_paisa + shipping_paisa)
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_payment_idx on public.orders (payment_method, payment_status);
create index orders_created_at_idx on public.orders (created_at desc);
create index orders_phone_idx on public.orders (customer_phone);
create index orders_expiry_idx on public.orders (reservation_expires_at)
  where payment_method = 'bank_transfer' and payment_status in ('unpaid', 'failed') and status in ('pending', 'confirmed');
create index orders_open_user_idx on public.orders (user_id) where status in ('pending', 'confirmed');
create index orders_open_phone_idx on public.orders (customer_phone) where status in ('pending', 'confirmed');
create index orders_coupon_idx on public.orders (coupon_id) where coupon_id is not null;
create index orders_delivery_method_idx on public.orders (delivery_method_id);
alter table public.orders enable row level security;
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.stock_movements
  add constraint stock_movements_order_fkey foreign key (order_id) references public.orders (id) on delete restrict;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name text not null check (length(product_name) between 1 and 200),
  variant_name text not null check (length(variant_name) between 1 and 120),
  sku text not null check (length(sku) between 1 and 64),
  unit_price_paisa bigint not null check (unit_price_paisa >= 0),
  quantity integer not null check (quantity between 1 and 999),
  line_total_paisa bigint not null check (line_total_paisa >= 0),
  created_at timestamptz not null default now(),
  constraint order_items_line_total check (line_total_paisa = unit_price_paisa * quantity)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);
create index order_items_variant_idx on public.order_items (variant_id);
alter table public.order_items enable row level security;

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  note text check (note is null or length(note) <= 500),
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);
alter table public.order_status_history enable row level security;
create trigger order_status_history_append_only before update or delete on public.order_status_history
  for each row execute function public.prevent_mutation();

-- One payment attempt per row. COD and bank transfer start as 'unpaid'.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  method public.payment_method not null,
  amount_paisa bigint not null check (amount_paisa >= 0),
  status public.payment_status not null default 'unpaid',
  provider text check (provider is null or length(provider) <= 40),
  provider_reference text check (provider_reference is null or length(provider_reference) <= 120),
  -- Bank transfer: reference and proof submitted by the customer. Never marks the order paid by itself.
  customer_reference text check (customer_reference is null or length(customer_reference) between 3 and 64),
  proof_path text check (proof_path is null or length(proof_path) <= 300),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);
create index payments_status_idx on public.payments (status);
create index payments_verified_by_idx on public.payments (verified_by);
alter table public.payments enable row level security;
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- Raw provider callbacks. The unique (provider, provider_event_id) makes processing idempotent.
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (length(provider) between 1 and 40),
  provider_event_id text not null check (length(provider_event_id) between 1 and 200),
  event_type text check (event_type is null or length(event_type) <= 80),
  order_id uuid references public.orders (id) on delete set null,
  payment_id uuid references public.payments (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint payment_events_provider_event_key unique (provider, provider_event_id)
);
create index payment_events_order_idx on public.payment_events (order_id);
create index payment_events_payment_idx on public.payment_events (payment_id);
alter table public.payment_events enable row level security;

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  courier text not null check (length(courier) between 1 and 80),
  tracking_number text check (tracking_number is null or length(tracking_number) <= 80),
  tracking_url text check (tracking_url is null or (tracking_url ~ '^https://' and length(tracking_url) <= 500)),
  dispatched_at timestamptz,
  estimated_delivery date,
  delivery_notes text check (delivery_notes is null or length(delivery_notes) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shipments_order_idx on public.shipments (order_id);
create index shipments_tracking_idx on public.shipments (tracking_number);
create index shipments_created_by_idx on public.shipments (created_by);
alter table public.shipments enable row level security;
create trigger shipments_set_updated_at before update on public.shipments
  for each row execute function public.set_updated_at();

create table public.returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  quantity integer not null check (quantity between 1 and 999),
  reason text not null check (length(reason) between 3 and 1000),
  status public.return_status not null default 'requested',
  resolution_note text check (resolution_note is null or length(resolution_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index returns_order_idx on public.returns (order_id);
create index returns_status_idx on public.returns (status);
create index returns_user_idx on public.returns (user_id, created_at desc);
create index returns_order_item_idx on public.returns (order_item_id);
alter table public.returns enable row level security;
create trigger returns_set_updated_at before update on public.returns
  for each row execute function public.set_updated_at();

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  return_id uuid references public.returns (id) on delete set null,
  amount_paisa bigint not null check (amount_paisa > 0),
  status public.refund_status not null default 'pending',
  method text not null check (length(method) between 1 and 40),
  reference text check (reference is null or length(reference) <= 120),
  note text check (note is null or length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_order_idx on public.refunds (order_id);
create index refunds_return_idx on public.refunds (return_id);
create index refunds_created_by_idx on public.refunds (created_by);
alter table public.refunds enable row level security;
create trigger refunds_set_updated_at before update on public.refunds
  for each row execute function public.set_updated_at();

-- Invoice content is snapshotted at issue time so later changes never alter an issued invoice.
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete restrict,
  invoice_number text not null unique check (length(invoice_number) between 1 and 40),
  issued_at timestamptz not null default now(),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index invoices_created_by_idx on public.invoices (created_by);
alter table public.invoices enable row level security;
-- Issued invoices never change.
create trigger invoices_immutable before update or delete on public.invoices
  for each row execute function public.prevent_mutation();

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete restrict,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  customer_phone text not null check (customer_phone ~ '^03[0-9]{9}$'),
  discount_paisa bigint not null check (discount_paisa >= 0),
  created_at timestamptz not null default now()
);
create index coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id);
create index coupon_redemptions_user_idx on public.coupon_redemptions (coupon_id, user_id);
create index coupon_redemptions_user_only_idx on public.coupon_redemptions (user_id);
create index coupon_redemptions_phone_idx on public.coupon_redemptions (coupon_id, customer_phone);
alter table public.coupon_redemptions enable row level security;

-- Reviews: only verified purchasers (a delivered order containing the product) can write one.
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  title text check (title is null or length(title) <= 120),
  body text check (body is null or length(body) <= 2000),
  status public.review_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_one_per_product unique (user_id, product_id)
);
create index reviews_product_idx on public.reviews (product_id, status);
create index reviews_order_item_idx on public.reviews (order_item_id);
alter table public.reviews enable row level security;
create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

-- Bulk quote requests (no wholesale pricing; see docs/ROADMAP.md decisions).
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  contact_name text not null check (length(contact_name) between 2 and 80),
  phone text not null check (phone ~ '^03[0-9]{9}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  company_name text check (company_name is null or length(company_name) <= 120),
  message text not null check (length(message) between 5 and 4000),
  -- [{"variant_id": uuid|null, "description": text, "quantity": int}]
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 100),
  purchase_order_reference text check (purchase_order_reference is null or length(purchase_order_reference) <= 80),
  status public.quote_status not null default 'new',
  quoted_total_paisa bigint check (quoted_total_paisa >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quotes_user_idx on public.quotes (user_id, created_at desc);
create index quotes_status_idx on public.quotes (status, created_at desc);
alter table public.quotes enable row level security;
create trigger quotes_set_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();

-- Outbox for email/WhatsApp notifications. Written and sent by the server (service role).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient text not null check (length(recipient) between 3 and 254),
  template text not null check (length(template) between 1 and 80),
  payload jsonb not null default '{}'::jsonb,
  order_id uuid references public.orders (id) on delete set null,
  status public.notification_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or length(last_error) <= 1000),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_pending_idx on public.notifications (created_at) where status = 'pending';
create index notifications_order_idx on public.notifications (order_id);
alter table public.notifications enable row level security;
create trigger notifications_set_updated_at before update on public.notifications
  for each row execute function public.set_updated_at();

-- Staff-only notes on orders, customers, quotes or returns. Never visible to customers.
create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('order', 'customer', 'quote', 'return')),
  entity_id uuid not null,
  note text not null check (length(note) between 1 and 2000),
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index internal_notes_entity_idx on public.internal_notes (entity_type, entity_id, created_at desc);
create index internal_notes_author_idx on public.internal_notes (author_id);
alter table public.internal_notes enable row level security;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
create policy orders_select on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Child tables readable when the parent order is readable.
do $$
declare
  t text;
begin
  foreach t in array array['order_items', 'order_status_history', 'payments', 'shipments', 'refunds', 'invoices'] loop
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (
        (select public.is_admin())
        or exists (select 1 from public.orders o where o.id = %I.order_id and o.user_id = (select auth.uid()))
      )$f$, t || '_select', t, t);
  end loop;
end;
$$;

-- Staff record shipments and issue invoices (invoices are immutable once issued).
-- Refunds move money, so they are admin only.
create policy shipments_insert on public.shipments for insert to authenticated with check ((select public.is_admin()));
create policy shipments_update on public.shipments for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy invoices_insert on public.invoices for insert to authenticated with check ((select public.is_admin()));
create policy refunds_insert on public.refunds for insert to authenticated with check ((select public.is_full_admin()));
create policy refunds_update on public.refunds for update to authenticated
  using ((select public.is_full_admin())) with check ((select public.is_full_admin()));

create policy payment_events_select on public.payment_events for select to authenticated
  using ((select public.is_admin()));
create policy coupon_redemptions_select on public.coupon_redemptions for select to authenticated
  using ((select public.is_admin()));
create policy notifications_select on public.notifications for select to authenticated
  using ((select public.is_admin()));

-- Returns: customers create them only through request_return() (see order functions), which
-- checks ownership, delivery, returnability, the return window and the running quantity.
create policy returns_select on public.returns for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy returns_update on public.returns for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Reviews: public sees approved ones; authors see their own; only verified purchasers can write.
grant select (id, product_id, rating, title, body, status, created_at) on public.reviews to anon;
create policy reviews_select on public.reviews for select to anon, authenticated
  using (status = 'approved' or user_id = (select auth.uid()) or (select public.is_admin()));
create policy reviews_insert on public.reviews for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
       where oi.id = reviews.order_item_id
         and oi.product_id = reviews.product_id
         and o.user_id = (select auth.uid())
         and o.status = 'delivered'
    )
  );
create policy reviews_update on public.reviews for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy reviews_delete on public.reviews for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Quotes: signed-in customers create and read their own; guests submit through the server.
create policy quotes_select on public.quotes for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy quotes_insert on public.quotes for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'new' and quoted_total_paisa is null);
create policy quotes_update on public.quotes for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy internal_notes_select on public.internal_notes for select to authenticated
  using ((select public.is_admin()));
create policy internal_notes_insert on public.internal_notes for insert to authenticated
  with check ((select public.is_admin()) and author_id = (select auth.uid()));
