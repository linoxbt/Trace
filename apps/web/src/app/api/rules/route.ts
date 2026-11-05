import { z } from "zod";
import { listRules, saveRule } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";

/** GET /api/rules: the signed-in user's rules and preset switches. */
export const GET = route(async (_req, { user }) => listRules(engine(), user.id));

/** POST /api/rules: save a compiled rule the user read back and accepted. Rules only tighten. */
export const POST = route(async (req, { user }) => {
  const b = await body(req, z.object({ draftId: z.uuid() }));
  const row = await saveRule(engine(), user.id, b);
  return { id: row.id };
});
