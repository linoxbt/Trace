-- What the AI drafter suggested each line cost, so a price far above it can
-- be asked about before money moves (Tripwire rule B12). Kept per job by the
-- line's title, as the tradesperson may reorder or edit lines after drafting.

create table if not exists price_suggestions (
  job_id uuid not null references jobs on delete cascade,
  title_key text not null,
  suggested_cents int not null check (suggested_cents > 0),
  created_at timestamptz not null default now(),
  primary key (job_id, title_key)
);
alter table price_suggestions enable row level security;
revoke all on price_suggestions from anon, authenticated;
