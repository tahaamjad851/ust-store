import { loadExportData } from "@/features/admin/queries";
import { buildExportCsv, buildTemplateCsv } from "@/features/catalog/csv/export";
import { getAuthState } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// CSV download for staff. The session is checked here, not only by the layout: a route handler is not
// rendered through it. Costs are included for administrators only (and the database gives staff none).
export async function GET(request: Request) {
  const state = await getAuthState();
  if (state.status !== "ok") return new Response("Sign in first.", { status: 401, headers: { "cache-control": "no-store" } });
  if (!state.user.role) return new Response("Not allowed.", { status: 403, headers: { "cache-control": "no-store" } });

  const template = new URL(request.url).searchParams.get("template") === "1";
  const body = template ? buildTemplateCsv() : buildExportCsv(await loadExportData(await createClient()), state.user.role === "admin");
  const name = template ? "products-template.csv" : `products-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
