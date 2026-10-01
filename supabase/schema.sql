-- supabase/schema.sql — HopeGrid database (architecture.md §6).
-- Run once in the Supabase SQL editor. RLS is enabled on every table with NO policies:
-- only the server (service-role key) can read or write (architecture D6).

-- 6.1 Staff profiles (one row per Supabase auth user)
create table if not exists profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  name         text not null,
  email        text not null,
  role         text not null,                       -- ADMIN | VOLUNTEER
  phone        text,                                -- never sent to victims
  skills       text[] not null default '{}',
  equipment    text[] not null default '{}',
  vehicle      text not null default 'NONE',
  availability text not null default 'AVAILABLE',
  lat          double precision,
  lng          double precision,
  push_token   text,                                -- F28: the volunteer app's push address (Firebase), if any
  created_at   timestamptz not null default now()
);

-- 6.2 Incidents
create table if not exists incidents (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null unique,
  type                   text not null,
  lat                    double precision,
  lng                    double precision,
  location_text          text,
  public_area            text,
  people                 int,
  vulnerable             boolean not null default false,
  trapped                boolean not null default false,
  medical                boolean not null default false,
  danger                 boolean not null default false,
  needs                  text[] not null default '{}',
  summary                text,
  status                 text not null default 'NEW',
  confidence             int not null default 0,
  confidence_reasons     jsonb not null default '[]',
  priority_score         int not null default 0,
  priority               text not null default 'LOW',
  priority_reasons       jsonb not null default '[]',
  priority_override      text,
  override_reason        text,
  escalation_recommended boolean not null default false,
  escalation_reasons     jsonb not null default '[]',
  escalated_at           timestamptz,
  verified_at            timestamptz,
  on_site_at             timestamptz,
  resolved_at            timestamptz,
  reject_reason          text,
  possible_duplicate_of  uuid references incidents (id),
  merged_into            uuid references incidents (id),
  auto_dispatched_at     timestamptz,             -- F28: first auto-dispatch; keeps it off the public map until verified or on site
  open_to_all            boolean not null default false, -- F29: a coordinator lets anyone join directly from the map
  public_task            text,                    -- F29: what helpers should do and where to meet (shown publicly)
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- 6.3 Reports (id is generated on the phone and is the idempotency key)
create table if not exists reports (
  id                uuid primary key,
  code              text not null unique,
  pin               text not null,
  device_id         text not null,
  incident_id       uuid references incidents (id),
  text              text not null default '',
  transcript        text,
  transcript_status text not null default 'NONE',  -- NONE | DONE | FAILED
  lat               double precision,
  lng               double precision,
  location_text     text,
  people            int,
  needs             text[] not null default '{}',
  phone             text,
  phone_verified    boolean not null default false,
  photo_path        text,
  audio_path        text,
  audio_seconds     int,
  extraction        jsonb,
  ai_source         text,                           -- AI | KEYWORDS
  processing_status text not null default 'PENDING', -- PENDING | DONE | FAILED
  channel           text not null default 'APP',    -- APP | SMS (F27: arrived through the SMS gateway phone)
  pending_media     text[] not null default '{}',   -- SMS reports: PHOTO / AUDIO still on the phone (BR-07)
  completed_at      timestamptz,                    -- SMS reports: when the full report arrived from the app (BR-07)
  app_language      text,                           -- en | ta | hi: the app's language, a hint for speech recognition (BR-12)
  created_at        timestamptz not null,           -- time on the phone
  received_at       timestamptz not null default now()
);
-- Databases created before F27 (SMS fallback): add its columns. Safe to run again.
alter table reports add column if not exists channel text not null default 'APP';
alter table reports add column if not exists pending_media text[] not null default '{}';
alter table reports add column if not exists completed_at timestamptz;
-- Databases created before the speech upgrade (BR-12): the app's language. Safe to run again.
alter table reports add column if not exists app_language text;
create index if not exists reports_incident_id_idx on reports (incident_id);
create index if not exists reports_processing_status_idx on reports (processing_status);
create index if not exists reports_phone_idx on reports (phone); -- follow-up SMS from the same number (BR-06)

-- 6.4 Assignments
create table if not exists assignments (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references incidents (id),
  volunteer_id uuid not null references profiles (id),
  status       text not null,
  reason       text,
  auto         boolean not null default false,       -- F28: sent by auto-dispatch (an SOS)
  respond_by   timestamptz,                          -- F28: an SOS not answered by then counts as declined
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists assignments_incident_id_idx on assignments (incident_id);
create index if not exists assignments_volunteer_id_idx on assignments (volunteer_id);

-- 6.5 Messages (private volunteer <-> victim chat)
create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  incident_id   uuid not null references incidents (id),
  report_id     uuid not null references reports (id),
  assignment_id uuid not null references assignments (id),
  sender        text not null,                      -- VICTIM | VOLUNTEER
  text          text,
  audio_path    text,
  lat           double precision,
  lng           double precision,
  created_at    timestamptz not null default now()
);
create index if not exists messages_report_id_idx on messages (report_id);

-- 6.6 Resources, allocations, logs
create table if not exists resources (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null,
  quantity      int not null check (quantity >= 0),
  unit          text not null,
  location_text text,
  created_at    timestamptz not null default now()
);

create table if not exists allocations (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources (id),
  incident_id uuid not null references incidents (id),
  quantity    int not null check (quantity > 0),
  created_at  timestamptz not null default now()
);
create index if not exists allocations_incident_id_idx on allocations (incident_id);

create table if not exists incident_logs (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents (id),
  text        text not null,
  public      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists incident_logs_incident_id_idx on incident_logs (incident_id);

-- 6.8 Volunteer registration (F26). The applicant's login is created at sign-up, but without a profile row it can't
-- be used; approving the application creates the profile. The ID proof photo is in the private media bucket.
create table if not exists volunteer_applications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,                      -- Supabase auth user created at sign-up
  name          text not null,
  email         text not null,
  phone         text not null,
  skills        text[] not null default '{}',
  equipment     text[] not null default '{}',
  vehicle       text not null default 'NONE',
  lat           double precision,
  lng           double precision,
  location_text text,
  proof_path    text,                               -- cleared when the proof is deleted (on rejection)
  status        text not null default 'PENDING',    -- PENDING | APPROVED | REJECTED
  reject_reason text,
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists volunteer_applications_status_idx on volunteer_applications (status);

-- F29 community help: offers from anyone who sees the incident on the public map. Phone numbers: coordinators only.
create table if not exists help_offers (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents (id),
  name        text not null,
  phone       text not null,
  kinds       text[] not null default '{}',        -- HANDS | VEHICLE | BOAT | FIRST_AID | FOOD_WATER | SHELTER | OTHER
  note        text,
  status      text not null default 'PENDING',     -- PENDING | ACCEPTED | DECLINED | JOINED
  device_id   text not null,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists help_offers_incident_id_idx on help_offers (incident_id);
-- Databases created before F29: add its columns. Safe to run again.
alter table incidents add column if not exists open_to_all boolean not null default false;
alter table incidents add column if not exists public_task text;

-- F28 auto-dispatch: coordinator settings (one row, key 'dispatch').
create table if not exists settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
-- Databases created before F28: add its columns. Safe to run again.
alter table profiles    add column if not exists push_token text;
alter table incidents   add column if not exists auto_dispatched_at timestamptz;
alter table assignments add column if not exists auto boolean not null default false;
alter table assignments add column if not exists respond_by timestamptz;

-- RLS on every table, no policies (architecture D6)
alter table profiles      enable row level security;
alter table incidents     enable row level security;
alter table reports       enable row level security;
alter table assignments   enable row level security;
alter table messages      enable row level security;
alter table resources     enable row level security;
alter table allocations   enable row level security;
alter table incident_logs enable row level security;
alter table volunteer_applications enable row level security;
alter table settings      enable row level security;
alter table help_offers   enable row level security;

-- The server's service-role key must reach these tables through the Data API
-- (needed when the project does not auto-expose new tables).
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;

-- 6.7 Storage: private bucket for victim photos and audio (architecture D7)
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;
