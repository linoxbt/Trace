import { z } from "zod";
import { confirmClose } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";

const Input = z.object({ dropLineIds: z.array(z.uuid()).max(8) });

/** POST /api/jobs/:id/close: confirm closing with these lines dropped. Both sides must confirm the same set. */
export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const { dropLineIds } = await body(req, Input);
  return confirmClose(engine(), params.id, user.id, dropLineIds);
});
