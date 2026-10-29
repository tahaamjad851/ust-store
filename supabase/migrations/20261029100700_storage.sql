-- Storage buckets and policies.
--
--   product-images  public read (served by URL), admin/staff write. 5 MB, JPEG/PNG/WebP/AVIF.
--                   No SVG (scriptable).
--   payment-proofs  private. A signed-in customer uploads into <their user id>/<their order id>/ and
--                   can read only their own files; admin/staff read all. No overwrite or delete by
--                   customers (evidence is immutable). Guest proofs are uploaded by the server
--                   (service role) under guest/<order id>/. 5 MB, JPEG/PNG/WebP/PDF.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('payment-proofs', 'payment-proofs', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- product-images: writes by admin/staff only. Public URLs need no SELECT policy;
-- admin/staff may list objects for the image manager.
create policy product_images_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
create policy product_images_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy product_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()))
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy product_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));

-- payment-proofs
create policy payment_proofs_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(objects.name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(objects.name), 1) = 2
    and exists (
      select 1 from public.orders o
       where o.id = public.try_uuid((storage.foldername(objects.name))[2])
         and o.user_id = (select auth.uid())
         and o.payment_method = 'bank_transfer'
         and o.status in ('pending', 'confirmed')
         and o.payment_status in ('unpaid', 'failed')
    )
  );
create policy payment_proofs_owner_select on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and ((storage.foldername(objects.name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );
create policy payment_proofs_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'payment-proofs' and (select public.is_full_admin()));
