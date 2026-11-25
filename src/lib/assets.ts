/**
 * Creates audio/image asset rows from either a server-received File (db mode,
 * or s3 fallback) or a completed direct upload (s3 mode).
 */
import { db } from "@/db";
import { audioAssets, issueAssets } from "@/db/schema";
import { putObject, statUpload, storageProvider, validateUpload, type UploadKind } from "./storage";

type Source = { file: File } | { key: string };

async function materialize(kind: UploadKind, src: Source) {
  if ("key" in src) {
    if (storageProvider() !== "s3") throw new Error("Direct uploads require object storage.");
    const { size, mime } = await statUpload(kind, src.key);
    return { size, mime, data: null, storageKey: src.key, filename: null };
  }
  const mime = (src.file.type || (kind === "audio" ? "audio/webm" : "")).split(";")[0];
  const problem = validateUpload(kind, mime, src.file.size);
  if (problem) throw new Error(problem);
  const bytes = Buffer.from(await src.file.arrayBuffer());
  if (storageProvider() === "s3") {
    return { size: src.file.size, mime, data: null, storageKey: await putObject(kind, bytes, mime), filename: src.file.name || null };
  }
  return { size: src.file.size, mime, data: bytes, storageKey: null, filename: src.file.name || null };
}

export async function createAudioAsset(src: Source, durationSeconds?: number | null) {
  const m = await materialize("audio", src);
  const [row] = await db
    .insert(audioAssets)
    .values({
      mimeType: m.mime,
      sizeBytes: m.size,
      data: m.data,
      storageKey: m.storageKey,
      originalFilename: m.filename?.slice(0, 200) ?? null,
      durationSeconds: durationSeconds ? Math.round(durationSeconds) : null,
    })
    .returning({ id: audioAssets.id });
  return row.id;
}

export async function createImageAsset(issueId: string, src: Source, altText: string) {
  const m = await materialize("image", src);
  const [row] = await db
    .insert(issueAssets)
    .values({ issueId, mimeType: m.mime, sizeBytes: m.size, data: m.data, storageKey: m.storageKey, altText: altText.slice(0, 200) })
    .returning({ id: issueAssets.id });
  return row.id;
}

/** Audio arrives either as a File (database storage) or as the key of a completed direct upload (object storage). */
export async function audioAssetFromForm(form: FormData): Promise<string | null> {
  const key = String(form.get("audioKey") ?? "");
  const file = form.get("audio");
  const duration = Number(form.get("durationSeconds") ?? "") || null;
  if (key) return createAudioAsset({ key }, duration);
  if (file instanceof File && file.size > 0) return createAudioAsset({ file }, duration);
  return null;
}
