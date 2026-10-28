import { z } from "zod";
import { decideLine } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";

const Input = z.discriminatedUnion("approve", [
  z.object({ approve: z.literal(true) }),
  z.object({ approve: z.literal(false), note: z.string().trim().min(1).max(500) }),
]);

/** POST /api/lines/:id/decision: the homeowner approves or flags a proved line. */
export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const decision = await body(req, Input);
  const line = await decideLine(engine(), params.id, user.id, decision);
  return { status: line.status };
});
