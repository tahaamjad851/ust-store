# Authentication and accounts

Email + password sign-in with Supabase Auth. Anonymous sign-ins are not used. Phase 2 of `docs/ROADMAP.md`.

## How it works

| Piece | Where | What it does |
|---|---|---|
| Session refresh | `src/proxy.ts`, `src/lib/supabase/proxy.ts` | Refreshes the Supabase cookies on `/account`, `/admin` and the sign-in pages. Redirects visitors from `/account` and `/admin` to `/login?next=…`. Optimistic only. |
| Guards | `src/lib/auth/session.ts` | `requireUser()`, `requireStaff()`, `requireAdmin()`. The real checks: they ask Supabase Auth to verify the session, load the profile and role through RLS, and are called by the `/account` and `/admin` layouts, every page and every server action. Visitors are redirected, customers on `/admin` get a **403**, disabled accounts are signed out via `/auth/disabled`. They fail closed if the database cannot be read. |
| Actions | `src/features/customers/auth-actions.ts`, `account-actions.ts` | Login, register, forgot/reset password, logout, profile and address changes. Every input is validated again with Zod on the server (`src/lib/validation/auth.ts`). |
| Email links | `src/app/auth/confirm/route.ts` | Verifies the emailed link (confirm email or reset password), then redirects to a safe path only. |
| Rate limiting | `src/lib/auth/rate-limit.ts`, migration `20261030100000_auth_support.sql` | Postgres counters, reachable only with the service role. Fails closed. |

Rules the code follows:

- **No account enumeration.** Wrong password and unknown email give the same message. Register and forgot-password answer the same whether or not the address exists. (A *disabled* or *unconfirmed* account is only mentioned after the correct password was given.)
- **Safe redirects.** `?next=` is accepted only as a same-site path (`safeNextPath`); anything else becomes `/account`.
- **Disabled accounts** (`profiles.disabled_at`) cannot sign in and are blocked on every protected request of the website, including staff who still have a role row. Row-level security on customer data does not check the flag, so a disabled customer who keeps a valid token could still call the API directly until it expires. When an admin disables someone in Phase 6, the same action **must** also ban the user in Supabase Auth (service role). That is a hard requirement of Phase 6.
- **Password reset** on the website needs the short-lived `ust-recovery` cookie that only a verified reset link sets (it holds the user id and is removed on sign-out), so the site's own form cannot be used from an ordinary signed-in session. This guards the website only: Supabase's Auth API is public, so the real protection against someone holding a stolen session is the **Secure password change** setting below. After a reset the account's other sessions are signed out.
- **Staff can read every customer's addresses through RLS** (for support). Pages and actions for the signed-in user therefore always filter by the owner themselves.
- **Customers and staff cannot read staff identity columns** (`order_status_history.actor_id`, `payments.verified_by`, `shipments.created_by`, `refunds.created_by`) and never see `internal_notes`. Consequence for later phases: API queries on those four tables must list their columns (`select *` returns "permission denied"); staff see who did what in `audit_log`.

## One-time setup (hosted Supabase DEV project, then again for production)

In the Supabase dashboard:

1. **Authentication → Sign In / Providers**: Email provider on, **Confirm email on**, **Allow anonymous sign-ins off**. Minimum password length **8**, password requirements **letters and digits**, and **Secure password change on** (a password can then only be changed by someone who signed in recently). If your plan offers it, also turn on leaked-password protection and **CAPTCHA** (Turnstile or hCaptcha) for sign-in, sign-up and password recovery. `supabase/config.toml` carries the same values for the local stack, but `db push` does not apply them to the hosted project: set them in the dashboard.
2. **Authentication → URL Configuration**: Site URL = your site (`http://localhost:3000` for dev). Add to Redirect URLs: `http://localhost:3000/**` (and the production address later).
3. **Authentication → Email Templates** (recommended; makes the links work on any device, not only in the browser that asked for the email). With the default templates the links still work, but only in the same browser.
   - *Confirm signup*:
     ```html
     <h2>Confirm your email</h2>
     <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/account">Confirm my email address</a></p>
     ```
   - *Reset password*:
     ```html
     <h2>Reset your password</h2>
     <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Choose a new password</a></p>
     ```
4. Email delivery uses Supabase's built-in mailer for now. It is limited to a few emails per hour and is for testing only. **Configure custom SMTP (for example Resend) before the Phase 4 staging deploy.**

In `.env.local` (names only here; never commit values): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DB_TEST_PROJECT_REF`, and optionally `NEXT_PUBLIC_SITE_URL` (required in production; local dev falls back to `http://localhost:3000`). The service-role key is needed by the rate limiter, so sign-in does not work without it.

## Apply the new migration

```powershell
npx supabase db push --dry-run   # expect: 20261030100000_auth_support.sql is the only pending migration
npx supabase db push             # expect: Applying migration 20261030100000_auth_support.sql…  Finished supabase db push.
```

## Rate limits

These limits protect the website's own forms (server actions) only. Supabase Auth's endpoints are public, so a determined attacker can call them directly: Supabase's own rate limits and CAPTCHA (dashboard) are the control for that.

| Action | Bucket | Limit |
|---|---|---|
| Login | per IP · per email + IP · per email (ceiling) | 20 / 15 min · 8 / 15 min · 40 / hour |
| Register | per IP | 5 / hour |
| Forgot password | per IP · per email + IP · per email (ceiling) | 5 / hour · 3 / hour · 10 / hour |
| Reset password | per IP | 10 / hour |
| Contact and quote requests (added with their pages) | per IP | 5 / hour (`contact_ip` bucket is ready) |
| Guest checkout (Phase 4) | per IP · per phone + IP · everyone | 30 / hour · 6 / hour · 120 / hour (`checkout_ip`, `checkout_phone_ip`, `checkout_all`; the per-address limit is loose because mobile carriers share addresses) |

The IP comes from `x-real-ip` / `x-forwarded-for`, which Vercel sets itself. If the site is ever self-hosted, put it behind a proxy that overwrites those headers. Values are keyed-hashed (HMAC) before they are stored, rows older than a day are purged as the limiter is used, and in production a request with no client address is refused rather than put in a shared bucket. Limits are per email **and** IP so that nobody can lock a customer out of signing in by failing on purpose from another address. Mobile carriers share addresses between many customers, so per-IP limits are deliberately loose.

## Tests

```powershell
npm test                 # unit tests (schemas, safe redirects, guards, rate-limit helper, auth and account actions)
npm run test:db          # DEV project: includes tests/integration/db/auth-support.test.ts
npm run test:e2e         # Playwright
```

- The visitor tests in `tests/e2e/auth-redirects.spec.ts` need only the dev server and `.env.local`.
- `tests/e2e/auth.spec.ts` (wrong password, rate limit, disabled user, `/admin` 403, address isolation, the account journey) needs the DEV project: the migration above applied, the four Supabase keys and `DB_TEST_PROJECT_REF` in `.env.local`, and the dashboard settings above (email confirmation and anonymous sign-ins do not matter to these tests, which create confirmed users with the service role). It refuses to run when `DB_TEST_PROJECT_REF` does not match `NEXT_PUBLIC_SUPABASE_URL`, and is skipped (with the reason shown) when the keys are missing. It creates users named `ust-e2e-<run>-…@example.test` and deletes them afterwards.
- First run on a machine: `npx playwright install chromium`.
- Tests where signing in is only set-up use `signInWithSession` (helper in `tests/e2e/helpers/dev-project.ts`: signs the test user in from the test process and gives the browser the cookies the app would set); the "sign-in" tests use the real login form. If a form sign-in is refused, the error says what the browser saw and whether Supabase accepts the credentials directly. The first visit to a route in `npm run dev` compiles it, so the first run is slower; navigations wait for it.
- Failures of sign-in and of the account checks are logged on the server with their Supabase error code or status (never passwords, tokens or emails); the visitor only sees the generic message. Where to read those logs: the terminal that runs the dev server. `.next/dev/logs/next-development.log` does **not** hold them (it only has start-up lines and browser messages, and is overwritten at every start). To keep them when running the e2e tests, start the server yourself in one PowerShell terminal, writing its output outside the repo: `npm run dev *> $env:TEMP\ust-dev.log`; run `npm run test:e2e` in a second terminal (Playwright reuses the running server); then search the log, for example `Select-String $env:TEMP\ust-dev.log -Pattern "sign-in|account lookup|account status|session check|rate limiter"`.
- A form that awaits a Server Action which redirects (sign-in, register, reset password, add/edit address) gets a **rejection** from Next on success: that is the navigation under way. The forms ignore it (`isRedirectError`, `src/components/forms/is-redirect-error.ts`); treating it as an error showed "Something went wrong" on every successful sign-in. Any new form that calls a redirecting action inside try/catch must do the same.
- The account pages are blocking (`export const instant = false`, as in the layout), not streamed with a `loading.tsx`: a Suspense boundary above a page sends status 200 before `notFound()` is decided. Even so, `/account/addresses/[id]/edit` is built as partially prerendered, so a production build answers **200** with the not-found page for an address that is not yours or does not exist (`npm run dev` answers 404). No address data is in that response; the e2e test checks the not-found content and the absence of the other customer's data, not the status.
- A signed-in user whose profile row is missing or unreadable is an **error** ("Could not load the account"), never "disabled": only an explicit `profiles.disabled_at` disables an account.
- Each test file gets its own pretend visitor address through an `x-forwarded-for` header, so the login limit does not carry over between runs.

## Known limitations

- Registering and resetting need real emails: with the built-in mailer, expect delays and low limits. These two flows are covered by unit tests and by code review, not by an automated end-to-end test (no test mailbox).
- No password change, email change or "resend confirmation" screens yet (registering again with the same address re-sends the confirmation email). Social and phone sign-in are out of scope.
- A mail scanner that opens the email link before the customer does can use up the one-time link; the customer then requests a new one.
- The reset-password cookie and the app's limits cannot stop direct calls to Supabase Auth (see the setup above).
- The header still shows a plain "Account" link (no signed-in name), because the storefront shell is prerendered.
- Admin is a shell only (name and role); management screens arrive in Phase 6.
