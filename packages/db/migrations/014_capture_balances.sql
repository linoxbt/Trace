-- Makes sure refunds are kept the 013 way on every database. The live one
-- recorded an earlier 013, which added refunded_cents and refund_ids columns
-- to captures, so the refunds table and the capture_balances view were never
-- made there. Safe on a database where 013 already made them.

create table if not exists capture_refunds (
  capture_id uuid not null references captures on delete cascade,
  refund_id text not null,
  cents int not null check (cents > 0),
  created_at timestamptz not null default now(),
  primary key (capture_id, refund_id)
);
alter table capture_refunds enable row level security;
revoke all on capture_refunds from anon, authenticated;

-- Refunds the earlier 013 recorded as columns on captures, carried across once.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'captures' and column_name = 'refunded_cents') then
    execute $q$
      insert into capture_refunds (capture_id, refund_id, cents)
        select id, coalesce(refund_ids[1], 'legacy-' || id), refunded_cents from captures where refunded_cents > 0
      on conflict do nothing
    $q$;
  end if;
end $$;

-- Capture columns listed by name: on the live database captures also has the
-- earlier 013's columns, which this view's own refunded_cents replaces.
drop view if exists capture_balances;
create view capture_balances as
  select c.id, c.authorization_id, c.paypal_capture_id, c.request_id, c.invoice_id, c.amount_cents, c.final, c.line_ids,
    c.status, c.attempts, c.last_error, c.created_at, c.updated_at,
    least(c.amount_cents, coalesce((select sum(r.cents) from capture_refunds r where r.capture_id = c.id), 0))::int as refunded_cents,
    coalesce((select array_agg(r.refund_id order by r.created_at) from capture_refunds r where r.capture_id = c.id), '{}')::text[] as refund_ids
  from captures c;
revoke all on capture_balances from anon, authenticated;
