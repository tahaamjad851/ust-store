import { Banknote, RotateCcw, Truck, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { orList } from "@/lib/store-text";
import type { StoreSettings } from "@/types/store";

/**
 * Service points derived from store settings only; no claim beyond what the settings enable. Each point appears
 * only when its data exists (a delivery method, a WhatsApp number, an exchange text). Renders nothing otherwise.
 */
export function TrustStrip({ settings, className }: { settings: StoreSettings; className?: string }) {
  const delivery = orList(settings.delivery_methods.map((m) => m.name));
  const items = [
    settings.payment_methods.some((m) => m.id === "cod" && m.enabled) && {
      icon: Banknote,
      title: "Cash on delivery",
      text: "Pay when your order arrives",
    },
    delivery !== "" && {
      icon: Truck,
      title: "Delivery",
      text: delivery,
    },
    settings.whatsapp_number.replace(/\D/g, "") !== "" && {
      icon: Wrench,
      title: "Help finding parts",
      text: "Ask us on WhatsApp",
    },
    settings.return_policy_note.trim() !== "" && {
      icon: RotateCcw,
      title: "Exchange policy",
      text: settings.return_policy_note,
    },
  ].filter((i): i is Exclude<typeof i, false | ""> => Boolean(i));

  if (items.length === 0) return null;
  return (
    <ul className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
      {items.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
          <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-label-lg">{title}</p>
            <p className="text-body-sm text-muted-foreground">{text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
