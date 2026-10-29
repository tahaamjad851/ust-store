import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Category } from "@/types/catalog";

export function SubcategoryCard({ category, href }: { category: Category; href: string }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-card transition-shadow hover:border-primary hover:shadow-card-hover">
      <Image
        src={category.image_path ?? "/images/placeholders/category.svg"}
        alt={`${category.name} (placeholder image)`}
        width={640}
        height={400}
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
        className="aspect-[16/10] w-full bg-surface-container object-cover"
      />
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
