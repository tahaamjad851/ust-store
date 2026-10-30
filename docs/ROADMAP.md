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
| 1. Database | feat/database | Done, verified and merged |
| 2. Auth & accounts | feat/auth | Built and reviewed; waiting for the user to apply the migration, configure the dev project and run the dev-project tests (see `docs/AUTH.md`) |

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
| 2026-10-30 | Phase 2 sign-in is email + password only; anonymous sign-ins stay rejected. Auth pages use the existing design system. Rate limiting is Postgres-backed (no new service). | Phase 2 proposal questions 1, 3, 4 |
| 2026-10-30 | Supabase's built-in mailer for now. **Configure custom SMTP (for example Resend) before the Phase 4 staging deploy.** | Phase 2 proposal question 2 |

## Phase 1: Database

Scope: Supabase schema, RLS, transactional functions, storage, DEMO seed, database tests and docs. No UI is switched to Supabase in this phase.

- Migrations in `supabase/migrations/` for: roles and profiles, catalog (categories, brands, products, product_variants, product_images, tractor_makes, tractor_models, product_compatibility, private variant costs), inventory and the append-only `stock_movements` ledger, customers (addresses, wishlist_items, carts, cart_items), store settings (public vs private), delivery methods, shipping_rates, bank_accounts, coupons and redemptions, orders (order items, status history, payments, payment_events, shipments, returns, refunds, invoices), reviews, quotes, notifications, internal notes, audit_log; storage buckets and policies.
- Functions: `place_order()`, `adjust_stock()`, `set_order_status()`, `set_payment_status()`, `expire_unpaid_bank_transfers()`, tracking-token and bank-detail lookups, stock availability.
- `supabase/seed.sql`: DEMO data matching `src/lib/mock/`.
- `src/lib/supabase/admin.ts` (service-role client, `server-only`).
- Tests in `tests/integration/db/` run against the dev project (`npm run test:db`).
- `docs/DATABASE.md`.

### Phase 1 report (2026-10-29)

Built: 9 migrations (41 tables, RLS on all, 20+ functions), storage buckets and policies, DEMO seed generated from `src/lib/mock` (`npm run db:seed:generate`), `src/lib/supabase/admin.ts`, 25 dev-project tests, `docs/DATABASE.md`. Wholesale pricing removed from the UI layer; demo categories aligned with decision 7.

Tested so far:
- All migrations and the seed were executed on a local Postgres 17 (PGlite) with stubbed Supabase `auth`/`storage` schemas; 58 SQL-level checks pass (RLS isolation, privileges, place_order validation/idempotency/price recomputation/anti-hoarding, coupons, shipping, lifecycle, release-once, ledger = inventory, bank-transfer expiry, returns, storage policies, hardening guards). This harness lives outside the repo.
- Not yet run against Supabase: `supabase db push` and `npm run test:db` (concurrency, real PostgREST/Auth behaviour). The user runs these.
- Reviews: db-architect and security-reviewer; all critical/high/medium findings fixed.

Low findings left open:
- Customers see `order_status_history.note`/`actor_id` and `payments.verified_by` on their own orders (notes are documented as customer-facing; internal remarks go in `internal_notes`).
- Coupon per-customer limits key on account or phone; phones are not verified, so a guest can bypass them by changing the number.
- `stock_availability()` shows exact available quantities to anyone.
- No per-order cap on payment-proof uploads (server-side limit planned for Phase 4); MIME type is client-declared.
- Refund amounts are not capped against the order total in the database (admin UI / function in Phase 6).
- Re-running the seed fails if an admin created rows with the same slug/SKU under other ids, and resets DEMO values (documented: never `--include-seed` in production).
- COD orders never auto-expire (staff cancel stale ones; open-order cap limits abuse).
- `npm audit`: 3 low (deepmerge via the `shadcn` dev CLI), pre-existing.

## Phase 2: Auth & accounts

Branch `feat/auth`. Supabase Auth with email + password. Catalog stays on mock data (Phase 3). Details, setup steps, limits and test commands: `docs/AUTH.md`.

### Phase 2 report (2026-10-30)

Built:
- Migration `20261030100000_auth_support.sql`: Postgres rate limiter (`rate_limits`, `check_rate_limit()` for the service role only); API roles can no longer read the staff identity columns `order_status_history.actor_id`, `payments.verified_by`, `shipments.created_by`, `refunds.created_by` (the open low finding; staff see the actor in `audit_log`; `internal_notes` was already staff-only); address integrity (one default, first address is default, deleting the default promotes another, max 10).
- `src/proxy.ts` session refresh and optimistic redirects; server-side `requireUser()`, `requireStaff()`, `requireAdmin()` used by the `/account` and `/admin` layouts, pages and actions (customers get a real 403, disabled accounts are signed out, anonymous users are rejected, database errors fail closed).
- Pages: login, register, forgot password, reset password, email confirmation callback, logout; `/account` (profile, addresses: add, edit, delete, set default); `/admin` shell showing the staff name and role. Generic error messages, Zod validation on the server, same-site redirects only.

Verified:
- `npm run lint`, `npm run typecheck`, `npm run build` pass. 111 unit tests pass (schemas, safe redirects including dot-segment bypasses, guards, rate-limit helper, auth actions, account actions).
- All 10 migrations run on a local Postgres 17 (PGlite, stubbed Supabase `auth`/`storage`; the harness lives outside the repo): 51 SQL checks pass (limiter, column privileges for customer/staff/service role, internal notes, address rules and isolation).
- 14 Playwright tests pass against the real dev server (mobile and desktop): visitors are redirected from `/account`, `/admin` and deeper account pages with a real 307; the auth pages render; browser-side validation.
- Reviews: security-reviewer (1 high, 3 medium, 4 low) and ui-designer. The high (open redirect through `/..//host`), the mediums (lockout abuse through email-only limits, overclaimed reset protection, public Supabase Auth endpoints not covered by the app limiter) and the UI findings are fixed or documented.

Written but **not run** (need the DEV project and the migration applied): `tests/e2e/auth.spec.ts` (wrong password, rate limit, disabled user, `/admin` 403, another customer's address, account journey) and `tests/integration/db/auth-support.test.ts`. Registration and password-reset emails are untested end to end (no test mailbox); they are covered by unit tests and review.

Low findings left open:
- A disabled customer who keeps a valid token can still call the API directly until it expires; row-level security does not check `disabled_at`. Phase 6's disable action **must** also ban the user in Supabase Auth.
- Supabase Auth's endpoints are public, so the app's limits and password policy do not cover direct calls; the dashboard settings (password rules, secure password change, CAPTCHA, rate limits) do. They are manual steps (`docs/AUTH.md`).
- The e2e project guard checks that `DB_TEST_PROJECT_REF` matches the URL, not that the project is "dev".
- The 10-address cap is not race-proof; the header shows a plain "Account" link; no password/email change screens; a mail scanner can consume a one-time link.
- Screens reachable only when signed in (account pages on a 360px phone, address buttons) were reviewed from code, not visually.

Needs from the user: apply the migration, the dashboard settings and email templates, `NEXT_PUBLIC_SITE_URL`, first admin account, then run the tests (`docs/AUTH.md`).

### Phase 2 check fixes (2026-10-31)

The user's run of the Phase 2 checks: unit 97 passed, `test:db` 47 passed, e2e 37 passed and 5 failed, plus repeated dev-server errors. Causes and fixes:

1. **`Date.now()` error on every protected route** ("encountered the unstable value Date.now() while prerendering … at AccountLayout / AdminLayout"). supabase-js reads the clock in `auth.getUser()` to see whether the session has expired. Next's dev-time prerender validation has cookies available but treats any time read as unstable. Fix: `await connection()` at the top of `getAuthState()` (`src/lib/auth/session.ts`): who is signed in can only be known for a real request. During a real request or a server action it resolves immediately. Removing that error exposed a second one (the guard now sits outside a `<Suspense>` boundary in each page), so `/account`, `/account/addresses`, `/account/addresses/new`, `/account/addresses/[id]/edit` and `/admin` each got a `loading.tsx` skeleton. Nothing is suppressed. Checked: a fresh `next dev` with a cold compile and a signed-in session produced 0 errors on all five routes (before the fix: the error on every one); `npm run build` is clean and `/account` and `/admin` are still dynamic.
2. **`farm.getByText("Default")`**: a test bug. `getByText` is a case-insensitive substring match, so it also matched the "Make default" button on every non-default card (checked in a browser: old locator found 1 match on a non-default card, the exact-match badge locator 0). The app shows exactly one default. Fixed with `getByText("Default", { exact: true })`.
3. **Sign-ins staying on `/login`**: not the rate limiter (a refusal prints an alert; the failure snapshots show a disabled "Sign in" button and no message, i.e. the action was still running). The action was slow because the first sign-in also cold-compiles `/account` in the dev server (4.4 s on its own, with a local mock instead of Supabase), after about 9 round trips to the hosted project, while all workers did the same at once, against the 5 s `expect` timeout. Fixes: a Playwright `warm-up` setup project (`tests/e2e/warm-up.setup.ts`) visits every signed-in route once before the other tests; `signInThroughUi` waits for the redirect as a navigation (not a 5 s assertion) and fails at once, with the alert text, if sign-in is refused. No production limit was changed, no `expect` timeout was raised. **"Enter the receiver's name" not visible**: also a test bug; the receiver's name is pre-filled from the profile, so the test now empties it. That test never reached the server (the form validates in the browser first), so it is renamed, and server-side validation of the account actions now has its own unit tests (`tests/unit/account-actions.test.ts`: invalid input, forged owner, another customer's address, id checks).

Verified here: lint, typecheck, build, 111 unit tests (14 new), 14 visitor e2e tests. **Not** re-run here: the 28 dev-project e2e tests and `test:db` (they need the DEV project); the user re-runs them (`docs/AUTH.md`).

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
