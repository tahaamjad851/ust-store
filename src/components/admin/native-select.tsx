import { cn } from "@/lib/utils";

/**
 * A plain <select>: works with every phone keyboard and screen reader, and needs no script. Styled to
 * match the text inputs (44px tall, 16px text on phones so iOS does not zoom).
 */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-body-lg shadow-xs outline-none md:text-body-md",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring",
        "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
