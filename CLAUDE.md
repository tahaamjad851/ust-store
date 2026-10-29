# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Umar Siddique Traders: an online store for tractor parts and lubricants. One retail price for everyone; bulk buyers send a quote request or use WhatsApp (no wholesale pricing, see docs/ROADMAP.md decisions). Next.js (App Router) frontend, Supabase for database, auth and storage.

Project phases are defined in docs/ROADMAP.md

## Commands

- `npm run dev`: start the dev server (http://localhost:3000)
- `npm run build`: production build
- `npm run lint`: ESLint
- `npm run typecheck`: generate Next.js route types, then `tsc --noEmit`
- `npm test`: Vitest unit + integration tests (`tests/unit`, `tests/integration`)
- `npm run test:e2e`: Playwright e2e tests (`tests/e2e`); starts the dev server unless `PLAYWRIGHT_BASE_URL` is set. First run: `npx playwright install chromium`

Stack: Next.js 16 (App Router, Turbopack), React 19, TypeScript 5.9 (TS 7 is blocked until typescript-eslint supports it), Tailwind CSS 4, shadcn/ui (Radix), ESLint 9.

## Secrets and client data (hard rules)

- Never read, print or edit `.env.local`, `.env`, or anything in `client-data/` or `private/`. `.claude/settings.json` blocks this; do not work around it.
- `.env.example` lists variable **names** only. When adding a new env var, add its name there with an empty value.
- `client-data/` holds the client's raw files and bank details and is gitignored. Ask the user for any value you need from it instead of reading it.
- `supabase/seed.sql` is demo data only: no real customer, order or bank details.

## Architecture

- `src/app/` — routing only. Route groups: `(store)` for the public shop, `(auth)` for sign-in/up; plus `account/`, `admin/` and `api/`. Keep pages thin and call into `features/`.
- `src/features/` — domain logic per area (catalog, inventory, orders, payments, customers, wholesale = bulk quote requests only). Business rules live here, not in components or route handlers.
- `src/lib/` — shared infrastructure clients and helpers (Supabase client, auth, validation schemas, pricing, payment providers, notifications, file storage). Price and total calculations belong in `lib/pricing` (display) and the `place_order()` database function (authoritative), not in components.
- `src/components/` — presentational UI grouped by area; `ui/` holds the generic primitives.
- `src/services/`, `src/hooks/`, `src/types/` — data-access wrappers, React hooks, shared TypeScript types.
- `supabase/migrations/` — every schema change goes in a new migration file; never edit an applied one.
- `tests/` — `unit/`, `integration/`, `e2e/`.

## Design

`design/` holds the approved Stitch screenshots and exports. Match them when building UI; ask before deviating.
