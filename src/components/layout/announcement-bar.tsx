import { Clock, Phone } from "lucide-react";
import { telHref } from "@/lib/contact";
import type { StoreSettings } from "@/types/store";

export function AnnouncementBar({ settings }: { settings: StoreSettings }) {
  return (
    <div className="bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-page items-center justify-between gap-4 px-margin py-1.5 text-label-md lg:px-margin-desktop">
        {settings.announcement_text && <p>{settings.announcement_text}</p>}
        <div className="ml-auto hidden items-center gap-4 md:flex">
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
