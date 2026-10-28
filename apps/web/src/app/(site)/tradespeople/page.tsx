import type { Metadata } from "next";
import { AudiencePage } from "@/components/marketing/audience";
import { Receipt } from "@/components/marketing/receipt";

export const metadata: Metadata = { title: "For tradespeople", description: "Get paid as you finish. The money is held before you start, and released line by line as you prove the work." };

export default function Tradespeople() {
  return (
    <AudiencePage
      clause="For tradespeople"
      title={
        <>
          Get paid <span className="text-violet">as you finish.</span>
        </>
      }
      lede="Know the money exists before you buy a single tube of sealant. Prove each line with your phone and it's released to your own PayPal account, not at the end, and not after a chase."
      promises={[
        { k: "Funds confirmed first", v: "The homeowner's PayPal hold is in place before you start. You can see it on the job." },
        { k: "Paid per line", v: "Every line you prove and the homeowner approves is captured to your PayPal business account." },
        { k: "A scope that writes itself", v: "Photograph the problem, talk it through, and edit the drafted lines and prices." },
        { k: "Your defence, built in", v: "If a payment is disputed, the photo log is already an evidence pack." },
      ]}
      journeyTitle={
        <>
          From quote <span className="text-lilac">to paid.</span>
        </>
      }
      journey={[
        { when: "Start a job", what: "Enter the address and the homeowner's email. Take up to six before-photos; the first sets the job's location.", money: "draft" },
        { when: "Write the scope", what: "One visible outcome per line, each with a price and what a camera should see when it's done.", money: "$420.00 quoted" },
        { when: "Money is held", what: "The homeowner approves with PayPal. You get notified the moment the hold is in place.", money: "$420.00 held" },
        { when: "Prove it", what: "Tap Prove it on a line, line up with the ghost of the before-photo, and shoot. You get a verdict in seconds.", money: "per line" },
        { when: "Get paid", what: "Request release. Approved lines are captured to your PayPal account; anything that failed can be fixed and re-proved.", money: "$420.00 paid" },
      ]}
      feature={{
        clause: "The money",
        title: (
          <>
            A statement <span className="text-violet">you can bank on.</span>
          </>
        ),
        body: "Every capture is tied to the lines it pays for, so you always know what's been paid, what's still held and why.",
        points: ["Captures land in your own PayPal business account", "Failed lines stay held for you to fix, not lost", "If a dispute comes in, Trace drafts the response from your photos"],
        visual: <Receipt />,
      }}
      faq={[
        ["Do I need a PayPal business account?", "Yes. Payments are captured straight to it. Trace never holds your money."],
        ["What if the AI fails good work?", "You'll see exactly why. Re-shoot from the right angle, or the homeowner can approve a line the AI wasn't sure about. Lines it's uncertain about go to the homeowner rather than failing."],
        ["What about hidden work, like pipes in a wall?", "Mark the line as not visible in an after-photo and take a photo during the work. It goes to the homeowner to approve."],
        ["What happens in a dispute?", "Trace builds an evidence pack from the scope, photos, integrity checks and approvals. You file it in one tap. Seller protection is aimed at goods, so no outcome is guaranteed, but it's the strongest case you can make."],
      ]}
      cta={{ title: <>Prove a line <span className="text-lilac">in seconds.</span></>, body: "In the demo you play the tradesperson too: shoot the after-photos and watch the release land." }}
    />
  );
}
