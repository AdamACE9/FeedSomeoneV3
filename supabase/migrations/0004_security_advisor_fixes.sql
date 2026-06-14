-- 0004 — resolve the two Supabase Advisor CRITICAL findings.
--
-- 1) public._sql_applied had RLS disabled while exposed to the API. It is an
--    internal migration-tracking table; enabling RLS with no policy denies all
--    client roles (the service-role client still bypasses RLS).
--
-- 2) public.public_kitchens was a SECURITY DEFINER view, which bypasses RLS.
--    Switch it to security_invoker so it respects RLS, add a narrow public
--    read policy (enabled kitchens only), and hard-revoke the sensitive
--    contact_email column from client roles. The admin portal reads kitchens
--    through the service-role client (adminDb), so it is unaffected.

alter table public._sql_applied enable row level security;

alter view public.public_kitchens set (security_invoker = on);

drop policy if exists "public_read_enabled_kitchens" on public.kitchens;
create policy "public_read_enabled_kitchens" on public.kitchens
  for select to anon, authenticated using (enabled = true);

revoke select (contact_email) on public.kitchens from anon, authenticated;
