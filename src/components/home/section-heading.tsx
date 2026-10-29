import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionHeading({
  id,
  title,
  description,
  link,
  inverted = false,
}: {
  id: string;
  title: string;
  description?: string;
  link?: { href: string; label: string };
  inverted?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-headline-lg-mobile lg:text-headline-lg">
          {title}
        </h2>
        {description && (
          <p className={cn("mt-1 text-body-md", inverted ? "text-primary-foreground/85" : "text-muted-foreground")}>
            {description}
          </p>
        )}
      </div>
      {link && (
        <Link
          href={link.href}
          className={cn(
            "inline-flex min-h-11 items-center gap-1 text-label-lg hover:underline",
            inverted ? "text-primary-foreground" : "text-primary",
          )}
        >
          {link.label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
