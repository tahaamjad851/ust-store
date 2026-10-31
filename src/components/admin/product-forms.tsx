"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { ProductFields, type Option } from "@/components/admin/product-fields";
import { Panel } from "@/components/admin/page-header";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { VariantFields } from "@/components/admin/variant-fields";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { createProductAction, updateProductAction } from "@/features/admin/product-actions";
import type { AdminProductDetail } from "@/features/admin/types";
import { createProductSchema, productSchema, type ProductInput } from "@/lib/validation/admin";

type Common = { categories: (Option & { isActive: boolean })[]; brands: Option[] };

const blankProduct = (): ProductInput => ({
  name: "",
  slug: "",
  category_id: "",
  brand_id: "",
  product_type: "part",
  status: "draft",
  short_description: "",
  description: "",
  part_number: "",
  oem_part_numbers: "",
  viscosity_grade: "",
  oil_specifications: "",
  origin: "",
  warranty_info: "",
  packaging_info: "",
  is_returnable: true,
  is_featured: false,
  seo_title: "",
  seo_description: "",
  specs: [],
});

function toInput(p: AdminProductDetail): ProductInput {
  return {
    name: p.name,
    slug: p.slug,
    category_id: p.category_id,
    brand_id: p.brand_id ?? "",
    product_type: p.product_type,
    status: p.status,
    short_description: p.short_description ?? "",
    description: p.description ?? "",
    part_number: p.part_number ?? "",
    oem_part_numbers: p.oem_part_numbers.join("\n"),
    viscosity_grade: p.viscosity_grade ?? "",
    oil_specifications: p.oil_specifications.join("\n"),
    origin: p.origin ?? "",
    warranty_info: p.warranty_info ?? "",
    packaging_info: p.packaging_info ?? "",
    is_returnable: p.is_returnable,
    is_featured: p.is_featured,
    seo_title: p.seo_title ?? "",
    seo_description: p.seo_description ?? "",
    specs: p.specs,
  };
}

/** Edit form of an existing product: the details only (variants, photos and compatibility have their own sections). */
export function EditProductForm({ product, categories, brands }: Common & { product: AdminProductDetail }) {
  const { form, submit, pending, error, success } = useAdminForm<ProductInput, ReturnType<typeof productSchema.parse>>({
    resolver: zodResolver(productSchema),
    defaults: toInput(product),
    action: (values, dirty) => {
      // The status is also changed by Publish and Archive; send it only if it was changed in this form,
      // so saving the details can never undo one of those.
      const { status, ...rest } = values;
      return updateProductAction(product.id, dirty.status ? { ...rest, status } : rest);
    },
  });
  // "Publish now" and "Archive" change the status outside this form. Without this the form would keep
  // the status it was loaded with and the next "Save product" would silently undo them.
  const { setValue } = form;
  useEffect(() => {
    setValue("status", product.status);
  }, [product.status, setValue]);
  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <ProductFields form={form as unknown as UseFormReturn<FieldValues>} prefix="" categories={categories} brands={brands} />
      {error && <FormAlert tone="error">{error}</FormAlert>}
      {success && <FormAlert tone="success">{success}</FormAlert>}
      <SubmitButton pending={pending} className="w-auto px-8">
        Save product
      </SubmitButton>
    </form>
  );
}

type CreateInput = { product: ProductInput; variant: Record<string, unknown> };

/** New product: the details and its first variant (SKU, price, opening stock) in one go. */
export function CreateProductForm({ categories, brands, isAdmin }: Common & { isAdmin: boolean }) {
  const router = useRouter();
  const [failedId, setFailedId] = useState<string>();
  const { form, submit, pending, error } = useAdminForm<CreateInput, ReturnType<typeof createProductSchema.parse>>({
    resolver: zodResolver(createProductSchema) as never,
    defaults: {
      product: blankProduct(),
      variant: { name: "Default", sku: "", barcode: "", regular_price: "", sale_price: "", cost: "", initial_stock: "", weight_grams: "", length_mm: "", width_mm: "", height_mm: "", is_default: true, is_active: true },
    } as never,
    action: async (values) => {
      const result = await createProductAction(values);
      if (result.ok && result.data) router.push(`/admin/products/${result.data.productId}?created=1`);
      // The product exists as a draft although its variant failed: open it so the variant can be fixed there.
      if (!result.ok && result.code === "variant_failed" && result.detail && typeof result.detail === "object" && "productId" in result.detail) {
        setFailedId(String((result.detail as { productId: unknown }).productId));
      }
      return result;
    },
  });
  const f = form as unknown as UseFormReturn<FieldValues>;
  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Panel title="Product details" id="details">
        <ProductFields form={f} prefix="product." categories={categories} brands={brands} />
      </Panel>
      <Panel title="First variant" id="first-variant" description="Every product has at least one variant: its own SKU, price and stock. Add more sizes or packs after saving.">
        <VariantFields form={f} prefix="variant." isAdmin={isAdmin} showStock hideDefault />
      </Panel>
      {error && (
        <FormAlert tone="error">
          {error}
          {failedId && (
            <>
              {" "}
              <a className="underline" href={`/admin/products/${failedId}`}>
                Open the product
              </a>{" "}
              to add the variant.
            </>
          )}
        </FormAlert>
      )}
      <SubmitButton pending={pending} className="w-auto px-8">
        Add product
      </SubmitButton>
    </form>
  );
}
