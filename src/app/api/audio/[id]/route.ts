import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { audioAssets } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { presignDownload } from "@/lib/storage";

/** Private: voice notes are only ever served to the signed-in owner. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const [a] = await db.select().from(audioAssets).where(eq(audioAssets.id, id));
  if (!a) return new NextResponse("Not found", { status: 404 });
  if (a.storageKey) {
    // Short-lived signed link straight to the bucket; the bucket itself stays private.
    return NextResponse.redirect(await presignDownload(a.storageKey, 300), { headers: { "Cache-Control": "private, no-store" } });
  }
  return new NextResponse(new Uint8Array(a.data!), {
    headers: { "Content-Type": a.mimeType, "Content-Length": String(a.sizeBytes), "Cache-Control": "private, max-age=3600" },
  });
}
