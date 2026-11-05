import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/marketing/legal";

export const metadata: Metadata = { title: "Privacy", description: "What Trace collects, why, who it is shared with, and how long it is kept." };

const SECTIONS: LegalSection[] = [
  {
    title: "What Trace collects",
    paras: [
      "Your email address, and for jobs: the address, the lines and prices, and the messages and decisions on the job.",
      "Proof: photos, short clips, documents and links you submit, with the phone's location and the time when a photo is taken in the app. Location is recorded only with a photo, never tracked.",
      "From PayPal: the IDs and states of orders, holds, captures, refunds and disputes, and for tradespeople the PayPal merchant ID payments go to. Trace never sees card or bank details.",
      "A device identifier the app creates, used to check that proof comes from the phone the job started on.",
    ],
  },
  {
    title: "Why",
    paras: [
      "To run the job: show each side what was agreed, check proof, release payments, and keep the record that a dispute needs.",
      "To keep Trace safe: spot reused or faked proof, limit abuse, and keep a ledger of every money decision.",
      "Trace does not sell your data, show ads, or use your photos to train models.",
    ],
  },
  {
    title: "Who sees it",
    paras: [
      "The two parties to a job see that job. Nobody else does: the database enforces it.",
      "Service providers who process it for Trace: PayPal (payments), Supabase (database and sign-in), Netlify (hosting), Anthropic (the AI models that check proof, which receive the photo or file and the line's criteria for that check), and, when email is on, the email provider that delivers job and sign-off links.",
      "PayPal, when a dispute is filed: the evidence pack for that payment. And anyone the law requires.",
    ],
  },
  {
    title: "How long it is kept",
    paras: [
      "Photos, clips, documents and photo locations are deleted automatically 180 days after a job closes, the window in which a payment can be disputed, unless a dispute is still open; a demo job's after 30 days.",
      "The record of the job (lines, prices, verdicts, checks and payment decisions) is kept after that, because it is the payment record.",
    ],
  },
  {
    title: "Your choices",
    paras: [
      "You can ask for a copy of your data, a correction, or deletion of your account. Some records have to be kept while a payment can still be disputed or the law requires them.",
      "Cookies are used only to keep you signed in and to remember a few settings; there are no tracking cookies.",
    ],
  },
  {
    title: "Changes",
    paras: ["This page may be updated. The date above changes when it is."],
  },
];

export default function Privacy() {
  return <LegalPage clause="Privacy" title="Privacy" lede="What Trace keeps, why, who sees it, and when it's deleted." updated="5 November 2026" sections={SECTIONS} />;
}
