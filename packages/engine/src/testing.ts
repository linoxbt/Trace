// A test engine: real Postgres (TEST_DATABASE_URL), FakePayPal, memory
// storage, a scripted verifier and a settable clock.

import sharp from "sharp";
import type { Acceptance, LineObservation, TextScan } from "@trace/core";
import { type Db } from "@trace/db";
import { freshDb, makeUser } from "@trace/db/testing";
import { FakePayPal } from "@trace/paypal/fake";
import type { Engine, Logger } from "./deps.ts";
import type { ScopeFlag, ScopeLineText, TextScanner } from "./inject/text-scan.ts";
import type { CompiledRule, CompileResult, RuleCompiler } from "./rules/compile.ts";
import { refreshPayee } from "./payee.ts";
import { MemoryStorage } from "./storage.ts";
import type { InspectInput, ProofInspectInput, ProofObservation, Verifier } from "./verifier.ts";

export class ScriptedVerifier implements Verifier {
  readonly model = "scripted";
  readonly calls: InspectInput[] = [];
  /** By line ID; a function gets the input. Unscripted lines pass every check. */
  readonly script = new Map<string, Partial<LineObservation>[] | ((i: InspectInput) => Partial<LineObservation>)>();

  async inspect(input: InspectInput): Promise<LineObservation> {
    this.calls.push(input);
    const s = this.script.get(input.lineId);
    const over = typeof s === "function" ? s(input) : (s?.shift() ?? {});
    return { ...passing(input.lineId, input.acceptance), ...over };
  }

  readonly proofCalls: ProofInspectInput[] = [];
  /** By line ID, for the other proof types. Unscripted lines pass every check and read nothing. */
  readonly proofScript = new Map<string, Partial<ProofObservation>>();

  async inspectProof(input: ProofInspectInput): Promise<ProofObservation> {
    this.proofCalls.push(input);
    return {
      ...passing(input.lineId, input.acceptance),
      extracted: { value: null, unit: null, vendor: null, date: null, total_cents: null, items: [] },
      instructions_found: null,
      ...this.proofScript.get(input.lineId),
    };
  }
}

/** Finds no text unless told to: queue scans for the next photos, or flags for the next scope. */
export class ScriptedScanner implements TextScanner {
  readonly model = "scripted-scan";
  readonly images: (TextScan | Error)[] = [];
  readonly scopes: ScopeFlag[][] = [];
  scanned = 0;

  async scanImage(_image: Uint8Array): Promise<TextScan> {
    this.scanned += 1;
    const next = this.images.shift() ?? { texts: [] };
    if (next instanceof Error) throw next;
    return next;
  }

  async scanScope(_lines: ScopeLineText[]): Promise<ScopeFlag[]> {
    return this.scopes.shift() ?? [];
  }
}

/** Answers from a table keyed by the rule's words; the readback is built from the JSON. */
export class ScriptedCompiler implements RuleCompiler {
  readonly model = "scripted-compiler";
  readonly answers = new Map<string, CompileResult>();
  readonly readbackSaw: CompiledRule[] = [];

  async compile(english: string): Promise<CompileResult> {
    return this.answers.get(english) ?? { kind: "unsupported", reason: "not in the script" };
  }

  async readback(rule: CompiledRule): Promise<string> {
    this.readbackSaw.push(rule);
    return `When ${rule.when.map((c) => `${c.field} ${c.op} ${JSON.stringify(c.value)}`).join(" and ")}, ${rule.effect === "deny" ? "block it" : `ask the ${rule.approver ?? "owner"}`}.`;
  }
}

export function passing(lineId: string, a: Acceptance): LineObservation {
  return {
    line_id: lineId,
    same_location: "yes",
    recapture: "no",
    checks: [
      ...a.must_show.map((check) => ({ check, kind: "must_show" as const, satisfied: true, observation: "visible" })),
      ...a.must_not_show.map((check) => ({ check, kind: "must_not_show" as const, satisfied: true, observation: "absent" })),
    ],
    confidence: 0.93,
    homeowner_reason: "The work matches what was agreed.",
  };
}

export const quietLog: Logger = { info() {}, warn() {}, error() {} };

export interface TestEngine extends Engine {
  db: Db;
  paypal: FakePayPal;
  storage: MemoryStorage;
  verifier: ScriptedVerifier;
  scanner: ScriptedScanner;
  compiler: ScriptedCompiler;
  clock: { t: Date };
}

export async function testEngine(): Promise<TestEngine> {
  const db = await freshDb();
  const clock = { t: new Date("2026-11-03T10:00:00Z") };
  return {
    db,
    paypal: new FakePayPal(() => clock.t),
    storage: new MemoryStorage(),
    verifier: new ScriptedVerifier(),
    scanner: new ScriptedScanner(),
    compiler: new ScriptedCompiler(),
    settings: { webhookId: "WH-TEST", demoMode: false, confidenceThreshold: 0.8, brandName: "Trace" },
    now: () => clock.t,
    log: quietLog,
    clock,
  };
}

export { makeUser };

/** The tradesperson links a PayPal account that can take payments. Returns its merchant ID. */
export async function connectPayee(e: TestEngine, userId: string): Promise<string> {
  const merchantId = e.paypal.onboard(userId);
  await refreshPayee(e, userId);
  return merchantId;
}

let seed = 0;
/**
 * A distinct test photo: a seeded pattern of blocks, so its dHash differs from
 * every other photo made here.
 */
export async function testPhoto(n = ++seed): Promise<Buffer> {
  const w = 320;
  const h = 240;
  const px = Buffer.alloc(w * h * 3);
  let s = (n * 2654435761) >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const cells = Array.from({ length: 64 }, () => Math.floor(rand() * 256));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = cells[Math.floor((y / h) * 8) * 8 + Math.floor((x / w) * 8)]!;
      const i = (y * w + x) * 3;
      px[i] = v;
      px[i + 1] = (v * 7) & 255;
      px[i + 2] = 255 - v;
    }
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
}
