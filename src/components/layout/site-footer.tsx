import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone, Tractor } from "lucide-react";
import { mailtoHref, telLink, whatsappLink } from "@/lib/contact";
import { addressText, joinSentences } from "@/lib/store-text";
import type { Category } from "@/types/catalog";
import type { StoreSettings } from "@/types/store";

const heading = "font-display text-headline-sm text-footer-foreground";
const link = "inline-flex min-h-11 items-center text-body-md text-footer-muted hover:text-footer-foreground hover:underline";

export function SiteFooter({ settings, categories }: { settings: StoreSettings; categories: Category[] }) {
  const mailto = mailtoHref(settings.email);
  const whatsapp = whatsappLink(settings.whatsapp_number);
  const primary = telLink(settings.phone_primary);
  const secondary = settings.phone_secondary ? telLink(settings.phone_secondary) : null;
  const address = addressText(settings);
  const hours = settings.business_hours.trim();
  const about = joinSentences(settings.tagline, settings.value_statement);
  const hasContact = Boolean(address || primary || settings.email.trim() || hours);
  return (
    <footer className="on-dark bg-footer pb-20 text-footer-foreground lg:pb-0">
      <div className="mx-auto grid max-w-page gap-8 px-margin py-10 sm:grid-cols-2 lg:grid-cols-4 lg:px-margin-desktop">
        <div className="space-y-3">
          <p className="flex items-center gap-2 font-display text-headline-sm">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary">
              <Tractor className="size-5" aria-hidden="true" />
            </span>
            {settings.business_name}
          </p>
          {about && <p className="text-body-md text-footer-muted">{about}</p>}
        </div>

        {categories.length > 0 && (
          <nav aria-labelledby="footer-shop">
            <h2 id="footer-shop" className={heading}>
              Shop
            </h2>
            <ul className="mt-1">
              {categories.map((c) => (
                <li key={c.id}>
                  <Link href={`/categories/${c.slug}`} className={link}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <nav aria-labelledby="footer-service">
          <h2 id="footer-service" className={heading}>
            Customer service
          </h2>
          <ul className="mt-1">
            <li>
              <Link href="/cart" className={link}>
                Your cart
              </Link>
            </li>
            <li>
              <Link href="/checkout" className={link}>
                Checkout
              </Link>
            </li>
            {whatsapp && (
              <li>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={link}>
                  Ask on WhatsApp<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            )}
          </ul>
        </nav>

        {hasContact && (
          <div>
            <h2 className={heading}>Contact</h2>
            <address className="mt-3 space-y-3 text-body-md text-footer-muted not-italic">
              {address && (
                <p className="flex gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{address}</span>
                </p>
              )}
              {primary && (
                <p className="flex gap-2">
                  <Phone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span className="tabular">
                    <a href={primary} className="hover:underline">
                      {settings.phone_primary}
                    </a>
                    {secondary && settings.phone_secondary && (
                      <>
                        {" / "}
                        <a href={secondary} className="hover:underline">
                          {settings.phone_secondary}
                        </a>
                      </>
                    )}
                  </span>
                </p>
              )}
              {settings.email.trim() && (
                <p className="flex gap-2">
                  <Mail className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {mailto ? (
                    <a href={mailto} className="break-all hover:underline">
                      {settings.email}
                    </a>
                  ) : (
                    <span className="break-all">{settings.email}</span>
                  )}
                </p>
              )}
              {hours && (
                <p className="flex gap-2">
                  <MessageCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{hours}</span>
                </p>
              )}
            </address>
          </div>
        )}
      </div>
      <div className="border-t border-footer-border">
        <p className="mx-auto max-w-page px-margin py-4 text-body-sm text-footer-muted lg:px-margin-desktop">
          © {settings.business_name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
