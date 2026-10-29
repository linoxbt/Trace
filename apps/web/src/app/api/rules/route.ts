import { z } from "zod";
import { listRules, saveRule } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";
import { Compiled, Target } from "./schemas";

/** GET /api/rules: the signed-in user's rules and preset switches. */
export const GET = route(async (_req, { user }) => listRules(engine(), user.id));

/** POST /api/rules: save a compiled rule the user read back and accepted. Rules only tighten. */
export const POST = route(async (req, { user }) => {
  const b = await body(req, Target.extend({ english: z.string(), readback: z.string().max(400), rule: Compiled }));
  const row = await saveRule(engine(), user.id, b);
  return { id: row.id };
});
