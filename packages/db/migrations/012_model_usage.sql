-- Model-call budget (spend on AI is capped before the call, not counted
-- after): each AI action reserves a row here under a per-user lock, and is
-- refused once the user's, or all guests', hourly allowance is used.
create table model_usage (
  id bigserial primary key,
  user_id uuid,
  kind text not null,
  guest boolean not null default false,
  created_at timestamptz not null default now()
);
create index model_usage_user on model_usage (user_id, kind, created_at);
create index model_usage_guest on model_usage (created_at) where guest;
alter table model_usage enable row level security;
revoke all on model_usage from anon, authenticated;
