// Builds the SQL for a NEW, EMPTY Supabase project from supabase/migrations/, into supabase/setup/.
//
//   npm run setup:build
//
// Paste the generated files into the project's SQL Editor in the order docs/PRODUCTION_SETUP.md gives. Each part is
// one transaction that records its migrations' versions inside itself, so the first error rolls back everything in
// it and records nothing. See scripts/lib/setup-builder.ts for the rules. Reads files only; touches no database.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkGeneratedThrough,
  dropRedundantRepairs,
  firstAdminSql,
  NEUTRAL_SEED_SQL,
  parseMigration,
  recordStorageOnlySql,
  renderPart,
  schemaCheckToDoBlock,
  sortMigrations,
  splitIntoParts,
  standaloneCheck,
  verificationSql,
} from "./lib/setup-builder.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const migrationsDir = join(root, "supabase", "migrations");
const checkFile = join(root, "supabase", "checks", "schema_check.sql");
const outDir = join(root, option("--out", "supabase/setup"));
const maxBytes = Number(option("--max-part-bytes", "100000"));

const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
const all = sortMigrations(files.map((f) => parseMigration(f, readFileSync(join(migrationsDir, f), "utf8"))));
const { kept, skipped } = dropRedundantRepairs(all, flag("--include-repairs"));

// The in-transaction schema check is generated from supabase/checks/schema_check.sql. It must describe the newest
// migration, or the check would pass on a schema that lacks what a newer migration adds.
const checkSql = readFileSync(checkFile, "utf8").replace(/\r\n/g, "\n");
const through = checkGeneratedThrough(checkSql);
const newest = all[all.length - 1].version;
if (through !== newest) {
  console.error(
    `supabase/checks/schema_check.sql was generated through ${through ?? "an unknown migration"}, but the newest migration is ${newest}.\n` +
      "Regenerate it first: npm run schema-check:generate (see docs/PRODUCTION_SETUP.md, \"When a migration is added\").",
  );
  process.exit(1);
}

const sourceHash = createHash("sha256").update(kept.map((m) => `${m.file}\n${m.sql}`).join("\n")).digest("hex");
const parts = splitIntoParts(kept, maxBytes);
const extra = { seedSql: NEUTRAL_SEED_SQL, checkDoBlock: schemaCheckToDoBlock(checkSql) };
const generatedFor = `Built from ${kept.length} migrations (${kept[0].version} to ${kept[kept.length - 1].version}); source fingerprint ${sourceHash.slice(0, 12)}.`;

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (/\.(sql|json)$/.test(f)) rmSync(join(outDir, f));

const written = [];
const write = (name, text, what) => {
  writeFileSync(join(outDir, name), text.replace(/\r\n/g, "\n"));
  written.push({ file: name, bytes: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex"), what });
};

let before = [];
for (const part of parts) {
  write(`part-${part.index}-of-${part.total}.sql`, renderPart(part, before, extra, { generatedFor }), part.migrations.map((m) => m.file).join(", "));
  before = [...before, ...part.migrations];
}

const storage = kept.find((m) => m.name === "storage");
if (storage) {
  write("optional-record-storage.sql", recordStorageOnlySql(storage, kept.filter((m) => m.version < storage.version)), "only if the storage part failed and the policies were made by hand");
}
write("check-schema.sql", standaloneCheck(checkSql), "read-only: lists anything missing (no rows = complete)");
write("verify.sql", verificationSql(kept.map((m) => m.version)), "read-only: one row per check, all OK");
write("first-admin.sql", firstAdminSql(), "makes your own account the administrator (edit the email first)");
write(
  "manifest.json",
  JSON.stringify(
    {
      generatedBy: "scripts/build-setup-sql.mjs",
      migrations: kept.map((m) => m.file),
      skipped: skipped.map((s) => ({ file: s.migration.file, reason: s.reason })),
      sourceFingerprint: sourceHash,
      files: written,
    },
    null,
    2,
  ),
  "what was built",
);

console.log(`Setup files written to ${outDir}`);
for (const w of written) console.log(`  ${w.file.padEnd(30)} ${String(w.bytes).padStart(7)} bytes  ${w.what}`);
for (const s of skipped) console.log(`Skipped ${s.migration.file}: ${s.reason}.`);
