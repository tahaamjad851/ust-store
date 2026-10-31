import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { TractorsManager } from "@/components/admin/tractors-manager";
import { loadTractors } from "@/features/admin/queries";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tractors" };

// Who is signed in is only known for a real request, so the page is never prerendered (see the layout).
export const instant = false;

export default async function TractorsPage() {
  const user = await requireStaff({ next: "/admin/tractors" });
  const { makes, models, compatibilityCounts } = await loadTractors(await createClient());
  return (
    <>
      <PageHeader title="Tractors" description="Makes and models, used for the tractor selector and for saying which tractors a part fits." />
      <TractorsManager makes={makes} models={models} compatibilityCounts={compatibilityCounts} isAdmin={user.role === "admin"} />
    </>
  );
}
