"use client";

import { useActionState } from "react";
import type { FormState } from "@/actions/public";

export function TokenActionForm({
  action,
  token,
  label,
  pendingLabel,
  danger = false,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  token: string;
  label: string;
  pendingLabel: string;
  danger?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  if (state) {
    return (
      <p role="status" className={`font-serif text-xl leading-relaxed ${state.ok ? "text-ink" : "text-danger"}`}>
        {state.message}
      </p>
    );
  }
  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      <button className={`btn ${danger ? "btn-danger" : ""}`} disabled={pending}>
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}
