export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        <path d="M2 8V2h6M18 2h6v6M24 18v6h-6M8 24H2v-6" fill="none" stroke="#0b7f74" strokeWidth="2.5" />
        <path d="M8 13.5l3.5 3.5L18.5 9" fill="none" stroke="#10201e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-lg font-semibold tracking-tight">Trace</span>
    </div>
  );
}
