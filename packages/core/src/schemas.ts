// The model's outputs (spec section 6). Each is validated before any code reads it.

import { z } from "zod";

export const Acceptance = z.object({
  criterion: z.string().max(200), // one observable sentence
  must_show: z.array(z.string().max(160)).min(1).max(4),
  must_not_show: z.array(z.string().max(160)).max(4),
  framing: z.string().max(160), // how to shoot the after-photo
});
export type Acceptance = z.infer<typeof Acceptance>;

export const ScopeDraft = z.object({
  summary: z.string().max(240),
  lines: z
    .array(
      z.object({
        id: z.string(), // "L1", "L2", ...
        title: z.string().max(60),
        description: z.string().max(280),
        suggested_price_cents: z.number().int().positive(),
        before_photo_ids: z.array(z.string()).min(1),
        acceptance: Acceptance,
        verifiable_by_photo: z.boolean(),
        note: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(8),
});
export type ScopeDraft = z.infer<typeof ScopeDraft>;

export const Tristate = z.enum(["yes", "no", "uncertain"]);
export type Tristate = z.infer<typeof Tristate>;

export const Region = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type Region = z.infer<typeof Region>;

export const LineObservation = z.object({
  line_id: z.string(),
  same_location: Tristate,
  /** Is the after-photo a photo of a screen or a printout (moiré, bezels, glare)? Section 7. */
  recapture: Tristate,
  checks: z.array(
    z.object({
      check: z.string(), // copied from must_show / must_not_show
      kind: z.enum(["must_show", "must_not_show"]),
      satisfied: z.boolean(),
      observation: z.string().max(160),
    }),
  ),
  region: Region.optional(), // 0–1, after-photo
  confidence: z.number().min(0).max(1),
  homeowner_reason: z.string().max(200), // plain words
});
export type LineObservation = z.infer<typeof LineObservation>;
