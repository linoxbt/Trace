"use client";

/** A segmented control, as banking apps use for filters. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; count?: number }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-full bg-[#ececf2] p-1">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`press h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-medium transition-colors ${value === o.id ? "bg-white text-ink shadow-[0_1px_3px_rgba(16,24,40,0.12)]" : "text-muted hover:text-ink"}`}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 tabular-nums text-faint">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
