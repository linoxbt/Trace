"use client";

// Live updates: new timeline events arrive over Supabase Realtime, filtered by
// row-level security to the viewer's own jobs. Callers still poll slowly as a
// fallback, in case the socket can't connect.

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "./supabase-browser";

/** Call `onEvent` (debounced) when a new event lands on this job, or on any of the viewer's jobs. Returns whether the socket is live. */
export function useLiveEvents(onEvent: () => void, jobId?: string): boolean {
  const [live, setLive] = useState(false);
  const cb = useRef(onEvent);
  cb.current = onEvent;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sb: ReturnType<typeof supabaseBrowser>;
    try {
      sb = supabaseBrowser();
    } catch {
      return;
    }
    const channel = sb
      .channel(jobId ? `job-${jobId}` : "my-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events", ...(jobId ? { filter: `job_id=eq.${jobId}` } : {}) },
        () => {
          // Several events usually land together (a verdict, then a guard decision): refresh once.
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => cb.current(), 600);
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      if (timer) clearTimeout(timer);
      sb.removeChannel(channel);
    };
  }, [jobId]);
  return live;
}
