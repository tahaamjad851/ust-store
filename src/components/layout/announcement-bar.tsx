import { Clock, Phone } from "lucide-react";
import { formatPKR } from "@/lib/pricing";
import { telHref } from "@/lib/contact";
import type { StoreSettings } from "@/types/store";

export function AnnouncementBar({ settings }: { settings: StoreSettings }) {
  const threshold = settings.free_delivery_threshold_paisa;
  return (
    <div className="bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-page items-center justify-between gap-4 px-margin py-1.5 text-label-md lg:px-margin-desktop">
        <p>
          {settings.value_statement}
          {threshold !== null && (
            <span className="hidden sm:inline"> · Free delivery over {formatPKR(threshold)}</span>
          )}
        </p>
        <div className="hidden items-center gap-4 md:flex">
          <a href={telHref(settings.phone_primary)} className="inline-flex items-center gap-1.5 hover:underline">
            <Phone className="size-3.5" aria-hidden="true" />
            <span className="tabular">{settings.phone_primary}</span>
          </a>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" aria-hidden="true" />
            {settings.business_hours}
          </span>
        </div>
      </div>
    </div>
  );
}
