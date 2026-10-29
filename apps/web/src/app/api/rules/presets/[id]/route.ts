import { z } from "zod";
import { setPresetOn } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";

/** PATCH /api/rules/presets/:id: turn a preset (P1 to P3) off or back on, for the jobs where you are the homeowner. */
export const PATCH = route<{ id: string }>(async (req, { params, user }) => {
  const b = await body(req, z.object({ enabled: z.boolean() }));
  await setPresetOn(engine(), user.id, params.id, b.enabled);
  return { ok: true };
});
