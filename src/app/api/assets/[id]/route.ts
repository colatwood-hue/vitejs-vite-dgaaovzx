import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { issueAssets } from "@/db/schema";
import { readAssetBytes } from "@/lib/storage";

/**
 * Issue images. Served publicly (and permanently cacheable) so they render in
 * emails and on the site. IDs are random UUIDs. With object storage the bytes
 * are proxied once and then cached by the CDN, so email links never expire.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const [a] = await db.select().from(issueAssets).where(eq(issueAssets.id, id));
  if (!a) return new NextResponse("Not found", { status: 404 });
  const bytes = await readAssetBytes(a);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
