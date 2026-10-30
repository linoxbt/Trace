import type { Metadata } from "next";
import { AudiencePage } from "@/components/marketing/audience";
import { Receipt } from "@/components/marketing/receipt";

export const metadata: Metadata = {
  title: "For tradespeople",
  description: "Get paid as you finish, straight to your own PayPal account. The money is held before you start and released line by line as you prove the work.",
};

export default function Tradespeople() {
  return (
    <AudiencePage
      clause="For tradespeople"
      title={
        <>
          Get paid <span className="text-violet">as you finish.</span>
        </>
      }
      lede="Plumbers, cleaners, mechanics, gardeners, movers, installers and event crews. Know the money exists before you buy a single part. Prove each line with your phone and it's paid to your own PayPal account, not at the end, and not after a chase."
      promises={[
        { k: "Funds confirmed first", v: "The client's PayPal hold is in place before you start. You can see it on the job." },
        { k: "Paid per line, to you", v: "Connect your PayPal business account once. Every line you prove is paid straight into it; Trace never touches the money." },
        { k: "A scope that writes itself", v: "Photograph the problem and describe it, typed or spoken. AI drafts the lines, prices and proof for each; you edit before sending." },
        { k: "Your defence, built in", v: "If a payment is disputed, the photo log is already an evidence pack." },
      ]}
      journeyTitle={
        <>
          From quote <span className="text-lilac">to paid.</span>
        </>
      }
      journey={[
        { when: "Connect PayPal", what: "Once, before your first job: sign in to PayPal from Trace and your business account becomes where payments land.", money: "ready" },
        { when: "Start a job", what: "Pick the job type, enter the address and the client's email. Take up to six before-photos; the first sets the job's location.", money: "draft" },
        { when: "Write the scope", what: "Start from a template for the job type, or let AI draft it from your photos. One outcome per line, each with a price and its proof: a photo, a video, a meter reading, a receipt, a link or file, or a signed note.", money: "$420.00 quoted" },
        { when: "Money is held", what: "The client approves with PayPal. You get notified the moment the hold is in place.", money: "$420.00 held" },
        { when: "Prove it", what: "Tap Prove it on a line, line up with the ghost of the before-photo, and shoot. You get a verdict in seconds. Found more work? Send a change order; the client approves it as a new hold.", money: "per line" },
        { when: "Get paid", what: "Request release. Approved lines are paid to your PayPal account; anything that failed can be fixed and re-proved.", money: "$420.00 paid" },
      ]}
      feature={{
        clause: "The money",
        title: (
          <>
            A statement <span className="text-violet">you can bank on.</span>
          </>
        ),
        body: "Every capture is tied to the lines it pays for, so you always know what's been paid, what's still held and why.",
        points: ["Captures land in your own PayPal business account", "Failed lines stay held for you to fix, not lost", "Refund a payment, in full or part, from the job", "If a dispute comes in, Trace drafts the response and builds the evidence PDF from your proof"],
        visual: <Receipt />,
      }}
      faq={[
        ["Do I need a PayPal business account?", "Yes. You connect it once from Trace, and payments are captured straight to it. Trace never holds your money."],
        ["What if the AI fails good work?", "You'll see exactly why. Re-shoot from the right angle, or the client can approve a line the AI wasn't sure about. Lines it's uncertain about go to the client rather than failing."],
        ["What about hidden work, like pipes in a wall?", "Prove it another way: a photo during the work, a pressure reading, the parts receipt, or a signed note from the inspector, who gets a one-time link."],
        ["What if the job grows?", "Send a change order with the extra lines and prices. The client approves it in PayPal as its own hold, and you're paid for those lines as you prove them."],
        ["What happens in a dispute?", "Trace builds an evidence pack from the scope, photos, integrity checks and approvals. You file it in one tap. Seller protection is aimed at goods, so no outcome is guaranteed, but it's the strongest case you can make."],
      ]}
      cta={{ title: <>Prove a line <span className="text-lilac">in seconds.</span></>, body: "In the demo job you play both sides: prove the lines with the sample photos and watch the release land. No sign-up." }}
    />
  );
}
