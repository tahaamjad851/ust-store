-- Catalog: categories, brands, tractor makes/models, products, variants, images, compatibility.
--
-- Every product has at least one variant. A product without options has a single default
-- variant, so SKU, price and stock always live on product_variants (one code path for cart,
-- stock and orders). Cost prices live in a separate admin-only table so RLS can hide them.
-- Public (anon) reads only active categories/brands/models and published products.

-- ---------------------------------------------------------------------------
-- Categories (self-referencing tree)
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name text not null check (length(name) between 1 and 80),
  name_ur text check (name_ur is null or length(name_ur) between 1 and 80),
  description text check (description is null or length(description) <= 500),
  icon text check (icon is null or icon ~ '^[a-z0-9-]{1,40}$'),
  image_path text check (image_path is null or length(image_path) <= 300),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_not_own_parent check (parent_id is null or parent_id <> id),
  constraint categories_parent_slug_key unique nulls not distinct (parent_id, slug)
);
create index categories_parent_idx on public.categories (parent_id, sort_order);
alter table public.categories enable row level security;
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- Reject cycles when re-parenting (A -> B -> A).
create function public.categories_prevent_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null and exists (
    with recursive ancestors as (
      select c.id, c.parent_id from public.categories c where c.id = new.parent_id
      union all
      select c.id, c.parent_id from public.categories c join ancestors a on c.id = a.parent_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'category cycle' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger categories_no_cycle before insert or update of parent_id on public.categories
  for each row execute function public.categories_prevent_cycle();

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name text not null check (length(name) between 1 and 80),
  name_ur text check (name_ur is null or length(name_ur) between 1 and 80),
  description text check (description is null or length(description) <= 1000),
  logo_path text check (logo_path is null or length(logo_path) <= 300),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.brands enable row level security;
create trigger brands_set_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tractor makes and models
-- ---------------------------------------------------------------------------
create table public.tractor_makes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name text not null unique check (length(name) between 1 and 80),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tractor_makes enable row level security;
create trigger tractor_makes_set_updated_at before update on public.tractor_makes
  for each row execute function public.set_updated_at();

create table public.tractor_models (
  id uuid primary key default gen_random_uuid(),
  make_id uuid not null references public.tractor_makes (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name text not null check (length(name) between 1 and 80),
  year_from integer check (year_from between 1900 and 2100),
  year_to integer check (year_to between 1900 and 2100),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tractor_models_years check (year_to is null or year_from is null or year_to >= year_from),
  constraint tractor_models_make_slug_key unique (make_id, slug)
);
create index tractor_models_make_idx on public.tractor_models (make_id, sort_order);
alter table public.tractor_models enable row level security;
create trigger tractor_models_set_updated_at before update on public.tractor_models
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120),
  name text not null check (length(name) between 1 and 200),
  short_description text check (short_description is null or length(short_description) <= 500),
  description text check (description is null or length(description) <= 10000),
  category_id uuid not null references public.categories (id) on delete restrict,
  brand_id uuid references public.brands (id) on delete set null,
  product_type public.product_type not null default 'part',
  part_number text check (part_number is null or length(part_number) <= 80),
  oem_part_numbers text[] not null default '{}' check (cardinality(oem_part_numbers) <= 50),
  specs jsonb not null default '[]'::jsonb check (jsonb_typeof(specs) = 'array'),
  viscosity_grade text check (viscosity_grade is null or length(viscosity_grade) <= 40),
  oil_specifications text[] not null default '{}' check (cardinality(oil_specifications) <= 30),
  origin text check (origin is null or length(origin) <= 80),
  warranty_info text check (warranty_info is null or length(warranty_info) <= 1000),
  packaging_info text check (packaging_info is null or length(packaging_info) <= 500),
  is_returnable boolean not null default true,
  is_featured boolean not null default false,
  status public.product_status not null default 'draft',
  seo_title text check (seo_title is null or length(seo_title) <= 70),
  seo_description text check (seo_description is null or length(seo_description) <= 170),
  -- Lower-cased name, part numbers and description; maintained by trigger for trigram search.
  search_text text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);
create index products_brand_idx on public.products (brand_id);
create index products_status_idx on public.products (status, is_featured);
create index products_created_at_idx on public.products (created_at desc);
create index products_search_trgm_idx on public.products using gin (search_text extensions.gin_trgm_ops);
create index products_oem_idx on public.products using gin (oem_part_numbers);
alter table public.products enable row level security;
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create function public.products_maintain()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := lower(concat_ws(' ',
    new.name, new.part_number, array_to_string(new.oem_part_numbers, ' '),
    new.viscosity_grade, new.short_description
  ));
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;
create trigger products_maintain before insert or update on public.products
  for each row execute function public.products_maintain();

-- ---------------------------------------------------------------------------
-- Variants: own SKU, price and stock. Price actually charged = coalesce(sale, regular).
-- ---------------------------------------------------------------------------
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null check (sku ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'),
  barcode text check (barcode is null or barcode ~ '^[0-9A-Za-z-]{4,64}$'),
  name text not null default 'Default' check (length(name) between 1 and 120),
  option_values jsonb not null default '{}'::jsonb check (jsonb_typeof(option_values) = 'object'),
  regular_price_paisa bigint not null check (regular_price_paisa >= 0),
  sale_price_paisa bigint check (sale_price_paisa >= 0),
  weight_grams integer check (weight_grams >= 0),
  length_mm integer check (length_mm >= 0),
  width_mm integer check (width_mm >= 0),
  height_mm integer check (height_mm >= 0),
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_sale_below_regular check (sale_price_paisa is null or sale_price_paisa < regular_price_paisa)
);
create unique index product_variants_sku_key on public.product_variants (sku);
create unique index product_variants_barcode_key on public.product_variants (barcode) where barcode is not null;
create unique index product_variants_one_default on public.product_variants (product_id) where is_default;
create index product_variants_product_idx on public.product_variants (product_id, sort_order);
create index product_variants_sku_trgm_idx on public.product_variants using gin (lower(sku) extensions.gin_trgm_ops);
alter table public.product_variants enable row level security;
create trigger product_variants_set_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

-- Price a customer pays for a variant (used by place_order and the storefront).
create function public.effective_price_paisa(p_regular bigint, p_sale bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$ select coalesce(p_sale, p_regular) $$;
grant execute on function public.effective_price_paisa(bigint, bigint) to anon, authenticated, service_role;

-- Cost prices: admin/staff only.
create table public.product_variant_costs (
  variant_id uuid primary key references public.product_variants (id) on delete cascade,
  cost_paisa bigint not null check (cost_paisa >= 0),
  updated_at timestamptz not null default now()
);
alter table public.product_variant_costs enable row level security;
create trigger product_variant_costs_set_updated_at before update on public.product_variant_costs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Images (files in the public product-images bucket)
-- ---------------------------------------------------------------------------
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null check (length(storage_path) between 1 and 300 and storage_path !~ '\.\.'),
  alt_text text not null default '' check (length(alt_text) <= 200),
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);
create unique index product_images_one_primary on public.product_images (product_id) where is_primary;
alter table public.product_images enable row level security;

-- ---------------------------------------------------------------------------
-- Compatibility: never assume a part fits every model.
-- ---------------------------------------------------------------------------
create table public.product_compatibility (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  tractor_model_id uuid not null references public.tractor_models (id) on delete restrict,
  year_from integer check (year_from between 1900 and 2100),
  year_to integer check (year_to between 1900 and 2100),
  notes text check (notes is null or length(notes) <= 300),
  created_at timestamptz not null default now(),
  constraint product_compatibility_years check (year_to is null or year_from is null or year_to >= year_from),
  constraint product_compatibility_key unique (product_id, tractor_model_id)
);
create index product_compatibility_model_idx on public.product_compatibility (tractor_model_id);
alter table public.product_compatibility enable row level security;

-- ---------------------------------------------------------------------------
-- Grants and policies
-- ---------------------------------------------------------------------------
grant select on public.categories, public.brands, public.tractor_makes, public.tractor_models,
  public.products, public.product_variants, public.product_images, public.product_compatibility
  to anon;

create policy categories_select on public.categories for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy brands_select on public.brands for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy tractor_makes_select on public.tractor_makes for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy tractor_models_select on public.tractor_models for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy products_select on public.products for select to anon, authenticated
  using (status = 'published' or (select public.is_admin()));
create policy product_variants_select on public.product_variants for select to anon, authenticated
  using (
    (select public.is_admin())
    or (is_active and exists (select 1 from public.products p where p.id = product_variants.product_id and p.status = 'published'))
  );
create policy product_images_select on public.product_images for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.products p where p.id = product_images.product_id and p.status = 'published')
  );
create policy product_compatibility_select on public.product_compatibility for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.products p where p.id = product_compatibility.product_id and p.status = 'published')
  );
create policy product_variant_costs_select on public.product_variant_costs for select to authenticated
  using ((select public.is_admin()));

-- Admin/staff write access to every catalog table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'brands', 'tractor_makes', 'tractor_models', 'products',
    'product_variants', 'product_variant_costs', 'product_images', 'product_compatibility'
  ] loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', t || '_delete', t);
  end loop;
end;
$$;
