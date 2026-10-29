import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { EngineError } from "@trace/engine";
import { NotFound } from "@trace/db";
import { IllegalTransition, OverCapture } from "@trace/core";
import { currentUser, type SessionUser } from "./auth";
import { env } from "./env";

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

type Ctx<P> = { params: Promise<P> };

/**
 * Wrap a route handler: same-origin check on writes, a signed-in user, and
 * errors turned into { error, message } with the right status. Nothing
 * internal leaks to the client.
 */
export function route<P = Record<string, string>>(
  fn: (req: NextRequest, ctx: { params: P; user: SessionUser }) => Promise<unknown>,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      if (req.method !== "GET" && !sameOrigin(req)) throw new HttpError(403, "bad_origin", "cross-site request refused");
      const user = await currentUser();
      if (!user) throw new HttpError(401, "signed_out", "sign in first");
      const out = await fn(req, { params: await ctx.params, user });
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  if (err instanceof EngineError) return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  if (err instanceof NotFound) return NextResponse.json({ error: "not_found", message: `${err.what} not found` }, { status: 404 });
  if (err instanceof IllegalTransition) return NextResponse.json({ error: "illegal_transition", message: "that step isn't allowed now" }, { status: 409 });
  if (err instanceof OverCapture) return NextResponse.json({ error: "over_capture", message: "that would capture more than is held" }, { status: 409 });
  if (err instanceof z.ZodError) return NextResponse.json({ error: "bad_request", message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  console.error(JSON.stringify({ level: "error", msg: "unhandled route error", err: String(err), stack: err instanceof Error ? err.stack : undefined }));
  return NextResponse.json({ error: "internal", message: "something went wrong; nothing was charged" }, { status: 500 });
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const allowed = new URL(env().APP_URL).origin;
  return origin === allowed || origin === req.nextUrl.origin;
}

export async function body<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "bad_json", "the request body must be JSON");
  }
  return schema.parse(json);
}

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

/** A photo upload: multipart with a `photo` file plus optional GPS and device fields. */
export async function photoForm(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "bad_form", "send the photo as multipart form data");
  return photoFromForm(form);
}

/** The same fields, from a form already read. */
export async function photoFromForm(form: FormData, field = "photo") {
  const file = form.get(field);
  if (!(file instanceof File)) throw new HttpError(400, "no_photo", "the photo is missing");
  if (file.size > MAX_PHOTO_BYTES) throw new HttpError(413, "photo_too_big", "photos are limited to 12 MB");
  return { bytes: new Uint8Array(await file.arrayBuffer()), ...formFields(form), form };
}

/** GPS, device and token fields of a proof form. */
export function formFields(form: FormData) {
  const num = (k: string) => {
    const v = form.get(k);
    const n = typeof v === "string" && v !== "" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const lat = num("lat");
  const lng = num("lng");
  const accuracy = num("accuracy");
  const gps =
    lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat, lng, accuracyM: accuracy ?? 9999 }
      : null;
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v ? v.slice(0, 200) : null;
  };
  return { gps, deviceId: str("deviceId"), token: str("token"), num, str };
}
