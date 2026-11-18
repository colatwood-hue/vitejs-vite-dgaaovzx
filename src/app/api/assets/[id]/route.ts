import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { issueAssets } from "@/db/schema";

/**
 * Issue images. Served publicly so they render in emails and on the site.
 * IDs are random UUIDs; images attached to unpublished drafts are only
 * discoverable by someone who already has the draft.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const [a] = await db.select().from(issueAssets).where(eq(issueAssets.id, id));
  if (!a) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(a.data), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Length": String(a.sizeBytes),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
