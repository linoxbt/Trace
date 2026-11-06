-- Indexes for the queries every money action and every worker run makes. The
-- tables were created by Supabase's postgres role, and only a table's owner
-- may index it, so each index is made only where this role owns the table;
-- elsewhere it is skipped with a notice, and docs/indexes.sql makes them as
-- the owner. Nothing here alters a table.

do $$
declare
  ix record;
begin
  for ix in
    select * from (values
      ('captures', 'captures_authorization', 'create index if not exists captures_authorization on captures (authorization_id)'),
      ('captures', 'captures_sending', 'create index if not exists captures_sending on captures (updated_at) where status = ''SENDING'''),
      ('lines', 'lines_capture', 'create index if not exists lines_capture on lines (capture_id) where capture_id is not null'),
      ('lines', 'lines_status', 'create index if not exists lines_status on lines (status, review_due_at)'),
      ('authorizations', 'authorizations_job', 'create index if not exists authorizations_job on authorizations (job_id)'),
      ('authorizations', 'authorizations_pending', 'create index if not exists authorizations_pending on authorizations (updated_at) where status = ''PENDING'''),
      ('approval_requests', 'approval_requests_open', 'create index if not exists approval_requests_open on approval_requests (status, expires_at)'),
      ('webhook_events', 'webhook_events_failed', 'create index if not exists webhook_events_failed on webhook_events (received_at) where processed_at is null and error is not null')
    ) as t(tbl, name, ddl)
  loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = ix.tbl and tableowner = current_user) then
      execute ix.ddl;
    else
      raise notice 'index % skipped: % is owned by another role (see docs/indexes.sql)', ix.name, ix.tbl;
    end if;
  end loop;
end $$;
