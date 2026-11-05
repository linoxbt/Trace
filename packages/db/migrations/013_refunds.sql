-- Refunds by amount, not by flag. A capture can be refunded in parts; PayPal
-- reports each refund (Trace's own included) by webhook, so each refund ID is
-- counted once, and a capture is REFUNDED only when all of it has come back.
alter table captures add column refunded_cents int not null default 0;
alter table captures add column refund_ids text[] not null default '{}';
update captures set refunded_cents = amount_cents where status = 'REFUNDED';
alter table captures add constraint captures_refunded_range check (refunded_cents >= 0 and refunded_cents <= amount_cents);
