import { z } from "zod";
import { proposeChangeOrder } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";

const Input = z.object({
  lines: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(60),
        description: z.string().max(280).nullish(),
        priceCents: z.number().int().positive(),
        acceptance: z.unknown(),
        verifiableByPhoto: z.boolean(),
        proofType: z.string().optional(),
        proofSpec: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(8),
});

/** POST /api/jobs/:id/change-orders: propose added work on a held job. The client approves its own hold. */
export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const { lines } = await body(req, Input);
  const co = await proposeChangeOrder(engine(), params.id, user.id, lines.map((l) => ({ ...l, description: l.description ?? null })));
  return { id: co.id, code: co.code };
});
