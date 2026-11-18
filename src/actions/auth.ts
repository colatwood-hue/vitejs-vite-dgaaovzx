"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticate, createSession, createUser, hasAnyUser, logout, setSessionCookie } from "@/lib/auth";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { updateSettings } from "@/lib/settings";
import type { FormState } from "./public";

async function ip() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!(await rateLimit(`login:ip:${await ip()}`, 10, 900)) || !(await rateLimit(`login:email:${email}`, 8, 900))) {
    return { ok: false, message: "Too many attempts. Wait 15 minutes and try again." };
  }
  const user = await authenticate(email, password);
  if (!user) return { ok: false, message: "That email and password don't match." };
  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);
  redirect("/studio");
}

const setupSchema = z.object({
  token: z.string(),
  name: z.string().trim().min(1).max(80),
  email: z.email(),
  password: z.string().min(12, "Use at least 12 characters."),
});

export async function setupAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (await hasAnyUser()) return { ok: false, message: "The studio already has an owner. Sign in instead." };
  if (!(await rateLimit(`setup:${await ip()}`, 5, 3600))) return { ok: false, message: "Too many attempts." };
  const parsed = setupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const expected = env.setupToken();
  if (!expected || !safeEqual(parsed.data.token, expected)) return { ok: false, message: "Setup token is incorrect." };
  const user = await createUser(parsed.data.email, parsed.data.password, parsed.data.name);
  await updateSettings({ authorName: parsed.data.name });
  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);
  redirect("/studio?welcome=1");
}

export async function logoutAction() {
  await logout();
  redirect("/studio/login");
}
