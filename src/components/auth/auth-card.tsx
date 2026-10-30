/** Centered card used by every sign-in page. */
export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <h1 className="text-headline-lg-mobile text-brand-deep sm:text-headline-lg">{title}</h1>
        {description && <p className="mt-1 text-body-md text-muted-foreground">{description}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <p className="mt-2 text-center text-body-md text-muted-foreground">{footer}</p>}
    </div>
  );
}

/** Placeholder while a page waits for its search params. */
export function AuthCardSkeleton() {
  return <div className="h-64 animate-pulse rounded-lg bg-surface-low" aria-hidden="true" />;
}
