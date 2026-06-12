-- FeedSomeone — core schema (plan §2)
create extension if not exists citext;
create extension if not exists pgcrypto;

create type user_role       as enum ('donor','kitchen','admin');
create type donation_type   as enum ('one_time','scheduled','recurring_cycle');
create type donation_status as enum ('pending','paid','failed','refunded');
create type photo_status    as enum ('available','assigned','delivered','flagged','rejected');
create type day_status      as enum ('unassigned','partial','assigned','delivered');
create type delivery_status as enum ('waiting','scheduled','sent','failed');
create type sub_status      as enum ('active','paused','canceled');
create type sub_cadence     as enum ('daily','weekly','monthly');
create type dedication_kind as enum ('memory','honor');

-- ── reference ─────────────────────────────────────────────────────────────
create table countries (
  code    text primary key,
  name    text not null,
  enabled boolean not null default true
);

create table kitchens (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  city          text not null,
  country_code  text not null references countries(code),
  tz            text not null default 'Asia/Kolkata',
  contact_email citext,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ── identity ──────────────────────────────────────────────────────────────
create table profiles (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  role                 user_role not null default 'donor',
  kitchen_id           uuid references kitchens(id),
  display_name         text,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now()
);

create table donors (
  id                uuid primary key default gen_random_uuid(),
  email             citext unique not null,
  first_name        text,
  is_anonymous      boolean not null default false,
  user_id           uuid unique references auth.users(id),
  currency          text not null default 'INR' check (currency in ('INR','USD','AED')),
  tz                text not null default 'Asia/Kolkata',
  first_donation_at timestamptz,
  created_at        timestamptz not null default now()
);

-- ── money ─────────────────────────────────────────────────────────────────
create table subscriptions (
  id              uuid primary key default gen_random_uuid(),
  donor_id        uuid not null references donors(id),
  cadence         sub_cadence not null,
  quantity        int not null check (quantity > 0),
  currency        text not null check (currency in ('INR','USD','AED')),
  amount_local    bigint not null,
  tip_local       bigint not null default 0,
  status          sub_status not null default 'active',
  provider        text not null,
  provider_sub_id text unique,
  country_pref    text references countries(code),
  next_charge_at  timestamptz,
  created_at      timestamptz not null default now()
);

create table qr_campaigns (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  kitchen_id      uuid references kitchens(id),
  preset_quantity int not null default 1,
  country_pref    text references countries(code),
  scans           int not null default 0,
  created_at      timestamptz not null default now()
);

create table donations (
  id                  uuid primary key default gen_random_uuid(),
  donor_id            uuid not null references donors(id),
  type                donation_type not null default 'one_time',
  status              donation_status not null default 'pending',
  quantity_total      int not null check (quantity_total > 0),
  days                int not null default 1 check (days >= 1),
  per_day_quantity    int not null,
  is_classroom        boolean not null default false,
  currency            text not null check (currency in ('INR','USD','AED')),
  amount_local        bigint not null,
  amount_inr          bigint not null,
  country_pref        text references countries(code),
  donor_tz            text not null default 'Asia/Kolkata',
  subscription_id     uuid references subscriptions(id),
  qr_campaign_id      uuid references qr_campaigns(id),
  provider            text not null,
  provider_session_id text unique,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  check (per_day_quantity * days = quantity_total)
);
create index donations_donor on donations (donor_id, created_at desc);
create index donations_paid  on donations (status, paid_at desc);

create table tips (
  id           uuid primary key default gen_random_uuid(),
  donation_id  uuid not null unique references donations(id),
  percent      int not null,
  amount_local bigint not null,
  currency     text not null check (currency in ('INR','USD','AED')),
  amount_inr   bigint not null,
  created_at   timestamptz not null default now()
);

create table receipts (
  id          uuid primary key default gen_random_uuid(),
  donation_id uuid not null unique references donations(id),
  number      text not null unique,
  issued_at   timestamptz not null default now()
);

create table receipt_counters (
  date_key text primary key,
  counter  int not null
);

create or replace function allocate_receipt(p_donation_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_key    text := to_char(now() at time zone 'Asia/Kolkata', 'YYYYMMDD');
  v_n      int;
  v_number text;
begin
  insert into receipt_counters as rc (date_key, counter) values (v_key, 1)
    on conflict (date_key) do update set counter = rc.counter + 1
    returning counter into v_n;
  v_number := 'FS-' || v_key || '-' || lpad(v_n::text, 4, '0');
  insert into receipts (donation_id, number) values (p_donation_id, v_number);
  return v_number;
end $$;

-- ── photos & delivery engine ──────────────────────────────────────────────
create table photos (
  id           uuid primary key default gen_random_uuid(),
  kitchen_id   uuid not null references kitchens(id),
  country_code text not null references countries(code),
  storage_path text not null,
  blurred_path text,
  kitchen_note text,
  taken_at     timestamptz not null,
  tz           text not null default 'Asia/Kolkata',
  phash        bit(64),
  status       photo_status not null default 'available',
  dup_of       uuid references photos(id),
  created_at   timestamptz not null default now()
);
create index photos_fifo on photos (status, country_code, taken_at);

create table donation_days (
  id          uuid primary key default gen_random_uuid(),
  donation_id uuid not null references donations(id),
  day_index   int not null,
  quantity    int not null,
  status      day_status not null default 'unassigned',
  unique (donation_id, day_index)
);
create index donation_days_pending on donation_days (status);

create table photo_assignments (
  id              uuid primary key default gen_random_uuid(),
  photo_id        uuid not null unique references photos(id),
  donation_day_id uuid not null references donation_days(id),
  donor_id        uuid not null references donors(id),
  assigned_at     timestamptz not null default now()
);
create index photo_assignments_day on photo_assignments (donation_day_id);

create table deliveries (
  id              uuid primary key default gen_random_uuid(),
  donation_day_id uuid not null unique references donation_days(id),
  donor_id        uuid not null references donors(id),
  recipient_email citext not null,
  scheduled_at    timestamptz,
  status          delivery_status not null default 'waiting',
  attempt_count   int not null default 0,
  sent_at         timestamptz,
  last_error      text
);
create index deliveries_due on deliveries (status, scheduled_at);

-- Atomic FIFO assignment. One photo, one donor — UNIQUE(photo_id) is the hard guarantee.
create or replace function assign_photos(p_day_id uuid, p_donor uuid, p_n int, p_country text)
returns setof uuid language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select id from photos
    where status = 'available'
      and (p_country is null or country_code = p_country)
    order by taken_at asc
    limit p_n
    for update skip locked
  loop
    update photos set status = 'assigned' where id = r.id;
    insert into photo_assignments (photo_id, donation_day_id, donor_id)
      values (r.id, p_day_id, p_donor);
    return next r.id;
  end loop;
end $$;

-- ── extras ────────────────────────────────────────────────────────────────
create table dedications (
  id          uuid primary key default gen_random_uuid(),
  donation_id uuid not null unique references donations(id),
  kind        dedication_kind not null,
  name        text not null
);

create table gifts (
  id              uuid primary key default gen_random_uuid(),
  donation_id     uuid not null unique references donations(id),
  recipient_name  text not null,
  recipient_email citext not null,
  message         text,
  notified_at     timestamptz
);

create table streaks (
  donor_id  uuid primary key references donors(id),
  current   int not null default 0,
  longest   int not null default 0,
  last_date date
);

create table email_outbox (
  id          uuid primary key default gen_random_uuid(),
  to_email    citext not null,
  subject     text not null,
  html        text not null,
  kind        text not null,
  ref_id      uuid,
  provider    text not null,
  provider_id text,
  status      text not null default 'sent',
  created_at  timestamptz not null default now()
);
create index email_outbox_kind on email_outbox (kind, created_at desc);

create table webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  event_id     text not null,
  type         text not null,
  payload      jsonb not null,
  processed_at timestamptz,
  unique (provider, event_id)
);

create table audit_log (
  id        bigint generated always as identity primary key,
  actor     text not null,
  action    text not null,
  entity    text,
  entity_id text,
  meta      jsonb,
  at        timestamptz not null default now()
);

create table app_settings (
  key   text primary key,
  value jsonb not null
);

-- ── public stats (anon-callable, powers the live counter + stats band) ────
create or replace function get_public_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'fed_today', coalesce((
      select sum(quantity_total) from donations
      where status = 'paid'
        and (paid_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date), 0),
    'total_meals', coalesce((select sum(quantity_total) from donations where status = 'paid'), 0),
    'total_donors', coalesce((select count(distinct donor_id) from donations where status = 'paid'), 0),
    'kitchens', (select count(*) from kitchens where enabled)
  );
$$;
grant execute on function get_public_stats() to anon, authenticated;

-- ── storage buckets ───────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false), ('receipts', 'receipts', false)
on conflict (id) do nothing;
