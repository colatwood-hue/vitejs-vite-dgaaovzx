"use server";

import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { presignUpload, storageProvider, validateUpload, type UploadKind } from "@/lib/storage";

export type UploadTicket = { mode: "server" } | { mode: "direct"; key: string; url: string; headers: Record<string, string> } | { mode: "error"; message: string };

/**
 * Asks where to send a file. With object storage the browser gets a 10-minute
 * presigned PUT URL and uploads directly; otherwise it posts the file with the form.
 */
export async function requestUploadAction(kind: UploadKind, mime: string, size: number): Promise<UploadTicket> {
  const user = await requireUser();
  if (kind !== "audio" && kind !== "image") return { mode: "error", message: "Unknown upload type." };
  const problem = validateUpload(kind, mime || (kind === "audio" ? "audio/webm" : ""), size);
  if (problem) return { mode: "error", message: problem };
  if (storageProvider() !== "s3") return { mode: "server" };
  if (!(await rateLimit(`upload:${user.id}`, 60, 3600))) return { mode: "error", message: "Too many uploads this hour." };
  try {
    return { mode: "direct", ...(await presignUpload(kind, mime, size)) };
  } catch (err) {
    return { mode: "error", message: (err as Error).message };
  }
}
