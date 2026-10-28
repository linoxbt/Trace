// The scope hash freezes what both sides approved. It goes into the order's
// custom_id and the evidence pack.

import { createHash } from "node:crypto";
import type { Acceptance } from "./schemas.ts";

export interface ScopeLine {
  code: string;
  title: string;
  priceCents: number;
  acceptance: Acceptance;
  verifiableByPhoto: boolean;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function scopeHash(input: { jobId: string; currency: string; lines: readonly ScopeLine[] }): string {
  const body = canonical({
    job: input.jobId,
    currency: input.currency,
    lines: input.lines.map((l) => ({
      code: l.code,
      title: l.title,
      price_cents: l.priceCents,
      acceptance: l.acceptance,
      verifiable_by_photo: l.verifiableByPhoto,
    })),
  });
  return createHash("sha256").update(body).digest("hex");
}
