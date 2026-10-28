import { addBeforePhoto } from "@trace/engine";
import { engine } from "@/server/engine";
import { photoForm, route } from "@/server/http";

/** POST /api/jobs/:id/photos: a before-photo. The first one with GPS anchors the job. */
export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const f = await photoForm(req);
  const lineId = f.form.get("lineId");
  const photo = await addBeforePhoto(engine(), {
    jobId: params.id,
    tradesId: user.id,
    photo: f.bytes,
    gps: f.gps,
    deviceId: f.deviceId,
    lineId: typeof lineId === "string" && lineId ? lineId : null,
  });
  return { id: photo.id };
});
