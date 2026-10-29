import Link from "next/link";
import { CategoryIcon } from "@/components/layout/category-icon";
import type { Category } from "@/types/catalog";

/** Home page category link: a compact chip on phones, an icon tile with description from sm up. */
export function CategoryTile({ category, href }: { category: Category; href: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-card py-1 pr-4 pl-1 whitespace-nowrap shadow-card transition-shadow hover:border-primary hover:shadow-card-hover sm:h-full sm:flex-col sm:items-start sm:gap-3 sm:rounded-lg sm:p-4 sm:whitespace-normal"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-container text-primary sm:size-11 sm:rounded-lg">
        <CategoryIcon name={category.icon} className="size-5 sm:size-6" />
      </span>
      <span>
        <span className="block text-label-lg">{category.name}</span>
        {category.description && (
          <span className="mt-1 hidden text-body-sm text-muted-foreground sm:line-clamp-2">{category.description}</span>
        )}
      </span>
    </Link>
  );
}
