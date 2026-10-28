import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { Acceptance } from "@trace/core";
import { ClaudeVerifier, toLineObservation } from "../src/claude-verifier.ts";

const acceptance: Acceptance = {
  criterion: "Tap closed with a dry spout",
  must_show: ["the spout is dry"],
  must_not_show: ["water dripping from the spout"],
  framing: "Front-on, spout and handle in frame",
};

const report = {
  same_location: "yes",
  recapture: "no",
  checks: [
    { check: "the spout is dry", kind: "must_show", satisfied: true, observation: "No droplets at the spout tip." },
    { check: "water dripping from the spout", kind: "must_not_show", satisfied: true, observation: "No drips visible." },
  ],
  region: null,
  confidence: 0.93,
  homeowner_reason: "The tap is closed and the spout is dry.",
};

/** A real SDK client whose HTTP layer answers with a canned Messages response. */
function fakeClient(reply: Record<string, unknown>, seen: { body?: Record<string, unknown>; headers?: Headers }[]) {
  return new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push({ body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
      const msg = { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", stop_sequence: null, stop_details: null, usage: { input_tokens: 10, output_tokens: 10 }, ...reply };
      return new Response(JSON.stringify(msg), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
}

const input = { lineId: "line-1", title: "Fix dripping tap", acceptance, before: new Uint8Array([1, 2, 3]), after: new Uint8Array([4, 5, 6]) };

describe("ClaudeVerifier", () => {
  it("sends both photos and the acceptance, and returns the parsed observation", async () => {
    const seen: { body?: Record<string, unknown>; headers?: Headers }[] = [];
    const v = new ClaudeVerifier({ client: fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(report) }] }, seen) });
    const obs = await v.inspect(input);

    expect(obs).toMatchObject({ line_id: "line-1", same_location: "yes", confidence: 0.93 });
    expect(obs.checks).toHaveLength(2);
    expect(obs.region).toBeUndefined();

    const body = seen[0]!.body!;
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.fallbacks).toBe("default");
    expect(seen[0]!.headers!.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect((body.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    const content = (body.messages as { content: { type: string; text?: string }[] }[])[0]!.content;
    expect(content.filter((b) => b.type === "image")).toHaveLength(2);
    expect(content.at(-1)!.text).toContain("water dripping from the spout");
  });

  it("adds the crop as a third image on the second pass", async () => {
    const seen: { body?: Record<string, unknown> }[] = [];
    const v = new ClaudeVerifier({ client: fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(report) }] }, seen) });
    await v.inspect({ ...input, crop: new Uint8Array([7]) });
    const content = (seen[0]!.body!.messages as { content: { type: string }[] }[])[0]!.content;
    expect(content.filter((b) => b.type === "image")).toHaveLength(3);
  });

  it("throws on a refusal instead of guessing, so the proof can be retried", async () => {
    const v = new ClaudeVerifier({ client: fakeClient({ stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: null }, content: [] }, []) });
    await expect(v.inspect(input)).rejects.toThrow(/declined/);
  });

  it("clamps numbers and trims text into the core schema's limits", () => {
    const obs = toLineObservation("L1", {
      ...report,
      same_location: "yes",
      recapture: "no",
      checks: [{ check: "x", kind: "must_show", satisfied: false, observation: "a".repeat(400) }],
      region: { x: -0.2, y: 0.5, w: 1.4, h: 0.3 },
      confidence: 1.7,
      homeowner_reason: "b".repeat(500),
    });
    expect(obs.confidence).toBe(1);
    expect(obs.region).toEqual({ x: 0, y: 0.5, w: 1, h: 0.3 });
    expect(obs.checks[0]!.observation).toHaveLength(160);
    expect(obs.homeowner_reason).toHaveLength(200);
  });
});
