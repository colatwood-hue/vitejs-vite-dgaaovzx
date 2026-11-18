"use client";

import { useEffect, useRef, useState } from "react";

export function useRecorder(maxSeconds = 15 * 60) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const secs = useRef(0);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        setClip({ blob, url: URL.createObjectURL(blob) });
      };
      r.start(1000);
      rec.current = r;
      secs.current = 0;
      setSeconds(0);
      timer.current = setInterval(() => {
        secs.current += 1;
        setSeconds(secs.current);
        if (secs.current >= maxSeconds) stop();
      }, 1000);
      setRecording(true);
    } catch {
      setError("Couldn't access the microphone.");
    }
  }

  function stop() {
    rec.current?.stop();
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
  }

  function clear() {
    if (clip) URL.revokeObjectURL(clip.url);
    setClip(null);
  }

  function asFile() {
    if (!clip) return null;
    const ext = clip.blob.type.includes("mp4") ? "m4a" : clip.blob.type.includes("ogg") ? "ogg" : "webm";
    return new File([clip.blob], `answer.${ext}`, { type: clip.blob.type });
  }

  return { recording, seconds, clip, error, start, stop, clear, asFile };
}
