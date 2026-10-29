"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLiveEvents } from "@/lib/live";

/** App pages re-render when anything happens on the viewer's jobs. The job page handles its own updates. */
export function LiveRefresh() {
  const router = useRouter();
  const path = usePathname();
  const onJobPage = /^\/jobs\/[0-9a-f-]{36}$/.test(path);
  useLiveEvents(() => {
    if (!onJobPage) router.refresh();
  });
  return null;
}
