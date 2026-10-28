-- Trace: first migration (spec section 9). Amounts are integer cents.
-- Runs on Supabase (auth.users, auth.uid(), the authenticated role) and on
-- plain Postgres 15+ with test/supabase-shim.sql loaded first.

create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  paypal_email text,
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  trades_id uuid references profiles not null,
  homeowner_id uuid references profiles,
  homeowner_email text not null,
  address text not null,
  anchor_lat double precision,
  anchor_lng double precision,
  status text not null default 'DRAFT' check (status in
    ('DRAFT','AWAITING_APPROVAL','AUTHORIZED','IN_PROGRESS','PARTIALLY_RELEASED','COMPLETED','CLOSED_VOIDED')),
  disputed boolean not null default false,
  scope_hash text,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  review_window_s int not null default 43200 check (review_window_s > 0),
  paypal_order_id text unique,             -- the order the homeowner is approving
  trades_device_id text,                   -- device that started the job (section 7)
  demo boolean not null default false,     -- judge-mode copy (section 12)
  close_drop_line_ids uuid[],              -- lines the close proposal drops
  close_trades_at timestamptz,             -- the two close confirmations, for that proposal
  close_homeowner_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table authorizations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs on delete cascade not null,
  paypal_order_id text not null,
  paypal_auth_id text unique not null,     -- current ID (changes on reauthorize)
  amount_cents int not null check (amount_cents > 0),
  currency text not null,
  status text not null check (status in ('CREATED','PARTIALLY_CAPTURED','CAPTURED','VOIDED','DENIED','PENDING')),
  honor_until timestamptz,
  expires_at timestamptz,
  reauth_attempted_at timestamptz,         -- the one reauthorization, tried (section 5)
  kind text not null default 'base' check (kind in ('base','change_order')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index authorizations_one_base on authorizations (job_id) where kind = 'base';

create table captures (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid references authorizations not null,
  paypal_capture_id text unique,
  request_id text unique not null,         -- PayPal-Request-Id
  invoice_id text unique not null,         -- <job>-r<n>
  amount_cents int not null check (amount_cents > 0),
  final boolean not null,
  line_ids uuid[] not null,
  -- SENDING: on record, PayPal's answer not known yet. Retried with the same request ID.
  status text not null check (status in ('SENDING','COMPLETED','PENDING','DECLINED','FAILED','REFUNDED','PARTIALLY_REFUNDED')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lines (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs on delete cascade not null,
  code text not null,                      -- L1, L2 ...
  title text not null,
  description text,
  price_cents int not null check (price_cents > 0),
  acceptance jsonb not null,               -- criterion, must_show, must_not_show, framing
  verifiable_by_photo boolean not null default true,
  status text not null default 'PENDING' check (status in
    ('PENDING','PROVING','VERIFIED','NEEDS_REVIEW','FAILED','APPROVED','FLAGGED','CAPTURED','DROPPED')),
  capture_id uuid references captures,     -- the capture that took this line, once reserved
  review_due_at timestamptz,               -- end of the review window; silence approves a VERIFIED line after it
  flag_note text,
  position int not null,
  unique (job_id, code)
);

create table photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs on delete cascade not null,
  line_id uuid references lines on delete cascade,
  kind text not null check (kind in ('before','after','during')),
  storage_path text not null,
  dhash text not null check (dhash ~ '^[0-9a-f]{16}$'),
  lat double precision,
  lng double precision,
  gps_accuracy_m real,
  capture_token text,
  device_id text,
  sample boolean not null default false,   -- judge-mode sample photo
  taken_at timestamptz not null,
  integrity jsonb                          -- check results (section 7)
);
create index photos_line on photos (line_id, kind);

create table capture_tokens (
  token text primary key,
  line_id uuid references lines on delete cascade not null,
  issued_to uuid references profiles not null,
  device_id text,
  issued_at timestamptz not null default now(),
  used_at timestamptz
);

create table verdicts (
  id uuid primary key default gen_random_uuid(),
  line_id uuid references lines on delete cascade not null,
  photo_id uuid references photos not null,
  observation jsonb not null,              -- LineObservation (section 6.2)
  verdict text not null check (verdict in ('VERIFIED','NEEDS_REVIEW','FAILED')),
  reasons jsonb not null default '[]',
  model text not null,
  pass int not null default 1,
  created_at timestamptz not null default now()
);

create table disputes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs on delete cascade not null,
  capture_id uuid references captures,
  paypal_dispute_id text unique not null,
  reason text,
  status text,
  draft_notes text,
  pdf_path text,
  filed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table events (                      -- append-only timeline
  id bigserial primary key,
  job_id uuid references jobs on delete cascade not null,
  actor text not null check (actor in ('tradesperson','homeowner','system','paypal')),
  type text not null,
  data jsonb,
  at timestamptz not null default now()
);
create index events_job on events (job_id, id);

create function events_append_only() returns trigger language plpgsql as $$
begin
  -- A job can still be deleted as a whole (demo copies are cleaned up).
  if tg_op = 'DELETE' and not exists (select 1 from jobs where id = old.job_id) then return old; end if;
  raise exception 'events is append-only';
end $$;
create trigger events_append_only before update or delete on events
  for each row execute function events_append_only();

create table webhook_events (              -- idempotency
  paypal_event_id text primary key,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

-- Row-level security: a job and everything under it is visible to its two
-- parties only. Every write goes through the server's service connection,
-- which bypasses RLS, so clients get read policies and nothing else.

create function is_job_party(j uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from jobs where id = j and auth.uid() in (trades_id, homeowner_id))
$$;

alter table profiles enable row level security;
alter table jobs enable row level security;
alter table authorizations enable row level security;
alter table captures enable row level security;
alter table lines enable row level security;
alter table photos enable row level security;
alter table capture_tokens enable row level security;
alter table verdicts enable row level security;
alter table disputes enable row level security;
alter table events enable row level security;
alter table webhook_events enable row level security;

create policy profiles_self on profiles for select to authenticated using (id = auth.uid());
create policy jobs_party on jobs for select to authenticated using (auth.uid() in (trades_id, homeowner_id));
create policy authorizations_party on authorizations for select to authenticated using (is_job_party(job_id));
create policy captures_party on captures for select to authenticated using (
  exists (select 1 from authorizations a where a.id = authorization_id and is_job_party(a.job_id)));
create policy lines_party on lines for select to authenticated using (is_job_party(job_id));
create policy photos_party on photos for select to authenticated using (is_job_party(job_id));
create policy verdicts_party on verdicts for select to authenticated using (
  exists (select 1 from lines l where l.id = line_id and is_job_party(l.job_id)));
create policy disputes_party on disputes for select to authenticated using (is_job_party(job_id));
create policy events_party on events for select to authenticated using (is_job_party(job_id));
-- capture_tokens and webhook_events have no policies: server only.

revoke all on all tables in schema public from anon;

-- The private photo bucket, where Supabase Storage exists.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('proof', 'proof', false) on conflict (id) do nothing;
  end if;
end $$;
