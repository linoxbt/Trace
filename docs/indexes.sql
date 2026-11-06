-- Run once in the Supabase SQL editor (as the postgres role, which owns these
-- tables). Migration 020 makes the same indexes itself where the app's role
-- owns the tables; this is for where it doesn't. Safe to run more than once.
create index if not exists captures_authorization on captures (authorization_id);
create index if not exists captures_sending on captures (updated_at) where status = 'SENDING';
create index if not exists lines_capture on lines (capture_id) where capture_id is not null;
create index if not exists lines_status on lines (status, review_due_at);
create index if not exists authorizations_job on authorizations (job_id);
create index if not exists authorizations_pending on authorizations (updated_at) where status = 'PENDING';
create index if not exists approval_requests_open on approval_requests (status, expires_at);
create index if not exists webhook_events_failed on webhook_events (received_at) where processed_at is null and error is not null;
