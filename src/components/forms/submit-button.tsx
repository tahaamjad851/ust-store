import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SubmitButton({
  pending,
  children,
  className,
}: {
  pending: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} className={cn("h-11 w-full text-label-lg", className)}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </Button>
  );
}
