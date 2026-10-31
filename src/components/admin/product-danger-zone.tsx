"use client";

import { useState } from "react";
import { Archive, Eye, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { RowAction, toNotice, type Notice } from "@/components/admin/row-action";
import { FormAlert } from "@/components/forms/form-alert";
import { deleteProductAction, setProductStatusAction } from "@/features/admin/product-actions";
import type { ProductStatus } from "@/features/admin/types";

/**
 * Archive (the normal way to stop selling something: nothing is lost) and the real delete, which only an
 * administrator can do and only for a product that was never ordered; the database refuses otherwise.
 */
export function ProductDangerZone({ product, isAdmin }: { product: { id: string; name: string; status: ProductStatus }; isAdmin: boolean }) {
  const [notice, setNotice] = useState<Notice>(null);
  const report = (result: Parameters<typeof toNotice>[0]) => setNotice(toNotice(result));

  return (
    <div className="space-y-5">
      <div aria-live="polite" className="empty:hidden">
        {notice && <FormAlert tone={notice.tone}>{notice.text}</FormAlert>}
      </div>

      <div className="space-y-2">
        <h3 className="text-label-lg">Stop selling</h3>
        <p className="text-body-md text-muted-foreground">
          Archiving hides the product from the shop and keeps everything: its prices, stock history and past orders. You can restore it at any time.
        </p>
        <div className="flex flex-wrap gap-2">
          {product.status !== "archived" ? (
            <ConfirmAction
              label={<><Archive className="size-4" aria-hidden="true" />Archive this product</>}
              title={`Archive ${product.name}?`}
              description="It will no longer be shown in the shop. Orders that include it are not affected."
              confirmLabel="Archive"
              action={async () => {
                const result = await setProductStatusAction(product.id, "archived");
                report(result);
                return result;
              }}
            />
          ) : (
            <RowAction action={() => setProductStatusAction(product.id, "draft")} onResult={report}>
              Restore as draft
            </RowAction>
          )}
          {product.status !== "published" && (
            <RowAction variant="default" action={() => setProductStatusAction(product.id, "published")} onResult={report}>
              <Eye className="size-4" aria-hidden="true" />
              Publish now
            </RowAction>
          )}
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-5">
        <h3 className="text-label-lg">Delete for good</h3>
        {isAdmin ? (
          <>
            <p className="text-body-md text-muted-foreground">
              For test products and mistakes. This removes the product, its variants, photos, stock and price history. It cannot be undone. A product that is on an order cannot be deleted: archive it instead.
            </p>
            <ConfirmAction
              label={<><Trash2 className="size-4" aria-hidden="true" />Delete this product</>}
              title={`Delete ${product.name} for good?`}
              description="Everything about this product is removed and this cannot be undone. If it was ever ordered, the delete is refused and you can archive it instead."
              confirmLabel="Delete for good"
              destructive
              triggerClassName="h-11 text-destructive"
              action={async () => {
                const result = await deleteProductAction(product.id);
                if (!result.ok) report(result);
                return result;
              }}
            />
          </>
        ) : (
          <p className="text-body-md text-muted-foreground">Only an administrator can delete products. Archive it instead.</p>
        )}
      </div>
    </div>
  );
}
