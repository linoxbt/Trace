import { submitProof } from "@trace/engine";
import { engine } from "@/server/engine";
import { photoForm, route } from "@/server/http";

export const maxDuration = 60;

/** POST /api/lines/:id/proof: the after-photo; integrity checks, the verifier, and the verdict. */
export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const f = await photoForm(req);
  const r = await submitProof(engine(), {
    lineId: params.id,
    tradesId: user.id,
    photo: f.bytes,
    deviceId: f.deviceId,
    gps: f.gps,
    token: f.token ?? undefined,
    sample: f.form.get("sample") === "true",
  });
  return { verdict: r.verdict, reasons: r.reasons, photoId: r.photoId, integrity: r.integrity, region: r.observation?.region ?? null };
});
