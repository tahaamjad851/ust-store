import Link from "next/link";
import { CategoryIcon } from "@/components/layout/category-icon";
import type { Category } from "@/types/catalog";

/** Compact icon tile used on the home page category grid. */
export function CategoryTile({ category, href }: { category: Category; href: string }) {
  return (
    <Link
      href={href}
      className="flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card transition-shadow hover:border-primary hover:shadow-card-hover"
    >
      <span className="flex size-11 items-center justify-center rounded-lg bg-surface-container text-primary">
        <CategoryIcon name={category.icon} className="size-6" />
      </span>
      <span>
        <span className="block text-label-lg">{category.name}</span>
        {category.description && (
          <span className="mt-1 line-clamp-2 block text-body-sm text-muted-foreground">{category.description}</span>
        )}
      </span>
    </Link>
  );
}
