import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import { emailAttestation, emailJobInvite, ResendMailer, type MailMessage } from "../src/index.ts";
import { testEngine, type TestEngine } from "../src/testing.ts";
import { heldJob } from "./helpers.ts";

describe("ResendMailer", () => {
  it("posts one message with the server's key, and throws when Resend refuses", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await new ResendMailer("re_test", "Trace <jobs@example.com>", ok).send({ to: "a@example.com", subject: "s", text: "t", html: "<p>t</p>" });
    expect(seen[0]!.url).toBe("https://api.resend.com/emails");
    expect((seen[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(String(seen[0]!.init.body))).toMatchObject({ from: "Trace <jobs@example.com>", to: ["a@example.com"] });
    const no = (async () => new Response("domain not verified", { status: 403 })) as unknown as typeof fetch;
    await expect(new ResendMailer("re_test", "x", no).send({ to: "a@example.com", subject: "s", text: "t", html: "t" })).rejects.toThrow(/403/);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("engine: emails", () => {
  let e: TestEngine;
  let sent: MailMessage[];
  beforeEach(async () => {
    e = await testEngine();
    sent = [];
  });
  afterEach(() => e.db.end());

  it("does nothing without a mailer: the page shares the link instead", async () => {
    const h = await heldJob(e);
    expect(await emailJobInvite(e, h.jobId, "https://trace.example/jobs/x")).toBe(false);
  });

  it("emails the client the job's link, escaped, and notes it on the job", async () => {
    e.mailer = { send: async (m) => void sent.push(m) };
    const h = await heldJob(e);
    await e.db.query("update jobs set address = $2 where id = $1", [h.jobId, "12 <b>Admiralty</b> Way"]);
    expect(await emailJobInvite(e, h.jobId, "https://trace.example/jobs/x")).toBe(true);
    const job = await store.mustGetJob(e.db, h.jobId);
    expect(sent[0]).toMatchObject({ to: job.homeowner_email, subject: "Review your job at 12 <b>Admiralty</b> Way" });
    expect(sent[0]!.text).toContain("$420.00");
    expect(sent[0]!.html).toContain("12 &lt;b&gt;Admiralty&lt;/b&gt; Way");
    expect(sent[0]!.html).not.toContain("<b>Admiralty");
    expect((await store.getEvents(e.db, h.jobId)).find((x) => x.type === "EMAIL_SENT")?.data).toMatchObject({ kind: "job_invite" });
  });

  it("a failed email doesn't fail the step", async () => {
    e.mailer = { send: async () => Promise.reject(new Error("down")) };
    const h = await heldJob(e);
    expect(await emailAttestation(e, { jobId: h.jobId, email: "inspector@example.com", statement: "I saw it", lineTitle: "Fix tap", link: "https://x/attest/t", expiresAt: new Date() })).toBe(false);
  });
});
