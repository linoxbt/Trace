// A small hand-drawn icon set, 24px on a 1.6 stroke.

const base = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconPin = () => (
  <svg {...base}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" /><circle cx="12" cy="10" r="2.3" /></svg>
);
export const IconClock = () => (
  <svg {...base}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
export const IconFingerprint = () => (
  <svg {...base}><path d="M7 15.5c0-3 0-8.5 5-8.5s5 3.5 5 6.5" /><path d="M10 20c-.6-1.6-1-3.5-1-6 0-2 1-3.3 3-3.3s3 1.3 3 3.3c0 2.3.3 4.3 1 6" /><path d="M12 14c0 2.2.4 4.2 1.2 6" /><path d="M4.5 10.5C5.4 6.2 8.3 4 12 4c3 0 5.4 1.4 6.7 4" /></svg>
);
export const IconScreen = () => (
  <svg {...base}><rect x="3.5" y="5" width="17" height="11" rx="2" /><path d="M9 20h6M12 16v4" /><path d="m5 3 14 18" /></svg>
);
export const IconLayers = () => (
  <svg {...base}><path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z" /><path d="m3.5 12.5 8.5 4.5 8.5-4.5" opacity=".5" /></svg>
);
export const IconShield = () => (
  <svg {...base}><path d="M12 3.5 19 6v5.5c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6l7-2.5Z" /><path d="m9 12 2 2 4-4.5" /></svg>
);
export const IconCamera = () => (
  <svg {...base}><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" /><circle cx="12" cy="13" r="3.3" /></svg>
);
export const IconMic = () => (
  <svg {...base}><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21" /></svg>
);
export const IconLock = () => (
  <svg {...base}><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
);
export const IconArrow = () => (
  <svg {...base} width={16} height={16}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconDoc = () => (
  <svg {...base}><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V3.5Z" /><path d="M14 3.5V8h4M9.5 12h5M9.5 15h5M9.5 18h3" /></svg>
);
export const IconCheck = () => (
  <svg {...base} width={14} height={14} strokeWidth={2.2}><path d="m5 12.5 4.2 4L19 7" /></svg>
);
