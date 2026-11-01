# Production setup (a NEW, EMPTY Supabase project)

How to create the database of a new project from the migrations, safely. It is for a **new, empty project only**: the first part refuses to run on anything else. A project that already has some migrations applied (for example the dev project) is not set up this way; see "If 3A is recorded but missing" in `docs/CATALOG.md`.

**What makes it safe.** The files are generated from `supabase/migrations/` in order, never written by hand. Every file ("part") is **one transaction** and records each migration's version **inside that same transaction**, right after the migration's own statements. If anything fails, the part is rolled back completely and **nothing is recorded**, so the project can never say a migration is applied when it is not. The last part ends with the neutral seed rows and a full schema check that raises (and rolls that part back) if anything is missing. No demo products, categories or contact details are ever included.

Nothing here has been run on a hosted Supabase project yet. It was tested on a local Postgres 17 with stand-ins for Supabase's `auth` and `storage` schemas (see "What was tested" at the end). Run it on a staging project first if you can.

## 0. Before you start

1. Create the Supabase project (dashboard > New project). Choose the region closest to your customers and a **strong database password**; keep it in a password manager. Nothing in this repository ever stores it.
2. Wait until the project is ready. Open **SQL Editor** (left menu).
3. On your computer, in the repository, at the commit you are releasing:

```powershell
npm run setup:build
```

It writes `supabase/setup/` (git-ignored; always rebuilt, never edited by hand) and prints:

```
  part-1-of-5.sql                  82249 bytes  foundation, catalog, inventory, store_settings, customers, orders
  part-2-of-5.sql                  46580 bytes  order_functions
  part-3-of-5.sql                   4583 bytes  storage
  part-4-of-5.sql                  67395 bytes  hardening, auth_support, catalog_public, catalog_admin
  part-5-of-5.sql                 107774 bytes  orders (Phase 4) + neutral seed + final schema check
  optional-record-storage.sql       1925 bytes  only if the storage part failed and the policies were made by hand
  check-schema.sql                 41279 bytes  read-only: lists anything missing (no rows = complete)
  verify.sql                        5196 bytes  read-only: one row per check, all OK
  first-admin.sql                   1118 bytes  makes your own account the administrator (edit the email first)
  manifest.json                     2744 bytes  what was built
Skipped 20261031100100_catalog_public_repair.sql: the migrations before it already create everything it repairs.
```

(The sizes change with the migrations.) The 3A repair file is skipped because the chain from scratch already creates everything it repairs. If a part is too large to paste, rebuild smaller parts: `npm run setup:build -- --max-part-bytes 50000`; the rules are the same.

If the command says `schema_check.sql was generated through …`, a migration was added after the check was generated: run `npm run schema-check:generate` first (see "When a migration is added").

## 1. Apply the parts, in order

For **each** part, in the order `part-1-of-5.sql`, `part-2-of-5.sql`, `part-3-of-5.sql`, `part-4-of-5.sql`, `part-5-of-5.sql`:

1. SQL Editor > **New query**. Open the file in a text editor, select **everything**, copy, paste. Do **not** type or edit anything. Make sure nothing is "selected" in the editor before you press Run (the editor runs only the highlighted text if there is a selection).
2. **Run** once.
3. Expect exactly: **`Success. No rows returned`**.
4. Only then go to the next part.

If a part shows an error: **stop**, copy the **whole** message and send it to me. Do not run the next part and do not run the same part again. Because each part is one transaction, a failed part has changed nothing and recorded nothing, so you can run it again after the cause is fixed.

What the guards say if you get the order wrong (they change nothing):

| Message | Meaning |
|---|---|
| `This project already has tables in the public schema … NEW, EMPTY project only` | Part 1 on a project that is not empty. Stop: this setup is not for that project. |
| `This project already has migrations recorded` | Same. |
| `Run the earlier parts first, in order (part N of 4 is not complete)` | You skipped a part. Run the missing one first. |
| `Part N of 4 has already been run` | You ran it before. Do not run it again. |
| `The schema check found problems, so nothing was kept: …` | Part 4's final check found a missing object; the message lists them. Send it to me. |
| `these functions are executable by anon or authenticated but are not in the allowlist: …` | A function has permissions it must not have; the message lists them. Send it to me. |

### If part 3 (storage) fails with "must be owner of table objects"

Hosted Supabase has been tightening who may create policies on `storage.objects`. Part 3 is on its own so that this cannot affect the others (parts 1 and 2 stay recorded). Then:

1. SQL Editor: run only the `insert into storage.buckets …` statement from `supabase/migrations/20261029100700_storage.sql` (it creates the two buckets; ordinary inserts are allowed).
2. Dashboard > Storage > Policies > `objects`: create the **7 policies** that file lists, with the same names, operations, roles and expressions (`product_images_admin_select/insert/update/delete` and `payment_proofs_owner_insert/owner_select/admin_delete`).
3. Run `optional-record-storage.sql`. It records the storage version **only if** the two buckets and all 7 policies really exist; otherwise it raises and records nothing. Expect `Success. No rows returned`.
4. Continue with part 4.

## 2. Check the result

Both files are read-only.

1. New query: paste `check-schema.sql`, Run. Expect **`Success. No rows returned`**. Any row names something the migrations should have created and the project lacks (or a table without row-level security, or a function `anon` can run that it must not). Part 4 already ran this check inside its transaction, so rows here would be a surprise: send them to me.
2. New query: paste `verify.sql`, Run. Expect these **22 rows, all with `status = OK`** (the editor shows failures first):

| item | expected |
|---|---|
| admin and order functions anon can run | 0 |
| anon can read costs, inventory, price history or orders | false |
| anon can run catalog_search and stock_availability (2 functions) | 2 |
| categories (must be empty: no demo data) | 0 |
| cost prices readable only by an admin (policy uses is_full_admin) | true |
| couriers | 7 |
| delivery note | Delivery charge confirmed by phone |
| exchange text | Exchange accepted if the product is not damaged, within 7 days. |
| extensions pg_trgm and pgcrypto | 2 |
| free delivery threshold (no free-delivery offer) | null |
| latest version recorded | 20261102100000 |
| migrations recorded | 13 |
| orders (must be empty) | 0 |
| price-change confirmation percent | 20 |
| products (must be empty: no demo data) | 0 |
| staff or admin accounts (0 until you run first-admin.sql) | 0 |
| storage buckets (product-images public, payment-proofs private) | payment-proofs:false,product-images:true |
| store_private_settings rows | 1 |
| store_settings rows | 1 |
| tables without row-level security | 0 |
| top bar text (empty until you set it) | (empty) |
| tractor makes (must be empty) | 0 |

3. Run `notify pgrst, 'reload schema';` once, so the API sees the new tables and functions.

Twelve migrations are recorded and the repair is not among them: it was not applied, so it is not recorded. (If you later use `supabase db push`, the repair file would be applied once as a harmless no-op.)

## 3. Auth settings (dashboard > Authentication)

The database does not carry these; the dashboard does. From `docs/AUTH.md`:

1. **Sign In / Providers**: Email provider **on**; **Confirm email on**; **Allow anonymous sign-ins OFF** (the app refuses anonymous sessions); keep "Allow new users to sign up" on (customers register). **Minimum password length 8**, password requirements **letters and digits**, **Secure password change on**. If your plan offers it, turn on **leaked-password protection** and **CAPTCHA** (Turnstile or hCaptcha) for sign-in, sign-up and password recovery. Review the rate limits.
2. **URL Configuration**:
   - **Site URL**: your public address, for example `https://www.your-domain.pk` (https, no trailing slash).
   - **Redirect URLs**: `https://www.your-domain.pk/**` (and the bare domain if it also serves the site). **Do not** add `http://localhost:3000/**` to the production project; keep localhost for your dev project only.
3. **Email Templates** (so links work on any device):
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
4. **SMTP**: the built-in mailer is for testing only (a few emails per hour). Configure **custom SMTP** (for example Resend) before real customers register; without it confirmation and password-reset emails will be delayed or dropped.

`supabase/config.toml` carries the same values for a local stack only; it does not change the hosted project.

## 4. Hosting environment variables

Names only; never commit values. In the hosting provider's environment (not in a file in the repository):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL from Project Settings > API (`https://<ref>.supabase.co`). The production build **stops with an error** if it is missing or not https. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The public key (labelled `anon` / `publishable`). |
| `SUPABASE_SERVICE_ROLE_KEY` | The secret key (labelled `service_role` / `secret`). **Server only: never prefix it with `NEXT_PUBLIC_`, never put it in the browser or in git.** |
| `NEXT_PUBLIC_SITE_URL` | The same public https address as the Site URL above (required in production). |
| `DEMO_CATALOG_NOTICE` | `off` (there is no demo catalogue on this project). |

Do **not** set `DB_TEST_PROJECT_REF` on production, and never run `npm run test:db` or the Playwright admin tests against it: they create users and products. (The database tests refuse to run unless the project is the one named in that variable; leave it out.) Not verified: whether the newer publishable/secret key format works with this app's `@supabase/ssr` session check; test it on staging first.

## 5. Create the first administrator

No account, password or role is in any migration.

1. Dashboard > Authentication > Users > **Add user**. Your real email, a strong password, "Auto confirm user" on.
2. SQL Editor: open `first-admin.sql`, replace `REPLACE-WITH-YOUR-EMAIL@example.com` with that email (keep the quotes), paste, Run. It stops with an error if the email is still the placeholder or no such account exists. Expect **one row: your email and `admin`**.
3. After the site is deployed: sign in at `/login`, then open `/admin`. Staff accounts are added the same way with `'staff'` in place of `'admin'` (see `docs/DATABASE.md`).

## 5b. Delivery methods (once)

No migration creates a delivery method, and there is no admin screen for them: checkout needs at least one, and without it a customer cannot place an order. Run this once in the SQL Editor, with the names and wording the client confirmed (these are examples; change them before you run it). Expect "Success. No rows returned", then the select shows the rows.

```sql
insert into public.delivery_methods (id, name, description, is_pickup, sort_order) values
  ('courier', 'Doorstep courier', 'Delivered to your address by courier.', false, 1),
  ('cargo_terminal', 'Cargo terminal pickup', 'Sent by goods transport to the terminal in your city. You collect it there.', true, 2)
on conflict (id) do nothing;
select id, name, is_pickup, is_active from public.delivery_methods order by sort_order;
```

To change one later, `update public.delivery_methods set name = '...' where id = 'courier';` and then save any value in Admin > Settings (or wait up to 15 minutes) so the shop refreshes.

## 6. First steps in the admin

1. **Settings**: business name, phones, WhatsApp number (typed like 0321 8219594), address, opening hours, the top bar text, the delivery note, the exchange text (the client confirms it), the private email for new orders.
2. **Categories**, **Brands**, **Tractors**, then **Products** (or **Import / export** with the CSV template). Photos are uploaded on each product. Products start as drafts; publish them when ready.
3. Open the shop in a private browser window and check the home page, a category and a product page.

## When a migration is added

1. Add the migration file (never edit an applied one).
2. `npm install --no-save @electric-sql/pglite` (once; a local Postgres in WebAssembly, not added to `package.json`), then `npm run schema-check:generate`. It regenerates `supabase/checks/schema_check.sql` and checks it against the migrations.
3. For an existing project: apply only the new migration as its own generated part or with `supabase db push` (which records it only on success). For a new project: `npm run setup:build` again. The generator refuses to build while the schema check is older than the newest migration.

## What was tested, and what was not

Tested here, on a local Postgres 17 (PGlite) with stand-ins for Supabase's auth and storage schemas, applying the **generated files**:
- parts 1 to 4 on an empty project: all apply, 12 versions recorded, `check-schema.sql` returns no rows, all 22 `verify.sql` rows are OK, and the resulting tables, columns, functions, policies and triggers are identical to running the migrations one by one;
- a different part size (6 parts of at most 50 KB) gives the same result;
- an error in the middle of part 1 leaves nothing behind (no tables, no migrations table, nothing recorded) and the fixed part then applies;
- a failing final schema check rolls part 4 back, names the missing object, and the real part 4 then applies;
- the guards: part 2 first, part 1 twice, part 3 before part 2, part 2 twice, and a project that already has the schema are all refused and change nothing;
- the storage fallback: `optional-record-storage.sql` refuses until the buckets and all 7 policies exist, then records once, and refuses a second time;
- `first-admin.sql` refuses the placeholder and an unknown email, and makes an existing account an administrator;
- no demo data in any generated file; contact fields and the top bar text stay empty.

Not tested: a real hosted Supabase project (the SQL Editor's behaviour on very large pastes, the exact ownership rules for storage policies, whether the `supabase_migrations` table already exists on a brand-new project, the new key formats). The first run on a hosted project is therefore the real test: that is why every part stops at the first error and records nothing.
