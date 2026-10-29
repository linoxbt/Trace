"use client";

import { useState } from "react";
import type { LedgerEntry } from "@/server/app-data";
import { money } from "@/lib/format";
import { dayOf } from "./activity";
import { IconIn, IconLock, IconOut, IconUndo, IconX } from "./icons";
import { Segmented } from "./segmented";
import { DayLabel, IconCircle, Row, type Tone } from "./ui";

const LANDED = ["COMPLETED", "PENDING"];

function describe(l: LedgerEntry): { title: string; tone: Tone; icon: React.ReactNode; value: string; valueTone: "ink" | "green" | "muted" | "red"; meta: string } {
  if (l.kind === "hold") {
    if (l.status === "VOIDED") return { title: "Hold released back", tone: "grey", icon: <IconUndo className="h-[19px] w-[19px]" />, value: money(l.amountCents), valueTone: "muted", meta: "Released back" };
    return {
      title: "Money held",
      tone: "violet",
      icon: <IconLock className="h-[19px] w-[19px]" />,
      value: money(l.amountCents),
      valueTone: "ink",
      meta: l.status === "CAPTURED" ? "Fully released" : l.status === "PARTIALLY_CAPTURED" ? "Part released" : "On hold",
    };
  }
  if (!LANDED.includes(l.status)) {
    const refused = l.status === "FAILED" || l.status === "DECLINED";
    return { title: refused ? "Payment refused" : l.status === "SENDING" ? "Payment sending" : "Payment refunded", tone: refused ? "red" : "amber", icon: <IconX className="h-[19px] w-[19px]" />, value: money(l.amountCents), valueTone: "muted", meta: refused ? "Not charged" : l.status.toLowerCase() };
  }
  const incoming = l.side === "tradesperson";
  return {
    title: l.final ? "Final payment released" : "Payment released",
    tone: incoming ? "green" : "grey",
    icon: incoming ? <IconIn className="h-[19px] w-[19px]" /> : <IconOut className="h-[19px] w-[19px]" />,
    value: `${incoming ? "+" : "−"}${money(l.amountCents)}`,
    valueTone: incoming ? "green" : "ink",
    meta: l.status === "PENDING" ? "Pending at PayPal" : "Paid",
  };
}

export function PaymentsList({ ledger }: { ledger: LedgerEntry[] }) {
  const [f, setF] = useState<"all" | "release" | "hold">("all");
  const shown = f === "all" ? ledger : ledger.filter((l) => l.kind === f);
  const groups: { day: string; items: LedgerEntry[] }[] = [];
  for (const l of shown) {
    const d = dayOf(l.at);
    const last = groups.at(-1);
    if (last && last.day === d) last.items.push(l);
    else groups.push({ day: d, items: [l] });
  }
  return (
    <div>
      <Segmented
        label="Filter payments"
        value={f}
        onChange={setF}
        options={[
          { id: "all", label: "All", count: ledger.length },
          { id: "release", label: "Payments", count: ledger.filter((l) => l.kind === "release").length },
          { id: "hold", label: "Holds", count: ledger.filter((l) => l.kind === "hold").length },
        ]}
      />
      <section className="mt-4 overflow-hidden rounded-[22px] border border-[#ebebf0] bg-white pb-2 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        {groups.length === 0 ? (
          <p className="px-6 py-14 text-center text-[14px] text-muted">Nothing here yet.</p>
        ) : (
          groups.map((g) => (
            <div key={g.day}>
              <DayLabel>{g.day}</DayLabel>
              {g.items.map((l) => {
                const d = describe(l);
                return (
                  <Row
                    key={l.id}
                    href={`/jobs/${l.jobId}`}
                    icon={
                      <IconCircle tone={d.tone} size={42}>
                        {d.icon}
                      </IconCircle>
                    }
                    title={d.title}
                    sub={`${l.address} · ${l.paypalId ?? "awaiting PayPal"}`}
                    value={d.value}
                    valueTone={d.valueTone}
                    meta={d.meta}
                  />
                );
              })}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
