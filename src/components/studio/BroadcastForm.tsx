"use client";

import { useActionState, useState } from "react";
import { broadcastAction } from "@/actions/issues";
import type { FormState } from "@/actions/public";

export function BroadcastForm({ issueId, recipientCount, simulated, provider }: { issueId: string; recipientCount: number; simulated: boolean; provider: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(broadcastAction, null);
  const [mode, setMode] = useState<"now" | "later">("now");
  const [local, setLocal] = useState("");
  const phrase = `SEND ${recipientCount}`;

  return (
    <form
      className="space-y-3"
      action={(fd) => {
        fd.set("scheduledFor", mode === "later" && local ? new Date(local).toISOString() : "");
        return action(fd);
      }}
    >
      <input type="hidden" name="id" value={issueId} />
      <div className={`rounded-sm border p-3 text-sm ${simulated ? "border-[#e8d49a] bg-[#fff4d6] text-[#5c4a12]" : "border-danger/30 bg-danger/5 text-ink"}`}>
        {simulated ? (
          <>
            <strong>Simulated mode.</strong> The send will be recorded for {recipientCount} subscriber(s), but no email will be delivered.
          </>
        ) : (
          <>
            <strong>This sends real email</strong> via {provider} to {recipientCount} consented subscriber(s). It can&rsquo;t be undone once it starts.
          </>
        )}
      </div>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="sr-only">When</legend>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "now"} onChange={() => setMode("now")} className="accent-[#7a5c34]" /> Send now
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "later"} onChange={() => setMode("later")} className="accent-[#7a5c34]" /> Schedule
        </label>
      </fieldset>
      {mode === "later" && (
        <div>
          <label htmlFor="when" className="field-label">
            Send at (your local time)
          </label>
          <input id="when" type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} required className="input max-w-xs" />
          <p className="field-hint">Scheduled sends are processed by the cron job (see setup guide).</p>
        </div>
      )}
      <div>
        <label htmlFor="segmentTags" className="field-label">
          Only subscribers tagged (optional, comma-separated)
        </label>
        <input id="segmentTags" name="segmentTags" className="input max-w-xs" placeholder="everyone" />
        <p className="field-hint">The confirmation count above is for everyone; a segment changes it, and the server will tell you the exact phrase.</p>
      </div>
      <div>
        <label htmlFor="confirmation" className="field-label">
          Type <code className="rounded-sm bg-paper-deep px-1">{phrase}</code> to confirm
        </label>
        <input id="confirmation" name="confirmation" autoComplete="off" required className="input max-w-xs font-mono" />
      </div>
      <button className={`btn ${simulated ? "" : "btn-danger"}`} disabled={pending}>
        {pending ? "Working…" : mode === "now" ? (simulated ? "Simulate send" : "Send to subscribers") : "Schedule"}
      </button>
      {state && (
        <p role="status" className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
