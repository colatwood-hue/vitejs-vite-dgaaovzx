/**
 * Audio transcription behind a small provider switch.
 *   TRANSCRIPTION_PROVIDER=openai   → POST https://api.openai.com/v1/audio/transcriptions (whisper-1 by default)
 *   TRANSCRIPTION_PROVIDER=deepgram → POST https://api.deepgram.com/v1/listen
 * Original audio is always preserved in audio_assets; the transcript is stored
 * separately on the thought and never replaces the original.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { audioAssets, thoughts } from "@/db/schema";
import { env } from "./env";
import { readAssetBytes } from "./storage";

export function transcriptionConfigured(): { ok: boolean; provider: string; problem?: string } {
  const p = env.transcriptionProvider();
  if (!p) return { ok: false, provider: "", problem: "No transcription provider configured." };
  if (p === "openai") return process.env.OPENAI_API_KEY ? { ok: true, provider: p } : { ok: false, provider: p, problem: "OPENAI_API_KEY is not set." };
  if (p === "deepgram") return process.env.DEEPGRAM_API_KEY ? { ok: true, provider: p } : { ok: false, provider: p, problem: "DEEPGRAM_API_KEY is not set." };
  return { ok: false, provider: p, problem: `Unknown TRANSCRIPTION_PROVIDER "${p}".` };
}

function extFor(mime: string) {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

async function transcribeBuffer(data: Buffer, mime: string): Promise<string> {
  const cfg = transcriptionConfigured();
  if (!cfg.ok) throw new Error(cfg.problem);
  if (cfg.provider === "openai") {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(data)], { type: mime }), `voice-note.${extFor(mime)}`);
    form.append("model", process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    const body = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
    if (!res.ok || typeof body.text !== "string") throw new Error(`Transcription failed (${res.status}): ${body.error?.message ?? "unknown error"}`);
    return body.text.trim();
  }
  const res = await fetch("https://api.deepgram.com/v1/listen?smart_format=true&punctuate=true&paragraphs=true", {
    method: "POST",
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": mime },
    body: new Uint8Array(data),
  });
  const body = (await res.json().catch(() => ({}))) as {
    results?: { channels?: { alternatives?: { transcript?: string; paragraphs?: { transcript?: string } }[] }[] };
    err_msg?: string;
  };
  const alt = body.results?.channels?.[0]?.alternatives?.[0];
  if (!res.ok || !alt) throw new Error(`Transcription failed (${res.status}): ${body.err_msg ?? "unknown error"}`);
  return (alt.paragraphs?.transcript ?? alt.transcript ?? "").trim();
}

/** Transcribe a thought's audio. Records failure state instead of throwing. */
export async function transcribeThought(thoughtId: string) {
  const [t] = await db.select().from(thoughts).where(eq(thoughts.id, thoughtId));
  if (!t?.audioAssetId) throw new Error("This thought has no audio.");
  const cfg = transcriptionConfigured();
  if (!cfg.ok) {
    await db.update(thoughts).set({ transcriptionStatus: "unconfigured", transcriptionError: cfg.problem }).where(eq(thoughts.id, t.id));
    return { ok: false as const, error: cfg.problem! };
  }
  const [audio] = await db.select().from(audioAssets).where(eq(audioAssets.id, t.audioAssetId));
  await db.update(thoughts).set({ transcriptionStatus: "pending", transcriptionError: null }).where(eq(thoughts.id, t.id));
  try {
    const text = await transcribeBuffer(await readAssetBytes(audio), audio.mimeType);
    await db.update(thoughts).set({ transcription: text, transcriptionStatus: "completed" }).where(eq(thoughts.id, t.id));
    return { ok: true as const, text };
  } catch (err) {
    const msg = (err as Error).message.slice(0, 500);
    await db.update(thoughts).set({ transcriptionStatus: "failed", transcriptionError: msg }).where(eq(thoughts.id, t.id));
    return { ok: false as const, error: msg };
  }
}
