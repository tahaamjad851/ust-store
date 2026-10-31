import { ProductImageView } from "./product-image";
import Link from "next/link";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { isPurchasable } from "@/features/inventory/stock";
import { discount } from "@/lib/pricing";
import type { Product } from "@/types/catalog";
import { Price } from "./price";
import { StockIndicator } from "./stock-indicator";

export function ProductCard({ product, fitmentLabel }: { product: Product; fitmentLabel?: string }) {
  const saving = discount(product);
  const href = `/products/${product.slug}`;
  return (
    <article className="flex w-full flex-col rounded-lg border border-border bg-card shadow-card transition-shadow hover:border-primary hover:shadow-card-hover">
      <div className="relative">
        <ProductImageView
          image={product.image}
          width={600}
          height={600}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="aspect-square w-full rounded-t-lg bg-surface-low object-cover"
        />
        <div className="absolute inset-x-2 top-2 flex flex-wrap justify-between gap-1">
          {fitmentLabel ? (
            <span className="rounded-sm bg-brand-tint px-2 py-0.5 text-label-sm text-brand-tint-foreground">
              {fitmentLabel}
            </span>
          ) : (
            <span />
          )}
          {saving && (
            <span className="rounded-sm bg-warning-container px-2 py-0.5 text-label-sm text-warning-foreground">
              −{saving.percent}%
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="font-mono text-label-sm text-muted-foreground">SKU: {product.sku}</p>
        <h3 className="font-sans text-label-lg">
          <Link href={href} className="line-clamp-2 hover:underline">
            {product.name}
          </Link>
        </h3>
        {product.specs.length > 0 && (
          <dl className="hidden space-y-0.5 text-body-sm sm:block">
            {product.specs.slice(0, 2).map((s) => (
              <div key={s.label} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{s.label}</dt>
                <dd className="text-right font-medium tabular">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-auto space-y-2 pt-1">
          <StockIndicator status={product.stock_status} />
          <Price product={product} />
          <AddToCartButton
            variantId={product.variant_id}
            productName={product.name}
            disabled={!isPurchasable(product.stock_status)}
          />
        </div>
      </div>
    </article>
  );
}
