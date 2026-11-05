-- One worker at a time, by lease rather than a session lock: through the
-- transaction pooler a session lock can land on one server connection and its
-- unlock on another. A lease lapses on its own if its holder dies.

create table if not exists worker_leases (
  name text primary key,
  holder text not null,
  until timestamptz not null
);
alter table worker_leases enable row level security;
revoke all on worker_leases from anon, authenticated;
