-- Live updates (spec section 11): pages listen for new timeline events over
-- Supabase Realtime, so verdicts and payments appear without a refresh. Row
-- level security (events_party) limits each person to their own jobs' events.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
    alter publication supabase_realtime add table events;
  end if;
end $$;
