"use client";

import { useActionState, useId } from "react";
import { subscribeAction, type FormState } from "@/actions/public";

export function SubscribeForm({
  source = "/",
  compact = false,
  consentText,
}: {
  source?: string;
  compact?: boolean;
  consentText: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(subscribeAction, null);
  const id = useId();

  if (state?.ok) {
    return (
      <p role="status" className="font-serif text-xl leading-relaxed text-ink">
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3" noValidate={false}>
      <input type="hidden" name="source" value={source} />
      {/* Honeypot: hidden from people, tempting to bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className={compact ? "flex flex-col gap-2 sm:flex-row" : "grid gap-3 sm:grid-cols-[1fr_1fr]"}>
        {!compact && (
          <div>
            <label htmlFor={`${id}-name`} className="field-label">
              First name <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id={`${id}-name`} name="name" autoComplete="given-name" className="input" />
          </div>
        )}
        <div className={compact ? "flex-1" : ""}>
          <label htmlFor={`${id}-email`} className={compact ? "sr-only" : "field-label"}>
            Email address
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder={compact ? "you@example.com" : undefined}
            className="input"
          />
        </div>
        {compact && (
          <button className="btn" disabled={pending}>
            {pending ? "Subscribing…" : "Subscribe"}
          </button>
        )}
      </div>
      <label className="flex items-start gap-2.5 text-sm leading-snug text-ink-soft">
        <input type="checkbox" name="consent" value="yes" required className="mt-0.5 size-4 accent-[#7a5c34]" />
        <span>{consentText}</span>
      </label>
      {!compact && (
        <button className="btn" disabled={pending}>
          {pending ? "Subscribing…" : "Subscribe to The Dash"}
        </button>
      )}
      {state && !state.ok && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <p className="text-xs text-muted">
        An occasional letter. Your address is never shared or sold, and you can unsubscribe in one click.{" "}
        <a href="/privacy" className="link">
          Privacy
        </a>
      </p>
    </form>
  );
}
