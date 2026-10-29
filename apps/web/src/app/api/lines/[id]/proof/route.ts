import { getLine } from "@trace/db";
import { submitDeliverableProof, submitDocumentProof, submitProof, submitReadingProof, submitVideoProof } from "@trace/engine";
import { engine } from "@/server/engine";
import { formFields, HttpError, photoFromForm, route } from "@/server/http";

export const maxDuration = 60;

const MAX_FILE = 10 * 1024 * 1024;

/**
 * POST /api/lines/:id/proof: the line's proof, as its proof type needs it
 * (multipart). Integrity checks, the verifier, and the verdict.
 *   photo: photo, plus lat/lng/accuracy, deviceId, token
 *   video: frame (up to 8, in order), times (JSON seconds), duration, plus the camera fields
 *   reading: photo, value (what the person read), plus the camera fields
 *   document: file
 *   deliverable: url, or file
 */
export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const e = engine();
  const line = await getLine(e.db, params.id);
  if (!line) throw new HttpError(404, "not_found", "line not found");
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "bad_form", "send the proof as multipart form data");
  const f = formFields(form);
  const sample = form.get("sample") === "true";
  const base = { lineId: params.id, tradesId: user.id, sample };
  const file = async (key: string) => {
    const v = form.get(key);
    if (!(v instanceof File)) return null;
    if (v.size > MAX_FILE) throw new HttpError(413, "too_big", "proof files are limited to 10 MB");
    return { bytes: new Uint8Array(await v.arrayBuffer()), mime: v.type, name: v.name || "file" };
  };

  let r;
  switch (line.proof_type) {
    case "photo": {
      const p = await photoFromForm(form);
      r = await submitProof(e, { ...base, photo: p.bytes, deviceId: p.deviceId, gps: p.gps, token: p.token ?? undefined });
      break;
    }
    case "video": {
      const frames = form.getAll("frame").filter((x): x is File => x instanceof File).slice(0, 8);
      const times = JSON.parse(String(form.get("times") ?? "[]")) as unknown;
      const at = Array.isArray(times) ? times.map(Number) : [];
      r = await submitVideoProof(e, {
        ...base,
        frames: await Promise.all(frames.map(async (fr, i) => ({ atS: Number.isFinite(at[i]) ? at[i]! : i, bytes: new Uint8Array(await fr.arrayBuffer()) }))),
        durationS: f.num("duration") ?? 0,
        deviceId: f.deviceId,
        gps: f.gps,
        token: f.token ?? undefined,
      });
      break;
    }
    case "reading": {
      const p = await photoFromForm(form);
      r = await submitReadingProof(e, { ...base, photo: p.bytes, enteredValue: f.num("value"), deviceId: p.deviceId, gps: p.gps, token: p.token ?? undefined });
      break;
    }
    case "document": {
      const doc = await file("file");
      if (!doc) throw new HttpError(400, "no_file", "attach the document");
      r = await submitDocumentProof(e, { ...base, ...doc });
      break;
    }
    case "deliverable": {
      const raw = form.get("url");
      const url = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 2000) : null;
      r = await submitDeliverableProof(e, { ...base, url: url ?? undefined, file: (await file("file")) ?? undefined });
      break;
    }
    default:
      throw new HttpError(400, "use_sign_off", "this line is proved by a sign-off; send the sign-off link instead");
  }
  return { verdict: r.verdict, reasons: r.reasons, photoId: r.photoId, integrity: r.integrity, region: r.observation?.region ?? null };
});
