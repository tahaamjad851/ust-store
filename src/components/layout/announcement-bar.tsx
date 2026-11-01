import { Clock, Phone } from "lucide-react";
import { telLink } from "@/lib/contact";
import type { StoreSettings } from "@/types/store";

export function AnnouncementBar({ settings }: { settings: StoreSettings }) {
  const tel = telLink(settings.phone_primary);
  const hours = settings.business_hours.trim();
  // A new shop starts with no top-bar text, phone or hours: then there is no bar at all, not an empty coloured strip.
  if (!settings.announcement_text.trim() && !tel && !hours) return null;
  return (
    <div className="bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-page items-center justify-between gap-4 px-margin py-1.5 text-label-md lg:px-margin-desktop">
        {settings.announcement_text.trim() && <p>{settings.announcement_text}</p>}
        <div className="ml-auto hidden items-center gap-4 md:flex">
          {tel && (
            <a href={tel} className="inline-flex items-center gap-1.5 hover:underline">
              <Phone className="size-3.5" aria-hidden="true" />
              <span className="tabular">{settings.phone_primary}</span>
            </a>
          )}
          {hours && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" aria-hidden="true" />
              {hours}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
