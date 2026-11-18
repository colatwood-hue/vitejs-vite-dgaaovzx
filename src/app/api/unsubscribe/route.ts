import { NextResponse } from "next/server";
import { findByManageToken, unsubscribe } from "@/lib/subscribers";

/** RFC 8058 one-click unsubscribe (mail clients POST here). */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const sub = await findByManageToken(token);
  if (sub) await unsubscribe(sub.id, "one_click");
  // Always 200 so the endpoint can't be used to probe tokens.
  return new NextResponse("Unsubscribed.", { status: 200 });
}

/** A GET (e.g. a person clicking the header link) shows the confirmation page instead. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.redirect(new URL(`/unsubscribe?token=${encodeURIComponent(url.searchParams.get("token") ?? "")}`, url));
}
