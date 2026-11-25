/**
 * Object storage against a local S3-compatible server (s3rver): presigned
 * PUT round-trips, HEAD verification and reads. Note: s3rver does NOT verify
 * SigV4 signatures, so signing correctness relies on the official AWS SDK
 * presigner and the manual real-bucket check in docs/STATUS.md.
 * Also covers background-capable transcription reading from either store.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
// @ts-expect-error: s3rver ships no types
import S3rver from "s3rver";

const { db } = await import("@/db");
const { audioAssets, issueAssets, issues, thoughts } = await import("@/db/schema");
const storage = await import("@/lib/storage");
const { createAudioAsset, createImageAsset, audioAssetFromForm } = await import("@/lib/assets");
const { transcribeThought } = await import("@/lib/transcription");

const PORT = 4569;
const dir = mkdtempSync(path.join(tmpdir(), "s3rver-"));
let server: { run: () => Promise<unknown>; close: () => Promise<void> };

function useS3() {
  Object.assign(process.env, {
    STORAGE_PROVIDER: "s3",
    S3_BUCKET: "dash-test",
    S3_REGION: "us-east-1",
    S3_ENDPOINT: `http://localhost:${PORT}`,
    S3_ACCESS_KEY_ID: "S3RVER",
    S3_SECRET_ACCESS_KEY: "S3RVER",
    S3_FORCE_PATH_STYLE: "true",
  });
  storage.resetStorageClientForTests();
}
function useDb() {
  process.env.STORAGE_PROVIDER = "db";
  storage.resetStorageClientForTests();
}

beforeAll(async () => {
  server = new S3rver({ port: PORT, address: "localhost", silent: true, directory: dir, configureBuckets: [{ name: "dash-test" }] });
  await server.run();
});
afterAll(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
  useDb();
});

describe("upload validation", () => {
  it("accepts audio and images within limits and rejects everything else", () => {
    expect(storage.validateUpload("audio", "audio/webm;codecs=opus", 1000)).toBeNull();
    expect(storage.validateUpload("audio", "audio/mp4", 1000)).toBeNull();
    expect(storage.validateUpload("audio", "text/html", 1000)).toMatch(/audio/);
    expect(storage.validateUpload("audio", "audio/webm", 0)).toMatch(/empty/);
    expect(storage.validateUpload("audio", "audio/webm", 101 * 1024 * 1024)).toMatch(/larger/);
    expect(storage.validateUpload("image", "image/svg+xml", 10)).toMatch(/JPEG/);
  });

  it("only accepts keys it could have generated", () => {
    const key = storage.newKey("audio", "audio/webm");
    expect(storage.isValidKey("audio", key)).toBe(true);
    expect(storage.isValidKey("image", key)).toBe(false);
    expect(storage.isValidKey("audio", "audio/../../secrets.txt")).toBe(false);
  });
});

describe("database storage (default)", () => {
  it("stores bytes in Postgres", async () => {
    useDb();
    const id = await createAudioAsset({ file: new File([Buffer.from("db-audio")], "a.webm", { type: "audio/webm" }) });
    const [row] = await db.select().from(audioAssets).where(eq(audioAssets.id, id));
    expect(row.storageKey).toBeNull();
    expect((await storage.readAssetBytes(row)).toString()).toBe("db-audio");
  });

  it("rejects direct-upload keys when object storage is off", async () => {
    useDb();
    const fd = new FormData();
    fd.set("audioKey", storage.newKey("audio", "audio/webm"));
    await expect(audioAssetFromForm(fd)).rejects.toThrow(/object storage/);
  });
});

describe("S3-compatible storage", () => {
  it("browser-style direct upload: presigned PUT, then HEAD-verified registration", async () => {
    useS3();
    const body = Buffer.from("pretend-opus-audio-bytes");
    const ticket = await storage.presignUpload("audio", "audio/webm", body.length);
    const put = await fetch(ticket.url, { method: "PUT", body, headers: ticket.headers });
    expect(put.status).toBe(200);

    const fd = new FormData();
    fd.set("audioKey", ticket.key);
    fd.set("durationSeconds", "181");
    const id = (await audioAssetFromForm(fd))!;
    const [row] = await db.select().from(audioAssets).where(eq(audioAssets.id, id));
    expect(row.data).toBeNull();
    expect(row.storageKey).toBe(ticket.key);
    expect(row.sizeBytes).toBe(body.length); // from HEAD, not the client
    expect(row.durationSeconds).toBe(181);
    expect((await storage.readAssetBytes(row)).equals(body)).toBe(true);

    const signed = await storage.presignDownload(ticket.key, 60);
    expect(await (await fetch(signed)).text()).toBe(body.toString());
  });

  it("refuses to register a key that was never uploaded", async () => {
    useS3();
    await expect(createAudioAsset({ key: storage.newKey("audio", "audio/webm") })).rejects.toThrow();
  });

  it("server-side uploads (fallback) also land in the bucket", async () => {
    useS3();
    const [issue] = await db.insert(issues).values({ title: "Img", slug: `img-${Date.now()}` }).returning();
    const id = await createImageAsset(issue.id, { file: new File([Buffer.from("png-bytes")], "a.png", { type: "image/png" }) }, "a photo");
    const [row] = await db.select().from(issueAssets).where(eq(issueAssets.id, id));
    expect(row.storageKey).toMatch(/^image\//);
    expect((await storage.readAssetBytes(row)).toString()).toBe("png-bytes");
  });

  it("transcribes audio stored in the bucket and keeps the original untouched", async () => {
    useS3();
    process.env.TRANSCRIPTION_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    const id = await createAudioAsset({ file: new File([Buffer.from("voice")], "v.webm", { type: "audio/webm" }) });
    const [t] = await db.insert(thoughts).values({ sourceType: "voice", originalContent: "", audioAssetId: id, transcriptionStatus: "pending" }).returning();

    const realFetch = globalThis.fetch;
    const spy = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith("https://api.openai.com/")) {
        const file = (init!.body as FormData).get("file") as File;
        expect(Buffer.from(await file.arrayBuffer()).toString()).toBe("voice");
        return new Response(JSON.stringify({ text: "Someday is a dangerous place." }), { status: 200 });
      }
      return realFetch(url, init);
    });
    globalThis.fetch = spy as typeof fetch;
    try {
      const r = await transcribeThought(t.id);
      expect(r).toEqual({ ok: true, text: "Someday is a dangerous place." });
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.TRANSCRIPTION_PROVIDER;
      delete process.env.OPENAI_API_KEY;
    }
    const [after] = await db.select().from(thoughts).where(eq(thoughts.id, t.id));
    expect(after.transcriptionStatus).toBe("completed");
    expect(after.transcription).toBe("Someday is a dangerous place.");
    expect(after.audioAssetId).toBe(id);
  });

  it("records a failed transcription instead of throwing", async () => {
    useDb();
    process.env.TRANSCRIPTION_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    const id = await createAudioAsset({ file: new File([Buffer.from("voice")], "v.webm", { type: "audio/webm" }) });
    const [t] = await db.insert(thoughts).values({ sourceType: "voice", audioAssetId: id, transcriptionStatus: "pending" }).returning();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 })) as typeof fetch;
    try {
      const r = await transcribeThought(t.id);
      expect(r.ok).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.TRANSCRIPTION_PROVIDER;
      delete process.env.OPENAI_API_KEY;
    }
    const [after] = await db.select().from(thoughts).where(eq(thoughts.id, t.id));
    expect(after.transcriptionStatus).toBe("failed");
    expect(after.transcriptionError).toContain("quota exceeded");
  });
});
