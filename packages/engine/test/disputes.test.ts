import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import {
  decideLine,
  draftDispute,
  fileDispute,
  handleWebhook,
  loadEvidence,
  release,
  requireEvidenceDemo,
  saveDisputeNotes,
  templateNotes,
  type DisputeDrafter,
} from "../src/index.ts";
import { testEngine, type TestEngine } from "../src/testing.ts";
import { heldJob, prove, type Held } from "./helpers.ts";

const H: Record<string, string> = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT",
  "paypal-transmission-id": "tx-1",
  "paypal-transmission-sig": "sig",
  "paypal-transmission-time": "2026-11-03T10:00:00Z",
};
let n = 0;
const event = (event_type: string, resource: Record<string, unknown>) => JSON.stringify({ id: `WH-D-${++n}`, event_type, resource });

describe.skipIf(!TEST_DATABASE_URL)("engine: dispute defence (Flow E)", () => {
  let e: TestEngine;
  beforeEach(async () => {
    e = await testEngine();
  });
  afterEach(() => e.db.end());

  /** L1 proved, approved and captured, then disputed at PayPal. */
  async function disputed(): Promise<{ h: Held; disputeId: string; paypalId: string }> {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    await release(e, h.jobId);
    const cap = [...e.paypal.captures.values()][0]!;
    const d = e.paypal.openDispute(cap.id);
    await handleWebhook(e, event("CUSTOMER.DISPUTE.CREATED", { dispute_id: d.dispute_id, reason: d.reason, status: "OPEN", disputed_transactions: d.disputed_transactions }), (k) => H[k] ?? null);
    const row = (await e.db.query<{ id: string }>("select id from disputes where paypal_dispute_id = $1", [d.dispute_id])).rows[0]!;
    return { h, disputeId: row.id, paypalId: d.dispute_id };
  }

  it("gathers the scope, proof, approvals and the guard's decisions for the disputed payment", async () => {
    const { disputeId } = await disputed();
    const ev = await loadEvidence(e, disputeId);
    const l1 = ev.lines.find((l) => l.code === "L1")!;
    expect(l1).toMatchObject({ status: "CAPTURED", approvedBy: "homeowner", verdict: { verdict: "VERIFIED" } });
    expect(l1.proof?.integrity?.status).toBe("pass");
    expect(ev.captures).toHaveLength(1);
    expect(ev.captures[0]).toMatchObject({ disputed: true, lines: ["L1"] });
    expect(ev.decisions.some((d) => d.disputed && d.outcome === "ALLOW")).toBe(true);
    expect(templateNotes(ev)).toContain("L1 Fix dripping tap");
  });

  it("drafts with the assistant, renders the evidence pack, and keeps the person's edits", async () => {
    const { disputeId, h } = await disputed();
    const drafter: DisputeDrafter = { model: "scripted-drafter", draft: async () => "The tap was fixed and the client approved it." };
    await expect(draftDispute(e, disputeId, h.home, drafter)).rejects.toMatchObject({ code: "forbidden" });
    const v = await draftDispute(e, disputeId, h.trades, drafter);
    expect(v.notes).toBe("The tap was fixed and the client approved it.");
    const pdf = await PDFDocument.load(await e.storage.get(v.pdfPath!));
    // Cover, one page per line, payments and payment controls.
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(6);
    const edited = await saveDisputeNotes(e, disputeId, h.trades, "Edited notes.");
    expect(edited.notes).toBe("Edited notes.");
    expect(edited.pdfPath).not.toBe(v.pdfPath);
  });

  it("falls back to the template when the assistant fails", async () => {
    const { disputeId, h } = await disputed();
    const broken: DisputeDrafter = { model: "broken", draft: async () => Promise.reject(new Error("overloaded")) };
    const v = await draftDispute(e, disputeId, h.trades, broken);
    expect(v.notes).toContain("The record shows otherwise");
  });

  it("files the evidence through the guard, acting for the payee, once PayPal waits for it", async () => {
    const { disputeId, h, paypalId } = await disputed();
    await expect(fileDispute(e, disputeId, h.trades)).rejects.toMatchObject({ code: "no_draft" });
    await draftDispute(e, disputeId, h.trades);
    e.settings.demoMode = true;
    expect((await requireEvidenceDemo(e, disputeId, h.trades)).status).toBe("WAITING_FOR_SELLER_RESPONSE");
    const r = await fileDispute(e, disputeId, h.trades);
    expect(r).toMatchObject({ filed: true, outcome: "ALLOW" });
    expect(r.dispute.filedAt).not.toBeNull();
    const filed = e.paypal.disputes.get(paypalId)!;
    expect(filed.evidence[0]).toMatchObject({ evidenceType: "PROOF_OF_FULFILLMENT", file: { contentType: "application/pdf" } });
    expect(e.paypal.calls.find((c) => c.op === "provideEvidence")!.args[2]).toBe((await store.mustGetJob(e.db, h.jobId)).payee_merchant_id);
    await expect(fileDispute(e, disputeId, h.trades)).rejects.toMatchObject({ code: "already_filed" });
  });

  it("keeps the sandbox require-evidence step off outside demo mode", async () => {
    const { disputeId, h } = await disputed();
    await expect(requireEvidenceDemo(e, disputeId, h.trades)).rejects.toMatchObject({ code: "not_demo" });
  });
});
