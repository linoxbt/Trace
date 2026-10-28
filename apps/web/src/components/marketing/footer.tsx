import Link from "next/link";
import { Mark } from "@/components/logo";
import { Eyebrow } from "./blocks";

const COLS = [
  { title: "Pages", links: [["Home", "/"], ["How it works", "/how-it-works"], ["Homeowners", "/homeowners"], ["Tradespeople", "/tradespeople"], ["Security", "/security"]] },
  { title: "Product", links: [["Try the demo", "/demo"], ["Start a job", "/jobs/new"], ["Your jobs", "/jobs"], ["Sign in", "/sign-in"]] },
  { title: "Money rules", links: [["Held by PayPal", "/how-it-works#rules"], ["Proof checks", "/security#checks"], ["Disputes", "/tradespeople#questions"]] },
  { title: "Source", links: [["GitHub", "https://github.com/linoxbt/Trace"], ["MIT licence", "https://github.com/linoxbt/Trace"]] },
];

export function Footer() {
  return (
    <footer className="grain relative overflow-hidden bg-night text-white">
      <svg aria-hidden viewBox="0 0 600 600" className="pointer-events-none absolute -bottom-48 -right-40 h-[620px] w-[620px] opacity-60">
        <circle cx="300" cy="300" r="290" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="1.5" />
        <circle cx="300" cy="300" r="210" fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="1.5" />
        <circle cx="300" cy="300" r="130" fill="none" stroke="rgb(122 82 244 / 0.25)" strokeWidth="40" />
      </svg>
      <span aria-hidden className="absolute right-[18%] top-[58%] hidden h-14 w-14 rounded-full bg-brass/70 lg:block" />

      <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-20 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_2fr]">
          <div>
            <div className="flex items-center gap-3">
              <Mark size={36} />
              <span className="font-display text-[26px] font-bold tracking-[-0.06em]">trace</span>
            </div>
            <p className="mt-5 max-w-xs text-[14.5px] leading-relaxed text-white/55">
              Home-repair payments held with PayPal and released line by line, only for work that photos taken on site prove.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLS.map((c) => (
              <div key={c.title}>
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">{c.title}</div>
                <ul className="mt-4 space-y-2.5 text-[14px]">
                  {c.links.map(([label, href]) => (
                    <li key={label}>
                      <Link href={href!} className="text-white/80 transition-colors hover:text-lilac">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-14 max-w-3xl text-[12.5px] leading-relaxed text-white/45">
          <span className="font-semibold text-white/70">Built for the PayPal AI Hackathon 2026.</span> PayPal Orders v2 with intent AUTHORIZE, partial and final captures,
          reauthorization, verified webhooks and dispute evidence. Sandbox only: no real money moves.
        </p>

        <div className="mt-12 border-t border-white/10 pt-12">
          <Eyebrow dark>Est. 2026 · paid on proof</Eyebrow>
          <p className="display mt-6 text-[56px] leading-[0.92] sm:text-[104px]">
            Pay for proof,
            <br />
            <span className="text-lilac">not promises.</span>
          </p>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-white/10 pt-6 text-[12.5px] text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Trace. MIT licensed.</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em]">PayPal sandbox · Next.js · Postgres</span>
        </div>
      </div>
    </footer>
  );
}
