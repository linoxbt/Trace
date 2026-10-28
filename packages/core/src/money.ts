// All amounts are integer cents. PayPal speaks decimal strings ("420.00").

export type Cents = number;

export function assertCents(n: number, what = "amount"): Cents {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${what} must be a non-negative integer of cents, got ${n}`);
  return n;
}

export function toPayPalValue(cents: Cents): string {
  assertCents(cents);
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  return `${whole}.${frac}`;
}

export function fromPayPalValue(value: string): Cents {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new RangeError(`not a PayPal amount: ${JSON.stringify(value)}`);
  return assertCents(Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")));
}

export function formatMoney(cents: Cents, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function sum(values: readonly Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0);
}
