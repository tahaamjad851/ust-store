-- Inventory: one row per variant (on_hand, reserved) plus the append-only stock_movements ledger.
--
--   available = on_hand - reserved, never negative (CHECK reserved <= on_hand).
--   Nobody writes inventory directly (no write policies): every change goes through a
--   SECURITY DEFINER function that locks the row and writes a ledger entry.
--
-- Ledger movement types and their effect:
--   receive / return       on_hand +n         (admin, adjust_stock)
--   damage                 on_hand -n         (admin, adjust_stock)
--   adjustment             on_hand +/-n       (admin, adjust_stock; stock count corrections)
--   reserve                reserved +n        (place_order)
--   release                reserved -n        (order cancelled)
--   sale                   on_hand -n, reserved -n  (order shipped or delivered)

create table public.inventory (
  variant_id uuid primary key references public.product_variants (id) on delete cascade,
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  reorder_level integer check (reorder_level >= 0),
  updated_at timestamptz not null default now(),
  constraint inventory_reserved_within_on_hand check (reserved <= on_hand)
);
create index inventory_low_stock_idx on public.inventory ((on_hand - reserved));
alter table public.inventory enable row level security;
create trigger inventory_set_updated_at before update on public.inventory
  for each row execute function public.set_updated_at();

create policy inventory_select on public.inventory for select to authenticated
  using ((select public.is_admin()));

-- Every variant gets an inventory row.
create function public.create_inventory_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory (variant_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger product_variants_inventory after insert on public.product_variants
  for each row execute function public.create_inventory_row();

-- Append-only ledger. order_id gets its foreign key in the orders migration.
create table public.stock_movements (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  order_id uuid,
  movement_type public.stock_movement_type not null,
  on_hand_delta integer not null default 0,
  reserved_delta integer not null default 0,
  on_hand_after integer not null check (on_hand_after >= 0),
  reserved_after integer not null check (reserved_after >= 0),
  reason text check (reason is null or length(reason) <= 500),
  actor_id uuid,
  created_at timestamptz not null default now(),
  constraint stock_movements_has_effect check (on_hand_delta <> 0 or reserved_delta <> 0)
);
create index stock_movements_variant_idx on public.stock_movements (variant_id, created_at desc);
create index stock_movements_order_idx on public.stock_movements (order_id);
create index stock_movements_created_at_idx on public.stock_movements (created_at desc);
-- An order can reserve, release or sell each variant at most once: no duplicate stock movements.
create unique index stock_movements_order_once on public.stock_movements (order_id, variant_id, movement_type)
  where order_id is not null;
alter table public.stock_movements enable row level security;

create trigger stock_movements_append_only before update or delete on public.stock_movements
  for each row execute function public.prevent_mutation();

create policy stock_movements_select on public.stock_movements for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- adjust_stock: admin/staff only; always writes a ledger row; never goes negative.
-- p_on_hand_delta: positive to add stock, negative to remove.
-- ---------------------------------------------------------------------------
create function public.adjust_stock(
  p_variant_id uuid,
  p_on_hand_delta integer,
  p_movement_type public.stock_movement_type,
  p_reason text
)
returns public.inventory
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.inventory;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_movement_type not in ('receive', 'adjustment', 'damage', 'return') then
    raise exception 'invalid_movement_type' using errcode = '22023',
      detail = 'reserve, release and sale are managed by orders';
  end if;
  if p_on_hand_delta is null or p_on_hand_delta = 0 or abs(p_on_hand_delta) > 1000000 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  if (p_movement_type in ('receive', 'return') and p_on_hand_delta < 0)
     or (p_movement_type = 'damage' and p_on_hand_delta > 0) then
    raise exception 'invalid_quantity' using errcode = '22023',
      detail = 'receive/return must add stock; damage must remove stock';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 or length(p_reason) > 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_inv from public.inventory where variant_id = p_variant_id for update;
  if not found then
    raise exception 'variant_not_found' using errcode = 'P0002';
  end if;
  if v_inv.on_hand + p_on_hand_delta < v_inv.reserved then
    raise exception 'insufficient_stock' using errcode = 'P0001',
      detail = format('on_hand %s, reserved %s, change %s', v_inv.on_hand, v_inv.reserved, p_on_hand_delta);
  end if;

  update public.inventory
     set on_hand = on_hand + p_on_hand_delta
   where variant_id = p_variant_id
  returning * into v_inv;

  insert into public.stock_movements (variant_id, movement_type, on_hand_delta, on_hand_after, reserved_after, reason, actor_id)
  values (p_variant_id, p_movement_type, p_on_hand_delta, v_inv.on_hand, v_inv.reserved, trim(p_reason), (select auth.uid()));

  perform public.log_audit('stock.' || p_movement_type::text, 'product_variants', p_variant_id::text,
    jsonb_build_object('on_hand_delta', p_on_hand_delta, 'on_hand_after', v_inv.on_hand, 'reason', trim(p_reason)));
  return v_inv;
end;
$$;
revoke all on function public.adjust_stock(uuid, integer, public.stock_movement_type, text) from public, anon;
grant execute on function public.adjust_stock(uuid, integer, public.stock_movement_type, text) to authenticated;

-- Low-stock threshold and reorder level are settings, not stock: admin/staff only, no ledger row.
create function public.set_stock_thresholds(p_variant_id uuid, p_low_stock_threshold integer, p_reorder_level integer)
returns public.inventory
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.inventory;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.inventory
     set low_stock_threshold = p_low_stock_threshold,
         reorder_level = p_reorder_level
   where variant_id = p_variant_id
  returning * into v_inv;
  if not found then
    raise exception 'variant_not_found' using errcode = 'P0002';
  end if;
  return v_inv;
end;
$$;
revoke all on function public.set_stock_thresholds(uuid, integer, integer) from public, anon;
grant execute on function public.set_stock_thresholds(uuid, integer, integer) to authenticated;

-- Public stock availability for the storefront: only active variants of published products.
create function public.stock_availability(p_variant_ids uuid[])
returns table (variant_id uuid, available integer, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.variant_id,
         i.on_hand - i.reserved,
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
grant execute on function public.stock_availability(uuid[]) to anon, authenticated, service_role;
