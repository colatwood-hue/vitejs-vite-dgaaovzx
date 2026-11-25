import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { loginChallenges, sessions, users } from "@/db/schema";
import {
  beginLogin,
  completeChallenge,
  confirmTotpEnrollment,
  createSession,
  createUser,
  disableTotp,
  getUserForToken,
  regenerateRecoveryCodes,
  startTotpEnrollment,
  changePassword,
  authenticate,
} from "@/lib/auth";
import { base32Decode, base32Encode, currentStep, decryptSecret, encryptSecret, totpAt, verifyTotp } from "@/lib/totp";

const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890")); // RFC 6238 SHA-1 seed

describe("TOTP primitives", () => {
  it("matches the RFC 6238 test vectors (last 6 digits)", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totpAt(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(totpAt(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpAt(RFC_SECRET, Math.floor(1234567890 / 30))).toBe("005924");
    expect(totpAt(RFC_SECRET, Math.floor(2000000000 / 30))).toBe("279037");
  });

  it("round-trips base32 and accepts ±1 step, rejecting replays and junk", () => {
    expect(base32Decode(base32Encode(Buffer.from("hello world"))).toString()).toBe("hello world");
    const now = 1_800_000_000_000;
    const step = currentStep(now);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step), null, now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 2), null, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step), step, now)).toBeNull(); // replay
    expect(verifyTotp(RFC_SECRET, "12a456", null, now)).toBeNull();
  });

  it("encrypts secrets at rest and detects tampering or a wrong key", () => {
    const blob = encryptSecret("SECRET", "k".repeat(40));
    expect(blob).not.toContain("SECRET");
    expect(decryptSecret(blob, "k".repeat(40))).toBe("SECRET");
    expect(() => decryptSecret(blob, "x".repeat(40))).toThrow();
    const parts = blob.split(".");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join("."), "k".repeat(40))).toThrow();
  });
});

describe("two-factor sign-in", () => {
  it("full lifecycle: enrol, challenge, codes, recovery, disable", async () => {
    const user = await createUser("mfa@example.com", "correct-horse-battery");

    // Without 2FA, a correct password yields a session directly.
    expect((await beginLogin(user.id)).kind).toBe("session");

    const { secret, uri } = await startTotpEnrollment(user.id);
    expect(uri).toContain(`secret=${secret}`);
    const [stored] = await db.select().from(users).where(eq(users.id, user.id));
    expect(stored.totpSecretEnc).not.toContain(secret);
    expect((await beginLogin(user.id)).kind).toBe("session"); // pending enrolment isn't active yet

    expect(await confirmTotpEnrollment(user.id, "000000")).toBeNull();
    const enrolStep = currentStep();
    const codes = (await confirmTotpEnrollment(user.id, totpAt(secret, enrolStep)))!;
    expect(codes).toHaveLength(8);

    // Now a password alone isn't enough.
    const ch = await beginLogin(user.id);
    expect(ch.kind).toBe("challenge");
    expect(await getUserForToken(ch.token)).toBeNull(); // a challenge token is not a session

    expect((await completeChallenge(ch.token, "123456")).ok).toBe(false);
    // Code from the enrolment step can't be replayed.
    expect((await completeChallenge(ch.token, totpAt(secret, enrolStep))).ok).toBe(false);
    const ok = await completeChallenge(ch.token, totpAt(secret, enrolStep + 1));
    expect(ok).toMatchObject({ ok: true, userId: user.id, usedRecovery: false });
    // Challenge is consumed.
    expect((await completeChallenge(ch.token, totpAt(secret, enrolStep + 1))).ok).toBe(false);

    // Recovery code works exactly once.
    const ch2 = await beginLogin(user.id);
    expect(await completeChallenge(ch2.token, codes[0].toUpperCase())).toMatchObject({ ok: true, usedRecovery: true });
    const ch3 = await beginLogin(user.id);
    expect((await completeChallenge(ch3.token, codes[0])).ok).toBe(false);

    // Regenerating invalidates old codes.
    const fresh = await regenerateRecoveryCodes(user.id);
    const ch4 = await beginLogin(user.id);
    expect((await completeChallenge(ch4.token, codes[1])).ok).toBe(false);
    expect((await completeChallenge(ch4.token, fresh[0])).ok).toBe(true);

    // Disabling requires the password and signs out other sessions.
    const keep = await createSession(user.id);
    const other = await createSession(user.id);
    expect(await disableTotp(user.id, "wrong-password-123", keep.token)).toBe(false);
    expect(await disableTotp(user.id, "correct-horse-battery", keep.token)).toBe(true);
    expect(await getUserForToken(keep.token)).not.toBeNull();
    expect(await getUserForToken(other.token)).toBeNull();
    expect((await beginLogin(user.id)).kind).toBe("session");
  });

  it("locks a challenge after five wrong codes and expires old challenges", async () => {
    const user = await createUser("lock@example.com", "correct-horse-battery");
    const { secret } = await startTotpEnrollment(user.id);
    await confirmTotpEnrollment(user.id, totpAt(secret, currentStep()));
    const ch = await beginLogin(user.id);
    for (let i = 0; i < 5; i++) await completeChallenge(ch.token, "000000");
    const r = await completeChallenge(ch.token, totpAt(secret, currentStep() + 1));
    expect(r).toMatchObject({ ok: false });
    expect((r as { reason: string }).reason).toMatch(/Too many/);

    const ch2 = await beginLogin(user.id);
    await db.update(loginChallenges).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await completeChallenge(ch2.token, totpAt(secret, currentStep() + 1))).ok).toBe(false);
  });

  it("changing the password requires the current one and signs out other devices", async () => {
    const user = await createUser("pw@example.com", "first-password-123");
    const keep = await createSession(user.id);
    const other = await createSession(user.id);
    expect((await changePassword(user.id, "nope-nope-nope", "second-password-123", keep.token)).ok).toBe(false);
    expect((await changePassword(user.id, "first-password-123", "short", keep.token)).ok).toBe(false);
    expect((await changePassword(user.id, "first-password-123", "second-password-123", keep.token)).ok).toBe(true);
    expect(await authenticate("pw@example.com", "second-password-123")).not.toBeNull();
    expect(await authenticate("pw@example.com", "first-password-123")).toBeNull();
    expect(await getUserForToken(other.token)).toBeNull();
    expect(await getUserForToken(keep.token)).not.toBeNull();
    expect((await db.select().from(sessions).where(eq(sessions.userId, user.id))).length).toBe(1);
  });
});
