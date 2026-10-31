import type { Metadata } from "next";
import { Download } from "lucide-react";
import { ImportPanel } from "@/components/admin/import-panel";
import { PageHeader, Panel } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { CSV_COLUMNS, CSV_HELP } from "@/features/catalog/csv/columns";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Import and export" };

// Who is signed in is only known for a real request, so the page is never prerendered (see the layout).
export const instant = false;

export default async function ImportExportPage() {
  const user = await requireStaff({ next: "/admin/import-export" });
  return (
    <>
      <PageHeader title="Import and export" description="Work on the whole catalogue in a spreadsheet. One row per variant, identified by its SKU." />

      <Panel title="Export" id="export" description={user.role === "admin" ? "Includes cost prices, because you are an administrator." : "Cost prices are not included."}>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="h-11">
            <a href="/admin/export" download>
              <Download className="size-4" aria-hidden="true" />
              Download all products (CSV)
            </a>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <a href="/admin/export?template=1" download>
              <Download className="size-4" aria-hidden="true" />
              Download an empty template
            </a>
          </Button>
        </div>
      </Panel>

      <Panel title="Import" id="import" description="The file is checked first and nothing is saved until you confirm. A SKU that exists is updated; a new SKU is added.">
        <ImportPanel />
      </Panel>

      <Panel title="The columns" id="columns" description="A blank cell keeps what is there now. A single - clears the field. Photos, specifications and the tractors a part fits are edited on the product page.">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,14rem)_1fr]">
          {CSV_COLUMNS.map((c) => (
            <div key={c} className="contents">
              <dt className="font-mono text-label-lg">{c}</dt>
              <dd className="text-body-md text-muted-foreground">{CSV_HELP[c] || "Optional."}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </>
  );
}
