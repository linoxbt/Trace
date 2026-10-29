-- Change orders (spec section 5): work added once the money is held gets its
-- own PayPal order and authorization. Its lines wait here until the client
-- approves the extra hold, then join the job's lines, tied to that hold.

create table change_orders (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs on delete cascade not null,
  code text not null,                         -- CO1, CO2, ...
  status text not null default 'AWAITING_APPROVAL'
    check (status in ('AWAITING_APPROVAL','AUTHORIZED','DECLINED','CANCELLED')),
  lines jsonb not null,                       -- the proposed lines, frozen
  total_cents int not null check (total_cents > 0),
  scope_hash text not null,
  paypal_order_id text,
  authorization_id uuid references authorizations,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, code)
);
alter table change_orders enable row level security;

alter table lines add column change_order_id uuid references change_orders;
create index lines_change_order on lines (change_order_id) where change_order_id is not null;
