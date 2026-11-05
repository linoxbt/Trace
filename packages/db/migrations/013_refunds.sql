-- Refunds by amount, not by flag. A capture can be refunded in parts; PayPal
-- reports each refund (Trace's own included) by webhook, so each refund ID is
-- recorded once. They live in their own table (the app's role can't alter
-- captures, which another role created), and capture_balances adds each
-- capture's refunded total and refund IDs for reading.

create table capture_refunds (
  capture_id uuid not null references captures on delete cascade,
  refund_id text not null,
  cents int not null check (cents > 0),
  created_at timestamptz not null default now(),
  primary key (capture_id, refund_id)
);
alter table capture_refunds enable row level security;
revoke all on capture_refunds from anon, authenticated;

-- Captures already marked refunded in full, from before amounts were kept.
insert into capture_refunds (capture_id, refund_id, cents)
  select id, 'legacy-' || id, amount_cents from captures where status = 'REFUNDED';

create view capture_balances as
  select c.*,
    least(c.amount_cents, coalesce((select sum(r.cents) from capture_refunds r where r.capture_id = c.id), 0))::int as refunded_cents,
    coalesce((select array_agg(r.refund_id order by r.created_at) from capture_refunds r where r.capture_id = c.id), '{}')::text[] as refund_ids
  from captures c;
revoke all on capture_balances from anon, authenticated;
