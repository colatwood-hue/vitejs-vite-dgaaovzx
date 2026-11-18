import { NextResponse } from "next/server";
import { dispatchDueCampaigns } from "@/lib/campaigns";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { db } from "@/db";
import { integrationStatus } from "@/db/schema";

export const maxDuration = 60;

/** Called by Vercel Cron (or any scheduler) with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = env.cronSecret();
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !safeEqual(given, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const results = await dispatchDueCampaigns();
    await db
      .insert(integrationStatus)
      .values({ key: "cron", status: "ok", message: `Processed ${results.length} campaign(s)` })
      .onConflictDoUpdate({ target: integrationStatus.key, set: { status: "ok", message: `Processed ${results.length} campaign(s)`, checkedAt: new Date() } });
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const message = (err as Error).message;
    await db
      .insert(integrationStatus)
      .values({ key: "cron", status: "failed", message })
      .onConflictDoUpdate({ target: integrationStatus.key, set: { status: "failed", message, checkedAt: new Date() } });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const POST = GET;
