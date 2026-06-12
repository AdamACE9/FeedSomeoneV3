-- FeedSomeone — seed (runs on `supabase db reset`)
-- Fixed UUIDs so tests + docs can reference them.

-- ── countries ─────────────────────────────────────────────────────────────
insert into countries (code, name, enabled) values
  ('IN', 'India', true),
  ('AE', 'United Arab Emirates', true),
  ('US', 'United States', true)
on conflict (code) do nothing;

-- ── auth users (admin + kitchen) ──────────────────────────────────────────
-- Standard local-dev pattern: insert directly into auth schema with bcrypt.
-- Empty-string token columns are required (GoTrue scans them as NOT NULL text).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'admin@feedsomeone.com',
   crypt('Admin@123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'kitchen@feedsomeone.com',
   crypt('Kitchen@123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
   '{"sub":"11111111-1111-1111-1111-111111111111","email":"admin@feedsomeone.com"}',
   'email', '11111111-1111-1111-1111-111111111111', now(), now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"kitchen@feedsomeone.com"}',
   'email', '22222222-2222-2222-2222-222222222222', now(), now(), now())
on conflict do nothing;

-- ── kitchen + profiles ────────────────────────────────────────────────────
insert into kitchens (id, name, city, country_code, tz, contact_email) values
  ('33333333-3333-3333-3333-333333333333', 'Noor Kitchen', 'Hyderabad', 'IN', 'Asia/Kolkata', 'kitchen@feedsomeone.com')
on conflict (id) do nothing;

insert into profiles (user_id, role, kitchen_id, display_name, must_change_password) values
  ('11111111-1111-1111-1111-111111111111', 'admin',   null, 'Admin', true),
  ('22222222-2222-2222-2222-222222222222', 'kitchen', '33333333-3333-3333-3333-333333333333', 'Noor Kitchen', false)
on conflict (user_id) do nothing;

-- ── app settings ──────────────────────────────────────────────────────────
insert into app_settings (key, value) values
  ('fx',               '{"usd_inr": 83, "aed_inr": 22.6}'),
  ('stats_thresholds', '{"meals": 500, "donors": 100}'),
  ('clock_override',   'null')
on conflict (key) do nothing;

-- ── demo donors (guest accounts, no auth user yet) ────────────────────────
insert into donors (id, email, first_name, currency, tz, first_donation_at) values
  ('44444444-4444-4444-4444-444444444444', 'ayesha.demo@example.com', 'Ayesha', 'INR', 'Asia/Kolkata', now() - interval '30 hours'),
  ('55555555-5555-5555-5555-555555555555', 'rohan.demo@example.com',  'Rohan',  'INR', 'Asia/Kolkata', now() - interval '28 hours')
on conflict (id) do nothing;

-- ── photo pool: 8 available, FIFO-ordered over the last 36h ───────────────
insert into photos (id, kitchen_id, country_code, storage_path, taken_at, tz, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', '33333333-3333-3333-3333-333333333333', 'IN', 'seed/photo-01.jpg', now() - interval '36 hours', 'Asia/Kolkata', 'available'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', '33333333-3333-3333-3333-333333333333', 'IN', 'seed/photo-02.jpg', now() - interval '32 hours', 'Asia/Kolkata', 'available'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03', '33333333-3333-3333-3333-333333333333', 'IN', 'seed/photo-03.jpg', now() - interval '20 hours', 'Asia/Kolkata', 'available'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04', '33333333-3333-3333-3333-333333333333', 'IN', 'seed/photo-04.jpg', now() - interval '16 hours', 'Asia/Kolkata', 'available'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa05', '33333333-3333-3333-3333-333333333333', 'IN', 'seed/photo-05.jpg', now() - interval '9 hours',  'Asia/Kolkata', 'available'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa06', '33333333-3333-3333-3333-333333333333', 'IN', 'seed/photo-06.jpg', now() - interval '7 hours',  'Asia/Kolkata', 'available'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa07', '33333333-3333-3333-3333-333333333333', 'IN', 'seed/photo-07.jpg', now() - interval '4 hours',  'Asia/Kolkata', 'available'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa08', '33333333-3333-3333-3333-333333333333', 'IN', 'seed/photo-08.jpg', now() - interval '2 hours',  'Asia/Kolkata', 'available')
on conflict (id) do nothing;

-- ── delivered chain: 2 paid donations × 2 meals → 4 delivered photos ──────
insert into photos (id, kitchen_id, country_code, storage_path, kitchen_note, taken_at, tz, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa09', '33333333-3333-3333-3333-333333333333', 'IN', 'seed/photo-09.jpg', 'She asked for a second helping of dal.', now() - interval '26 hours', 'Asia/Kolkata', 'delivered'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10', '33333333-3333-3333-3333-333333333333', 'IN', 'seed/photo-10.jpg', null,                                     now() - interval '25 hours', 'Asia/Kolkata', 'delivered'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', '33333333-3333-3333-3333-333333333333', 'IN', 'seed/photo-11.jpg', null,                                     now() - interval '23 hours', 'Asia/Kolkata', 'delivered'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa12', '33333333-3333-3333-3333-333333333333', 'IN', 'seed/photo-12.jpg', 'Friday biryani day.',                    now() - interval '22 hours', 'Asia/Kolkata', 'delivered')
on conflict (id) do nothing;

insert into donations (id, donor_id, type, status, quantity_total, days, per_day_quantity,
                       currency, amount_local, amount_inr, country_pref, donor_tz, provider,
                       provider_session_id, paid_at, created_at) values
  ('66666666-6666-6666-6666-666666666601', '44444444-4444-4444-4444-444444444444', 'one_time', 'paid',
   2, 1, 2, 'INR', 5000, 5000, 'IN', 'Asia/Kolkata', 'mock', 'seed_session_01',
   now() - interval '30 hours', now() - interval '30 hours'),
  ('66666666-6666-6666-6666-666666666602', '55555555-5555-5555-5555-555555555555', 'one_time', 'paid',
   2, 1, 2, 'INR', 5000, 5000, 'IN', 'Asia/Kolkata', 'mock', 'seed_session_02',
   now() - interval '28 hours', now() - interval '28 hours')
on conflict (id) do nothing;

insert into tips (donation_id, percent, amount_local, currency, amount_inr) values
  ('66666666-6666-6666-6666-666666666601', 25, 1250, 'INR', 1250)
on conflict (donation_id) do nothing;

insert into receipts (donation_id, number, issued_at) values
  ('66666666-6666-6666-6666-666666666601',
   'FS-' || to_char((now() - interval '30 hours') at time zone 'Asia/Kolkata', 'YYYYMMDD') || '-0001',
   now() - interval '30 hours'),
  ('66666666-6666-6666-6666-666666666602',
   'FS-' || to_char((now() - interval '28 hours') at time zone 'Asia/Kolkata', 'YYYYMMDD') || '-0002',
   now() - interval '28 hours')
on conflict (donation_id) do nothing;

insert into dedications (donation_id, kind, name) values
  ('66666666-6666-6666-6666-666666666602', 'memory', 'Nani')
on conflict (donation_id) do nothing;

insert into donation_days (id, donation_id, day_index, quantity, status) values
  ('77777777-7777-7777-7777-777777777701', '66666666-6666-6666-6666-666666666601', 1, 2, 'delivered'),
  ('77777777-7777-7777-7777-777777777702', '66666666-6666-6666-6666-666666666602', 1, 2, 'delivered')
on conflict (id) do nothing;

insert into photo_assignments (photo_id, donation_day_id, donor_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa09', '77777777-7777-7777-7777-777777777701', '44444444-4444-4444-4444-444444444444'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10', '77777777-7777-7777-7777-777777777701', '44444444-4444-4444-4444-444444444444'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', '77777777-7777-7777-7777-777777777702', '55555555-5555-5555-5555-555555555555'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa12', '77777777-7777-7777-7777-777777777702', '55555555-5555-5555-5555-555555555555')
on conflict (photo_id) do nothing;

insert into deliveries (id, donation_day_id, donor_id, recipient_email, scheduled_at, status, sent_at) values
  ('88888888-8888-8888-8888-888888888801', '77777777-7777-7777-7777-777777777701',
   '44444444-4444-4444-4444-444444444444', 'ayesha.demo@example.com',
   now() - interval '25 hours', 'sent', now() - interval '25 hours'),
  ('88888888-8888-8888-8888-888888888802', '77777777-7777-7777-7777-777777777702',
   '55555555-5555-5555-5555-555555555555', 'rohan.demo@example.com',
   now() - interval '22 hours', 'sent', now() - interval '22 hours')
on conflict (id) do nothing;

insert into streaks (donor_id, current, longest, last_date) values
  ('44444444-4444-4444-4444-444444444444', 1, 1, ((now() - interval '30 hours') at time zone 'Asia/Kolkata')::date),
  ('55555555-5555-5555-5555-555555555555', 1, 1, ((now() - interval '28 hours') at time zone 'Asia/Kolkata')::date)
on conflict (donor_id) do nothing;
