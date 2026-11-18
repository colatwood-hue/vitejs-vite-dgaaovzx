/**
 * Thin server-side wrapper around the Anthropic SDK.
 * - Structured outputs via Zod (beta parse helper)
 * - Server-side refusal fallback enabled ("default" routing)
 * - Stable system prompt cached; volatile material goes in the user turn
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env } from "@/lib/env";
import { EDITORIAL_SYSTEM, voiceBlock } from "./prompts";

export class AIUnavailableError extends Error {
  constructor(message = "AI is not configured. Add ANTHROPIC_API_KEY to the environment to use the editorial partner.") {
    super(message);
    this.name = "AIUnavailableError";
  }
}

export function aiConfigured(): boolean {
  return env.anthropicKey().length > 0;
}

let client: Anthropic | null = null;
function getClient() {
  if (!aiConfigured()) throw new AIUnavailableError();
  client ??= new Anthropic({ apiKey: env.anthropicKey(), maxRetries: 2, timeout: 5 * 60_000 });
  return client;
}

type Effort = "low" | "medium" | "high";

export async function structured<S extends z.ZodType>(opts: {
  schema: S;
  instruction: string;
  material: string;
  voiceGuidelines?: string;
  effort?: Effort;
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; model: string }> {
  const res = await getClient()
    .beta.messages.parse({
      model: env.aiModel(),
      max_tokens: opts.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
      system: [
        { type: "text", text: EDITORIAL_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: voiceBlock(opts.voiceGuidelines ?? "") },
      ],
      messages: [{ role: "user", content: `${opts.material}\n\n---\n\nTask:\n${opts.instruction}` }],
    })
    .catch(mapError);

  if (res.stop_reason === "refusal") {
    throw new Error("The AI declined this request. Try rephrasing the material, or continue manually.");
  }
  if (res.stop_reason === "max_tokens") throw new Error("The AI response was cut off. Try again with less material.");
  if (!res.parsed_output) throw new Error("The AI returned an unexpected format. Please try again.");
  return { data: res.parsed_output as z.infer<S>, model: res.model };
}

export async function plainText(opts: { instruction: string; material: string; voiceGuidelines?: string; effort?: Effort }) {
  const res = await getClient()
    .beta.messages.create({
      model: env.aiModel(),
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort ?? "medium" },
      system: [
        { type: "text", text: EDITORIAL_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: voiceBlock(opts.voiceGuidelines ?? "") },
      ],
      messages: [{ role: "user", content: `${opts.material}\n\n---\n\nTask:\n${opts.instruction}` }],
    })
    .catch(mapError);
  if (res.stop_reason === "refusal") throw new Error("The AI declined this request.");
  const text = res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { text, model: res.model };
}

function mapError(err: unknown): never {
  if (err instanceof Anthropic.AuthenticationError) throw new Error("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
  if (err instanceof Anthropic.RateLimitError) throw new Error("The AI provider is rate limiting requests. Wait a minute and try again.");
  if (err instanceof Anthropic.BadRequestError) throw new Error(`The AI request was rejected: ${err.message}`);
  if (err instanceof Anthropic.APIConnectionError) throw new Error("Couldn't reach the AI provider. Check your connection.");
  if (err instanceof Anthropic.APIError) throw new Error(`AI provider error (${err.status}). Please try again.`);
  throw err;
}
