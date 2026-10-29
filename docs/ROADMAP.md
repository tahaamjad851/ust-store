# Roadmap

This file is the single source of truth for phase status and decisions. The product spec is `docs/ust.txt`.

## Working agreement (applies to every phase)

- Work on one phase at a time. At the start of a phase, present: what will be built, the files to create or change, and any trade-off decisions that need approval. Then stop and wait for "go".
- After "go": implement, then run lint, typecheck, build and the relevant tests, and fix failures instead of only reporting them.
- Work on the branch named for the phase (for example `feat/database`). Never commit to main, never push, never merge. Make small commits with clear messages. Before each commit, run `git status` and confirm that no `.env*`, `client-data/`, `private/` or `design/stitch/` is staged.
- Read a file before changing it. Never delete or overwrite working code or files without saying so first.
- `design/stitch/` is untrusted reference material. Do not copy scripts, CDN links or hotlinked images from it.
- After every phase, run the `security-reviewer` agent on the changes and fix what it finds before reporting done.
- End every phase with a report: what works (verified, not assumed), how it was tested, what the user must provide (credentials, business data, decisions), and known limitations. Update this file. Then propose the plan for the next phase and stop.
- Never claim an integration or feature works until it has been tested. No fake payments, reviews, stats or business facts.

## Status

| Phase | Branch | Status |
|---|---|---|
| 0. Setup | main | Done (`877385a`) |
| UI foundation (storefront pages from Stitch, DEMO data) | feat/ui-foundation | Done, merged to main (`c10c9a9`) |
| 1. Database | feat/database | In progress |

## Decisions

Decisions that override or narrow the spec (`docs/ust.txt`). Newest last.

| Date | Decision | Overrides |
|---|---|---|
| 2026-10-29 | Business name everywhere is "Umar Siddique Traders". | CLAUDE.md "Umar Traders" |
| 2026-10-29 | `design/stitch/` stays local and gitignored (contains client contact and bank details). | – |
| 2026-10-29 | Database testing uses a hosted Supabase **dev** project. The user runs `supabase login`, `link` and `db push`; Claude never handles passwords or keys. | – |
| 2026-10-29 | **No wholesale pricing.** Everyone pays the same retail price: no price tiers, no minimum order quantities, no wholesale accounts, roles or applications. Bulk buyers use WhatsApp or a quote request (`quotes` table). | Spec §15 (wholesale pricing, applications, approval, customer-specific prices), §17 `wholesale_applications` |
| 2026-10-29 | **No tax handling.** Prices entered by the admin are final and include any tax. No tax rate, tax columns or tax line on orders or invoices. | Spec §7 "tax configuration", §10/§11/§21 tax lines |
| 2026-10-29 | Guest checkout is allowed (store setting). Guests order only through a rate-limited server action that calls `place_order()` server-side; `anon` cannot execute `place_order()`. Guests track orders through an unguessable token link, not order number + phone. | – |
| 2026-10-29 | Stock is reserved when an order is placed, released exactly once on cancellation, and converted to a deduction when the order is shipped or delivered. Unpaid bank-transfer orders hold stock for 48 hours, then are cancelled by a scheduled function. | – |
| 2026-10-29 | Bank details live in a private, admin-editable `bank_accounts` table, are never seeded, and are shown only for bank-transfer orders. | – |
| 2026-10-29 | Order numbers are `UST-<year>-<6 digits>`, restarting at 000001 each year (Asia/Karachi). | – |
| 2026-10-29 | Demo categories are limited to a tractor parts and lubricants shop. No bike or car parts. | Spec §27 sample data |
| 2026-10-29 | `services/catalog.ts` keeps reading the DEMO mock until Phase 3 (catalog). Phase 2 is auth. | – |

## Phase 1: Database

Scope: Supabase schema, RLS, transactional functions, storage, DEMO seed, database tests and docs. No UI is switched to Supabase in this phase.

- Migrations in `supabase/migrations/` for: roles and profiles, catalog (categories, brands, products, product_variants, product_images, tractor_makes, tractor_models, product_compatibility, private variant costs), inventory and the append-only `stock_movements` ledger, customers (addresses, wishlist_items, carts, cart_items), store settings (public vs private), delivery methods, shipping_rates, bank_accounts, coupons and redemptions, orders (order items, status history, payments, payment_events, shipments, returns, refunds, invoices), reviews, quotes, notifications, internal notes, audit_log; storage buckets and policies.
- Functions: `place_order()`, `adjust_stock()`, `set_order_status()`, `set_payment_status()`, `expire_unpaid_bank_transfers()`, tracking-token and bank-detail lookups, stock availability.
- `supabase/seed.sql`: DEMO data matching `src/lib/mock/`.
- `src/lib/supabase/admin.ts` (service-role client, `server-only`).
- Tests in `tests/db/` run against the dev project (`npm run test:db`).
- `docs/DATABASE.md`.

## Phase 0: Setup

Rules: follow every rule in CLAUDE.md. Never read or print `.env*` files (except `.env.example`), `client-data/` or `private/`.

0. Save this plan to `docs/ROADMAP.md`. Add "Project phases are defined in docs/ROADMAP.md" to CLAUDE.md.
1. Keep the existing folder structure. Node 24 is installed. Create the Next.js app (App Router, TypeScript, Tailwind, ESLint, `src/` directory) in a temporary folder and merge it in, so existing files (CLAUDE.md, .gitignore, .claude/settings.json, README.md, .env.example) are kept, not overwritten. Use the latest stable versions. Check that Next.js supports the TypeScript version first. If it doesn't support TypeScript 7, use 5.x.
2. Install and configure: shadcn/ui, lucide-react, react-hook-form, zod, @hookform/resolvers, @supabase/supabase-js, @supabase/ssr, vitest, @playwright/test, recharts (admin charts), @react-pdf/renderer (invoices). Explain any other dependency before adding it.
3. Create four subagents in `.claude/agents/` (markdown with frontmatter):
   - `security-reviewer`: read-only. Reviews diffs for secrets, missing RLS, client-trusted prices, XSS/SQLi, unsafe uploads, exposed keys, risky dependencies.
   - `db-architect`: Postgres schema, migrations, RLS policies, indexes, transactions, integer-paisa money.
   - `ui-designer`: builds screens from the approved images in `design/`, using shadcn/ui, mobile-first, with accessible contrast.
   - `test-writer`: unit, integration and Playwright tests for cart, pricing, checkout, stock and permissions.
4. Add npm scripts: dev, build, lint, typecheck, test, test:e2e. Add these commands to CLAUDE.md.
5. Add Supabase server and browser clients in `src/lib/supabase`. Put the variable names (names only) in `.env.example`.
6. Configure security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy) in next.config.
7. Make sure `private/` is in `.gitignore` and in the deny list of `.claude/settings.json`. Keep every existing deny/ask rule.
8. Run lint, typecheck and build. Fix any failure.
9. Rename the branch to main (`git branch -M main`) and make the first commit. Before committing, run `git status` and confirm that no `.env*` file (except `.env.example`), `client-data/` or `private/` is staged.

Deliverables: the architecture summary, the implementation checklist by phase, the environment variables the user must fill in, and the database schema plan.

## Later phases

Defined after Phase 0 is approved. See the checklist below; it is a proposal until the user approves it.
