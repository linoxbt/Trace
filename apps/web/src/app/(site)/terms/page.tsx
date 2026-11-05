import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/marketing/legal";

export const metadata: Metadata = { title: "Terms", description: "The terms for using Trace: what it does with your money, your proof and your account." };

const SECTIONS: LegalSection[] = [
  {
    title: "What Trace is",
    paras: [
      "Trace is software that connects a client who wants on-site work done with the person doing it. The client approves a scope of priced lines and PayPal holds the money; each line is paid out only after its work is proved and approved.",
      "Trace is not a bank, an escrow agent or a party to your agreement for the work. The agreement is between the client and the person doing the work. Money is held and moved by PayPal under PayPal's own terms, which apply to you as a PayPal user.",
      "This build runs on PayPal's sandbox: no real money moves, and it is offered as a demonstration.",
    ],
  },
  {
    title: "Your account",
    paras: [
      "You sign in with an email address you control, or as a guest to try the demo. Keep access to that email private: whoever can open it can act as you.",
      "You must be old enough to enter a contract where you live, and the information you give (names, addresses, prices, PayPal account) must be yours to give and accurate.",
    ],
  },
  {
    title: "Holds, payments and refunds",
    paras: [
      "When a client approves a scope, PayPal authorizes (holds) the total on their payment method. Nothing is charged at that point. A line is captured, and so paid to the tradesperson's PayPal account, only when it has been proved and approved, by the client or by the review window they agreed to.",
      "PayPal honours a hold for a limited time. Trace renews a hold once where PayPal allows; it cannot keep money held indefinitely. Anything not paid when a job closes is released back to the client.",
      "Refunds and disputes run through PayPal. Trace provides the record (the agreed lines, the proof, its checks and every decision) to help, but PayPal decides disputes.",
      "Trace never sets an amount from a photo, a message or a model's output: every amount comes from the lines both sides agreed.",
    ],
  },
  {
    title: "Proof and automated checks",
    paras: [
      "Proof is checked automatically, including by AI models, against the line's agreed criteria. These checks can be wrong. A verdict of Verified means the checks passed, not that the work is guaranteed; the client can still flag a line during its review window.",
      "Do not submit proof you didn't take for this job, or try to mislead the checks (for example with photos of screens or notes addressed to the checker). Doing so can fail the line, end your access, and be passed to PayPal.",
    ],
  },
  {
    title: "Acceptable use",
    paras: [
      "Use Trace only for real, lawful work. Don't use it to move money for anything else, to test stolen payment details, to harass anyone, or to get around its checks or limits.",
      "Trace may limit, suspend or close an account that breaks these terms, and will not move money it believes is part of fraud.",
    ],
  },
  {
    title: "Availability and liability",
    paras: [
      "Trace is provided as is. It may be unavailable at times, and features may change. Money held at PayPal stays at PayPal whatever Trace's status.",
      "To the extent the law allows, Trace is not liable for the quality of the work, for what one party owes another, or for indirect losses. Nothing in these terms limits rights you have that the law says can't be limited.",
    ],
  },
  {
    title: "Changes",
    paras: ["These terms may be updated. The date above changes when they do, and continuing to use Trace after a change means you accept the new terms."],
  },
];

export default function Terms() {
  return <LegalPage clause="Terms" title="Terms of use" lede="Plain terms for a plain idea: money is held by PayPal, and released for proved work." updated="5 November 2026" sections={SECTIONS} />;
}
