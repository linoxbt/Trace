import { z } from "zod";
import { updateProfile } from "@trace/db";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";
import { myJobs } from "@/server/view";

export const GET = route(async (_req, { user }) => ({ user, jobs: await myJobs(user.id) }));

/** PATCH /api/me: your name and the PayPal email you're paid at. */
export const PATCH = route(async (req, { user }) => {
  const b = await body(req, z.object({ displayName: z.string().trim().min(1).max(80).optional(), paypalEmail: z.email().max(200).nullable().optional() }));
  await updateProfile(engine().db, user.id, b);
  return { ok: true };
});
