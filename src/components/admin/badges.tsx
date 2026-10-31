import { Badge } from "@/components/ui/badge";
import type { ProductStatus, StockLevel } from "@/features/admin/types";
import { cn } from "@/lib/utils";

const STATUS: Record<ProductStatus, { label: string; className: string }> = {
  published: { label: "Published", className: "border-transparent bg-brand-tint text-brand-tint-foreground" },
  draft: { label: "Draft", className: "border-transparent bg-warning-container text-warning-foreground" },
  archived: { label: "Archived", className: "border-border bg-surface-low text-muted-foreground" },
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const s = STATUS[status];
  return <Badge className={cn("font-medium", s.className)}>{s.label}</Badge>;
}

const LEVEL: Record<StockLevel, { label: string; className: string }> = {
  ok: { label: "In stock", className: "border-transparent bg-brand-tint text-brand-tint-foreground" },
  low: { label: "Low stock", className: "border-transparent bg-warning-container text-warning-foreground" },
  out: { label: "Out of stock", className: "border-transparent bg-destructive/10 text-destructive" },
};

export function StockLevelBadge({ level }: { level: StockLevel }) {
  const s = LEVEL[level];
  return <Badge className={cn("font-medium", s.className)}>{s.label}</Badge>;
}

export function ActiveBadge({ active, on = "Active", off = "Hidden" }: { active: boolean; on?: string; off?: string }) {
  return (
    <Badge className={cn("font-medium", active ? "border-transparent bg-brand-tint text-brand-tint-foreground" : "border-border bg-surface-low text-muted-foreground")}>
      {active ? on : off}
    </Badge>
  );
}
