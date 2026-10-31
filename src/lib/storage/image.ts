// Rules for product photos, shared by the upload action and its tests. The type is decided from the
// file's own first bytes, never from its name or the type the browser claims.

/** What the server accepts. The browser shrinks photos first, so this is far above a normal upload. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGES_PER_PRODUCT = 8;
/** Mirrors the bucket's allowed types (no SVG: it can carry script). */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export type ImageKind = { mime: (typeof IMAGE_TYPES)[number]; ext: "jpg" | "png" | "webp" | "avif" };

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));

/** JPEG, PNG, WebP or AVIF by magic number; null for everything else (GIF, SVG, HEIC, PDF, text, ...). */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { mime: "image/png", ext: "png" };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(bytes, 8, 12))) return { mime: "image/avif", ext: "avif" };
  return null;
}

/** products/<product id>/<random id>.<ext>: the only shape the database accepts (see product_images_before_write). */
export function productImagePath(productId: string, randomId: string, ext: ImageKind["ext"]): string {
  return `products/${productId}/${randomId.replace(/[^A-Za-z0-9]/g, "").slice(0, 32)}.${ext}`;
}
