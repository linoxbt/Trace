"use client";

// Full-screen in-app camera (spec screen 6). No file picker: frames come from
// getUserMedia. The before-photo sits on top as a 35% ghost to match the angle.
// For an after-photo the server issues a one-time token when the camera opens.

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, deviceId, position } from "@/lib/api";

export interface CameraResult {
  verdict?: string;
  reasons?: string[];
}

export function Camera(props: {
  mode: "before" | "after";
  jobId: string;
  lineId?: string;
  title: string;
  framing?: string;
  ghostUrl?: string | null;
  onClose: () => void;
  onDone: (r: CameraResult) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [status, setStatus] = useState<"starting" | "live" | "sending" | "error">("starting");
  const [message, setMessage] = useState("");

  const getToken = useCallback(async () => {
    if (props.mode !== "after" || !props.lineId) return null;
    const t = await api<{ token: string }>(`/api/lines/${props.lineId}/token`, { json: { deviceId: deviceId() } });
    setToken(t.token);
    return t.token;
  }, [props.mode, props.lineId]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } }, audio: false });
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        await getToken();
        setStatus("live");
      } catch (e) {
        setStatus("error");
        setMessage(e instanceof ApiError ? e.message : "The camera isn't available. Allow camera access and try again.");
      }
    })();
    position().then(setGps);
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [getToken]);

  async function shoot() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setStatus("sending");
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return setStatus("live");
    const send = async (tok: string | null) => {
      const form = new FormData();
      form.append("photo", blob, "photo.jpg");
      form.append("deviceId", deviceId());
      if (gps) {
        form.append("lat", String(gps.lat));
        form.append("lng", String(gps.lng));
        form.append("accuracy", String(gps.accuracy));
      }
      if (tok) form.append("token", tok);
      const path = props.mode === "after" ? `/api/lines/${props.lineId}/proof` : `/api/jobs/${props.jobId}/photos`;
      return api<CameraResult>(path, { form });
    };
    try {
      props.onDone(await send(token));
    } catch (e) {
      // The 120-second token ran out: open a fresh camera session and send once more.
      if (e instanceof ApiError && e.code === "token_rejected") {
        try {
          return props.onDone(await send(await getToken()));
        } catch (e2) {
          e = e2;
        }
      }
      setStatus("live");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-night text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={props.onClose} className="h-11 px-2 text-sm">Cancel</button>
        <div className="truncate text-sm font-medium">{props.title}</div>
        <div className="flex h-11 items-center gap-1.5 text-xs" aria-live="polite">
          <span className={`h-2 w-2 rounded-full ${gps ? (gps.accuracy <= 100 ? "bg-emerald-400" : "bg-amber-400") : "bg-white/30"}`} />
          {gps ? `GPS ±${Math.round(gps.accuracy)} m` : "Finding GPS"}
        </div>
      </div>
      <div className="bracket relative mx-3 flex-1 overflow-hidden rounded-2xl bg-black">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        {props.ghostUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.ghostUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35" />
        )}
        {status === "sending" && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm">Checking the photo…</div>}
      </div>
      <div className="px-5 pb-8 pt-4">
        {props.framing && <p className="mb-3 text-center text-sm text-white/80">{props.framing}</p>}
        {message && <p role="alert" className="mb-3 text-center text-sm text-red-300">{message}</p>}
        <button
          onClick={shoot}
          disabled={status !== "live"}
          aria-label="Take photo"
          className="mx-auto block h-18 w-18 rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
        />
      </div>
    </div>
  );
}
