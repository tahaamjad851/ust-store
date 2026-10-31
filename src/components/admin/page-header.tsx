import { cn } from "@/lib/utils";

/** Title row of an admin page: heading, one line of help, and the page's main actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-headline-lg-mobile break-words lg:text-headline-lg">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-body-md text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A bordered white panel; the building block of every admin page. */
export function Panel({
  title,
  description,
  children,
  className,
  id,
}: {
  title?: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={title ? `${id ?? title.toLowerCase().replace(/\W+/g, "-")}-title` : undefined}
      className={cn("rounded-lg border border-border bg-card p-4 shadow-card lg:p-6", className)}
    >
      {title && (
        <div className="mb-4">
          <h2 id={`${id ?? title.toLowerCase().replace(/\W+/g, "-")}-title`} className="text-headline-sm">
            {title}
          </h2>
          {description && <p className="mt-1 text-body-md text-muted-foreground">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}
