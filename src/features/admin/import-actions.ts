"use server";

import { createHash } from "node:crypto";
import { AdminError, dbCheck, runAdminAction } from "./action";
import { loadImportContext } from "./queries";
import type { AdminResult } from "./types";
import { MAX_CSV_BYTES, parseCsv } from "@/features/catalog/csv/parse";
import { validateImport, type ImportReport } from "@/features/catalog/csv/validate";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

// Two steps. 1) validateImportAction reads the file and reports every problem; nothing is written.
// 2) applyImportAction reads the same file again, validates it again against the catalogue as it is now,
// and applies it with import_catalog(): all rows or none, in one database transaction.

export type ImportCheck = {
  ok: boolean;
  /** Fingerprint of the file that was checked: the apply step refuses a different file. */
  hash: string;
  fileErrors: string[];
  fileWarnings: string[];
  counts: ImportReport["counts"];
  /** Rows with a problem or a warning (at most 200 are listed). */
  issues: { line: number; sku: string; errors: string[]; warnings: string[] }[];
  issueCount: number;
};

async function readFile(form: FormData): Promise<{ text: string; hash: string; name: string }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new AdminError("Choose a CSV file first.");
  if (file.size > MAX_CSV_BYTES) throw new AdminError("That file is larger than 2 MB. Split it into smaller files.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AdminError("The file is not UTF-8 text. In Excel, save it as CSV UTF-8.");
  }
  return { text, hash: createHash("sha256").update(bytes).digest("hex"), name: file.name.slice(0, 80) };
}

async function check(form: FormData, canSetCost: boolean) {
  const file = await readFile(form);
  const parsed = parseCsv(file.text);
  if (parsed.error) throw new AdminError(parsed.error);
  const supabase = await createClient();
  const ctx = await loadImportContext(supabase, canSetCost);
  return { file, report: validateImport(parsed.rows, ctx), supabase };
}

/** Step 1. Reads and checks the file, writes nothing. */
export async function validateImportAction(form: FormData): Promise<AdminResult<ImportCheck>> {
  const user = await requireStaff({ next: "/admin/import-export" });
  try {
    const { file, report } = await check(form, user.role === "admin");
    const issues = report.rows.filter((r) => r.errors.length > 0 || r.warnings.length > 0);
    return {
      ok: true,
      data: {
        ok: report.ok && report.fileErrors.length === 0,
        hash: file.hash,
        fileErrors: report.fileErrors,
        fileWarnings: report.fileWarnings,
        counts: report.counts,
        issues: issues.slice(0, 200).map(({ line, sku, errors, warnings }) => ({ line, sku, errors, warnings })),
        issueCount: issues.length,
      },
    };
  } catch (error) {
    if (error instanceof AdminError) return { ok: false, message: error.message };
    console.error("admin: import check failed", error);
    return { ok: false, message: "The file could not be checked. Please try again." };
  }
}

/** Step 2. Applies the file that step 1 checked, or nothing. */
export async function applyImportAction(form: FormData): Promise<AdminResult<{ products: number; variants: number }>> {
  return runAdminAction({
    next: "/admin/import-export",
    schema: z.object({ hash: z.string().regex(/^[0-9a-f]{64}$/) }),
    input: { hash: String(form.get("hash") ?? "") },
    revalidate: ["products", "categories"],
    async run({ hash }, { supabase, user }) {
      const { file, report } = await check(form, user.role === "admin");
      if (file.hash !== hash) throw new AdminError("This is not the file that was checked. Check it again.");
      if (!report.ok || report.fileErrors.length > 0) throw new AdminError("The file has problems. Nothing was imported. Check it again.");
      const result = dbCheck(await supabase.rpc("import_catalog", { p_products: report.products, p_label: file.name }), "import catalog") as {
        products_new: number;
        products_updated: number;
        variants_new: number;
        variants_updated: number;
      };
      const products = result.products_new + result.products_updated;
      const variants = result.variants_new + result.variants_updated;
      return {
        message: `Imported ${variants} variant${variants === 1 ? "" : "s"} in ${products} product${products === 1 ? "" : "s"} (${result.products_new} new product${result.products_new === 1 ? "" : "s"}).`,
        data: { products, variants },
      };
    },
  });
}
