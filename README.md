# Umar Siddique Traders

Online store for tractor parts and lubricants, built on Next.js and Supabase.

## Setup

1. Copy `.env.example` to `.env.local` and fill in the Supabase keys.
2. Put client-provided files in `client-data/` (gitignored — never commit them).
3. Approved UI designs live in `design/`.

## Structure

- `src/app` — routes: `(store)`, `(auth)`, `account`, `admin`, `api`
- `src/components` — UI grouped by area (ui, layout, products, cart, checkout, admin, forms)
- `src/features` — domain logic: catalog, inventory, orders, payments, customers, wholesale (bulk quote requests)
- `src/lib` — shared infrastructure: supabase, auth, validation, pricing, payments, notifications, storage
- `supabase/` — SQL migrations and demo seed data
- `tests/` — unit, integration, e2e
