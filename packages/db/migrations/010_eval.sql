-- Eval runs (spec section 12): the photo verifier set and the planted-note
-- set, run on the server with the production models, one case at a time from
-- the scheduled worker. A run is per set version and model, so a changed set
-- or a new model gets a fresh run; the public /accuracy page reads the latest.

create table eval_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('verifier', 'inject')),
  set_version text not null,
  model text not null,
  total int not null,
  status text not null default 'running' check (status in ('running', 'done')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb,
  unique (kind, set_version, model)
);

create table eval_results (
  run_id uuid references eval_runs on delete cascade not null,
  case_id text not null,
  expected text not null,
  got text,
  correct boolean,
  detail jsonb not null default '{}',
  error text,
  attempts int not null default 1,
  created_at timestamptz not null default now(),
  primary key (run_id, case_id)
);

alter table eval_runs enable row level security;
alter table eval_results enable row level security;
