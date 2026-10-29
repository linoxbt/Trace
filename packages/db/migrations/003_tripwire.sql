-- Tripwire (add-on spec section 9): the decision ledger, approval requests,
-- people's own rules, trust labels on inputs, and what the proof text scan
-- found. Nothing existing is dropped.

-- Proof text scan (section 7). A masked copy is a photo row of kind 'masked'
-- that points at its original; originals are never altered.
alter table photos add column text_scan jsonb;
alter table photos add column injection_flag boolean not null default false;
alter table photos add column masked_of uuid references photos;
alter table photos drop constraint if exists photos_kind_check;
alter table photos add constraint photos_kind_check check (kind in ('before','after','during','masked'));

-- A line whose latest proof had text aimed at the reviewer.
alter table lines add column injection_flag boolean not null default false;
alter table lines add column injection_excerpt text;

alter table verdicts add column masked boolean not null default false;

-- Scope-time check: instructions to the AI written into a line's text.
alter table jobs add column scope_flags jsonb;

create table guard_decisions (
  id bigserial primary key,
  request_id text not null,
  job_id uuid references jobs on delete cascade not null,
  action jsonb not null,                 -- MoneyAction
  decision jsonb not null,               -- Decision, facts snapshot included
  outcome text not null check (outcome in ('ALLOW','REQUIRE_APPROVAL','DENY')),
  executed boolean not null default false,
  paypal_result jsonb,
  decided_at timestamptz not null default now()
);
create index guard_decisions_job on guard_decisions (job_id, decided_at);
create index guard_decisions_request on guard_decisions (request_id);

-- Append-only: only the execution result may be filled in, once. A job can
-- still be deleted as a whole (demo copies are cleaned up).
create function guard_decisions_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from jobs where id = old.job_id) then return old; end if;
    raise exception 'guard_decisions is append-only';
  end if;
  if old.executed or new.action is distinct from old.action or new.decision is distinct from old.decision
     or new.outcome is distinct from old.outcome or new.request_id is distinct from old.request_id
     or new.job_id is distinct from old.job_id or new.decided_at is distinct from old.decided_at then
    raise exception 'guard_decisions is append-only';
  end if;
  return new;
end $$;
create trigger guard_decisions_lock before update or delete on guard_decisions
  for each row execute function guard_decisions_append_only();

create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  decision_id bigint references guard_decisions not null,
  job_id uuid references jobs on delete cascade not null,
  approver text not null check (approver in ('homeowner','tradesperson','both')),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','DENIED','EXPIRED')),
  approvals jsonb not null default '[]',  -- [{by, at, event_id}]
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index approval_requests_job on approval_requests (job_id, status);

-- People's own rules. A preset row only records that someone turned a
-- built-in preset off (or back on); the preset's rule lives in code.
create table guard_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles on delete cascade not null,
  owner_kind text not null check (owner_kind in ('homeowner','tradesperson')),
  scope text not null check (scope in ('job','account')),
  job_id uuid references jobs on delete cascade,
  preset text,
  rule jsonb,
  english text not null,
  readback text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check ((preset is null) = (rule is not null)),
  check ((scope = 'job') = (job_id is not null))
);
create index guard_rules_owner on guard_rules (owner_id);
create unique index guard_rules_one_preset on guard_rules (owner_id, preset) where preset is not null;

-- How far each input to a money decision can be trusted (section 7).
create table input_labels (
  ref text primary key,                  -- proof:<id>, verdict:<id>, line:<id>, note:<id>
  job_id uuid references jobs on delete cascade not null,
  trust text not null check (trust in ('system','homeowner','tradesperson','untrusted_content','ai_output')),
  parents text[] not null default '{}'
);
create index input_labels_job on input_labels (job_id);

alter table guard_decisions enable row level security;
alter table approval_requests enable row level security;
alter table guard_rules enable row level security;
alter table input_labels enable row level security;

create policy guard_decisions_party on guard_decisions for select to authenticated using (is_job_party(job_id));
create policy approval_requests_party on approval_requests for select to authenticated using (is_job_party(job_id));
create policy guard_rules_owner on guard_rules for select to authenticated using (owner_id = auth.uid());
create policy input_labels_party on input_labels for select to authenticated using (is_job_party(job_id));

revoke all on guard_decisions, approval_requests, guard_rules, input_labels from anon;
