import { formatPKRExact } from "@/lib/pricing/money";
import type { PriceChangeRow } from "@/features/admin/types";

const SOURCE: Record<PriceChangeRow["source"], string> = {
  daily_prices: "Daily prices",
  csv_import: "CSV import",
  direct: "Product page",
};

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" });

function Amounts({ regular, sale }: { regular: number; sale: number | null }) {
  return (
    <span className="tabular">
      {formatPKRExact(regular)}
      {sale !== null && <span className="text-muted-foreground"> (sale {formatPKRExact(sale)})</span>}
    </span>
  );
}

/** Price changes, newest first. Times are shown in Pakistan time. */
export function PriceHistory({ changes }: { changes: PriceChangeRow[] }) {
  if (changes.length === 0) return <p className="text-body-md text-muted-foreground">No price has been changed yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-body-md">
        <thead>
          <tr className="border-b border-border text-label-md uppercase text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">When</th>
            <th scope="col" className="py-2 pr-3 font-medium">Who</th>
            <th scope="col" className="py-2 pr-3 font-medium">Product</th>
            <th scope="col" className="py-2 pr-3 font-medium">Old price</th>
            <th scope="col" className="py-2 pr-3 font-medium">New price</th>
            <th scope="col" className="py-2 font-medium">From</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {changes.map((c) => (
            <tr key={c.id}>
              <td className="py-2 pr-3 whitespace-nowrap">{when.format(new Date(c.created_at))}</td>
              <td className="py-2 pr-3">{c.changed_by_name ?? "System"}</td>
              <td className="py-2 pr-3">
                <span className="block break-words">{c.product_name}</span>
                <span className="font-mono text-label-sm text-muted-foreground">{c.sku}</span>
              </td>
              <td className="py-2 pr-3"><Amounts regular={c.old_regular_paisa} sale={c.old_sale_paisa} /></td>
              <td className="py-2 pr-3"><Amounts regular={c.new_regular_paisa} sale={c.new_sale_paisa} /></td>
              <td className="py-2">{SOURCE[c.source]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
