import { requestAttestation } from "@trace/engine";
import { engine } from "@/server/engine";
import { env } from "@/server/env";
import { route } from "@/server/http";

/** POST /api/lines/:id/attest-request: a single-use sign-off link for the person named on the line. Shown once. */
export const POST = route<{ id: string }>(async (_req, { params, user }) => {
  const a = await requestAttestation(engine(), params.id, user.id);
  return { link: `${env().APP_URL}/attest/${a.token}`, email: a.email, statement: a.statement, expiresAt: a.expiresAt.toISOString() };
});
