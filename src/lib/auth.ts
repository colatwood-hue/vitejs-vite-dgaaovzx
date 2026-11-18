/**
 * Single-owner authentication: email + password (scrypt), opaque session
 * tokens stored hashed in Postgres, httpOnly SameSite=Lax cookies.
 */
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto";

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
