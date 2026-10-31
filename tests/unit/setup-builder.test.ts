import { describe, expect, it } from "vitest";
import {
  checkGeneratedThrough,
  dropRedundantRepairs,
  NEUTRAL_SEED_SQL,
  parseMigration,
  recordStorageOnlySql,
  renderPart,
  schemaCheckToDoBlock,
  sortMigrations,
  splitIntoParts,
  verificationSql,
} from "../../scripts/lib/setup-builder";

const mig = (version: string, name: string, sql = `-- ${name}\ncreate table t_${name} (id int);\n`) => parseMigration(`${version}_${name}.sql`, sql);

describe("parseMigration", () => {
  it("reads version and name, normalises line endings", () => {
    const m = parseMigration("20261029100000_foundation.sql", "a\r\nb");
    expect(m).toMatchObject({ version: "20261029100000", name: "foundation", sql: "a\nb\n" });
  });
  it("refuses a bad file name", () => {
    expect(() => parseMigration("foundation.sql", "x")).toThrow(/does not look like/);
    expect(() => parseMigration("2026_foundation.sql", "x")).toThrow(/does not look like/);
  });
  it("refuses a migration that controls the transaction itself", () => {
    for (const bad of ["begin;\nselect 1;", "select 1;\n  COMMIT ;", "rollback;", "start transaction;"]) {
      expect(() => parseMigration("20261029100000_x.sql", bad)).toThrow(/own transaction/);
    }
  });
  it("does not mistake plpgsql blocks for transaction control", () => {
    expect(() => parseMigration("20261029100000_x.sql", "create function f() returns void language plpgsql as $$\nbegin\n  null;\nend;\n$$;")).not.toThrow();
  });
});

describe("sortMigrations", () => {
  it("orders by version and refuses duplicates", () => {
    expect(sortMigrations([mig("20261101100000", "b"), mig("20261029100000", "a")]).map((m) => m.name)).toEqual(["a", "b"]);
    expect(() => sortMigrations([mig("20261029100000", "a"), mig("20261029100000", "b")])).toThrow(/share the version/);
  });
});

describe("dropRedundantRepairs", () => {
  const threeA = mig(
    "20261031100000",
    "catalog_public",
    "alter table public.store_settings add column delivery_charge_note text, add column return_policy_note text;\ncreate function public.stock_availability(x uuid[]) returns int as $$ select 1 $$;\ncreate function public.catalog_search(q text) returns int as $$ select 1 $$;",
  );
  const repair = mig("20261031100100", "catalog_public_repair", "-- repair");

  it("skips the repair when the chain before it already has everything", () => {
    const { kept, skipped } = dropRedundantRepairs([threeA, repair]);
    expect(kept.map((m) => m.name)).toEqual(["catalog_public"]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toMatch(/already create/);
  });
  it("keeps the repair when the chain lacks what it repairs", () => {
    const { kept, skipped } = dropRedundantRepairs([mig("20261029100000", "foundation"), repair]);
    expect(kept.map((m) => m.name)).toEqual(["foundation", "catalog_public_repair"]);
    expect(skipped).toEqual([]);
  });
  it("can be forced to keep it", () => {
    expect(dropRedundantRepairs([threeA, repair], true).kept).toHaveLength(2);
  });
  it("never drops an ordinary migration", () => {
    expect(dropRedundantRepairs([threeA, mig("20261101100000", "catalog_admin")]).kept).toHaveLength(2);
  });
});

describe("splitIntoParts", () => {
  const list = ["foundation", "catalog", "inventory", "storage", "hardening"].map((n, i) => mig(`2026102910${String(i).padStart(4, "0")}`, n, "x".repeat(40_000)));
  it("applies the storage migration alone, so its failure cannot take others with it", () => {
    const parts = splitIntoParts(list, 100_000);
    expect(parts.map((p) => p.migrations.map((m) => m.name))).toEqual([["foundation", "catalog"], ["inventory"], ["storage"], ["hardening"]]);
    expect(parts[0]).toMatchObject({ first: true, last: false, index: 1, total: 4 });
    expect(parts[3]).toMatchObject({ first: false, last: true });
  });
  it("keeps everything in order and loses nothing", () => {
    expect(splitIntoParts(list, 100_000).flatMap((p) => p.migrations.map((m) => m.name))).toEqual(list.map((m) => m.name));
  });
  it("puts a small chain in one part", () => {
    expect(splitIntoParts([mig("20261029100000", "a"), mig("20261029100100", "b")], 100_000)).toHaveLength(1);
  });
});

describe("renderPart", () => {
  const list = [mig("20261029100000", "foundation"), mig("20261029100100", "catalog")];
  const extra = { seedSql: NEUTRAL_SEED_SQL, checkDoBlock: "do $check$ begin null; end; $check$;" };
  const first = renderPart(splitIntoParts(list)[0], [], extra, { generatedFor: "test" });

  it("is one transaction", () => {
    expect(first.match(/^begin;$/gm)).toHaveLength(1);
    expect(first.match(/^commit;$/gm)).toHaveLength(1);
    expect(first.indexOf("begin;")).toBeLessThan(first.indexOf("commit;"));
    expect(first.trimEnd().endsWith("commit;")).toBe(true);
  });
  it("records each version right after its own statements, in the same transaction", () => {
    const a = first.indexOf("create table t_foundation");
    const rec1 = first.indexOf("values ('20261029100000', 'foundation')");
    const b = first.indexOf("create table t_catalog");
    const rec2 = first.indexOf("values ('20261029100100', 'catalog')");
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(rec1);
    expect(rec1).toBeLessThan(b);
    expect(b).toBeLessThan(rec2);
    expect(rec2).toBeLessThan(first.indexOf("commit;"));
  });
  it("is a plain insert, so a duplicate version is an error and not silently skipped", () => {
    expect(first).not.toMatch(/on conflict[^;]*schema_migrations/i);
  });
  it("the first part refuses a project that is not empty and creates the migrations table", () => {
    expect(first).toMatch(/NEW, EMPTY project/);
    expect(first).toMatch(/create table if not exists supabase_migrations\.schema_migrations/);
  });
  it("later parts refuse to run out of order or twice", () => {
    const parts = splitIntoParts(list, 10);
    const second = renderPart(parts[1], [list[0]], extra, { generatedFor: "test" });
    expect(second).toMatch(/Run the earlier parts first/);
    expect(second).toMatch(/has already been run/);
    expect(second).toContain("'20261029100000'");
  });
  it("only the last part has the seed and the schema check", () => {
    const parts = splitIntoParts(list, 10);
    const lastPart = renderPart(parts[1], [list[0]], extra, { generatedFor: "test" });
    expect(lastPart).toContain("insert into public.store_settings");
    expect(lastPart).toContain("do $check$");
    const notLast = renderPart(parts[0], [], extra, { generatedFor: "test" });
    expect(notLast).not.toContain("do $check$");
    expect(notLast).not.toContain("insert into public.store_settings");
  });
  it("the seed is neutral: no demo products, categories or contact details", () => {
    const code = NEUTRAL_SEED_SQL.replace(/--.*$/gm, "");
    expect(code).not.toMatch(/insert into public\.(products|categories|tractor_|product_|delivery_methods|shipping_rates)/);
    expect(code).not.toMatch(/phone|whatsapp|address|email/i);
  });
  it("escapes quotes in names", () => {
    const m = { file: "20261029100000_x.sql", version: "20261029100000", name: "it's_odd", sql: "select 1;\n" };
    expect(renderPart(splitIntoParts([m])[0], [], extra, { generatedFor: "t" })).toContain("'it''s_odd'");
  });
});

describe("schema check", () => {
  const check = "-- header\n-- generated-through: 20261101100000\nwith expected(since, kind, name) as (values ('3a','table','x')), actual(kind, name) as (select 'table', 'x')\nselect 1 as since, 'p' as problem, 'd' as detail\norder by 1, 2, 3;\n";
  it("becomes a block that raises, without the order by", () => {
    const block = schemaCheckToDoBlock(check);
    expect(block).toMatch(/^do \$check\$/m);
    expect(block).toContain("raise exception");
    expect(block).toContain("with expected(");
    expect(block).not.toContain("order by 1, 2, 3");
  });
  it("refuses a file of the wrong shape", () => {
    expect(() => schemaCheckToDoBlock("select 1;")).toThrow(/expected shape/);
  });
  it("knows which migration it was generated through", () => {
    expect(checkGeneratedThrough(check)).toBe("20261101100000");
    expect(checkGeneratedThrough("select 1")).toBeNull();
  });
});

describe("the storage fallback and the verification query", () => {
  const storage = mig("20261029100700", "storage");
  const before = [mig("20261029100000", "foundation")];
  it("records the storage version only after checking buckets and all 7 policies, and never twice", () => {
    const sql = recordStorageOnlySql(storage, before);
    expect(sql).toMatch(/begin;[\s\S]*commit;/);
    expect(sql).toContain("<> 7");
    expect(sql).toContain("<> 2");
    expect(sql).toMatch(/already recorded/);
    expect(sql.indexOf("raise exception")).toBeLessThan(sql.lastIndexOf("insert into supabase_migrations"));
  });
  it("verification is one read-only query, one row per check, nothing that writes", () => {
    const sql = verificationSql(["20261029100000", "20261101100000"]);
    expect(sql).not.toMatch(/\b(insert|update|delete|drop|alter|create)\b/i);
    expect(sql).toContain("'2' as expected");
    expect(sql.match(/union all/g)!.length).toBeGreaterThan(15);
  });
});
