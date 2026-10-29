import { z } from "zod";
import { Rule } from "@trace/core";

export const Target = z.object({
  side: z.enum(["homeowner", "tradesperson"]),
  scope: z.enum(["job", "account"]),
  jobId: z.uuid().nullish(),
});

export const Compiled = Rule.pick({ applies_to: true, when: true, effect: true, approver: true });
