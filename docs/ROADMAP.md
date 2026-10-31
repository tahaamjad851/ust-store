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
| 2. Auth & accounts | feat/auth | Done, verified and merged |
| 3A. Public catalog on Supabase | feat/catalog | Done, verified and merged |
| 3B. Catalog admin (daily prices, products, variants, images, compatibility, categories, brands, tractors, stock, CSV, settings) | feat/catalog-admin | Built and reviewed; waiting for the user to apply migration `20261101100000_catalog_admin.sql` and run the checks (`docs/CATALOG.md`) |

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
| 2026-10-31 | **Phase 3 is split.** 3A is the public catalog on Supabase; 3B is the admin for products, categories, brands, variants, images, compatibility, stock, prices and CSV import/export. 3B is required for launch because the client adds all products himself. | Single "Phase 3" |
| 2026-10-31 | The DEMO seed stays as the development catalog for now and **must be removed before launch** (launch checklist below). | Decision of 2026-10-29 that the storefront reads the DEMO mock until Phase 3: it now reads Supabase |
| 2026-10-31 | Out-of-stock products stay visible with an "Out of stock" label and a disabled Add to cart. Stock is shown as In stock / Low stock / Out of stock only, never as a count. | – |
| 2026-10-31 | Delivery charge is not calculated on public pages: product pages, cart and checkout show "Delivery charge confirmed by phone". Returns: exchange within 7 days if the product is in original condition. Both texts are read from `store_settings` (`delivery_charge_note`, `return_policy_note`), never hardcoded. | – |
| 2026-11-01 | **3B decisions.** CSV: one file, one row per variant, keyed by SKU. Cost prices are visible to admins only. Deleting: archive by default; a real delete (admin only) for products and variants that were never ordered, never for anything an order refers to. Up to 8 photos per product; category and brand images later. | 3B proposal questions |
| 2026-11-01 | **No free-delivery offer.** Delivery is quoted by phone. `free_delivery_threshold_paisa` is set to null by migration `20261101100000`; every mention is gone from public pages, the seed and the mock data. The top bar text comes from `store_settings.announcement_text`. `place_order()` still holds the free-shipping rule (off while the threshold is null): remove it in Phase 4. | Decision of 2026-10-31 about a DEMO threshold |
| 2026-11-01 | Exchange text: "Exchange accepted if the product is not damaged, within 7 days." (client to confirm). Couriers (TCS, Daewoo, Leopards, M&P, Trax, Pakistan Post, Other) live in a `couriers` table, edited by the admin, for later use on orders. The owner's order-notification email is private (`store_private_settings`). Bank and EasyPaisa details are not part of 3B. | 2026-10-31 exchange wording |
| 2026-11-01 | Staff edit prices, products, stock, categories and so on; only an admin sets costs, deletes, and edits settings and couriers. Admin pages and actions use the signed-in session, never the service-role key. | Phase 1 "staff: catalog and costs" |
| 2026-11-02 | **3A repair.** On the dev project `20261031100000` was recorded but not applied (found when 3B failed with `42703 return_policy_note`). New migration `20261031100100_catalog_public_repair.sql` (idempotent; sorts between 3A and 3B), `supabase/checks/schema_check.sql` (read-only schema check), and a preflight in the DB tests that lists what the project lacks. Production setup rule: never record a migration separately from applying it (`docs/CATALOG.md`, "Production setup"). | A migration list is not proof that a migration took effect |

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
- ~~`stock_availability()` shows exact available quantities to anyone.~~ Fixed in 3A: it returns the status only.
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

### Warm-up sign-in refusal (2026-10-31)

The user's rerun: the warm-up still failed on a sign-in with "Something went wrong. Please try again." (customer on one run, staff on another); manual sign-in in the browser works. What the evidence shows:

- **Not credentials, not rate limiting.** That exact text is `MESSAGES.unexpected`. A wrong password gives "Incorrect email or password.", a limit gives "Too many attempts…" and a limiter failure "Something went wrong on our side…". So the Supabase `400 invalid_credentials` and `422 anonymous_provider_disabled` entries are not this failure: they are the tests that intend them (wrong-password and rate-limit e2e tests; `tests/integration/db/auth-support.test.ts` calls `signInAnonymously()` to prove it is refused). `signUp` is only called by the register action, never by the test helpers or the warm-up. The test users are created with the service role (confirmed email, random password) right before use, and `createTestUser` throws if that fails.
- **The server side is fine.** On a local fake Supabase (no real project), the very first cold sign-in sometimes showed the same alert although the server log showed `loginAction` finishing in about 40 ms, a `200` with `x-action-redirect: /admin;push`, and every Supabase call succeeding. Roughly 1 cold start in 5 reproduced it. So the refusal comes from the browser side of the call (the form's `catch` shows the generic message when the action request fails or is aborted), triggered by the first cold compile of the signed-in routes in `next dev`. **The exact trigger was not pinned down**; I could not catch the thrown error, because the form discarded it.
- **Hidden causes, now visible.** Three places threw the real reason away: the form's `catch`, the profile check after a correct password (no log), and the mapping of every Supabase Auth error to "Incorrect email or password.", which included network failures (`AuthRetryableFetchError`, status 0; seen directly while testing) and 5xx. Now: the form logs the error to the browser console; the action logs the code of every failure that is not an ordinary wrong password (server side, the visitor still sees only the generic message), and Supabase/network failures show the generic "Something went wrong" instead of "Incorrect email or password."; `isAccountEnabled` and `getAuthState` log the database's error code and message before failing closed.
- **Tests no longer depend on the login form for set-up.** `signInWithSession` (`tests/e2e/helpers/dev-project.ts`) signs the test user in once from the test process with `@supabase/ssr` and hands the browser the same cookies the app would set. The warm-up and every test where signing in is only set-up use it; the login form is still tested end to end by the "sign-in" tests (wrong password, rate limit, disabled, redirects). The warm-up now signs in as staff only, so it no longer triggers the expected 403 on `/admin`. When `signInThroughUi` is refused it now reports what the browser saw (console errors, failed requests) and whether Supabase accepts that email and password when asked directly.
- **Not done on purpose:** persistent test users with a password in an env var (a standing credential in the DEV project; the per-run throwaway users are created with a known password, confirmed, and deleted afterwards), and any change to production rate limits.

Verified here: lint, typecheck, build, 115 unit tests (4 new). The cookie format of `signInWithSession` was checked against a local fake Supabase only. **Not** run here: any e2e test against the DEV project.

### Missing profile is not "disabled"; warm-up removed (2026-10-31)

The user confirmed manual sign-in works (so the failure is in the e2e set-up) and that the Supabase `400`/`422` entries are the tests' intended wrong-password and anonymous-sign-in checks. Their failing run's server log also showed an error for `/admin` ending in a redirect to `/auth/disabled`, thrown from `requireUser`. I did not see that line myself (the log I could read had been overwritten and held no errors).

- **Real defect found and fixed:** `getAuthState()` returned `disabled` when the profile read succeeded but returned **no row**, and `isAccountEnabled()` returned `false` for the same case. A valid user could therefore be sent to `/auth/disabled` (which re-checks and, if the read now works, bounces them to `/account`) after a read that came back empty, for example when a request reaches the database without the user's token and row-level security hides the row. Every account gets a profile in the transaction that creates the user, so a missing row means a fault, not a disabled account. Now: no row → logged error and the "Could not load the account" error page (fail closed, no sign-out, no "disabled" message); `disabled` only for an explicit `disabled_at`; the sign-in action answers the generic message and signs the half-made session out. Also, a Supabase Auth outage (network failure or 5xx) in `getAuthState()` no longer looks like "signed out" and no longer sends a signed-in user to the login page: it is an error page, logged. A rejected or expired token still means signed out. Unit tests cover all of these (guards and login action).
- **Whether this was the cause of the warm-up failure is not established.** It is the one place in the code that can turn a valid user into a redirect to `/auth/disabled`, and it matches that log line, but I could not reproduce an empty profile read, and I cannot read the hosted logs. The new server logging (`account lookup found no profile for a verified user`, `session check failed…`, `sign-in failed…`) will show it after one more run.
- **Warm-up project removed.** With set-up sign-ins done by session (no login form) and `page.goto` waiting for cold compiles, its job was gone, and while failing it blocked the whole suite. `signInThroughUi` (waits for the navigation, fails with the alert text and diagnostics) and `signInWithSession` stay.

Verified here: lint, typecheck, build, unit tests (counts in the report). **Not** run here: any e2e or `test:db` run against the DEV project.

### E2E after removing the warm-up: root causes (2026-10-31)

The user's run: 36 passed, 6 failed (3 tests on mobile and desktop). Evidence and causes:

1. **Login form refused a valid customer: a real app bug, found.** Next rejects a Server Action's promise with a redirect error when the action redirects (`server-action-reducer.js`: `reject(redirectError)`, marked `handled`). The login form awaited the action in a try/catch whose `catch` showed "Something went wrong. Please try again.", so **every successful sign-in flashed that alert** (and its DOM stayed behind after the URL changed); Next hides its own router errors from `console.error`, so nothing showed in the browser log. Sign-in worked, the flash was only visible for the moment before navigation, which is why manual sign-in "worked" and why the test failed only when its alert-watcher won the race (this matches the warm-up's "refused" failures and my earlier local reproductions, where the server log was clean; the first-round "stuck on /login with a disabled Sign in button" runs were a different symptom and keep their cold-compile explanation). Reproduced deterministically in a browser against a local fake Supabase (alert recorded at `/login` and after navigation on 3 of 3 sign-ins); after the fix: no alert on 3 of 3. Fixed in the login, register, reset-password and address forms with `isRedirectError` (unit-tested against the error `redirect()` really throws). The dev log file could not show any of this: it holds no server `console.error` output, only start-up lines (my earlier advice to search it was wrong; `docs/AUTH.md` has the corrected way).
2. **Bob got HTTP 200 for Alice's edit page: no data leaked; my `loading.tsx` files caused the 200 in dev.** The response body for another customer's (or an unknown) id has none of the owner's data (checked street, city, name, phone and label against the owner's own page, which has all of them) and contains the not-found page. The `loading.tsx` files I added in the first fix round wrapped each account page in a Suspense boundary, so the status was sent before `notFound()` ran (dev answered 200; it returned 404 once they were removed, same code otherwise). They are replaced by `export const instant = false` on each account page (Next's documented "[block]" option; no dev validation errors). A production build still answers 200 for this one route (`/account/addresses/[id]/edit` is built as partially prerendered, checked with `next start` against the fake backend): kept, documented in `docs/AUTH.md`, and the test now asserts the not-found content and the absence of Alice's data (status 200 or 404).
3. **Add-address journey: not an Activity/hidden-form problem.** After client-side navigation `new → list → edit` there is exactly one visible City input (no hidden second form). The mobile run stayed on `/new` with the same "Something went wrong" alert, which is the redirect rejection from (1) (and the first compile of the address list inside a 5 s wait); the desktop run hit the 30 s test limit of a ~30-step journey on one test against the hosted database (no page snapshot was kept; I could not see which step it was waiting on). Not a timeout bump: the journey is now three tests (details; add addresses and the default; edit and delete with API-seeded addresses), and the add test visits the address list first so its first compile happens in a navigation, not inside a 5 s assertion.

Verified here: lint, typecheck, build, 120 unit tests, sign-in check in a browser against a local fake Supabase, status codes in dev and in `next start` against it. **Not** run here: any e2e test or `test:db` against the DEV project.

## Phase 3A: Public catalog

Branch `feat/catalog`. Details, setup steps, caching rules, limits and test commands: `docs/CATALOG.md`.

### Phase 3A report (2026-10-31)

Built:
- Migration `20261031100000_catalog_public.sql`: two public texts in `store_settings` (`delivery_charge_note`, `return_policy_note`), `stock_availability()` returns the status only (closes the Phase 1 low finding), and `catalog_search()` (server-side search, filters, sort, paging; ids and a status only).
- `src/services/catalog.ts` reads Supabase with the anon key through RLS only (no service-role use on public pages, explicit column lists, no `select *`), cached with `"use cache"` and tags. Hand-written TypeScript types (`src/types/database.ts`), pure mappers (`src/features/catalog/mappers.ts`), listing parameter parsing, `createPublicClient()`.
- Storefront on the database: home, shop, categories and subcategories, product page (variants, compatibility, specs, related products), category drawer, mega menu, tractor selector, search, filters, sorting, pagination, stock status, product images through `next/image` with placeholders and a reserved box.
- Cart: variant ids and quantities only in the browser; prices, names, images and stock status come from the server (`lookupCartItems`). Delivery and exchange texts come from `store_settings`. Checkout stays on the demo path.
- `next.config.ts`: CSP and image host pinned to the exact `NEXT_PUBLIC_SUPABASE_URL` host; the production build and `next start` fail without it.
- `docs/CATALOG.md`, launch checklist, error boundaries (`(store)/error.tsx`, `global-error.tsx`).

Tested (here, against a local Postgres 17 with the real migrations and seed, and a throwaway PostgREST stand-in that lives outside the repo; **not** against your Supabase project):
- 170 unit tests pass (48 new: mappers, listing parameters). `npm run lint`, `npm run typecheck`, `npm run build` pass.
- 30 SQL checks on the migration (visibility of drafts, archived products, inactive variants and categories; no cost, inventory or count reachable by anon; search by name, SKU, part number, model; filters; sort; paging; wildcard and injection text).
- 45 browser tests (`tests/e2e/catalog.spec.ts` plus the 14 visitor tests) pass on the mobile and the desktop project against `next dev`, and against a production build (`next start`, repeated three times: 228 of 228). The empty `NEXT_PUBLIC_SUPABASE_URL` build failure was checked.
- Reviews: security-reviewer (0 critical, 0 high, 2 medium, 6 low) and ui-designer (see below).

Fixed after review:
- Cache poisoning: only common, bounded listing shapes are cached (no free text, no price range, known tractor model, first 10 pages); a malformed product slug is refused before the cached lookup.
- `catalog_search()` now has `statement_timeout = '3s'` and a 10,000 offset cap; the migration's self-check also covers `authenticated`.
- Cart: an out-of-stock line shows "Not included" instead of a total that is not in the sum; a visible reason when checkout is disabled; a notice when lines are removed because they are no longer sold; an inline retry when a refresh fails; a variant picker with one accessible name, a focus ring and 44px rows; live price/stock announcement; "Delivery & exchanges" heading; FAQ wording.
- Found by running it: an empty `min=&max=` from the filter form was read as a price of 0 (zero results; this bug existed in the demo-data version too); Zod's `uuid()` rejects the seed's md5-made ids, so the model filter and the cart silently ignored them (now `guid()`); the demo "OEM ref" lives in `oem_part_numbers`, so the page now shows part number and OEM references separately; a card with a small image shrank narrower than its grid cell.

Open (reasoned, not fixed):
- ~~**Medium: RLS is looser than the pages.**~~ Closed in 3B (migration `20261101100000`, `category_is_public()`). Original note: Anon can still read, through the API, published products in a deactivated category (and their variants and prices). The site and `catalog_search()` hide them; the database policies do not. Tightening the four select policies would make the existing database test fixtures (published products in an inactive category) invisible, so it is the first item of Phase 3B, together with the fixture change. Until the admin exists nobody deactivates categories except through SQL.
- Low: no per-IP rate limit on search requests and on the cart lookup (a WAF or the host's firewall is the right place); `stock_availability()` does not apply the category rule (status only); a production deploy with an `http://localhost` Supabase URL would start (https is only enforced for non-local hosts); the DB test leaves its inactive fixture rows in the DEV project; the trust-strip card for the exchange policy is taller than its neighbours on a 360px phone; a failure of the layout above the page boundary shows the generic global error page.
- Not part of 3A: brand filter and brand pages, specification filters, grid/list switch, items per page, wishlist, reviews, recently viewed, image zoom/gallery switching, category images, the 3B admin.
- The first request to an unknown or deactivated URL may be answered 200 by a production server (the shell streams first); it shows the not-found page with `noindex`, later requests get 404.
- `next dev` can answer a few concurrent first requests to a dynamic route with a 500 (a race inside the dev server, found in its source); the e2e global setup warms the routes, a production build is not affected.

Needs from the user (exact steps in `docs/CATALOG.md`):
1. Apply `supabase/migrations/20261031100000_catalog_public.sql` in the SQL Editor, record it in `supabase_migrations.schema_migrations` in a separate query, run the verification queries.
2. `npm run test:db -- tests/integration/db/catalog-public.test.ts`, then `npm test`, then `npm run test:e2e:catalog` (or `npm run test:e2e:mobile` / `npm run test:e2e:desktop`).
3. Decide: keep `free_delivery_threshold_paisa` (Rs 10,000 is a DEMO placeholder shown in the announcement bar, trust strip, cart and FAQ) or set it to `null`.
4. Confirm the two texts with the client (`delivery_charge_note`, `return_policy_note`).

## Phase 3B: Catalog admin

Branch `feat/catalog-admin`. Details, migration steps, tests and limits: `docs/CATALOG.md` ("Admin (Phase 3B)").

### Phase 3B report (2026-11-01)

Built:
- Migration `20261101100000_catalog_admin.sql`: closes the 3A RLS gap (`category_is_public()`; also applied to `_place_order()` and `stock_availability()`, so a hidden category stops ordering too); costs admin-only; only an admin deletes; "never delete what an order refers to" enforced by `BEFORE DELETE` guards (a never-ordered variant's stock ledger is deleted with it, audited); `price_changes` log; `apply_daily_changes()` and `import_catalog()` (one transaction each); two category levels; photo path, limit and primary rules; audit triggers (column names only); couriers; `announcement_text`, `price_change_alert_percent`; free-delivery threshold set to null; the exchange text.
- Admin under `/admin`: Daily prices, Products (every section-7 field the schema has, description preview, specifications, variants, photos, compatibility, archive, delete), Categories, Brands, Tractors, Stock (reason required, history), Import/Export (validation report first, then apply), Settings and couriers (admin only). One action pattern: signed-in session, never the service-role key; Zod; error mapping; cache tags expired so the shop updates at once.
- Storefront: every free-delivery mention removed (pages, types, mock data, seed); the top bar reads `store_settings.announcement_text`.

Tested here (not against your Supabase project):
- Migration on a local Postgres 17 (PGlite) with the real migrations and seed: 151 checks plus 6 for the hidden-category rule, all pass (RLS for anon, customer, staff, admin; cost privacy; refused writes; delete rules with a real order; price log and confirmation; atomic saves; image and category rules; import).
- Unit tests (`npm test`): money, daily-price logic, error messages, CSV parser/validator/export, image type check, schemas, row builders.
- Browser: the admin journey ran in Chromium against a local stand-in for Supabase built on the same Postgres (auth, REST with real row-level security, storage); passes on the mobile and the desktop project, each run on its own. Scratch scripts additionally checked categories, brands, tractors, products, photos (a text file named .png is refused), stock, settings, CSV, and that the public shop changes at once.
- Reviews: security-reviewer (0 critical, 0 high, 2 medium, 4 low) and ui-designer (1 high, many medium/low).

Written but **not run** (need your DEV project and the migration applied): `tests/integration/db/catalog-admin.test.ts`, and `tests/e2e/admin.spec.ts` against the hosted project. The stand-in is not Supabase: PostgREST, Auth and Storage details (for example `Prefer` headers, the storage upload format, JWT handling) are only verified where the stand-in imitates them.

Fixed after review:
- Security M1: a product in a hidden category could still be ordered or show a stock status (`_place_order()` and `stock_availability()` did not apply the category rule).
- Security L1/L4: database error details are no longer sent to the browser; the image trigger refuses non-staff.
- UI high: unsaved Daily prices edits are no longer lost silently when following a link or the menu. Medium: accessible names contain the visible label, whole-cell checkbox, no re-announcing on every keystroke, owner-facing wording, focus to the import report, an admin error page. A customer now gets a real 403 (removed `admin/loading.tsx`).
- Found by running it: forms sent parsed instead of raw values to the server; new categories landed first; "Publish now" followed by "Save product" silently reverted to draft (the details form now sends the status only if changed there); the price parser accepted "12,,".

Open (reasoned, not fixed):
- Medium: the large-change confirmation exists only on Daily prices. A CSV import (or the variant editor) can change many prices at once with no confirmation, only the price log. The CSV check does not yet flag large changes. Also the table allows a price of 0 (the functions refuse it).
- Low: `price_change_alert_percent` is readable by anyone (the settings table is public); the ledger-purge setting is a plain database setting, safe today because nothing can set it through the API (hardening: require trigger depth); `bodySizeLimit` of 5 MB applies to every Server Action; staff can overwrite any object in the photo bucket by calling the API directly.
- UI (not done): visible reason beside a disabled Delete button on phones; focus return after closing inline forms; a sticky save bar on the product form; the Daily prices page is tall on a 360px phone (about 260px per row); problems table in the import report scrolls sideways on phones; no loading skeleton (a `loading.tsx` would make the 403 a 200); courier add has no pending state.
- The e2e dev server can answer a first concurrent request slowly (cold compile); the admin tests allow 20 s for uploads.
- `place_order()` still contains the free-shipping rule (off while the threshold is null): remove it in Phase 4.
- Screens were reviewed in a desktop browser and from code; the phone layout of the admin was not checked visually on a device.

Needs from the user:
1. Apply `supabase/migrations/20261101100000_catalog_admin.sql` in the SQL Editor, record it in `schema_migrations` in a separate query, run the verification queries (`docs/CATALOG.md`).
2. `npm run test:db -- tests/integration/db/catalog-admin.test.ts`, then `npm test`, then `npm run test:e2e:mobile` and `npm run test:e2e:desktop` (first run: `npx playwright install chromium`).
3. Create your admin account (and staff) as in `docs/DATABASE.md`; in Admin > Settings check the contact details, WhatsApp, the owner's order email, and have the client confirm the exchange text.
4. Decide: should an import or the variant editor also ask for confirmation of large price changes (my suggestion: yes, in the import check report)?

## Phase 4 proposal: Orders (nothing starts until you say "go")

Goal: a customer can place an order (guest or signed in), the owner is told, and staff can run it to delivery. Money and stock stay authoritative in `place_order()`.

Slices:
1. **Checkout on the database.** Replace the demo checkout with a server action that rate-limits and calls `place_order()` / `place_order_as_guest()` (service role only for the guest path, as designed); idempotency key; field-level errors from the stable error codes; order confirmation page with the order number and a tracking link for guests. Remove the free-shipping rule from `place_order()` (new migration). Delivery stays "confirmed by phone"; the order total is the items total, shipping added by staff later (needs a decision: how staff record the agreed delivery charge on an order).
2. **Payments v1.** COD and bank transfer only (EasyPaisa/JazzCash and online gateways later). Bank accounts table and admin screen (admin only, never seeded), `get_bank_transfer_details()` on the confirmation page, payment reference/proof upload to the private bucket with server-side checks, staff verification (`set_payment_status()`).
3. **Admin orders.** List with search and filters, order detail, status changes through `set_order_status()` (valid transitions only), internal notes, shipment with courier (from the couriers list) and tracking number, cancellation (releases stock once), returns and refunds (admin).
4. **Notifications.** Email to the owner's private address for each new order and to the customer (order placed, shipped), through custom SMTP/Resend (launch checklist item), outbox table already exists; WhatsApp link only, no WhatsApp API.
5. **Customer account.** Order history and detail, tracking by token, reorder.
6. **Stock events.** Revalidate `catalog-stock` on order placement and cancellation; low-stock alert email.

Decisions needed first: how the delivery charge is added to an order; whether guest checkout stays on; which payment methods at launch; the email provider and sender address; invoice wording (no tax lines, decided).

Tests: unit (checkout schema, totals), database (place order, idempotency, cancellation releases once, permissions), Playwright (guest order, signed-in order, admin fulfils it) with the one-time session helper from 3B.

Risks: double submits and stock races (covered by the database functions, to be proven under concurrency on the DEV project), email deliverability, proof-of-payment uploads, abuse of guest checkout.

## Launch checklist

Things that must be true before the site goes live. Add to this list in every phase.

- [ ] **Remove the DEMO catalog.** Archive or delete the DEMO products, categories, tractor models and compatibility rows (`docs/DATABASE.md`, "Removing demo data"; with 3B, from the admin). Set `DEMO_CATALOG_NOTICE=off` so the "Demo catalogue" notice disappears. Delete `src/lib/mock/`, `scripts/generate-seed.mjs`, `supabase/seed.sql` and the `db:seed:generate` script. Never run `db push --include-seed` against production.
- [ ] Replace the DEMO contact details, hours and tagline in `store_settings` with the client's confirmed values (Admin > Settings). There is no free-delivery offer (threshold is null).
- [ ] Client confirms `delivery_charge_note` and `return_policy_note` (and keeps `return_period_days` in step with the note: 7).
- [ ] Production setup is **generated from `supabase/migrations/` in order, in one transaction that records each version inside the same file** (`npm run setup:build`; steps in `docs/PRODUCTION_SETUP.md`), ends with `supabase/checks/schema_check.sql` returning no rows and the DB tests passing. Never record a migration by hand.
- [ ] Production: apply `20261101100000_catalog_admin.sql`; create the first admin and the staff accounts; set the owner's order-notification email and the WhatsApp number in Admin > Settings; add real products (Admin > Products or CSV) and delete the DEMO ones.
- [ ] Remove the free-shipping rule from `place_order()` (Phase 4), now that there is no free-delivery offer.
- [ ] Dashboard Auth settings: a disabled account must also be banned in Supabase Auth (Phase 6).
- [ ] Rewrite the product names in `tests/e2e/catalog.spec.ts`, which currently assume the DEMO seed.
- [ ] Custom SMTP for Supabase Auth emails (before the Phase 4 staging deploy).
- [ ] Production Supabase project: dashboard Auth settings (`docs/AUTH.md`), first admin, `NEXT_PUBLIC_SUPABASE_URL` set in the hosting environment (the production build refuses to run without it).

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
