"use client";

import { useActionState } from "react";
import { preferencesAction, type FormState } from "@/actions/public";

export function PreferencesForm({
  token,
  name,
  newsletter,
  occasionalUpdates,
}: {
  token: string;
  name: string;
  newsletter: boolean;
  occasionalUpdates: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(preferencesAction, null);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="pref-name" className="field-label">
          Name
        </label>
        <input id="pref-name" name="name" defaultValue={name} className="input max-w-sm" />
      </div>
      <fieldset className="space-y-3">
        <legend className="field-label">What you&rsquo;d like to receive</legend>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="newsletter" defaultChecked={newsletter} className="mt-1 size-4 accent-[#7a5c34]" />
          <span>
            <span className="block font-medium">The Dash letters</span>
            <span className="text-sm text-muted">Each new issue of the newsletter.</span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="occasionalUpdates" defaultChecked={occasionalUpdates} className="mt-1 size-4 accent-[#7a5c34]" />
          <span>
            <span className="block font-medium">Occasional updates</span>
            <span className="text-sm text-muted">Rare notes about Who Is Col projects and events.</span>
          </span>
        </label>
      </fieldset>
      <p className="text-xs text-muted">Unticking everything unsubscribes you completely.</p>
      <button className="btn" disabled={pending}>
        {pending ? "Saving…" : "Save preferences"}
      </button>
      {state && (
        <p role="status" className={state.ok ? "text-ok" : "text-danger"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
