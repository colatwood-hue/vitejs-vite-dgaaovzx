"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { captureThoughtAction, type CaptureState } from "@/actions/thoughts";
import { attachUpload } from "./upload";

const SOURCES: [string, string][] = [
  ["note", "Note"],
  ["journal", "Journal"],
  ["story", "Story"],
  ["question", "Question"],
  ["observation", "Observation"],
  ["lesson", "Lesson"],
  ["quote", "Quote"],
  ["link", "Link"],
  ["concept", "Newsletter concept"],
];

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export function CaptureForm() {
  const [state, action, pending] = useActionState<CaptureState, FormData>(captureThoughtAction, null);
  const [source, setSource] = useState("note");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const secondsRef = useRef(0);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset local state when a new successful result arrives (no effect needed).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok) {
      setAudio(null);
      setSource("note");
    }
  }
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  async function start() {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        setAudio((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { blob, url: URL.createObjectURL(blob), seconds: secondsRef.current };
        });
      };
      rec.start(1000);
      recRef.current = rec;
      setSeconds(0);
      secondsRef.current = 0;
      timer.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= 15 * 60) stop();
      }, 1000);
      setRecording(true);
    } catch {
      setMicError("Couldn't access the microphone. Check browser permissions, or upload an audio file instead.");
    }
  }
  function stop() {
    recRef.current?.stop();
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <form
      ref={formRef}
      id="capture"
      className="card space-y-4 p-4 sm:p-5"
      action={async (fd) => {
        setUploadError(null);
        setUploading(true);
        try {
          const uploaded = fd.get("audio");
          if (audio) {
            const ext = audio.blob.type.includes("mp4") ? "m4a" : audio.blob.type.includes("ogg") ? "ogg" : "webm";
            await attachUpload(fd, "audio", new File([audio.blob], `voice-note.${ext}`, { type: audio.blob.type }), "audio", "audioKey");
            fd.set("recorded", "1");
            fd.set("durationSeconds", String(audio.seconds));
          } else if (uploaded instanceof File && uploaded.size > 0) {
            await attachUpload(fd, "audio", uploaded, "audio", "audioKey");
          } else {
            fd.delete("audio");
          }
        } catch (err) {
          setUploadError((err as Error).message);
          setUploading(false);
          return;
        }
        setUploading(false);
        startTransition(() => action(fd));
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl">Capture a thought</h2>
        <span className="text-xs text-muted">Private by default</span>
      </div>

      <fieldset>
        <legend className="sr-only">Type</legend>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {SOURCES.map(([v, label]) => (
            <label key={v} className={`chip cursor-pointer ${source === v ? "border-ink bg-ink text-paper" : ""}`}>
              <input type="radio" name="sourceType" value={v} checked={source === v} onChange={() => setSource(v)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="capture-content" className="sr-only">
        What&rsquo;s on your mind
      </label>
      <textarea
        id="capture-content"
        name="content"
        rows={source === "journal" ? 10 : 4}
        className="input font-serif text-lg"
        placeholder={
          source === "question"
            ? "What are you wondering about?"
            : source === "quote"
              ? "The quote, and who said it…"
              : source === "story"
                ? "What happened? Who was there? What did it feel like?"
                : "What's on your mind?"
        }
      />

      {(source === "link" || source === "quote") && (
        <div>
          <label htmlFor="capture-url" className="field-label">
            Link {source === "quote" && <span className="font-normal text-muted">(source, optional)</span>}
          </label>
          <input id="capture-url" name="sourceUrl" type="url" inputMode="url" className="input" placeholder="https://" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!recording ? (
          <button type="button" onClick={start} className="btn btn-ghost" aria-label="Record a voice note">
            <span className="inline-block size-2.5 rounded-full bg-danger" aria-hidden="true" /> {audio ? "Re-record" : "Record voice note"}
          </button>
        ) : (
          <button type="button" onClick={stop} className="btn btn-danger" aria-live="polite">
            ■ Stop · {mmss(seconds)}
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
          Upload audio
        </button>
        <input
          ref={fileRef}
          type="file"
          name="audio"
          accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setAudio(null);
              setSource("note");
            }
          }}
        />
        {audio && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <audio controls src={audio.url} className="h-9 max-w-full" />
            <button type="button" className="text-xs text-muted underline" onClick={() => setAudio(null)}>
              Discard
            </button>
          </div>
        )}
      </div>
      {micError && <p className="text-sm text-danger">{micError}</p>}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Title, tags & privacy</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="capture-title" className="field-label">
              Title
            </label>
            <input id="capture-title" name="title" className="input" />
          </div>
          <div>
            <label htmlFor="capture-tags" className="field-label">
              Tags
            </label>
            <input id="capture-tags" name="tags" className="input" placeholder="comma, separated" />
          </div>
          <div>
            <label htmlFor="capture-privacy" className="field-label">
              Privacy
            </label>
            <select id="capture-privacy" name="privacy" className="input" defaultValue="private">
              <option value="private">Private</option>
              <option value="sensitive">Sensitive (never sent to AI)</option>
              <option value="shareable">Shareable</option>
            </select>
          </div>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending || uploading || recording}>
          {uploading ? "Uploading…" : pending ? "Saving…" : "Save to inbox"}
        </button>
        {state && (
          <p role="status" className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>
            {state.message}{" "}
            {state.ok && state.id && (
              <Link href={`/studio/inbox/${state.id}`} className="link">
                Open
              </Link>
            )}
          </p>
        )}
      </div>
      {uploadError && (
        <p role="alert" className="text-sm text-danger">
          {uploadError} Your recording is still here. Try again.
        </p>
      )}
      {state?.transcriptionNote && <p className="text-xs text-warn">Transcription: {state.transcriptionNote}</p>}
    </form>
  );
}
