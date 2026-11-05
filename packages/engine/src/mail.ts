// Email: the job's link to the client when the scope is sent, and a sign-off
// link to the person named on a line. Sent through a transactional email API
// when one is set up (RESEND_API_KEY and MAIL_FROM); without one the
// tradesperson shares the links themselves, as before. A failed email never
// fails the step that sent it: the link is still on the page.

import * as store from "@trace/db";
import { formatMoney, sum } from "@trace/core";
import type { Engine } from "./deps.ts";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(m: MailMessage): Promise<void>;
}

/** Resend's HTTP API (resend.com). The key is the server's alone. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(m: MailMessage): Promise<void> {
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`email not sent: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(heading: string, paras: string[], cta: { label: string; href: string }, foot: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1b16">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="font-weight:700;font-size:18px;letter-spacing:-0.01em">Trace</div>
<div style="margin-top:20px;background:#fff;border-radius:20px;padding:28px">
<h1 style="margin:0;font-size:21px;line-height:1.3">${esc(heading)}</h1>
${paras.map((p) => `<p style="margin:14px 0 0;font-size:15px;line-height:1.55;color:#4a463d">${esc(p)}</p>`).join("")}
<p style="margin:24px 0 0"><a href="${esc(cta.href)}" style="display:inline-block;background:#1d1b16;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 22px;border-radius:999px">${esc(cta.label)}</a></p>
<p style="margin:18px 0 0;font-size:12.5px;color:#8a8577">Or open: ${esc(cta.href)}</p>
</div>
<p style="margin:18px 4px 0;font-size:12px;line-height:1.5;color:#8a8577">${esc(foot)}</p>
</div></body></html>`;
}

const mask = (email: string) => email.replace(/^(.).*(@.*)$/, "$1…$2");

async function deliver(e: Engine, jobId: string, kind: string, m: MailMessage): Promise<boolean> {
  if (!e.mailer) return false;
  try {
    await e.mailer.send(m);
    await store.appendEvent(e.db, { jobId, actor: "system", type: "EMAIL_SENT", data: { kind, to: mask(m.to) } });
    return true;
  } catch (err) {
    e.log.warn("email failed", { job: jobId, kind, err: String(err) });
    return false;
  }
}

/** The scope went out: send the client the job's link. True when it was emailed. */
export async function emailJobInvite(e: Engine, jobId: string, link: string): Promise<boolean> {
  if (!e.mailer) return false;
  const job = await store.mustGetJob(e.db, jobId);
  const lines = await store.getLines(e.db, jobId);
  const total = formatMoney(sum(lines.map((l) => l.price_cents)), job.currency);
  const text = [
    `Your job at ${job.address} is ready for you to review: ${lines.length} line${lines.length === 1 ? "" : "s"}, ${total} in all.`,
    "If it looks right, approve it and PayPal holds the money. Nothing is charged then: each line is paid only after its work is proved and you've had the chance to check it.",
    `Sign in with this email address (${job.homeowner_email}) to open it.`,
  ];
  return deliver(e, jobId, "job_invite", {
    to: job.homeowner_email,
    subject: `Review your job at ${job.address}`.slice(0, 120),
    text: `${text.join("\n\n")}\n\n${link}\n\nYou got this because a tradesperson sent you a job on Trace. If you weren't expecting it, ignore this email.`,
    html: page(`Review your job at ${job.address}`, text, { label: "Review the job", href: link }, "You got this because a tradesperson sent you a job on Trace. If you weren't expecting it, ignore this email."),
  });
}

/** A sign-off was asked for: send the named person their single-use link. True when it was emailed. */
export async function emailAttestation(e: Engine, a: { jobId: string; email: string; statement: string; lineTitle: string; link: string; expiresAt: Date }): Promise<boolean> {
  if (!e.mailer) return false;
  const job = await store.mustGetJob(e.db, a.jobId);
  const text = [
    `You've been asked to confirm a piece of work at ${job.address}: "${a.lineTitle}".`,
    `The statement to sign: "${a.statement}"`,
    `Sign in with this email address (${a.email}) to sign it. The link works once and until ${a.expiresAt.toUTCString().slice(0, 16)}. Only sign if it's true.`,
  ];
  return deliver(e, a.jobId, "attestation", {
    to: a.email,
    subject: `Please confirm: ${a.lineTitle}`.slice(0, 120),
    text: `${text.join("\n\n")}\n\n${a.link}\n\nIf you don't know about this work, ignore this email and nothing is signed.`,
    html: page(`Please confirm: ${a.lineTitle}`, text, { label: "Review and sign", href: a.link }, "If you don't know about this work, ignore this email and nothing is signed."),
  });
}
