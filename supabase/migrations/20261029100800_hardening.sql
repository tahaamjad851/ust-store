-- Final hardening for everything created above.

-- Explicit table privileges (RLS still decides which rows). Do not rely on Supabase's implicit
-- grants: authenticated gets DML, service_role everything, anon only the SELECTs granted earlier.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Re-apply the column-limited profile privileges (the blanket grant above widened them).
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, phone, company_name, disabled_at) on public.profiles to authenticated;

-- TRUNCATE, REFERENCES and TRIGGER are never needed by API roles (TRUNCATE ignores RLS).
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon;
revoke all on public.order_number_counters from anon, authenticated;

-- Fail loudly if any table in public was left without RLS.
do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    raise exception 'RLS is not enabled on public.%', t.relname;
  end loop;
end;
$$;

-- Fail loudly if anon or authenticated can execute any function outside the allowlist
-- (catches a future SECURITY DEFINER function that forgot its REVOKE).
do $$
declare
  f record;
  anon_ok text[] := array['is_admin', 'is_full_admin', 'try_uuid', 'effective_price_paisa', 'stock_availability'];
  auth_ok text[] := anon_ok || array[
    'place_order', 'adjust_stock', 'set_stock_thresholds', 'set_order_status', 'set_payment_status',
    'request_return', 'get_order_by_tracking_token', 'get_bank_transfer_details', 'submit_bank_transfer_reference'
  ];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname, r.rolname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join (values ('anon'), ('authenticated')) as r (rolname)
     where n.nspname = 'public'
       and p.prorettype <> 'trigger'::regtype
       and has_function_privilege(r.rolname, p.oid, 'execute')
       and not (p.proname = any (case when r.rolname = 'anon' then anon_ok else auth_ok end))
  loop
    raise exception '% can execute %, which is not in the allowlist', f.rolname, f.sig;
  end loop;
end;
$$;
