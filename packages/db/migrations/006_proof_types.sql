-- Proof types (spec section 6.2). A line is proved by a photo, a short video,
-- a document, a meter or gauge reading, a deliverable (a file or a link), or
-- a signed attestation. Photo lines are unchanged.

alter table lines add column proof_type text not null default 'photo'
  check (proof_type in ('photo','video','document','reading','deliverable','attestation'));
alter table lines add column proof_spec jsonb;

-- Proof that isn't a single photo: video frames, documents, files, link
-- snapshots and attestation records. The camera-taken frame of a video or a
-- reading is also a photos row, so the photo checks run on it as before.
create table proof_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs on delete cascade not null,
  line_id uuid references lines on delete cascade not null,
  kind text not null check (kind in ('video_frame','document','file','url','attestation')),
  storage_path text,
  sha256 text,
  meta jsonb not null default '{}',
  sample boolean not null default false,
  created_at timestamptz not null default now()
);
create index proof_items_line on proof_items (line_id, created_at);
create index proof_items_sha on proof_items (sha256);
alter table proof_items enable row level security;

-- A verdict is on a photo, or on a proof item.
alter table verdicts alter column photo_id drop not null;
alter table verdicts add column proof_item_id uuid references proof_items;

-- Single-use sign-off links for attestation lines. Only a hash of the token is kept.
create table attestations (
  id uuid primary key default gen_random_uuid(),
  line_id uuid references lines on delete cascade not null,
  token_hash text unique not null,
  email text not null,
  statement text not null,
  signed_name text,
  signed_at timestamptz,
  signed_ip text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index attestations_line on attestations (line_id, created_at);
alter table attestations enable row level security;
