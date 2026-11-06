import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { jsonSchema, tool } from "ai";
import { MockLanguageModelV1 } from "ai/test";
import type { Evidence } from "@trace/engine";
import { FirstThatWorks, ToolkitDisputeDrafter } from "../src/server/dispute-agent";

const ev = {
  dispute: { paypal_dispute_id: "PP-D-1", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" },
  job: { paypal_order_id: "ORDER-1", address: "12 Admiralty Way" },
  tradesName: "Ade",
  scopeSentAt: null,
  authorizedAt: null,
  heldCents: 42000,
  lines: [],
  captures: [{ id: "c1", paypalId: "CAP-1", amountCents: 12000, at: "2026-11-03T10:00:00Z", lines: ["L1"], disputed: true }],
  decisions: [],
} as unknown as Evidence;

describe("dispute assistant on PayPal's Agent Toolkit", () => {
  it("reads the dispute from PayPal with the toolkit's tool, then drafts", async () => {
    const asked: string[] = [];
    let step = 0;
    const model = new MockLanguageModelV1({
      doGenerate: async () => {
        step += 1;
        if (step === 1) {
          return {
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: "tool-calls",
            usage: { promptTokens: 1, completionTokens: 1 },
            toolCalls: [{ toolCallType: "function", toolCallId: "t1", toolName: "get_dispute", args: JSON.stringify({ dispute_id: "PP-D-1" }) }],
          };
        }
        return { rawCall: { rawPrompt: null, rawSettings: {} }, finishReason: "stop", usage: { promptTokens: 1, completionTokens: 1 }, text: "The client says the work wasn't done. PayPal's record shows the capture of $120.00 for L1, proved and approved." };
      },
    });
    const getDispute = tool({
      description: "get a dispute",
      parameters: jsonSchema<{ dispute_id: string }>({ type: "object", properties: { dispute_id: { type: "string" } }, required: ["dispute_id"] }),
      execute: async ({ dispute_id }) => {
        asked.push(dispute_id);
        return { dispute_id, reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", status: "OPEN" };
      },
    });
    const d = new ToolkitDisputeDrafter({ anthropicKey: "x", paypalClientId: "id", paypalClientSecret: "s", sandbox: true, languageModel: model, tools: { get_dispute: getDispute } });
    const notes = await d.draft(ev);
    expect(asked).toEqual(["PP-D-1"]);
    expect(notes).toContain("PayPal's record");
  });

  it("only hands the agent read-only PayPal tools", () => {
    const d = new ToolkitDisputeDrafter({ anthropicKey: "x", paypalClientId: "id", paypalClientSecret: "s", sandbox: true });
    const tools = (d as unknown as { paypalTools(): Record<string, unknown> }).paypalTools();
    expect(Object.keys(tools).sort()).toEqual(["get_dispute", "get_order", "list_transactions"]);
  });

  it("falls back to the next drafter when the toolkit fails", async () => {
    const broken = { model: "toolkit", draft: async () => Promise.reject(new Error("PayPal 403")) };
    const plain = { model: "plain", draft: async () => "notes from Trace's evidence" };
    const d = new FirstThatWorks([broken, plain]);
    expect(await d.draft(ev)).toBe("notes from Trace's evidence");
    expect(d.model).toBe("toolkit, else plain");
  });
});
