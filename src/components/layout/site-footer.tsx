import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone, Tractor } from "lucide-react";
import { telHref, whatsappHref } from "@/lib/contact";
import type { Category } from "@/types/catalog";
import type { StoreSettings } from "@/types/store";

const heading = "font-display text-headline-sm text-footer-foreground";
const link = "text-body-md text-footer-muted hover:text-footer-foreground hover:underline";

export function SiteFooter({ settings, categories }: { settings: StoreSettings; categories: Category[] }) {
  return (
    <footer className="bg-footer pb-20 text-footer-foreground lg:pb-0">
      <div className="mx-auto grid max-w-page gap-8 px-margin py-10 sm:grid-cols-2 lg:grid-cols-4 lg:px-margin-desktop">
        <div className="space-y-3">
          <p className="flex items-center gap-2 font-display text-headline-sm">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary">
              <Tractor className="size-5" aria-hidden="true" />
            </span>
            {settings.business_name}
          </p>
          <p className="text-body-md text-footer-muted">
            {settings.tagline}. {settings.value_statement}.
          </p>
        </div>

        <nav aria-labelledby="footer-shop">
          <h2 id="footer-shop" className={heading}>
            Shop
          </h2>
          <ul className="mt-3 space-y-2">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/categories/${c.slug}`} className={link}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-service">
          <h2 id="footer-service" className={heading}>
            Customer service
          </h2>
          <ul className="mt-3 space-y-2">
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
            <li>
              <a href={whatsappHref(settings.whatsapp_number)} target="_blank" rel="noopener noreferrer" className={link}>
                Ask on WhatsApp<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className={heading}>Contact</h2>
          <address className="mt-3 space-y-3 text-body-md text-footer-muted not-italic">
            <p className="flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {settings.address_line}, {settings.city}, {settings.province}
              </span>
            </p>
            <p className="flex gap-2">
              <Phone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="tabular">
                <a href={telHref(settings.phone_primary)} className="hover:underline">
                  {settings.phone_primary}
                </a>
                {settings.phone_secondary && (
                  <>
                    {" / "}
                    <a href={telHref(settings.phone_secondary)} className="hover:underline">
                      {settings.phone_secondary}
                    </a>
                  </>
                )}
              </span>
            </p>
            <p className="flex gap-2">
              <Mail className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <a href={`mailto:${settings.email}`} className="break-all hover:underline">
                {settings.email}
              </a>
            </p>
            <p className="flex gap-2">
              <MessageCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{settings.business_hours}</span>
            </p>
          </address>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-page px-margin py-4 text-body-sm text-footer-muted lg:px-margin-desktop">
          © {settings.business_name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
