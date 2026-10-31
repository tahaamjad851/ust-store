"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileCheck2, Loader2, Upload } from "lucide-react";
import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { applyImportAction, validateImportAction, type ImportCheck } from "@/features/admin/import-actions";

/** Step 1: check the file (nothing is written). Step 2: apply it, only if the check found no problem. */
export function ImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportCheck | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<"check" | "apply" | null>(null);

  const formFor = (extra?: Record<string, string>) => {
    const form = new FormData();
    if (file) form.set("file", file);
    for (const [k, v] of Object.entries(extra ?? {})) form.set(k, v);
    return form;
  };

  async function runCheck() {
    if (!file) return;
    setBusy("check");
    setMessage(null);
    setReport(null);
    try {
      const result = await validateImportAction(formFor());
      if (result.ok && result.data) setReport(result.data);
      else setMessage({ tone: "error", text: result.message ?? "The file could not be checked." });
    } catch {
      setMessage({ tone: "error", text: "The file could not be checked. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!file || !report) return;
    setBusy("apply");
    try {
      const result = await applyImportAction(formFor({ hash: report.hash }));
      if (result.ok) {
        setMessage({ tone: "success", text: result.message ?? "Imported." });
        setReport(null);
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
      } else setMessage({ tone: "error", text: result.message ?? "Nothing was imported." });
    } catch {
      setMessage({ tone: "error", text: "Nothing was imported. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  const c = report?.counts;
  return (
    <div className="space-y-4">
      <Field id="csv-file" label="CSV file" hint="Up to 2 MB and 5,000 rows. Save from Excel as CSV UTF-8.">
        <input
          ref={fileRef}
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-body-md file:mr-3 file:h-11 file:rounded-md file:border file:border-border file:bg-background file:px-4 file:text-sm file:font-medium"
          aria-describedby="csv-file-hint"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setReport(null);
            setMessage(null);
          }}
        />
      </Field>
      <Button type="button" className="h-11" disabled={!file || busy !== null} onClick={() => void runCheck()}>
        {busy === "check" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileCheck2 className="size-4" aria-hidden="true" />}
        Check the file
      </Button>
      <div aria-live="polite" className="empty:hidden">
        {message && <FormAlert tone={message.tone}>{message.text}</FormAlert>}
      </div>

      {report && (
        <div className="space-y-3 rounded-lg border border-border p-4" data-testid="import-report">
          <h3 className="text-headline-sm">{report.ok ? "The file is ready to import" : "The file has problems"}</h3>
          {report.fileErrors.map((e) => (
            <p key={e} className="text-body-md text-destructive">{e}</p>
          ))}
          {report.fileWarnings.map((e) => (
            <p key={e} className="text-body-md text-muted-foreground">{e}</p>
          ))}
          {c && (
            <p className="text-body-md">
              {c.rows} row{c.rows === 1 ? "" : "s"} read: {c.productsNew} new product{c.productsNew === 1 ? "" : "s"}, {c.productsUpdated} product{c.productsUpdated === 1 ? "" : "s"} updated,{" "}
              {c.variantsNew} new variant{c.variantsNew === 1 ? "" : "s"}, {c.variantsUpdated} variant{c.variantsUpdated === 1 ? "" : "s"} updated.
            </p>
          )}
          {report.issues.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-body-md">
                <thead>
                  <tr className="border-b border-border text-label-md uppercase text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">Line</th>
                    <th scope="col" className="py-2 pr-3 font-medium">SKU</th>
                    <th scope="col" className="py-2 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.issues.map((i) => (
                    <tr key={i.line}>
                      <td className="py-2 pr-3 tabular">{i.line}</td>
                      <td className="py-2 pr-3 font-mono break-all">{i.sku || "—"}</td>
                      <td className="py-2">
                        {i.errors.map((e) => (
                          <p key={e} className="text-destructive">{e}</p>
                        ))}
                        {i.warnings.map((w) => (
                          <p key={w} className="text-muted-foreground">{w}</p>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.issueCount > report.issues.length && <p className="mt-2 text-body-sm text-muted-foreground">Showing the first {report.issues.length} of {report.issueCount} rows with a problem.</p>}
            </div>
          )}
          {report.ok ? (
            <div className="space-y-2">
              <p className="flex items-start gap-2 text-body-md">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                Nothing has been changed yet. Importing saves every row together, or none at all.
              </p>
              <Button type="button" className="h-11" disabled={busy !== null} onClick={() => void apply()}>
                {busy === "apply" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
                Import these rows
              </Button>
            </div>
          ) : (
            <p className="text-body-md text-muted-foreground">Nothing can be imported until every problem is fixed. Fix the file and check it again.</p>
          )}
        </div>
      )}
    </div>
  );
}
