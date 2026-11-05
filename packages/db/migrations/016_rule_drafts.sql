-- A rule is saved exactly as Trace compiled and read it back. Compiling keeps
-- the draft here, and saving takes only its ID, so the rule and readback can't
-- be swapped for others between the two.

create table if not exists rule_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  target jsonb not null,
  english text not null,
  readback text not null,
  rule jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists rule_drafts_owner on rule_drafts (owner_id, created_at);
alter table rule_drafts enable row level security;
revoke all on rule_drafts from anon, authenticated;
