/**
 * Development provider. NEVER delivers email. Every "send" is recorded with
 * status `simulated` so the UI can't mistake it for a real delivery.
 */
import { randomUUID } from "node:crypto";
import type { EmailMessage, EmailProvider } from "./provider";

export type SimulatedOutboxEntry = { at: Date; idempotencyKey: string; message: EmailMessage; id: string };

const globalOutbox = globalThis as unknown as { __dashOutbox?: SimulatedOutboxEntry[] };

export function simulatedOutbox(): SimulatedOutboxEntry[] {
  globalOutbox.__dashOutbox ??= [];
  return globalOutbox.__dashOutbox;
}

export class SimulatedProvider implements EmailProvider {
  readonly name = "console";
  readonly capabilities = { realDelivery: false, webhooks: false, clickTracking: false, openTracking: false };

  configurationProblem() {
    return null;
  }

  async send(message: EmailMessage, idempotencyKey: string) {
    const outbox = simulatedOutbox();
    const existing = outbox.find((e) => e.idempotencyKey === idempotencyKey);
    if (existing) return { providerMessageId: existing.id, simulated: true };
    const id = `sim_${randomUUID()}`;
    outbox.push({ at: new Date(), idempotencyKey, message, id });
    if (outbox.length > 200) outbox.shift();
    if (process.env.NODE_ENV !== "test") {
      console.info(`[email:simulated] to=${message.to} subject=${JSON.stringify(message.subject)} id=${id}`);
    }
    return { providerMessageId: id, simulated: true };
  }
}
