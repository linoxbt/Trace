import { z } from "zod";
import { removeRule, setRuleOn } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";

/** PATCH /api/rules/:id: switch one of your rules on or off. */
export const PATCH = route<{ id: string }>(async (req, { params, user }) => {
  const b = await body(req, z.object({ enabled: z.boolean() }));
  await setRuleOn(engine(), user.id, params.id, b.enabled);
  return { ok: true };
});

/** DELETE /api/rules/:id: remove one of your rules. Built-in rules can't be removed. */
export const DELETE = route<{ id: string }>(async (_req, { params, user }) => {
  await removeRule(engine(), user.id, params.id);
  return { ok: true };
});
