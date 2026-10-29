import { describe, expect, it } from "vitest";
import { toCompileResult } from "../src/index.ts";

// Hand-written model outputs for the spec's examples (not recorded responses):
// they pin how the compiler's answer becomes a rule.
const cond = (field: string, op: string, slot: Partial<Record<"number" | "flag" | "text" | "list", unknown>>) =>
  ({ field, op, number: null, flag: null, text: null, list: null, ...slot }) as never;

describe("compiler output to rule", () => {
  it("takes each condition's value from the slot that fits", () => {
    expect(
      toCompileResult({
        outcome: "rule",
        unsupported_reason: null,
        applies_to: ["CAPTURE", "FINAL_CAPTURE", "CAPTURE"],
        conditions: [cond("action.amount_cents", "gt", { number: 15000 }), cond("facts.dispute_open", "eq", { flag: false }), cond("action.initiator.kind", "in", { list: ["worker"] })],
        effect: "require_approval",
        approver: "homeowner",
      }),
    ).toEqual({
      kind: "rule",
      rule: {
        applies_to: ["CAPTURE", "FINAL_CAPTURE"],
        when: [
          { field: "action.amount_cents", op: "gt", value: 15000 },
          { field: "facts.dispute_open", op: "eq", value: false },
          { field: "action.initiator.kind", op: "in", value: ["worker"] },
        ],
        effect: "require_approval",
        approver: "homeowner",
      },
    });
  });

  it("drops the approver on a deny, and passes 'unsupported' through", () => {
    const deny = toCompileResult({ outcome: "rule", unsupported_reason: null, applies_to: ["VOID"], conditions: [cond("facts.dispute_open", "eq", { flag: true })], effect: "deny", approver: "both" });
    expect(deny.kind === "rule" && deny.rule).toEqual({ applies_to: ["VOID"], when: [{ field: "facts.dispute_open", op: "eq", value: true }], effect: "deny" });
    expect(toCompileResult({ outcome: "unsupported", unsupported_reason: " no time-of-day field ", applies_to: [], conditions: [], effect: "deny", approver: null })).toEqual({
      kind: "unsupported",
      reason: "no time-of-day field",
    });
  });
});
