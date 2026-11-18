"use server";

import { headers } from "next/headers";
import { confirmSubscription } from "@/lib/subscribers";
import type { FormState } from "./public";

/** Confirmation is a POST (button click) so email link-scanners can't auto-confirm. */
export async function confirmAction(_prev: FormState, form: FormData): Promise<FormState> {
  const h = await headers();
  const sub = await confirmSubscription(String(form.get("token") ?? ""), {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  });
  return sub
    ? { ok: true, message: "You're subscribed. Thank you. The next letter will find you." }
    : { ok: false, message: "This link has expired or was already used. You can subscribe again from the homepage." };
}
