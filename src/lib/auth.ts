/**
 * Single-owner authentication: email + password (scrypt), opaque session
 * tokens stored hashed in Postgres, httpOnly SameSite=Lax cookies.
 */
import { and, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { loginChallenges, sessions, users } from "@/db/schema";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto";
import { env } from "./env";
import { decryptSecret, encryptSecret, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUri, verifyTotp } from "./totp";

export const SESSION_COOKIE = "dash_session";
const SESSION_DAYS = 30;

export type SessionUser = { id: string; email: string; name: string };

/* ---------- pure data layer (testable without Next request context) ---------- */

export async function createUser(email: string, password: string, name = ""): Promise<SessionUser> {
  if (password.length < 12) throw new Error("Password must be at least 12 characters.");
  const [u] = await db
    .insert(users)
    .values({ email: email.trim().toLowerCase(), name, passwordHash: await hashPassword(password) })
    .returning({ id: users.id, email: users.email, name: users.name });
  return u;
}

export async function hasAnyUser(): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}

export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const [u] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  if (!u) {
    // Spend comparable time so response timing doesn't reveal which emails exist.
    await verifyPassword(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==");
    return null;
  }
  return (await verifyPassword(password, u.passwordHash)) ? { id: u.id, email: u.email, name: u.name } : null;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  // Opportunistic cleanup of expired sessions.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { token, expiresAt };
}

export async function getUserForToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function destroySession(token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

/* ---------- request helpers ---------- */

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function currentUser(): Promise<SessionUser | null> {
  return getUserForToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Use at the top of every studio page and every server action. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/studio/login");
  return user;
}

export async function logout() {
  const jar = await cookies();
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}

/* ---------- two-factor (TOTP + recovery codes) ---------- */

export const MFA_COOKIE = "dash_mfa";
const CHALLENGE_MINUTES = 10;
const MAX_CHALLENGE_ATTEMPTS = 5;

export async function userHasTotp(userId: string) {
  const [u] = await db.select({ on: users.totpEnabledAt }).from(users).where(eq(users.id, userId));
  return !!u?.on;
}

/** After a correct password: either a session, or (with 2FA on) a short-lived challenge. */
export async function beginLogin(userId: string): Promise<{ kind: "session"; token: string; expiresAt: Date } | { kind: "challenge"; token: string; expiresAt: Date }> {
  if (!(await userHasTotp(userId))) return { kind: "session", ...(await createSession(userId)) };
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60_000);
  await db.delete(loginChallenges).where(lt(loginChallenges.expiresAt, new Date()));
  await db.insert(loginChallenges).values({ id: sha256(token), userId, expiresAt });
  return { kind: "challenge", token, expiresAt };
}

/** Accepts a 6-digit authenticator code or a single-use recovery code. */
export async function completeChallenge(token: string | undefined, code: string): Promise<{ ok: true; userId: string; usedRecovery: boolean } | { ok: false; reason: string }> {
  if (!token) return { ok: false, reason: "Your sign-in expired. Enter your password again." };
  const [ch] = await db.select().from(loginChallenges).where(and(eq(loginChallenges.id, sha256(token)), gt(loginChallenges.expiresAt, new Date())));
  if (!ch) return { ok: false, reason: "Your sign-in expired. Enter your password again." };
  if (ch.attempts >= MAX_CHALLENGE_ATTEMPTS) {
    await db.delete(loginChallenges).where(eq(loginChallenges.id, ch.id));
    return { ok: false, reason: "Too many incorrect codes. Enter your password again." };
  }
  await db.update(loginChallenges).set({ attempts: ch.attempts + 1 }).where(eq(loginChallenges.id, ch.id));
  const [u] = await db.select().from(users).where(eq(users.id, ch.userId));
  if (!u?.totpSecretEnc || !u.totpEnabledAt) return { ok: false, reason: "Two-factor isn't set up for this account." };

  const step = verifyTotp(decryptSecret(u.totpSecretEnc, env.authSecret()), code, u.totpLastStep);
  if (step !== null) {
    // Conditional update: two concurrent requests can't both use the same step.
    const updated = await db
      .update(users)
      .set({ totpLastStep: step })
      .where(and(eq(users.id, u.id), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
      .returning({ id: users.id });
    if (!updated.length) return { ok: false, reason: "That code was already used. Wait for the next one." };
    await db.delete(loginChallenges).where(eq(loginChallenges.id, ch.id));
    return { ok: true, userId: u.id, usedRecovery: false };
  }
  const h = hashRecoveryCode(code);
  // Atomic: the code is removed only if still present, so it can be spent once.
  const spent = await db
    .update(users)
    .set({ recoveryCodeHashes: sql`array_remove(${users.recoveryCodeHashes}, ${h})` })
    .where(and(eq(users.id, u.id), sql`${h} = any(${users.recoveryCodeHashes})`))
    .returning({ id: users.id });
  if (spent.length) {
    await db.delete(loginChallenges).where(eq(loginChallenges.id, ch.id));
    return { ok: true, userId: u.id, usedRecovery: true };
  }
  return { ok: false, reason: "That code didn't match. Check your authenticator app's clock." };
}

/** Step 1 of enrolment: a fresh secret, stored encrypted but not yet active. */
export async function startTotpEnrollment(userId: string) {
  const secret = generateTotpSecret();
  await db.update(users).set({ totpSecretEnc: encryptSecret(secret, env.authSecret()), totpEnabledAt: null, totpLastStep: null }).where(eq(users.id, userId));
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  return { secret, uri: otpauthUri(secret, u.email) };
}

/** Step 2: proves the app is set up; activates 2FA and returns recovery codes ONCE. */
export async function confirmTotpEnrollment(userId: string, code: string): Promise<string[] | null> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u?.totpSecretEnc || u.totpEnabledAt) return null;
  const step = verifyTotp(decryptSecret(u.totpSecretEnc, env.authSecret()), code, null);
  if (step === null) return null;
  const codes = generateRecoveryCodes();
  await db
    .update(users)
    .set({ totpEnabledAt: new Date(), totpLastStep: step, recoveryCodeHashes: codes.map(hashRecoveryCode) })
    .where(eq(users.id, userId));
  return codes;
}

export async function regenerateRecoveryCodes(userId: string) {
  const codes = generateRecoveryCodes();
  await db.update(users).set({ recoveryCodeHashes: codes.map(hashRecoveryCode) }).where(eq(users.id, userId));
  return codes;
}

/** Turning 2FA off requires the password; all other sessions are signed out. */
export async function disableTotp(userId: string, password: string, keepSessionToken?: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || !(await verifyPassword(password, u.passwordHash))) return false;
  await db.update(users).set({ totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, recoveryCodeHashes: [] }).where(eq(users.id, userId));
  await signOutOtherSessions(userId, keepSessionToken);
  return true;
}

export async function signOutOtherSessions(userId: string, keepSessionToken?: string) {
  const keep = keepSessionToken ? sha256(keepSessionToken) : "";
  await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, keep)));
}

export async function changePassword(userId: string, current: string, next: string, keepSessionToken?: string) {
  if (next.length < 12) return { ok: false as const, reason: "Use at least 12 characters." };
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || !(await verifyPassword(current, u.passwordHash))) return { ok: false as const, reason: "Current password is incorrect." };
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, userId));
  await signOutOtherSessions(userId, keepSessionToken);
  return { ok: true as const };
}

export async function currentSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}
