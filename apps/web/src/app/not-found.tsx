import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-4">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="display mt-8 text-[34px] leading-tight">Nothing here</h1>
        <p className="mt-2 text-muted">That page or job doesn&apos;t exist, or it isn&apos;t yours to see.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/jobs" className="press inline-flex h-11 items-center rounded-full bg-ink px-5 text-[14px] font-semibold text-paper">Your jobs</Link>
          <Link href="/" className="press inline-flex h-11 items-center rounded-full bg-card px-5 text-[14px] font-semibold shadow-[0_0_0_1px_var(--color-line)]">Home</Link>
        </div>
      </div>
    </main>
  );
}
