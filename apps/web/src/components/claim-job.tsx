"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Logo } from "./logo";

export function ClaimJob({ jobId, address }: { jobId: string; address: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <main className="px-5 pt-8">
      <Logo />
      <h1 className="mt-10 text-2xl font-semibold">A repair job for you</h1>
      <p className="mt-2 text-muted">{address}</p>
      <p className="mt-6 leading-relaxed">You'll review each line of work and its price. When you approve, PayPal holds the money. Nothing is charged until the work is verified.</p>
      {error && <p role="alert" className="mt-4 text-sm text-bad">{error}</p>}
      <button
        onClick={async () => {
          try {
            await api(`/api/jobs/${jobId}/claim`, { json: {} });
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
        className="mt-8 h-12 w-full rounded-xl bg-teal font-medium text-white"
      >
        Review the job
      </button>
    </main>
  );
}
