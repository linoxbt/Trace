// Line icons for the app's navigation, on a 24-unit grid.

type P = { className?: string };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };

export const IconHome = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z" />
  </svg>
);
export const IconJobs = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <rect x="3.5" y="6.5" width="17" height="13" rx="2.5" />
    <path d="M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v1.5M3.5 12h17" />
  </svg>
);
export const IconInbox = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M4 13.5 6.2 6a1.5 1.5 0 0 1 1.4-1h8.8a1.5 1.5 0 0 1 1.4 1L20 13.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18v-4.5Z" />
    <path d="M4 13.5h4.5l1 2h5l1-2H20" />
  </svg>
);
export const IconActivity = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M3.5 12h4l2.5-6 4 12 2.5-6h4" />
  </svg>
);
export const IconWallet = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <rect x="3.5" y="6" width="17" height="13" rx="2.5" />
    <path d="M16 12.5h4.5M6.5 6 15 3.5 16.5 6" />
    <circle cx="16.3" cy="12.5" r=".6" fill="currentColor" />
  </svg>
);
export const IconDispute = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M12 4 3.5 19h17L12 4Z" />
    <path d="M12 10v4M12 16.8v.2" />
  </svg>
);
export const IconShield = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M12 3.5 5 6.5v5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5v-5l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
export const IconSettings = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4.4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" />
  </svg>
);
export const IconPlus = ({ className = "h-4 w-4" }: P) => (
  <svg {...base} strokeWidth={2} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconBell = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2Z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </svg>
);
export const IconArrow = ({ className = "h-4 w-4" }: P) => (
  <svg {...base} strokeWidth={2} className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const IconMore = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
  </svg>
);
export const IconCamera = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
    <circle cx="12" cy="13" r="3.3" />
  </svg>
);
export const IconMail = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
    <path d="m4.5 7 7.5 6 7.5-6" />
  </svg>
);
export const IconCheck = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12.2 2.3 2.3 4.7-4.8" />
  </svg>
);
export const IconDoc = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" />
    <path d="M14 3.5V8h4M8.5 12.5h7M8.5 16h5" />
  </svg>
);
export const IconLock = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </svg>
);
export const IconIn = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} strokeWidth={2} className={className}>
    <path d="M17 7 7 17M7 9v8h8" />
  </svg>
);
export const IconOut = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} strokeWidth={2} className={className}>
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
);
export const IconUndo = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} strokeWidth={1.9} className={className}>
    <path d="M9 7 4.5 11.5 9 16" />
    <path d="M5 11.5h9a5 5 0 0 1 0 10h-2" />
  </svg>
);
export const IconChevron = ({ className = "h-4 w-4" }: P) => (
  <svg {...base} strokeWidth={2} className={className}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
export const IconX = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} strokeWidth={2} className={className}>
    <path d="M7 7l10 10M17 7 7 17" />
  </svg>
);
