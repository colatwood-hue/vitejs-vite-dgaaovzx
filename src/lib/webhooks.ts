import { eq } from "drizzle-orm";
import { db } from "@/db";
import { engagementEvents, sendEvents } from "@/db/schema";
import type { NormalizedWebhookEvent } from "./email";
import { handleBounceOrComplaint } from "./subscribers";

/** Idempotent: each provider event id is stored once (unique index). */
export async function recordWebhookEvents(events: NormalizedWebhookEvent[]) {
  for (const e of events) {
    const [send] = e.providerMessageId
      ? await db.select().from(sendEvents).where(eq(sendEvents.providerMessageId, e.providerMessageId)).limit(1)
      : [];
    const inserted = await db
      .insert(engagementEvents)
      .values({
        providerEventId: e.providerEventId,
        sendEventId: send?.id ?? null,
        campaignId: send?.campaignId ?? null,
        type: e.type,
        url: e.url ?? null,
        occurredAt: e.occurredAt,
        raw: e.raw as object,
      })
      .onConflictDoNothing()
      .returning({ id: engagementEvents.id });
    if (!inserted.length) continue; // duplicate delivery

    if (send && ["delivered", "bounced", "complained"].includes(e.type)) {
      await db.update(sendEvents).set({ status: e.type as "delivered" | "bounced" | "complained" }).where(eq(sendEvents.id, send.id));
    }
    const recipient = e.recipient ?? send?.email;
    if (recipient && (e.type === "bounced" || e.type === "complained")) {
      await handleBounceOrComplaint(recipient, e.type, `Provider event ${e.providerEventId}`);
    }
  }
}
