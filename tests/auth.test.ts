import { describe, expect, it } from "vitest";
import { authenticate, createSession, createUser, destroySession, getUserForToken, hasAnyUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("studio authentication", () => {
  it("creates the owner, authenticates, and manages sessions", async () => {
    expect(await hasAnyUser()).toBe(false);
    await expect(createUser("col@example.com", "short")).rejects.toThrow(/12 characters/);
    const user = await createUser("Col@Example.com ", "a-long-enough-password");
    expect(user.email).toBe("col@example.com");
    expect(await hasAnyUser()).toBe(true);

    expect(await authenticate("col@example.com", "nope-nope-nope")).toBeNull();
    expect(await authenticate("nobody@example.com", "a-long-enough-password")).toBeNull();
    const ok = await authenticate("COL@example.com", "a-long-enough-password");
    expect(ok?.id).toBe(user.id);

    const { token } = await createSession(user.id);
    expect((await getUserForToken(token))?.id).toBe(user.id);
    expect(await getUserForToken("forged-token")).toBeNull();
    expect(await getUserForToken(undefined)).toBeNull();
    await destroySession(token);
    expect(await getUserForToken(token)).toBeNull();
  });
});

describe("rate limiting", () => {
  it("allows up to the limit within a window", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit("test:key", 3, 60));
    expect(results).toEqual([true, true, true, false]);
  });
});
