-- Final hardening for everything created above.
--
-- TRUNCATE, REFERENCES and TRIGGER are never needed by API roles (and TRUNCATE ignores RLS).
-- Sequences and internal counters are not reachable by anon.

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
