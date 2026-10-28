// A phone frame for product screens on the marketing pages. Screens draw
// their own status bar so a dark screen gets light status icons.

export function Phone({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative w-[300px] rounded-[46px] bg-[#0d0a12] p-[10px] shadow-[0_50px_100px_-30px_rgba(26,19,37,0.55),0_0_0_1px_rgba(255,255,255,0.08)_inset] ${className}`}>
      <div className="relative h-[600px] overflow-hidden rounded-[37px] bg-paper">{children}</div>
    </div>
  );
}

export function StatusBar({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold ${dark ? "text-white" : "text-ink"}`}>
      <span className="num">9:41</span>
      <span className="h-[22px] w-[86px] rounded-full bg-[#0d0a12]" />
      <span className={`h-2 w-3.5 rounded-[2px] border ${dark ? "border-white" : "border-ink"}`} />
    </div>
  );
}

export function Screen({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className={`absolute inset-0 ${dark ? "bg-night text-white" : "bg-paper text-ink"}`}>
      <StatusBar dark={dark} />
      {children}
    </div>
  );
}
