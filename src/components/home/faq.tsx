import { ChevronDown } from "lucide-react";
import type { StoreSettings } from "@/types/store";

/** DEMO FAQ: answers are built from store settings; final wording to be confirmed with the client. */
export function Faq({ settings }: { settings: StoreSettings }) {
  const cod = settings.payment_methods.find((m) => m.id === "cod" && m.enabled);
  const items = [
    {
      q: "How do I check a part fits my tractor?",
      a: "Use the tractor selector to filter by make and model. If you are unsure, send us your tractor model and a photo of the old part on WhatsApp before ordering.",
    },
    {
      q: "How is my order delivered?",
      a: `We deliver across Pakistan by ${settings.delivery_methods.map((m) => m.name.toLowerCase()).join(" or ")}. ${settings.delivery_charge_note.replace(/\.+$/, "")}.`,
    },
    cod && { q: "Can I pay cash on delivery?", a: cod.description },
    settings.return_policy_note && {
      q: "Can I exchange a part that doesn't fit?",
      a: settings.return_policy_note,
    },
    {
      q: "Do you sell in bulk to workshops and dealers?",
      a: "Yes. Ask us on WhatsApp for a quote on larger orders.",
    },
  ].filter((i): i is { q: string; a: string } => Boolean(i));

  return (
    <div className="mx-auto max-w-3xl divide-y divide-border rounded-lg border border-border bg-card">
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-label-lg [&::-webkit-details-marker]:hidden">
            {item.q}
            <ChevronDown className="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="px-4 pb-4 text-body-md text-muted-foreground">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
