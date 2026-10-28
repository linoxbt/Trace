import { z } from "zod";
import { createJob } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, HttpError, route } from "@/server/http";

const Input = z.object({
  address: z.string().trim().min(3).max(200),
  homeownerEmail: z.email().max(200),
  deviceId: z.string().max(200).nullish(),
});

/** POST /api/jobs: the tradesperson starts a DRAFT job. */
export const POST = route(async (req, { user }) => {
  if (user.anonymous) throw new HttpError(403, "sign_in", "sign in with your email to create a job");
  const input = await body(req, Input);
  const job = await createJob(engine(), { tradesId: user.id, homeownerEmail: input.homeownerEmail, address: input.address, deviceId: input.deviceId ?? null });
  return { id: job.id };
});
