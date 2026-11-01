import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CategoryIcon } from "@/components/layout/category-icon";
import type { Category } from "@/types/catalog";

export function SubcategoryCard({ category, href }: { category: Category; href: string }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-card transition-shadow hover:border-primary hover:shadow-card-hover">
      {category.image_path ? (
        <Image
          src={category.image_path}
          alt={category.name}
          width={640}
          height={400}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="aspect-[16/10] w-full bg-surface-container object-cover"
        />
      ) : (
        // No category photo can be uploaded yet, so the card shows the category's icon, not a "coming soon" drawing.
        <div className="flex aspect-[16/6] w-full items-center justify-center bg-surface-container text-primary" aria-hidden="true">
          <CategoryIcon name={category.icon} className="size-12" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="text-headline-sm">{category.name}</h3>
        {category.description && <p className="line-clamp-2 text-body-md text-muted-foreground">{category.description}</p>}
        <Link
          href={href}
          className="mt-auto inline-flex min-h-11 items-center gap-1 self-end pt-2 text-label-lg text-primary hover:underline"
        >
          Shop {category.name}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
