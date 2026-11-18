/**
 * Resend adapter (https://resend.com/docs/api-reference).
 *  - POST /emails, one request per recipient, with the Idempotency-Key header
 *  - Webhooks are signed with Svix: svix-id / svix-timestamp / svix-signature
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { EmailSendError, type EmailMessage, type EmailProvider, type NormalizedWebhookEvent } from "./provider";

const API = "https://api.resend.com";

export class ResendProvider implements EmailProvider {
  readonly name = "resend";
  readonly capabilities = { realDelivery: true, webhooks: true, clickTracking: true, openTracking: true };

  constructor(
    private readonly apiKey = process.env.RESEND_API_KEY ?? "",
    private readonly webhookSecret = process.env.RESEND_WEBHOOK_SECRET ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  configurationProblem(): string | null {
    if (!this.apiKey) return "RESEND_API_KEY is not set.";
    if (!this.apiKey.startsWith("re_")) return "RESEND_API_KEY does not look like a Resend key (expected re_…).";
    return null;
  }

  async send(message: EmailMessage, idempotencyKey: string) {
    const problem = this.configurationProblem();
    if (problem) throw new EmailSendError(problem, false);
    let res: Response;
    try {
      res = await this.fetchImpl(`${API}/emails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.slice(0, 256),
        },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          reply_to: message.replyTo || undefined,
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: message.headers,
          tags: message.tags
            ? Object.entries(message.tags).map(([name, value]) => ({
                name,
                value: value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256),
              }))
            : undefined,
        }),
      });
    } catch (err) {
      throw new EmailSendError(`Network error contacting Resend: ${(err as Error).message}`, true);
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok || !body.id) {
      const retryable = res.status === 429 || res.status >= 500;
      throw new EmailSendError(`Resend ${res.status}: ${body.message ?? body.name ?? "unknown error"}`, retryable, res.status);
    }
    return { providerMessageId: body.id, simulated: false };
  }

  parseWebhook(rawBody: string, headers: Headers): NormalizedWebhookEvent[] {
    verifySvixSignature(rawBody, headers, this.webhookSecret);
    const evt = JSON.parse(rawBody) as {
      type: string;
      created_at?: string;
      data?: { email_id?: string; to?: string[] | string; created_at?: string; click?: { link?: string } };
    };
    const map: Record<string, NormalizedWebhookEvent["type"]> = {
      "email.sent": "sent",
      "email.delivered": "delivered",
      "email.delivery_delayed": "delayed",
      "email.bounced": "bounced",
      "email.complained": "complained",
      "email.opened": "opened",
      "email.clicked": "clicked",
    };
    const to = evt.data?.to;
    return [
      {
        providerEventId: headers.get("svix-id") ?? `${evt.type}:${evt.data?.email_id}:${evt.created_at}`,
        type: map[evt.type] ?? "other",
        providerMessageId: evt.data?.email_id ?? null,
        recipient: (Array.isArray(to) ? to[0] : to)?.toLowerCase() ?? null,
        url: evt.data?.click?.link ?? null,
        occurredAt: new Date(evt.created_at ?? evt.data?.created_at ?? Date.now()),
        raw: evt,
      },
    ];
  }
}

/** Svix signature scheme, as used by Resend webhooks. Throws on failure. */
export function verifySvixSignature(rawBody: string, headers: Headers, secret: string, nowMs = Date.now()) {
  if (!secret) throw new Error("Webhook secret not configured");
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) throw new Error("Missing signature headers");
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(nowMs / 1000 - tsNum) > 300) throw new Error("Webhook timestamp outside tolerance");
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest();
  const ok = sigHeader.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new Error("Invalid webhook signature");
}
