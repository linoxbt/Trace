-- The public roles (the publishable key, guest and signed-in sessions) only
-- ever read their own jobs, through row-level security; every write goes
-- through the server. Supabase grants them everything on each new public
-- table by default, so this takes the writes back on every table, and closes
-- the migration ledger, which the runner creates without row-level security.
-- A test checks every public table stays this way.

alter table trace_migrations enable row level security;
revoke all on trace_migrations from anon, authenticated;

revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
