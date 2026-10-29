import { z } from "zod";
import { compileRule } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";
import { Target } from "../schemas";

/** POST /api/rules/compile: plain English to a rule, its blind readback and a backtest. Saves nothing. */
export const POST = route(async (req, { user }) => {
  const b = await body(req, Target.extend({ english: z.string() }));
  return compileRule(engine(), user.id, b);
});
