"use client";

// Full-screen in-app camera (spec screen 6). No file picker: frames come from
// getUserMedia. The before-photo sits on top as a 35% ghost to match the angle.
// For an after-photo the server issues a one-time token when the camera opens.
// Video lines record a 5 to 20 second clip, sent as 8 frames with their times;
// reading lines take a photo of the gauge and ask what it reads.

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
  /** How the line is proved: a photo (default), a short video, or a gauge reading. */
  proofType?: "photo" | "video" | "reading";
  /** Reading lines: what to read, e.g. "pressure in bar". */
  readingLabel?: string;
  onClose: () => void;
  onDone: (r: CameraResult) => void;
}) {
  const kind = props.mode === "after" ? (props.proofType ?? "photo") : "photo";
  const [recording, setRecording] = useState<{ started: number; frames: { at: number; blob: Blob }[] } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [reading, setReading] = useState<{ blob: Blob; value: string } | null>(null);
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

  const grab = async (quality = 0.9): Promise<Blob | null> => {
    const v = video.current;
    if (!v || !v.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    return new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  };

  /** Send a proof form, with the camera fields; a stale token is replaced once. */
  async function submit(fill: (form: FormData) => void) {
    setStatus("sending");
    const send = async (tok: string | null) => {
      const form = new FormData();
      fill(form);
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

  async function shoot() {
    const blob = await grab();
    if (!blob) return;
    if (kind === "reading") return setReading({ blob, value: "" });
    await submit((form) => form.append("photo", blob, "photo.jpg"));
  }

  // Video: a frame a second while recording; stop at 20 s, send 8 evenly spread.
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(async () => {
      const at = (Date.now() - recording.started) / 1000;
      setElapsed(at);
      const blob = await grab(0.8);
      if (blob) recording.frames.push({ at, blob });
      if (at >= 20) stopRecording();
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  async function startRecording() {
    const first = await grab(0.85);
    if (!first) return;
    setMessage("");
    setElapsed(0);
    setRecording({ started: Date.now(), frames: [{ at: 0, blob: first }] });
  }

  async function stopRecording() {
    const r = recording;
    if (!r) return;
    setRecording(null);
    const duration = (Date.now() - r.started) / 1000;
    if (duration < 5) {
      setMessage("Record at least 5 seconds.");
      return;
    }
    const last = await grab(0.85);
    const all = last ? [...r.frames, { at: duration, blob: last }] : r.frames;
    const pick = all.length <= 8 ? all : Array.from({ length: 8 }, (_, i) => all[Math.round((i * (all.length - 1)) / 7)]!);
    await submit((form) => {
      pick.forEach((f, i) => form.append("frame", f.blob, `frame-${i}.jpg`));
      form.append("times", JSON.stringify(pick.map((f) => Math.round(f.at * 10) / 10)));
      form.append("duration", String(Math.round(duration * 10) / 10));
    });
  }

  async function sendReading() {
    if (!reading) return;
    const value = Number(reading.value.replace(",", "."));
    const r = reading;
    setReading(null);
    await submit((form) => {
      form.append("photo", r.blob, "gauge.jpg");
      if (Number.isFinite(value) && r.value.trim()) form.append("value", String(value));
    });
  }

  const gpsTone = gps ? (gps.accuracy <= 100 ? "bg-lilac" : "bg-[#ffd27a]") : "bg-white/30";
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-night text-white" role="dialog" aria-modal="true" aria-label={`Camera: ${props.title}`}>
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <button onClick={props.onClose} className="press h-10 rounded-full bg-white/10 px-4 text-[14px] font-medium backdrop-blur">
          Cancel
        </button>
        <div className="min-w-0 text-center">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/50">{props.mode === "before" ? "Before-photo" : kind === "video" ? "Record it" : kind === "reading" ? "Read the gauge" : "Prove it"}</div>
          <div className="truncate text-[14px] font-medium">{props.title}</div>
        </div>
        <div className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12px] backdrop-blur" aria-live="polite">
          <span className={`h-2 w-2 rounded-full ${gpsTone} ${gps ? "" : "animate-pulse-soft"}`} />
          <span className="num">{gps ? `±${Math.round(gps.accuracy)} m` : "GPS"}</span>
        </div>
      </div>

      <div className="relative mx-3 flex-1 overflow-hidden rounded-[28px] bg-black" style={{ "--bracket": "#c6b5ff" } as React.CSSProperties}>
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        {props.ghostUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.ghostUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-screen" />
        )}
        {/* Viewfinder corners */}
        <div className="bracket pointer-events-none absolute inset-6" />
        {props.ghostUrl && status === "live" && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1.5 text-[12px] backdrop-blur">Line up with the ghost of the before-photo</div>
        )}
        {status === "starting" && (
          <div className="absolute inset-0 grid place-items-center text-[14px] text-white/70">
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Opening the camera…
            </span>
          </div>
        )}
        {status === "sending" && (
          <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[2px]">
            <div className="overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-full animate-scan bg-gradient-to-b from-transparent via-lilac/25 to-transparent" />
              <div className="relative text-center">
                <div className="text-[16px] font-medium">Checking the photo</div>
                <div className="mt-1 text-[13px] text-white/60">Location, freshness, then the work itself</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-5">
        {props.framing && <p className="mx-auto mb-4 max-w-sm text-center text-[13px] text-white/70">{props.framing}</p>}
        {message && (
          <p role="alert" className="mx-auto mb-4 max-w-sm rounded-xl bg-[#2a0f0c] px-3 py-2 text-center text-[13px] text-[#ffb4ab]">
            {message}
          </p>
        )}
        {reading ? (
          <div className="mx-auto max-w-sm rounded-2xl bg-white/10 p-4 backdrop-blur">
            <label className="grid gap-2 text-[13px] text-white/80">
              What does it read{props.readingLabel ? ` (${props.readingLabel})` : ""}?
              <input
                autoFocus
                inputMode="decimal"
                value={reading.value}
                onChange={(e) => setReading({ ...reading, value: e.target.value })}
                className="h-12 rounded-xl bg-white px-3 text-[18px] text-ink"
              />
            </label>
            <p className="mt-2 text-[12px] text-white/60">The AI reads the photo too; if the two differ, the client takes a look.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => setReading(null)} className="press h-11 rounded-full bg-white/15 text-[14px] font-medium">
                Retake
              </button>
              <button onClick={sendReading} className="press h-11 rounded-full bg-white text-[14px] font-semibold text-ink">
                Send
              </button>
            </div>
          </div>
        ) : kind === "video" ? (
          <div className="flex flex-col items-center gap-3">
            <div className="num text-[13px] text-white/70">{recording ? `${elapsed.toFixed(0)} s · stop between 5 and 20 s` : "Record 5 to 20 seconds"}</div>
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={status !== "live"}
              aria-label={recording ? "Stop recording" : "Start recording"}
              className="press group grid h-[76px] w-[76px] place-items-center rounded-full border-[3px] border-white/90 disabled:opacity-40"
            >
              <span className={`bg-[#ff5a4f] transition-all duration-200 ${recording ? "h-7 w-7 rounded-md" : "h-[60px] w-[60px] rounded-full"}`} />
            </button>
          </div>
        ) : (
          <button
            onClick={shoot}
            disabled={status !== "live"}
            aria-label="Take photo"
            className="press group mx-auto grid h-[76px] w-[76px] place-items-center rounded-full border-[3px] border-white/90 disabled:opacity-40"
          >
            <span className="h-[60px] w-[60px] rounded-full bg-white transition-transform duration-200 group-active:scale-90" />
          </button>
        )}
      </div>
    </div>
  );
}
