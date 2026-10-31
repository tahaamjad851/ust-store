// Runs in the browser before a photo is uploaded: shrinks it and re-encodes it. A phone photo is often 3
// to 8 MB; this makes it a few hundred KB (faster shop pages, and under the hosting limit for a request),
// and removes its metadata, such as the GPS position the camera wrote into it.
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/storage/image";

const MAX_SIDE = 1600;

export type PreparedImage = { file: File; width: number; height: number };

export class ImageRefused extends Error {}

async function decode(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file);
  } catch {
    return null;
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Returns the file to upload. A photo the browser cannot decode is sent as it is when it is small enough,
 * and refused with a plain message when it is not an accepted type or is too large.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const accepted = (IMAGE_TYPES as readonly string[]).includes(file.type);
  const bitmap = await decode(file);
  if (!bitmap) {
    if (!accepted) throw new ImageRefused("Choose a JPEG, PNG, WebP or AVIF photo.");
    if (file.size > MAX_IMAGE_BYTES) throw new ImageRefused("That photo is too large and could not be shrunk. Try a smaller one.");
    return { file, width: 0, height: 0 };
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new ImageRefused("Your browser could not prepare that photo.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = (await toBlob(canvas, "image/webp", 0.85)) ?? (await toBlob(canvas, "image/jpeg", 0.88));
  if (!blob) throw new ImageRefused("Your browser could not prepare that photo.");
  // Keep the original when re-encoding did not help and the original is acceptable as it is.
  if (accepted && scale === 1 && blob.size >= file.size && file.size <= MAX_IMAGE_BYTES) return { file, width, height };
  if (blob.size > MAX_IMAGE_BYTES) throw new ImageRefused("That photo is still too large after shrinking. Try a smaller one.");
  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  return { file: new File([blob], `photo.${extension}`, { type: blob.type }), width, height };
}
