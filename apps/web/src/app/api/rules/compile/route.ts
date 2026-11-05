import { z } from "zod";
import { compileRule } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, HttpError, route } from "@/server/http";
import { Target } from "../schemas";

/** POST /api/rules/compile: plain English to a rule, its blind readback and a backtest. Saves nothing. Not for guests. */
export const POST = route(async (req, { user }) => {
  if (user.anonymous) throw new HttpError(403, "sign_in", "sign in with your email to write payment rules");
  const b = await body(req, Target.extend({ english: z.string() }));
  return compileRule(engine(), user.id, b);
});
