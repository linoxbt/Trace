-- A webhook event that keeps failing is retried with growing gaps, and the
-- ones tried least go first, so one that always fails can't crowd out others.
-- webhook_claims was created by this role (015), so it can be altered here.

alter table webhook_claims add column if not exists attempts int not null default 0;
