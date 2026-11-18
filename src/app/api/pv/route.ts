import { NextResponse } from "next/server";
import { db } from "@/db";
import { pageViews } from "@/db/schema";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { path?: string; kind?: string };
    const path = String(body.path ?? "").slice(0, 200);
    const kind = body.kind === "subscribe_view" ? "subscribe_view" : "view";
    if (!path.startsWith("/") || path.startsWith("/studio")) return new NextResponse(null, { status: 204 });
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    // IP is used only transiently for abuse limiting; it is never stored with the view.
    if (await rateLimit(`pv:${ip}`, 120, 3600)) await db.insert(pageViews).values({ path, kind });
  } catch {
    /* ignore malformed beacons */
  }
  return new NextResponse(null, { status: 204 });
}
