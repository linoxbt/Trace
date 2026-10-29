-- Pay the tradesperson directly. Each tradesperson links their own PayPal
-- account through Trace's partner sign-up; every order names them as payee,
-- so captured money settles in their account and never in Trace's.

alter table profiles add column paypal_merchant_id text unique;
alter table profiles add column paypal_receivable boolean not null default false;
alter table profiles add column paypal_email_confirmed boolean not null default false;
alter table profiles add column paypal_permissions boolean not null default false;
alter table profiles add column paypal_checked_at timestamptz;

-- Frozen when the homeowner's order is created: the account this job pays.
alter table jobs add column payee_merchant_id text;
