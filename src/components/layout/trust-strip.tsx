import { Banknote, RotateCcw, Truck, Wrench } from "lucide-react";
import { formatPKR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { StoreSettings } from "@/types/store";

/** Service points derived from store settings only; no claims beyond what settings enable. */
export function TrustStrip({ settings, className }: { settings: StoreSettings; className?: string }) {
  const items = [
    settings.payment_methods.some((m) => m.id === "cod" && m.enabled) && {
      icon: Banknote,
      title: "Cash on delivery",
      text: "Pay when your order arrives",
    },
    {
      icon: Truck,
      title: "Delivery across Pakistan",
      text:
        settings.free_delivery_threshold_paisa !== null
          ? `Free over ${formatPKR(settings.free_delivery_threshold_paisa)}`
          : "Courier or cargo terminal",
    },
    {
      icon: Wrench,
      title: "Help finding parts",
      text: "Ask us on WhatsApp",
    },
    settings.return_period_days !== null && {
      icon: RotateCcw,
      title: `${settings.return_period_days}-day returns`,
      text: "See return terms",
    },
  ].filter((i): i is Exclude<typeof i, false> => Boolean(i));

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
