-- The scheduled worker records each run here: one row, overwritten. The
-- health check reads it to show the worker is alive, and the write is the
-- steady database activity that keeps a free Supabase project from pausing
-- between submission and judging.
create table worker_heartbeat (
  id int primary key default 1 check (id = 1),
  last_tick_at timestamptz not null,
  report jsonb not null default '{}'
);
alter table worker_heartbeat enable row level security;
