-- One delivery of a webhook at a time. PayPal can deliver the same event twice
-- at once (a retry racing the first try); the first to claim it runs it, and a
-- claim that outlives its function (it timed out) lapses so a retry can run.
-- Its own table: the app's role can't alter webhook_events, which another role
-- created.

create table if not exists webhook_claims (
  paypal_event_id text primary key,
  claimed_until timestamptz not null
);
alter table webhook_claims enable row level security;
revoke all on webhook_claims from anon, authenticated;
