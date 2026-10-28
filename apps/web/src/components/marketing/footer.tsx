import Link from "next/link";
import { Mark } from "@/components/logo";

const COLS = [
  { title: "Product", links: [["How it works", "/how-it-works"], ["Try the demo", "/demo"], ["Security", "/security"]] },
  { title: "For", links: [["Homeowners", "/homeowners"], ["Tradespeople", "/tradespeople"]] },
  { title: "Trace", links: [["Sign in", "/sign-in"], ["Start a job", "/jobs/new"], ["Source on GitHub", "https://github.com/linoxbt/Trace"]] },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-line">
      <div className="mx-auto max-w-6xl px-5 pb-10 pt-16 sm:px-8">
        <div className="grid gap-12 md:grid-cols-[1.2fr_2fr]">
          <div>
            <div className="flex items-center gap-3">
              <Mark size={36} />
              <span className="text-[26px] font-semibold tracking-[-0.05em]">trace</span>
            </div>
            <p className="display mt-5 max-w-xs text-[26px] leading-[1.1] text-ink-2">
              Payment that <span className="italic text-violet">follows proof.</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLS.map((c) => (
              <div key={c.title}>
                <div className="clause uppercase">{c.title}</div>
                <ul className="mt-4 space-y-2.5 text-[14px]">
                  {c.links.map(([label, href]) => (
                    <li key={href}>
                      <Link href={href!} className="text-ink-2 transition-colors hover:text-violet">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 flex flex-col gap-2 border-t border-line pt-6 text-[12.5px] text-faint sm:flex-row sm:justify-between">
          <span>Sandbox demo. No real money moves. Built for the PayPal AI Hackathon 2026.</span>
          <span>MIT licensed</span>
        </div>
      </div>
      {/* The wordmark, oversized and cropped, as the page's last line. */}
      <div aria-hidden className="pointer-events-none select-none px-3 text-center font-semibold leading-[0.72] tracking-[-0.07em] text-violet/[0.07]" style={{ fontSize: "clamp(120px, 27vw, 420px)" }}>
        trace
      </div>
    </footer>
  );
}
