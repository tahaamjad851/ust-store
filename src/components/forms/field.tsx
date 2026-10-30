import { Label } from "@/components/ui/label";

/** Same input look as the checkout form: tall touch target, 16px text on phones. */
export const fieldInputClass = "h-11 rounded-lg border-input bg-card text-body-lg md:text-body-md";

/** Attributes that tie an input to its hint and error message for screen readers. */
export function fieldProps(id: string, options: { error?: string; hint?: boolean } = {}) {
  const describedBy = [options.error ? `${id}-error` : null, options.hint ? `${id}-hint` : null].filter(Boolean).join(" ");
  return {
    id,
    "aria-invalid": options.error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  } as const;
}

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Field({ id, label, error, hint, optional, className, children }: FieldProps) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
      <Label htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </Label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-body-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-body-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
