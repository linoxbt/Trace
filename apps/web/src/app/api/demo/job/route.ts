import { demoJobFor, networkKey, type DemoAssets, type DemoCode } from "@trace/engine";
import { env } from "@/server/env";
import { engine } from "@/server/engine";
import { HttpError, route } from "@/server/http";

export const maxDuration = 60;

const CODES: DemoCode[] = ["L1", "L2", "L3", "L4"];

/**
 * POST /api/demo/job: the visitor's private copy of the demo job (a guest
 * session is enough). They keep one open demo job: opening the demo again
 * returns it. Its before-photos are the site's own sample photos.
 */
export const POST = route(async (req, { user }) => {
  const assets = async () => {
    const before = {} as DemoAssets["before"];
    for (const code of CODES) {
      const res = await fetch(new URL(`/photos/${code.toLowerCase()}-before.webp`, req.nextUrl.origin));
      if (!res.ok) throw new HttpError(503, "demo_assets", "the demo photos couldn't be loaded; try again");
      before[code] = new Uint8Array(await res.arrayBuffer());
    }
    return { before };
  };
  const ip = req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const network = ip ? networkKey(ip, env().EVAL_STEP_SECRET ?? env().PAYPAL_CLIENT_SECRET ?? "trace") : undefined;
  const job = await demoJobFor(engine(), { id: user.id, email: user.anonymous ? null : user.email }, assets, { network });
  return { id: job.id };
});
