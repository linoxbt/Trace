import Link from "next/link";
import { Logo } from "@/components/logo";

export default function Landing() {
  return (
    <main className="flex min-h-dvh flex-col px-5 pb-10 pt-8">
      <Logo />
      <section className="mt-12">
        <p className="text-sm font-medium uppercase tracking-wider text-teal">Payment that follows proof</p>
        <h1 className="mt-3 text-[34px] font-semibold leading-tight">Pay for the repair, line by line, only when a camera shows it's done.</h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Your PayPal payment is held, not charged. Each line of work is released only after the photos show it matches what you both agreed.
        </p>
      </section>

      <div className="bracket mt-8 rounded-2xl border border-line bg-card p-5">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Figure label="Held" value="$420.00" />
          <Figure label="Released" value="$310.00" accent />
          <Figure label="Still held" value="$110.00" />
        </div>
        <p className="mt-4 text-sm text-muted">Three lines verified from photos. The grout is still cracked, so its $110 stays held until it's fixed.</p>
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-10">
        <Link href="/jobs" className="flex h-12 items-center justify-center rounded-xl bg-teal font-medium text-white">
          Open my jobs
        </Link>
        <Link href="/sign-in" className="flex h-12 items-center justify-center rounded-xl border border-line bg-card font-medium">
          Sign in with email
        </Link>
        <p className="text-center text-xs text-muted">Sandbox only: no real money moves.</p>
      </div>
    </main>
  );
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`num mt-1 text-lg font-semibold ${accent ? "text-teal" : ""}`}>{value}</div>
    </div>
  );
}
