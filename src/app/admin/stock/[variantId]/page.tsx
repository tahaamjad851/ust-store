import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/admin/page-header";
import { loadStockMovements } from "@/features/admin/queries";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation/admin";

export const metadata: Metadata = { title: "Stock history" };

// Who is signed in is only known for a real request, so the page is never prerendered (see the layout).
export const instant = false;

const TYPE: Record<string, string> = {
  receive: "Received",
  return: "Returned to shelf",
  damage: "Damaged or lost",
  adjustment: "Correction",
  reserve: "Reserved by an order",
  release: "Order cancelled",
  sale: "Sold",
};
const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" });

export default async function StockHistoryPage({ params }: PageProps<"/admin/stock/[variantId]">) {
  const { variantId } = await params;
  await requireStaff({ next: `/admin/stock/${variantId}` });
  if (!idSchema.safeParse(variantId).success) notFound();
  const db = await createClient();
  const variant = await db.from("product_variants").select("id,sku,name,product_id").eq("id", variantId).maybeSingle();
  if (!variant.data) notFound();
  const product = await db.from("products").select("name").eq("id", variant.data.product_id).maybeSingle();
  const movements = await loadStockMovements(db, variantId, 100);
  return (
    <>
      <PageHeader
        title={`Stock history: ${product.data?.name ?? ""}${variant.data.name !== "Default" ? `, ${variant.data.name}` : ""}`}
        description={
          <>
            <span className="font-mono">{variant.data.sku}</span> ·{" "}
            <Link href="/admin/stock" className="underline">
              Back to stock
            </Link>
          </>
        }
      />
      <Panel title="Latest 100 movements" id="movements">
        {movements.length === 0 ? (
          <p className="text-body-md text-muted-foreground">No stock has been recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-body-md">
              <thead>
                <tr className="border-b border-border text-label-md uppercase text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">When</th>
                  <th scope="col" className="py-2 pr-3 font-medium">What</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Change</th>
                  <th scope="col" className="py-2 pr-3 font-medium">On hand after</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Who</th>
                  <th scope="col" className="py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">{when.format(new Date(m.created_at))}</td>
                    <td className="py-2 pr-3">{TYPE[m.movement_type] ?? m.movement_type}</td>
                    <td className="py-2 pr-3 tabular">
                      {m.on_hand_delta !== 0 && <span>{m.on_hand_delta > 0 ? "+" : ""}{m.on_hand_delta} on hand</span>}
                      {m.reserved_delta !== 0 && <span className="text-muted-foreground"> {m.reserved_delta > 0 ? "+" : ""}{m.reserved_delta} reserved</span>}
                    </td>
                    <td className="py-2 pr-3 tabular">{m.on_hand_after}</td>
                    <td className="py-2 pr-3">{m.actor_name ?? (m.order_id ? "An order" : "System")}</td>
                    <td className="py-2 break-words">{m.reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
