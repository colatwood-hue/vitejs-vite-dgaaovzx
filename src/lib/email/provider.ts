/**
 * Email provider abstraction. The rest of the app only talks to this
 * interface, so the provider can be swapped (Resend today; Postmark, SES or
 * Kit later) without touching subscriber or campaign logic.
 *
 * Subscribers, consent and suppression live in OUR database. Providers are
 * used purely as delivery pipes, which keeps CASL consent evidence portable.
 */

export type EmailMessage = {
  to: string;
  from: string; // "Name <address>"
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
};

export type SendResult = { providerMessageId: string; simulated: boolean };

export class EmailSendError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

export type NormalizedWebhookEvent = {
  providerEventId: string;
  type: "sent" | "delivered" | "delayed" | "bounced" | "complained" | "opened" | "clicked" | "other";
  providerMessageId: string | null;
  recipient: string | null;
  url?: string | null;
  occurredAt: Date;
  raw: unknown;
};

export type ProviderCapabilities = {
  realDelivery: boolean;
  webhooks: boolean;
  clickTracking: boolean;
  openTracking: boolean;
};

export interface EmailProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  /** Returns a human-readable problem, or null when configured. */
  configurationProblem(): string | null;
  /** idempotencyKey must be stable per (campaign, recipient). */
  send(message: EmailMessage, idempotencyKey: string): Promise<SendResult>;
  /** Verify signature and normalise; throws on invalid signature. */
  parseWebhook?(rawBody: string, headers: Headers): NormalizedWebhookEvent[];
}
