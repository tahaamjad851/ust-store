// Builds the SQL for a NEW, EMPTY Supabase project from supabase/migrations/, to be pasted into the SQL Editor.
// Pure functions (no file or database access) so they can be unit-tested; scripts/build-setup-sql.mjs reads and
// writes the files. Only erasable TypeScript here: Node 24 runs this file directly.
//
// The rules the output follows, and why:
//   * Each part is ONE transaction (begin ... commit). The first error aborts it and everything in it is rolled
//     back, including the schema_migrations rows, so a version can never be recorded for something that did not
//     apply.
//   * A migration's version is recorded in the same part, right after its own statements.
//   * Parts are applied in order. A part refuses to run if an earlier part is not recorded, if it is already
//     recorded, and (the first part) if the project is not empty.
//   * The last part ends with the neutral seed rows and a schema check that raises on anything missing.
//   * Nothing from supabase/seed.sql (demo products, categories, contact details) is ever included.

export type Migration = { file: string; version: string; name: string; sql: string };
export type Skipped = { migration: Migration; reason: string };

export type Part = { index: number; total: number; migrations: Migration[]; first: boolean; last: boolean };

const FILE_PATTERN = /^(\d{14})_([a-z0-9_]+)\.sql$/;
/** A migration that is applied alone, so a failure there cannot take the others with it. */
const ISOLATED = ["storage"];
export const DEFAULT_MAX_PART_BYTES = 100_000;

/** Objects a 3A repair migration exists to create. If an earlier migration already creates them the repair is redundant. */
const REPAIR_MARKERS = [
  "delivery_charge_note",
  "return_policy_note",
  "create function public.catalog_search(",
  "create function public.stock_availability(",
];

export function parseMigration(file: string, sql: string): Migration {
  const match = FILE_PATTERN.exec(file);
  if (!match) throw new Error(`Migration file name "${file}" does not look like <14 digits>_<name>.sql`);
  const normalised = sql.replace(/\r\n/g, "\n");
  const control = /^\s*(begin|commit|rollback|start\s+transaction)\s*;\s*$/im.exec(normalised);
  if (control) {
    throw new Error(`${file} contains "${control[1]};". The generator wraps every part in its own transaction; a migration must not.`);
  }
  return { file, version: match[1], name: match[2], sql: normalised.trimEnd() + "\n" };
}

export function sortMigrations(list: Migration[]): Migration[] {
  const sorted = [...list].sort((a, b) => a.version.localeCompare(b.version));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].version === sorted[i - 1].version) throw new Error(`Two migrations share the version ${sorted[i].version}`);
  }
  return sorted;
}

/** Drops a repair migration when the migrations before it already create everything it would. */
export function dropRedundantRepairs(list: Migration[], includeRepairs = false): { kept: Migration[]; skipped: Skipped[] } {
  const kept: Migration[] = [];
  const skipped: Skipped[] = [];
  for (const m of list) {
    if (m.name.endsWith("_repair") && !includeRepairs) {
      const earlier = kept.map((k) => k.sql.toLowerCase()).join("\n");
      const missing = REPAIR_MARKERS.filter((marker) => !earlier.includes(marker));
      if (missing.length === 0) {
        skipped.push({ migration: m, reason: "the migrations before it already create everything it repairs" });
        continue;
      }
      // Not redundant: keep it, the chain really needs it.
    }
    kept.push(m);
  }
  return { kept, skipped };
}

export function splitIntoParts(list: Migration[], maxBytes = DEFAULT_MAX_PART_BYTES): Part[] {
  const groups: Migration[][] = [];
  let current: Migration[] = [];
  let size = 0;
  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
    size = 0;
  };
  for (const m of list) {
    if (ISOLATED.includes(m.name)) {
      flush();
      groups.push([m]);
      continue;
    }
    if (current.length && size + m.sql.length > maxBytes) flush();
    current.push(m);
    size += m.sql.length;
  }
  flush();
  return groups.map((migrations, i) => ({ index: i + 1, total: groups.length, migrations, first: i === 0, last: i === groups.length - 1 }));
}

const q = (text: string) => text.replace(/'/g, "''");
const versionList = (list: Migration[]) => list.map((m) => `'${m.version}'`).join(", ");

const PREPARE_MIGRATION_TABLE = `-- The table the Supabase CLI uses, created the way the CLI creates it, so \`supabase db push\` keeps working later.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;
`;

function guards(part: Part, allBefore: Migration[]): string {
  const out: string[] = [];
  if (part.first) {
    out.push(`-- Guard: this must be a new, empty project.
do $guard$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public') then
    raise exception 'This project already has tables in the public schema. This setup is for a NEW, EMPTY project only. Nothing was changed.';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations) then
    raise exception 'This project already has migrations recorded. This setup is for a NEW, EMPTY project only. Nothing was changed.';
  end if;
end;
$guard$;
`);
  } else {
    out.push(`-- Guard: the earlier parts must have been run, and this one must not have been.
do $guard$
begin
  if (select count(*) from supabase_migrations.schema_migrations where version in (${versionList(allBefore)})) <> ${allBefore.length} then
    raise exception 'Run the earlier parts first, in order (part ${part.index - 1} of ${part.total} is not complete). Nothing was changed.';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version in (${versionList(part.migrations)})) then
    raise exception 'Part ${part.index} of ${part.total} has already been run. Nothing was changed.';
  end if;
end;
$guard$;
`);
  }
  return out.join("\n");
}

export type SeedAndCheck = { seedSql: string; checkDoBlock: string };

export function renderPart(part: Part, allBefore: Migration[], extra: SeedAndCheck, meta: { generatedFor: string }): string {
  const lines: string[] = [];
  lines.push(`-- Production setup, part ${part.index} of ${part.total}. GENERATED by scripts/build-setup-sql.mjs: do not edit by hand.`);
  lines.push(`-- ${meta.generatedFor}`);
  lines.push(`-- Contains: ${part.migrations.map((m) => m.file).join(", ")}${part.last ? ", the neutral seed rows and the final schema check" : ""}.`);
  lines.push("--");
  lines.push("-- Paste ALL of this into the SQL Editor of the NEW project and run it once. It is a single transaction:");
  lines.push("-- if anything fails, everything in this part is rolled back and NOTHING is recorded. Expect: Success. No rows returned.");
  lines.push("-- If it fails, copy the whole error message, do not run the next part, and do not run this one again until it is fixed.");
  lines.push("");
  lines.push("begin;");
  lines.push("");
  if (part.first) lines.push(PREPARE_MIGRATION_TABLE);
  lines.push(guards(part, allBefore));
  for (const m of part.migrations) {
    lines.push(`-- ===========================================================================`);
    lines.push(`-- ${m.file}`);
    lines.push(`-- ===========================================================================`);
    lines.push(m.sql);
    lines.push(`-- Recorded in the same transaction: it exists only if everything above succeeded.`);
    lines.push(`insert into supabase_migrations.schema_migrations (version, name) values ('${m.version}', '${q(m.name)}');`);
    lines.push("");
  }
  if (part.last) {
    lines.push(extra.seedSql);
    lines.push(extra.checkDoBlock);
  }
  lines.push("commit;");
  return lines.join("\n") + "\n";
}

/** Rows that must exist for the app to start. Neutral: no contact details, no demo products or categories. */
export const NEUTRAL_SEED_SQL = `-- ===========================================================================
-- Neutral seed rows (the app needs exactly one row in each; the migrations create them, this makes sure).
-- No contact details, no products, no categories: the owner fills those in under Admin > Settings and Admin > Products.
-- ===========================================================================
insert into public.store_settings (business_name) values ('Umar Siddique Traders') on conflict (id) do nothing;
insert into public.store_private_settings default values on conflict (id) do nothing;
`;

/**
 * Turns supabase/checks/schema_check.sql (a read-only SELECT that lists what is missing) into a DO block that
 * RAISES when anything is missing, so it can sit inside the last transaction and roll it back.
 */
export function schemaCheckToDoBlock(checkSql: string): string {
  const start = checkSql.indexOf("with expected(");
  const orderBy = checkSql.lastIndexOf("order by 1, 2, 3;");
  if (start < 0 || orderBy < start) throw new Error("schema_check.sql does not have the expected shape (with expected(...) ... order by 1, 2, 3;)");
  const query = checkSql.slice(start, orderBy).trimEnd();
  return `-- ===========================================================================
-- Final schema check: every table, column, function, policy, trigger, extension and bucket the migrations
-- create must exist, RLS must be on everywhere, and anon must run nothing outside the allowlist. If not, this
-- raises and the WHOLE part is rolled back.
-- ===========================================================================
do $check$
declare
  v_problems text;
begin
  select string_agg(problem || ': ' || detail, E'\\n' order by problem, detail) into v_problems
    from (
${query.replace(/^/gm, "      ")}
    ) as problems;
  if v_problems is not null then
    raise exception E'The schema check found problems, so nothing was kept:\\n%', v_problems;
  end if;
end;
$check$;
`;
}

/** Reads the migration the check file says it was generated through. */
export function checkGeneratedThrough(checkSql: string): string | null {
  return /^-- generated-through: (\d{14})\s*$/m.exec(checkSql)?.[1] ?? null;
}

/** A standalone read-only copy of the check, for the SQL Editor. */
export function standaloneCheck(checkSql: string): string {
  return checkSql;
}

export function firstAdminSql(): string {
  return `-- Makes ONE existing account the administrator. Run it once, after you created your own account in the Supabase
-- dashboard (Authentication > Users > Add user) with a strong password and your real email.
-- 1. Replace the email below (keep the quotes). 2. Run. Expect: one row with role = admin.
-- It stops with an error if the email is still the placeholder or no account has that email.
do $first_admin$
declare
  v_email constant text := 'REPLACE-WITH-YOUR-EMAIL@example.com';
  v_id uuid;
begin
  if v_email = 'REPLACE-WITH-YOUR-EMAIL@example.com' then
    raise exception 'Replace the placeholder email with your own first.';
  end if;
  select id into v_id from auth.users where lower(email) = lower(v_email);
  if v_id is null then
    raise exception 'No account with the email % exists. Create it in Authentication > Users first.', v_email;
  end if;
  insert into public.user_roles (user_id, role) values (v_id, 'admin')
  on conflict (user_id) do update set role = 'admin';
end;
$first_admin$;

select u.email, r.role from public.user_roles r join auth.users u on u.id = r.user_id order by r.created_at;
`;
}

/** Records the storage migration after the policies were created by hand in the dashboard, but only if they are really there. */
export function recordStorageOnlySql(storage: Migration, previous: Migration[]): string {
  return `-- ONLY for the case where part with ${storage.file} FAILED (for example "must be owner of table objects") and you
-- then created the storage policies by hand in the dashboard (Storage > Policies, see docs/PRODUCTION_SETUP.md).
-- It records ${storage.version} only if the buckets and every policy of that migration really exist; otherwise it raises
-- and records nothing. Do not run it after a part that succeeded: that part already recorded the version.
begin;
do $guard$
begin
  if (select count(*) from supabase_migrations.schema_migrations where version in (${versionList(previous)})) <> ${previous.length} then
    raise exception 'The migrations before the storage one are not all recorded. Run the earlier parts first.';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '${storage.version}') then
    raise exception '${storage.version} is already recorded. Nothing to do.';
  end if;
  if (select count(*) from storage.buckets where id in ('product-images', 'payment-proofs')) <> 2 then
    raise exception 'The buckets product-images and payment-proofs do not both exist. Create them as in the migration before recording it.';
  end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
        and policyname in ('product_images_admin_select', 'product_images_admin_insert', 'product_images_admin_update',
                           'product_images_admin_delete', 'payment_proofs_owner_insert', 'payment_proofs_owner_select',
                           'payment_proofs_admin_delete')) <> 7 then
    raise exception 'The 7 storage policies of ${storage.file} do not all exist. Create them first.';
  end if;
end;
$guard$;
insert into supabase_migrations.schema_migrations (version, name) values ('${storage.version}', '${q(storage.name)}');
commit;
`;
}

/**
 * ONE read-only query (the SQL Editor shows only the last result), one row per check, with what is expected and
 * what was found. Every status must be OK.
 */
export function verificationSql(versions: string[]): string {
  const row = (check: string, expected: string, actual: string) =>
    `select '${q(check)}' as item, '${q(expected)}' as expected, (${actual})::text as actual`;
  const rows = [
    row("migrations recorded", String(versions.length), `select count(*) from supabase_migrations.schema_migrations where version in (${versions.map((v) => `'${v}'`).join(", ")})`),
    row("latest version recorded", versions[versions.length - 1], "select max(version) from supabase_migrations.schema_migrations"),
    row("tables without row-level security", "0", "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity"),
    row("extensions pg_trgm and pgcrypto", "2", "select count(*) from pg_extension where extname in ('pg_trgm', 'pgcrypto')"),
    row("storage buckets (product-images public, payment-proofs private)", "payment-proofs:false,product-images:true", "select string_agg(id || ':' || public::text, ',' order by id) from storage.buckets where id in ('product-images', 'payment-proofs')"),
    row("store_settings rows", "1", "select count(*) from public.store_settings"),
    row("free delivery threshold (no free-delivery offer)", "null", "select coalesce(free_delivery_threshold_paisa::text, 'null') from public.store_settings"),
    row("exchange text", "Exchange accepted if the product is not damaged, within 7 days.", "select return_policy_note from public.store_settings"),
    row("delivery note", "Delivery charge confirmed by phone", "select delivery_charge_note from public.store_settings"),
    row("top bar text (empty until you set it)", "", "select announcement_text from public.store_settings"),
    row("price-change confirmation percent", "20", "select price_change_alert_percent from public.store_settings"),
    row("store_private_settings rows", "1", "select count(*) from public.store_private_settings"),
    row("couriers", "7", "select count(*) from public.couriers"),
    row("products (must be empty: no demo data)", "0", "select count(*) from public.products"),
    row("categories (must be empty: no demo data)", "0", "select count(*) from public.categories"),
    row("tractor makes (must be empty)", "0", "select count(*) from public.tractor_makes"),
    row("orders (must be empty)", "0", "select count(*) from public.orders"),
    row("staff or admin accounts (0 until you run first-admin.sql)", "0", "select count(*) from public.user_roles"),
    row("anon can run catalog_search and stock_availability (2 functions)", "2", "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('catalog_search', 'stock_availability') and has_function_privilege('anon', p.oid, 'execute')"),
    row("admin and order functions anon can run", "0", "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('apply_daily_changes', 'import_catalog', 'catalog_reorder', 'set_primary_image', 'adjust_stock', 'set_stock_thresholds', 'place_order', 'set_order_status', 'set_payment_status') and has_function_privilege('anon', p.oid, 'execute')"),
    row("anon can read costs, inventory, price history or orders", "false", "select has_table_privilege('anon', 'public.product_variant_costs', 'select') or has_table_privilege('anon', 'public.inventory', 'select') or has_table_privilege('anon', 'public.price_changes', 'select') or has_table_privilege('anon', 'public.orders', 'select')"),
    row("cost prices readable only by an admin (policy uses is_full_admin)", "true", "select bool_and(qual like '%is_full_admin%') from pg_policies where schemaname = 'public' and tablename = 'product_variant_costs' and cmd = 'SELECT'"),
  ];
  return `-- Read-only. Run AFTER all parts (and, if you want, after first-admin.sql). Changes nothing.
-- One row per check; the status column must say OK on every row. The full structure check is check-schema.sql
-- (it must return no rows); the last part already ran it inside its transaction.
select item, expected, actual, case when actual = expected then 'OK' else 'CHECK' end as status
from (
${rows.map((r) => "  " + r).join("\n  union all\n")}
) c
order by case when actual = expected then 1 else 0 end, item;
`;
}
