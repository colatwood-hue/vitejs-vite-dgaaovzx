import { NextResponse } from "next/server";
import { recordWebhookEvents } from "@/lib/webhooks";
import { ResendProvider } from "@/lib/email/resend";

export async function POST(req: Request) {
  const raw = await req.text();
  let events;
  try {
    events = new ResendProvider().parseWebhook(raw, req.headers);
  } catch (err) {
    console.warn("[webhook:resend] rejected:", (err as Error).message);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  await recordWebhookEvents(events);
  return NextResponse.json({ ok: true });
}
