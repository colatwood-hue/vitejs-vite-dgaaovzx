import { eq } from "drizzle-orm";
import { db } from "@/db";
import { issues } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { renderIssueEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { getSettings, markOnboarding } from "@/lib/settings";

/** Email HTML preview for the editor iframe. Owner only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const [issue] = await db.select().from(issues).where(eq(issues.id, id));
  if (!issue) return new Response("Not found", { status: 404 });
  const settings = await getSettings();
  if (!settings.onboarding.previewed) await markOnboarding("previewed");
  const { html } = renderIssueEmail(issue, settings, { unsubscribeUrl: "#unsubscribe", preferencesUrl: "#preferences" }, { appUrl: env.appUrl() });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
