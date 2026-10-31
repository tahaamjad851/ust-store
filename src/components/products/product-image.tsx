import Image from "next/image";
import type { ProductImage } from "@/types/catalog";

// A 1x1 neutral grey PNG. Shown while a photo from Storage loads, so the box keeps its size and colour.
const BLUR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO0tbX9DwAEvAHvGJEUXQAAAABJRU5ErkJggg==";

/**
 * A product photo through next/image. Callers give the box its size with `className` (an aspect
 * ratio) and the intrinsic `width`/`height`, so nothing shifts when the image arrives. The shipped
 * placeholder drawings are local files and need no blur.
 */
export function ProductImageView({
  image,
  width,
  height,
  sizes,
  className,
  preload = false,
}: {
  image: ProductImage;
  width: number;
  height: number;
  sizes?: string;
  className?: string;
  preload?: boolean;
}) {
  return (
    <Image
      src={image.src}
      alt={image.alt}
      width={width}
      height={height}
      sizes={sizes}
      preload={preload}
      {...(image.placeholder ? {} : { placeholder: "blur" as const, blurDataURL: BLUR })}
      className={className}
    />
  );
}
