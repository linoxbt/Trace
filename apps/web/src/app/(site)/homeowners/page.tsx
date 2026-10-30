import type { Metadata } from "next";
import { AudiencePage } from "@/components/marketing/audience";
import { Inspection } from "@/components/marketing/inspection";

export const metadata: Metadata = {
  title: "For homeowners",
  description: "Pay for the work you can see, from a repair to a deep clean. PayPal holds the money; each line is paid only after its proof passes.",
};

export default function Homeowners() {
  return (
    <AudiencePage
      clause="For homeowners"
      title={
        <>
          Pay for the work <span className="text-violet">you can see.</span>
        </>
      }
      lede="A repair, a deep clean, a car service, a garden, a move or an event set-up. You approve a scope in plain words, PayPal holds the money, and each line is paid only after proof taken on site shows it's done."
      promises={[
        { k: "Nothing up front", v: "Approving places a hold on your PayPal account. Nothing is charged until work is proved." },
        { k: "Line by line", v: "A $420 job isn't all or nothing. Each line is paid on its own, as it passes." },
        { k: "You can see why", v: "Before and after, side by side, with the reason for every verdict." },
        { k: "Anything unfinished comes back", v: "Flag a line and it stays held. Drop it by agreement and it's released to you; a refund goes back the same way." },
      ]}
      journeyTitle={
        <>
          Your money, <span className="text-lilac">step by step.</span>
        </>
      }
      journey={[
        { when: "You get a link", what: "Open it signed in with the email the job was sent to, and read every line, its price and what “done” looks like.", money: "$0.00 held" },
        { when: "You approve", what: "PayPal's own window opens. You approve the total as a hold on your account.", money: "$420.00 held" },
        { when: "Work is proved", what: "Each finished line is proved on site: a photo, a short video, a meter reading, a receipt, a link, or a signed note from an inspector. Trace checks where and when before the AI compares it with what you agreed. You see it the moment it lands, no refresh.", money: "$420.00 held" },
        { when: "Extra work comes up", what: "If more is needed, it arrives as a change order with its own price. You approve it as a separate hold, or decline it; the original hold never grows on its own.", money: "+$50.00 held" },
        { when: "You review", what: "Approve or flag each proved line. A line the AI verified is released when the review window ends if you do nothing; a doubtful one never is.", money: "$310.00 paid" },
        { when: "It's finished", what: "The last line is fixed, proved and paid, or dropped by agreement and its money released back to you.", money: "$470.00 paid" },
      ]}
      feature={{
        clause: "The proof",
        title: (
          <>
            Every verdict <span className="text-violet">shows its working.</span>
          </>
        ),
        body: "You'll never be asked to trust a green tick. Each line carries the photos, the checks that ran and the AI's reason in plain words.",
        points: ["Photos taken in the app, at the job, within two minutes of opening the camera", "A dashed box on anything the AI flagged", "Needs review lines wait for you, always", "How often the check is right is measured and published on the Accuracy page"],
        visual: <Inspection />,
      }}
      faq={[
        ["Is my money taken when I approve?", "No. PayPal authorizes the total and holds it on your account. Money is captured line by line, only after the work is verified and you've had the chance to review it."],
        ["Who holds the money?", "PayPal. Payments go straight to the tradesperson's own PayPal business account. Trace never takes custody of funds."],
        ["What if I disagree with a verdict?", "Flag the line with a note. It stays held until the tradesperson fixes and re-proves it, or you both agree to drop it."],
        ["Can I still dispute with PayPal?", "Yes. Your PayPal buyer rights don't change. Trace keeps the photo record either side can point to."],
        ["What kinds of job can I use it for?", "Anything where the result can be shown: home repairs, cleaning and turnovers, car repair and detailing, garden work, removals and clear-outs, installations, and event set-up. Work hidden inside a wall can be proved by a photo during the job or a signed note from an inspector."],
        ["What if the job needs more than we agreed?", "The other side sends a change order: the extra lines and their price. Nothing is added until you approve it in PayPal as its own hold, and it's paid line by line like the rest."],
        ["Can I get money back after it's paid?", "Yes. The tradesperson can refund a payment, in full or in part, from the job. It goes back to your PayPal account."],
      ]}
      cta={{ title: <>See it from <span className="text-lilac">your side.</span></>, body: "In the demo job you approve the hold, review the proof and release the money yourself. No sign-up." }}
    />
  );
}
