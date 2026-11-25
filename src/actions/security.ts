"use server";

import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  changePassword,
  confirmTotpEnrollment,
  currentSessionToken,
  disableTotp,
  regenerateRecoveryCodes,
  requireUser,
  signOutOtherSessions,
  startTotpEnrollment,
} from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";

export type SecurityState = { ok: boolean; message: string; codes?: string[] } | null;

export async function startTotpAction(): Promise<{ secret: string; qr: string; uri: string }> {
  const user = await requireUser();
  const { secret, uri } = await startTotpEnrollment(user.id);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: "#1f1c18", light: "#fffdf9" } });
  return { secret, qr, uri };
}

export async function confirmTotpAction(_prev: SecurityState, form: FormData): Promise<SecurityState> {
  const user = await requireUser();
  if (!(await rateLimit(`totp-enrol:${user.id}`, 10, 900))) return { ok: false, message: "Too many attempts. Wait a few minutes." };
  const codes = await confirmTotpEnrollment(user.id, String(form.get("code") ?? ""));
  if (!codes) return { ok: false, message: "That code didn't match. Check the time on your phone and try the next code." };
  revalidatePath("/studio/settings");
  return { ok: true, message: "Two-factor sign-in is on.", codes };
}

async function passwordOk(userId: string, password: string) {
  const [u] = await db.select({ h: users.passwordHash }).from(users).where(eq(users.id, userId));
  return !!u && (await verifyPassword(password, u.h));
}

export async function regenerateCodesAction(_prev: SecurityState, form: FormData): Promise<SecurityState> {
  const user = await requireUser();
  if (!(await rateLimit(`pw-check:${user.id}`, 10, 900))) return { ok: false, message: "Too many attempts." };
  if (!(await passwordOk(user.id, String(form.get("password") ?? "")))) return { ok: false, message: "Password is incorrect." };
  const codes = await regenerateRecoveryCodes(user.id);
  revalidatePath("/studio/settings");
  return { ok: true, message: "New recovery codes. The old ones no longer work.", codes };
}

export async function disableTotpAction(_prev: SecurityState, form: FormData): Promise<SecurityState> {
  const user = await requireUser();
  if (!(await rateLimit(`pw-check:${user.id}`, 10, 900))) return { ok: false, message: "Too many attempts." };
  const ok = await disableTotp(user.id, String(form.get("password") ?? ""), await currentSessionToken());
  if (!ok) return { ok: false, message: "Password is incorrect." };
  revalidatePath("/studio/settings");
  return { ok: true, message: "Two-factor sign-in is off. Other devices were signed out." };
}

export async function changePasswordAction(_prev: SecurityState, form: FormData): Promise<SecurityState> {
  const user = await requireUser();
  if (!(await rateLimit(`pw-check:${user.id}`, 10, 900))) return { ok: false, message: "Too many attempts." };
  const next = String(form.get("next") ?? "");
  if (next !== String(form.get("confirm") ?? "")) return { ok: false, message: "The new passwords don't match." };
  const r = await changePassword(user.id, String(form.get("current") ?? ""), next, await currentSessionToken());
  return r.ok ? { ok: true, message: "Password changed. Other devices were signed out." } : { ok: false, message: r.reason };
}

export async function signOutOthersAction(): Promise<SecurityState> {
  const user = await requireUser();
  await signOutOtherSessions(user.id, await currentSessionToken());
  return { ok: true, message: "Signed out everywhere else." };
}
