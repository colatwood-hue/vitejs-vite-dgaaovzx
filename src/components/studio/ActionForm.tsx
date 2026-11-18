"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/actions/public";

/**
 * Generic form wrapper for server actions returning {ok, message}.
 * Shows pending state and an accessible status message.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Working…",
  className = "",
  buttonClassName = "btn",
  confirmMessage,
  resetOnSuccess = false,
  hidden,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  children?: React.ReactNode;
  submitLabel: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  buttonClassName?: string;
  confirmMessage?: string;
  resetOnSuccess?: boolean;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button className={buttonClassName} disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </button>
        {state && (
          <p role="status" className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
