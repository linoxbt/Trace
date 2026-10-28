import { z } from "zod";
import { issueCaptureToken } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";

const Input = z.object({ deviceId: z.string().max(200).nullish() });

/** POST /api/lines/:id/token: the camera opened; a one-time token valid 120 s. */
export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const { deviceId } = await body(req, Input);
  return issueCaptureToken(engine(), params.id, user.id, deviceId ?? null);
});
