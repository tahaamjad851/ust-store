// Regenerates supabase/checks/schema_check.sql from the migrations. Run it whenever a migration is added:
//
//   npm install --no-save @electric-sql/pglite      (once; a local Postgres in WebAssembly, not added to package.json)
//   npm run schema-check:generate
//
// It applies every migration to a throwaway local Postgres (with stand-ins for Supabase's auth and storage
// schemas), reads which tables, columns, functions, policies, triggers, extensions and buckets exist, and writes
// them as the "expected" list. Objects that appear only with the Phase 3B migration are tagged 3b. It also
// checks its own output: no rows on the complete schema, and the missing objects named on an older one.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

let PGlite, pg_trgm, pgcrypto;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
  ({ pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm"));
  ({ pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto"));
} catch {
  console.error("Needs @electric-sql/pglite. Run once: npm install --no-save @electric-sql/pglite");
  process.exit(1);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = join(root, "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  grant anon, authenticated, service_role to postgres;
  create schema extensions; create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to anon, authenticated, service_role;
  grant usage on schema extensions to anon, authenticated, service_role;
`;

async function chain(upTo) {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  await db.exec(STUBS);
  for (const f of files) {
    if (upTo && f > upTo) break;
    try {
      await db.exec(readFileSync(join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(`${f}: ${e.message}`);
    }
  }
  return db;
}

async function objects(db) {
  const rows = [];
  const add = async (kind, sql) => (await db.query(sql)).rows.forEach((r) => rows.push(`${kind}\u0000${r.n}`));
  await add("table", "select table_name n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
  await add("column", "select table_name||'.'||column_name n from information_schema.columns where table_schema='public'");
  await add("function", "select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public'");
  await add("policy", "select schemaname||'.'||tablename||'.'||policyname n from pg_policies where schemaname in ('public','storage') and (schemaname='public' or policyname like 'product_images_admin_%' or policyname like 'payment_proofs_%')");
  await add("trigger", "select c.relname||'.'||t.tgname n from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and not t.tgisinternal");
  await add("extension", "select extname n from pg_extension where extname in ('pg_trgm','pgcrypto')");
  await add("bucket", "select id n from storage.buckets");
  return new Set(rows);
}

// "3a" = present once the Phase 3A repair is applied; "3b" = added by the Phase 3B migration.
const repair = files.find((f) => f.includes("catalog_public_repair"));
const threeB = files.find((f) => f.includes("catalog_admin"));
const before3b = repair ?? files[files.indexOf(threeB) - 1];
const a = await objects(await chain(before3b));
const full = await chain();
const b = await objects(full);
const esc = (x) => x.replace(/'/g, "''");
const lines = [...b].sort().map((key) => {
  const [kind, name] = key.split("\u0000");
  return `    ('${a.has(key) ? "3a" : "3b"}', '${kind}', '${esc(name)}')`;
});
const newest = files[files.length - 1].slice(0, 14);

const sql = `-- Read-only. Paste into the SQL Editor of a project and run. It changes nothing.
-- generated-through: ${newest}
--
-- Lists every table, column, function, policy, trigger, extension and storage bucket that the migrations in
-- supabase/migrations/ create, and returns the ones this project is MISSING, plus tables without row-level
-- security and functions that anon can run outside the allowlist. No rows = the project matches.
--
--   since = '3a'  expected once migrations up to the Phase 3A repair (20261031100100) are applied
--   since = '3b'  expected once the Phase 3B migration (20261101100000) is applied too; ignore these rows before 3B
--
-- Generated by scripts/generate-schema-check.mjs from the migrations on a local Postgres; regenerate it when a
-- migration is added. It sees structure only (not seed values) and compares columns by name and functions by name
-- and argument types: it does not detect a changed function body.

with expected(since, kind, name) as (
  values
${lines.join(",\n")}
),
actual(kind, name) as (
  select 'table', table_name::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
  union all select 'column', (table_name || '.' || column_name)::text from information_schema.columns where table_schema = 'public'
  union all select 'function', (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text
              from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'
  union all select 'policy', (schemaname || '.' || tablename || '.' || policyname)::text from pg_policies where schemaname in ('public', 'storage')
  union all select 'trigger', (c.relname || '.' || t.tgname)::text
              from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace s on s.oid = c.relnamespace
             where s.nspname = 'public' and not t.tgisinternal
  union all select 'extension', extname::text from pg_extension
  union all select 'bucket', id::text from storage.buckets
)
select e.since as since, 'MISSING ' || e.kind as problem, e.name as detail
  from expected e
  left join actual a on a.kind = e.kind and a.name = e.name
 where a.name is null
union all
select '-', 'RLS NOT ENABLED', c.relname::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select '-', 'anon CAN EXECUTE (not in the allowlist)', p.oid::regprocedure::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype and has_function_privilege('anon', p.oid, 'execute')
   and p.proname <> all (array['is_admin', 'is_full_admin', 'try_uuid', 'effective_price_paisa', 'stock_availability', 'catalog_search', 'category_is_public'])
order by 1, 2, 3;
`;
mkdirSync(join(root, "supabase", "checks"), { recursive: true });
writeFileSync(join(root, "supabase", "checks", "schema_check.sql"), sql);

const complete = (await full.query(sql)).rows;
const older = await chain(files.find((f) => f.includes("auth_support")));
const missing = (await older.query(sql)).rows;
console.log(`schema_check.sql: ${lines.length} objects (${lines.filter((l) => l.includes("'3b'")).length} added by 3B), generated through ${newest}`);
console.log(`  complete schema reports ${complete.length} problems (must be 0)`);
console.log(`  schema at auth_support reports ${missing.length} missing objects (must be more than 0)`);
if (complete.length !== 0 || missing.length === 0) process.exit(1);
