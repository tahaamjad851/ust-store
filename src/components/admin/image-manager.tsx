"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Replace, Star, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { ImageRefused, prepareImage, type PreparedImage } from "@/components/admin/image-prepare";
import { RowAction, toNotice, type Notice } from "@/components/admin/row-action";
import { Field, fieldInputClass, fieldProps } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { ProductImageView } from "@/components/products/product-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  removeProductImageAction,
  reorderImagesAction,
  replaceProductImageAction,
  setImageAltAction,
  setPrimaryImageAction,
  uploadProductImageAction,
} from "@/features/admin/image-actions";
import type { AdminImage } from "@/features/admin/types";
import { IMAGE_TYPES, MAX_IMAGES_PER_PRODUCT } from "@/lib/storage/image";

export type ImageWithUrl = AdminImage & { src: string | null };

const ACCEPT = IMAGE_TYPES.join(",");

function ImageCard({
  productId,
  productName,
  image,
  index,
  all,
  report,
}: {
  productId: string;
  productName: string;
  image: ImageWithUrl;
  index: number;
  all: ImageWithUrl[];
  report: (result: Parameters<typeof toNotice>[0]) => void;
}) {
  const [alt, setAlt] = useState(image.alt_text);
  const [busy, setBusy] = useState(false);

  const move = (by: -1 | 1) => {
    const ids = all.map((i) => i.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    return () => reorderImagesAction(productId, ids);
  };

  async function replace(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const prepared = await prepareImage(file);
      const form = new FormData();
      form.set("productId", productId);
      form.set("imageId", image.id);
      form.set("file", prepared.file);
      report(await replaceProductImageAction(form));
    } catch (e) {
      report({ ok: false, message: e instanceof ImageRefused ? e.message : "The photo could not be replaced. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const label = `photo ${index + 1}`;
  return (
    <li className="space-y-3 rounded-lg border border-border bg-card p-3" data-testid="photo-card">
      <div className="relative">
        {image.src ? (
          <ProductImageView
            image={{ src: image.src, alt: image.alt_text || `${productName}, ${label}`, placeholder: false }}
            width={240}
            height={240}
            sizes="(min-width: 1024px) 220px, 45vw"
            className="aspect-square w-full rounded-lg border border-border bg-surface-low object-cover"
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-border bg-surface-low text-body-sm text-muted-foreground">Not available</div>
        )}
        {image.is_primary && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-label-md text-primary-foreground">
            <Star className="size-3" aria-hidden="true" />
            Main photo
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Field id={`alt-${image.id}`} label={`Description of ${label}`} optional className="min-w-0 flex-1">
          <Input
            className={fieldInputClass}
            value={alt}
            maxLength={200}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="What the photo shows"
            {...fieldProps(`alt-${image.id}`)}
          />
        </Field>
        <RowAction
          ariaLabel={`Save description of ${label}`}
          disabled={alt.trim() === image.alt_text.trim()}
          action={() => setImageAltAction(productId, image.id, alt)}
          onResult={report}
          className="mt-[1.625rem] h-11 shrink-0"
        >
          Save
        </RowAction>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <RowAction ariaLabel={`Move ${label} earlier`} disabled={index === 0} action={move(-1)} onResult={report} className="size-11 p-0">
          <ArrowLeft className="size-4" aria-hidden="true" />
        </RowAction>
        <RowAction ariaLabel={`Move ${label} later`} disabled={index === all.length - 1} action={move(1)} onResult={report} className="size-11 p-0">
          <ArrowRight className="size-4" aria-hidden="true" />
        </RowAction>
        {!image.is_primary && (
          <RowAction action={() => setPrimaryImageAction(productId, image.id)} onResult={report} ariaLabel={`Make ${label} the main photo`}>
            <Star className="size-4" aria-hidden="true" />
            Make main
          </RowAction>
        )}
        <label className="relative inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium shadow-xs focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Replace className="size-4" aria-hidden="true" />}
          Replace
          <input
            type="file"
            accept={ACCEPT}
            disabled={busy}
            aria-label={`Replace ${label}`}
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            onChange={(e) => {
              void replace(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <ConfirmAction
          label={<><Trash2 className="size-4" aria-hidden="true" />Remove</>}
          ariaLabel={`Remove ${label}`}
          title="Remove this photo?"
          description="The photo is deleted from the product and from storage. This cannot be undone."
          confirmLabel="Remove photo"
          destructive
          triggerClassName="h-11 text-destructive"
          action={async () => {
            const result = await removeProductImageAction(productId, image.id);
            report(result);
            return result;
          }}
        />
      </div>
    </li>
  );
}

/** Up to 8 photos per product: preview before saving, main photo, order, description (alt text), replace and remove. */
export function ImageManager({ productId, productName, images }: { productId: string; productName: string; images: ImageWithUrl[] }) {
  const [notice, setNotice] = useState<Notice>(null);
  const [selected, setSelected] = useState<{ prepared: PreparedImage; preview: string } | null>(null);
  const [alt, setAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  const report = (result: Parameters<typeof toNotice>[0]) => setNotice(toNotice(result));
  const full = images.length >= MAX_IMAGES_PER_PRODUCT;

  // A preview is an object URL: release it when it is replaced or the component goes away.
  useEffect(() => () => { if (selected) URL.revokeObjectURL(selected.preview); }, [selected]);

  async function choose(file: File | undefined) {
    setProblem(undefined);
    setNotice(null);
    if (!file) return;
    try {
      const prepared = await prepareImage(file);
      setSelected({ prepared, preview: URL.createObjectURL(prepared.file) });
    } catch (e) {
      setSelected(null);
      setProblem(e instanceof ImageRefused ? e.message : "That photo could not be read.");
    }
  }

  async function upload() {
    if (!selected) return;
    setUploading(true);
    setProblem(undefined);
    try {
      const form = new FormData();
      form.set("productId", productId);
      form.set("alt", alt);
      form.set("file", selected.prepared.file);
      const result = await uploadProductImageAction(form);
      if (result.ok) {
        setSelected(null);
        setAlt("");
        if (fileRef.current) fileRef.current.value = "";
      }
      report(result);
    } catch {
      setProblem("The photo could not be uploaded. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-body-md text-muted-foreground">
        Up to {MAX_IMAGES_PER_PRODUCT} photos ({images.length} added). The main photo is shown first. JPEG, PNG, WebP or AVIF. Large photos are shrunk before they are uploaded.
      </p>
      <div aria-live="polite" className="empty:hidden">
        {notice && <FormAlert tone={notice.tone}>{notice.text}</FormAlert>}
      </div>

      {images.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Photos">
          {images.map((image, index) => (
            <ImageCard key={`${image.id}:${image.alt_text}`} productId={productId} productName={productName} image={image} index={index} all={images} report={report} />
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
        <h3 className="text-label-lg">Add a photo</h3>
        {full ? (
          <p className="text-body-md text-muted-foreground">This product has {MAX_IMAGES_PER_PRODUCT} photos. Remove one to add another.</p>
        ) : (
          <>
            <Field id="new-photo" label="Choose a photo" error={problem}>
              <input
                ref={fileRef}
                id="new-photo"
                type="file"
                accept={ACCEPT}
                disabled={uploading}
                aria-describedby={problem ? "new-photo-error" : undefined}
                aria-invalid={problem ? true : undefined}
                className="block w-full text-body-md file:mr-3 file:h-11 file:rounded-md file:border file:border-border file:bg-background file:px-4 file:text-sm file:font-medium"
                onChange={(e) => void choose(e.target.files?.[0])}
              />
            </Field>
            {selected && (
              <div className="grid gap-4 sm:grid-cols-[10rem_1fr]" data-testid="photo-preview">
                {/* A local preview (blob:) of the file that is about to be uploaded: next/image cannot optimise it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.preview} alt="Preview of the chosen photo" className="aspect-square w-40 rounded-lg border border-border bg-surface-low object-cover" />
                <div className="space-y-3">
                  <Field id="new-photo-alt" label="Describe the photo" optional hint="For people who cannot see it, and for search engines. For example: front of the oil filter.">
                    <Input className={fieldInputClass} value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} {...fieldProps("new-photo-alt", { hint: true })} />
                  </Field>
                  <Button type="button" className="h-11" disabled={uploading} onClick={() => void upload()}>
                    {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="size-4" aria-hidden="true" />}
                    Upload photo
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
