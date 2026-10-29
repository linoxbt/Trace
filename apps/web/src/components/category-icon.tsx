// A line icon for each job type, on the app's 24-unit grid.

import type { JobCategory } from "@trace/core/categories";

const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };

const PATHS: Record<JobCategory, React.ReactNode> = {
  home_repair: (
    <>
      <path d="M14.5 5.5a4 4 0 0 0-5.2 5.2L4 16v4h4l5.3-5.3a4 4 0 0 0 5.2-5.2l-2.6 2.6-2.5-.6-.6-2.5 2.6-2.6Z" />
    </>
  ),
  cleaning: (
    <>
      <path d="M8 21h8M9 21l1-9h4l1 9" />
      <path d="M12 12V4M9 4h6" />
      <path d="M18.5 6.5 20 5M19 9.5h2M5 9.5H3M5.5 6.5 4 5" />
    </>
  ),
  car: (
    <>
      <path d="M4 15.5V12l2-5h12l2 5v3.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
      <path d="M4 12h16M7.5 16.5V19M16.5 16.5V19" />
      <circle cx="8" cy="14" r=".5" />
      <circle cx="16" cy="14" r=".5" />
    </>
  ),
  garden: (
    <>
      <path d="M12 21v-8" />
      <path d="M12 13c0-4 2.5-7 7-7 0 4.5-3 7-7 7ZM12 15c0-3-2-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5Z" />
      <path d="M6 21h12" />
    </>
  ),
  moving: (
    <>
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </>
  ),
  install: (
    <>
      <rect x="3.5" y="5" width="17" height="11" rx="1.5" />
      <path d="M9 20h6M12 16v4" />
    </>
  ),
  events: (
    <>
      <path d="M4 20 9.5 5l9.5 9.5L4 20Z" />
      <path d="M14 4.5c.5-1 1.5-1.5 2.5-1M19.5 9.5c1-.5 1.5-1.5 1.5-2.5M17 7l2-2" />
    </>
  ),
};

export function CategoryIcon({ id, className = "h-5 w-5" }: { id: JobCategory; className?: string }) {
  return (
    <svg {...base} className={className}>
      {PATHS[id]}
    </svg>
  );
}
