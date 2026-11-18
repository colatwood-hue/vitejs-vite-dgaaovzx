"use client";

import { useActionState, useEffect, useRef } from "react";
import { answerAction } from "@/actions/ai";
import type { FormState } from "@/actions/public";
import { useRecorder } from "./useRecorder";

export function AnswerForm({ ideaId }: { ideaId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(answerAction, null);
  const rec = useRecorder();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      rec.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={ref}
      className="space-y-3"
      action={(fd) => {
        const f = rec.asFile();
        if (f) fd.set("audio", f);
        return action(fd);
      }}
    >
      <input type="hidden" name="ideaId" value={ideaId} />
      <label htmlFor="answer" className="field-label">
        Your answer (your words are kept exactly as written)
      </label>
      <textarea id="answer" name="answer" rows={5} className="input font-serif text-lg" placeholder="Answer one or all of the questions. Specifics beat summaries." />
      <div className="flex flex-wrap items-center gap-2">
        {!rec.recording ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={rec.start}>
            <span className="inline-block size-2 rounded-full bg-danger" aria-hidden="true" /> {rec.clip ? "Re-record" : "Answer by voice"}
          </button>
        ) : (
          <button type="button" className="btn btn-danger btn-sm" onClick={rec.stop}>
            ■ Stop · {Math.floor(rec.seconds / 60)}:{String(rec.seconds % 60).padStart(2, "0")}
          </button>
        )}
        {rec.clip && <audio controls src={rec.clip.url} className="h-8 max-w-full" />}
        <button className="btn btn-sm" disabled={pending || rec.recording}>
          {pending ? (rec.clip ? "Transcribing…" : "Saving…") : "Save answer"}
        </button>
      </div>
      {rec.error && <p className="text-sm text-danger">{rec.error}</p>}
      {state && (
        <p role="status" className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
