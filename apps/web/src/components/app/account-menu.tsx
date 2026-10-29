"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export function AccountMenu({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const initial = (email ?? "G")[0]!.toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Account"
        className="press grid h-10 w-10 place-items-center rounded-full bg-violet text-[13px] font-semibold text-white ring-4 ring-transparent hover:ring-violet/15"
      >
        {initial}
      </button>
      <div
        className={`clay absolute right-0 top-12 w-64 origin-top-right rounded-2xl p-2 transition-all duration-300 ease-[var(--ease-out-expo)] ${
          open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
        }`}
      >
        <div className="px-3 py-2">
          <div className="text-[12px] text-faint">Signed in as</div>
          <div className="truncate text-[14px] font-medium">{email ?? "Guest"}</div>
        </div>
        <div className="my-1 h-px bg-line" />
        <a href="/jobs" className="block rounded-xl px-3 py-2 text-[14px] hover:bg-paper">
          Your jobs
        </a>
        <a href="/rules" className="block rounded-xl px-3 py-2 text-[14px] hover:bg-paper">
          Payment rules
        </a>
        <a href="/" className="block rounded-xl px-3 py-2 text-[14px] hover:bg-paper">
          About Trace
        </a>
        <button
          onClick={async () => {
            await supabaseBrowser().auth.signOut();
            router.push("/");
            router.refresh();
          }}
          className="block w-full rounded-xl px-3 py-2 text-left text-[14px] text-bad hover:bg-bad-soft"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
