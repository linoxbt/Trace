-- Photos and proof files are kept for 180 days after a job closes (the window
-- in which a payment can be disputed), then deleted by the scheduled worker.
-- A demo job's go after 30 days. The record of what was checked and decided
-- stays; the images, files and photo locations go. This notes which jobs have
-- been cleared, so each is done once.

create table if not exists proof_purges (
  job_id uuid primary key references jobs on delete cascade,
  purged_at timestamptz not null default now(),
  files int not null default 0
);
alter table proof_purges enable row level security;
revoke all on proof_purges from anon, authenticated;
