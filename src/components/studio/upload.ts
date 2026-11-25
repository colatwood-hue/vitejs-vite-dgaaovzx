"use client";

import { requestUploadAction } from "@/actions/uploads";

/**
 * Puts a file into the FormData the right way for the configured storage:
 * - database storage: attach the file to the form (it travels with the request)
 * - object storage: upload straight to the bucket, attach only the key
 * Throws with a readable message on failure.
 */
export async function attachUpload(fd: FormData, kind: "audio" | "image", file: File, fileField: string, keyField: string, onProgress?: (msg: string) => void) {
  const ticket = await requestUploadAction(kind, file.type, file.size);
  if (ticket.mode === "error") throw new Error(ticket.message);
  if (ticket.mode === "server") {
    fd.set(fileField, file);
    fd.delete(keyField);
    return;
  }
  onProgress?.("Uploading…");
  const res = await fetch(ticket.url, { method: "PUT", body: file, headers: ticket.headers });
  if (!res.ok) throw new Error(`Upload to storage failed (${res.status}). Check the bucket's CORS settings.`);
  fd.delete(fileField);
  fd.set(keyField, ticket.key);
}
