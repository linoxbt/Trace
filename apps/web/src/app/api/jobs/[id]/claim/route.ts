import { claimJob } from "@trace/engine";
import { engine } from "@/server/engine";
import { HttpError, route } from "@/server/http";

/** POST /api/jobs/:id/claim: the homeowner opens the job link signed in with the invited email. */
export const POST = route<{ id: string }>(async (_req, { params, user }) => {
  if (!user.email) throw new HttpError(403, "sign_in", "sign in with the email this job was sent to");
  await claimJob(engine(), params.id, { id: user.id, email: user.email });
  return { ok: true };
});
