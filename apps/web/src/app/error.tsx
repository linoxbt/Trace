"use client";

import Link from "next/link";

/** A page that failed to load. Money is never moved by viewing a page, so a reload is always safe. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="display text-[30px] leading-tight">This page didn&apos;t load</h1>
        <p className="mt-2 text-muted">Something went wrong on our side. Try again; if it keeps happening, come back in a few minutes.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={reset} className="press inline-flex h-11 items-center rounded-full bg-ink px-5 text-[14px] font-semibold text-paper">Try again</button>
          <Link href="/jobs" className="press inline-flex h-11 items-center rounded-full bg-card px-5 text-[14px] font-semibold shadow-[0_0_0_1px_var(--color-line)]">Your jobs</Link>
        </div>
      </div>
    </main>
  );
}
