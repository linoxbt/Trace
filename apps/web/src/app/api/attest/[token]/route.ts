import { z } from "zod";
import { signAttestation } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";

/**
 * POST /api/attest/:token: the person named on a line signs it off. They must
 * be signed in with the email the line names, and not be either side of the
 * job; the link alone is not enough. Name, time and IP are recorded, and the
 * client then approves the line.
 */
export const POST = route<{ token: string }>(async (req, { params, user }) => {
  const { name } = await body(req, z.object({ name: z.string().min(2).max(80) }));
  const ip = req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const r = await signAttestation(engine(), params.token, { name, ip, signer: { id: user.id, email: user.anonymous ? null : user.email } });
  return { verdict: r.verdict };
});
