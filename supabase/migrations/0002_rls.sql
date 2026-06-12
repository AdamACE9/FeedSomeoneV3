-- FeedSomeone — RLS: deny-by-default; service-role (server) does all writes.
-- Client-side reads are narrow: donors see own rows, kitchens own photos, admins all.

-- helper: current user's role without recursive RLS
create or replace function app_role()
returns user_role language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where user_id = auth.uid()), 'donor'::user_role);
$$;
grant execute on function app_role() to anon, authenticated;

create or replace function app_kitchen_id()
returns uuid language sql stable security definer set search_path = public as $$
  select kitchen_id from profiles where user_id = auth.uid();
$$;
grant execute on function app_kitchen_id() to authenticated;

-- enable RLS everywhere
alter table countries          enable row level security;
alter table kitchens           enable row level security;
alter table profiles           enable row level security;
alter table donors             enable row level security;
alter table subscriptions      enable row level security;
alter table qr_campaigns       enable row level security;
alter table donations          enable row level security;
alter table tips               enable row level security;
alter table receipts           enable row level security;
alter table receipt_counters   enable row level security;
alter table photos             enable row level security;
alter table donation_days      enable row level security;
alter table photo_assignments  enable row level security;
alter table deliveries         enable row level security;
alter table dedications        enable row level security;
alter table gifts              enable row level security;
alter table streaks            enable row level security;
alter table email_outbox       enable row level security;
alter table webhook_events     enable row level security;
alter table audit_log          enable row level security;
alter table app_settings       enable row level security;

-- public reference
create policy countries_public_read on countries for select using (enabled);

-- profiles: own row; admin all
create policy profiles_own    on profiles for select using (user_id = auth.uid());
create policy profiles_admin  on profiles for select using (app_role() = 'admin');

-- donors: own; admin
create policy donors_own   on donors for select using (user_id = auth.uid());
create policy donors_admin on donors for select using (app_role() = 'admin');

-- donations + money: donor-own via donors join; admin
create policy donations_own on donations for select
  using (donor_id in (select id from donors where user_id = auth.uid()));
create policy donations_admin on donations for select using (app_role() = 'admin');

create policy tips_own on tips for select
  using (donation_id in (select d.id from donations d join donors o on o.id = d.donor_id where o.user_id = auth.uid()));
create policy tips_admin on tips for select using (app_role() = 'admin');

create policy receipts_own on receipts for select
  using (donation_id in (select d.id from donations d join donors o on o.id = d.donor_id where o.user_id = auth.uid()));
create policy receipts_admin on receipts for select using (app_role() = 'admin');

create policy subs_own   on subscriptions for select
  using (donor_id in (select id from donors where user_id = auth.uid()));
create policy subs_admin on subscriptions for select using (app_role() = 'admin');

create policy days_own on donation_days for select
  using (donation_id in (select d.id from donations d join donors o on o.id = d.donor_id where o.user_id = auth.uid()));
create policy days_admin on donation_days for select using (app_role() = 'admin');

create policy assignments_own on photo_assignments for select
  using (donor_id in (select id from donors where user_id = auth.uid()));
create policy assignments_admin on photo_assignments for select using (app_role() = 'admin');

create policy deliveries_own on deliveries for select
  using (donor_id in (select id from donors where user_id = auth.uid()));
create policy deliveries_admin on deliveries for select using (app_role() = 'admin');

create policy dedications_own on dedications for select
  using (donation_id in (select d.id from donations d join donors o on o.id = d.donor_id where o.user_id = auth.uid()));
create policy dedications_admin on dedications for select using (app_role() = 'admin');

create policy gifts_own on gifts for select
  using (donation_id in (select d.id from donations d join donors o on o.id = d.donor_id where o.user_id = auth.uid()));
create policy gifts_admin on gifts for select using (app_role() = 'admin');

create policy streaks_own   on streaks for select
  using (donor_id in (select id from donors where user_id = auth.uid()));
create policy streaks_admin on streaks for select using (app_role() = 'admin');

-- photos: kitchen sees/contributes own; donors see photos assigned to them; admin all
create policy photos_kitchen_read on photos for select
  using (kitchen_id = app_kitchen_id());
create policy photos_kitchen_insert on photos for insert
  with check (kitchen_id = app_kitchen_id() and app_role() = 'kitchen');
create policy photos_donor_read on photos for select
  using (id in (select photo_id from photo_assignments pa
                join donors o on o.id = pa.donor_id where o.user_id = auth.uid()));
create policy photos_admin on photos for select using (app_role() = 'admin');

-- ops tables: admin read-only from client; writes are service-role only
create policy kitchens_admin   on kitchens      for select using (app_role() = 'admin');
create policy qr_admin         on qr_campaigns  for select using (app_role() = 'admin');
create policy outbox_admin     on email_outbox  for select using (app_role() = 'admin');
create policy webhooks_admin   on webhook_events for select using (app_role() = 'admin');
create policy audit_admin      on audit_log     for select using (app_role() = 'admin');
create policy settings_admin   on app_settings  for select using (app_role() = 'admin');
-- receipt_counters: no client policies (service-role only)

-- public kitchen directory (name/city only — no contact email)
create or replace view public_kitchens as
  select id, name, city, country_code from kitchens where enabled;
grant select on public_kitchens to anon, authenticated;

-- ── storage policies (defense-in-depth only) ──────────────────────────────
-- All storage I/O flows through the service role (uploads via API route, reads
-- via server-minted signed URLs), so these client policies are belt-and-braces.
-- On hosted Supabase the postgres role can't own storage.objects policies —
-- skip gracefully there; they apply fully on local stacks.
do $$
begin
  create policy storage_photos_kitchen_insert on storage.objects for insert
    with check (
      bucket_id = 'photos'
      and app_role() = 'kitchen'
      and (storage.foldername(name))[1] = app_kitchen_id()::text
    );
  create policy storage_photos_admin_read on storage.objects for select
    using (bucket_id = 'photos' and app_role() = 'admin');
  create policy storage_receipts_admin_read on storage.objects for select
    using (bucket_id = 'receipts' and app_role() = 'admin');
exception when insufficient_privilege then
  raise notice 'storage.objects policies skipped (hosted Supabase): service-role-only access stands';
end $$;
