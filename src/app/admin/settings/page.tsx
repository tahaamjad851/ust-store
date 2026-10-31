import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/admin/page-header";
import { CouriersEditor, SettingsForm } from "@/components/admin/settings-forms";
import { loadCouriers, loadNotificationEmails, loadSettings } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

// Who is signed in is only known for a real request, so the page is never prerendered (see the layout).
export const instant = false;

export default async function SettingsPage() {
  await requireAdmin({ next: "/admin/settings" });
  const db = await createClient();
  const [settings, emails, couriers] = await Promise.all([loadSettings(db), loadNotificationEmails(db), loadCouriers(db)]);
  return (
    <>
      <PageHeader title="Settings" description="Your business details, as customers see them. Changes show in the shop straight away." />
      <Panel title="Shop details" id="shop-details">
        <SettingsForm settings={settings} notificationEmails={emails} />
      </Panel>
      <Panel title="Couriers" id="couriers" description="The couriers you send orders with. They are offered when you record a shipment on an order.">
        <CouriersEditor couriers={couriers} />
      </Panel>
    </>
  );
}
