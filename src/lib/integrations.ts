/**
 * Integration health. Distinguishes configured / unconfigured / failed so the
 * onboarding checklist never pretends something works when it doesn't.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, integrationStatus, issues, thoughts, users } from "@/db/schema";
import { aiConfigured } from "./ai/client";
import { getEmailProvider } from "./email";
import { env } from "./env";
import { getSettings, senderComplianceGaps } from "./settings";
import { transcriptionConfigured } from "./transcription";

export type Health = "ok" | "configured" | "unconfigured" | "failed" | "optional";
export type IntegrationRow = { key: string; label: string; status: Health; detail: string };

export async function integrationHealth(): Promise<IntegrationRow[]> {
  const stored = Object.fromEntries((await db.select().from(integrationStatus)).map((r) => [r.key, r]));
  const rows: IntegrationRow[] = [];

  let provider;
  try {
    provider = getEmailProvider();
  } catch (err) {
    rows.push({ key: "email", label: "Email delivery", status: "failed", detail: (err as Error).message });
  }
  if (provider) {
    const problem = provider.configurationProblem();
    rows.push({
      key: "email",
      label: "Email delivery",
      status: !provider.capabilities.realDelivery ? "unconfigured" : problem ? "failed" : stored.email?.status === "failed" ? "failed" : "configured",
      detail: !provider.capabilities.realDelivery
        ? "Simulated mode: sends are recorded but nothing is delivered. Set EMAIL_PROVIDER=resend and RESEND_API_KEY."
        : problem ?? (stored.email?.status === "failed" ? stored.email.message : `${provider.name}${env.allowBroadcasts() ? "" : " · broadcasts locked (ALLOW_BROADCASTS=false)"}`),
    });
    if (provider.capabilities.webhooks) {
      rows.push({
        key: "webhooks",
        label: "Delivery webhooks",
        status: process.env.RESEND_WEBHOOK_SECRET ? "configured" : "unconfigured",
        detail: process.env.RESEND_WEBHOOK_SECRET ? `Endpoint: ${env.appUrl()}/api/webhooks/resend` : "Set RESEND_WEBHOOK_SECRET to receive bounces, complaints and clicks.",
      });
    }
  }

  const ai = aiConfigured();
  rows.push({
    key: "ai",
    label: "AI editorial partner",
    status: ai ? (stored.ai?.status === "failed" ? "failed" : stored.ai?.status === "ok" ? "ok" : "configured") : "optional",
    detail: ai ? (stored.ai?.message || `Model: ${env.aiModel()}`) : "Optional. Set ANTHROPIC_API_KEY to enable analysis, interviews and drafting.",
  });
  const tx = transcriptionConfigured();
  rows.push({
    key: "transcription",
    label: "Voice transcription",
    status: tx.ok ? "configured" : tx.provider ? "failed" : "optional",
    detail: tx.ok ? `Provider: ${tx.provider}` : tx.problem ?? "",
  });
  rows.push({
    key: "cron",
    label: "Scheduled sending (cron)",
    status: !env.cronSecret() ? "unconfigured" : stored.cron ? (stored.cron.status === "ok" ? "ok" : "failed") : "configured",
    detail: !env.cronSecret()
      ? "Set CRON_SECRET; Vercel Cron calls /api/cron/dispatch. Without it, only 'send now' works."
      : stored.cron
        ? `Last run ${stored.cron.checkedAt.toLocaleString("en-CA")}: ${stored.cron.message}`
        : "Configured, not yet run.",
  });
  return rows;
}

export async function recordIntegration(key: string, status: "ok" | "failed", message: string) {
  await db
    .insert(integrationStatus)
    .values({ key, status, message })
    .onConflictDoUpdate({ target: integrationStatus.key, set: { status, message, checkedAt: new Date() } });
}

export type OnboardingStep = { key: string; label: string; done: boolean; href: string; status?: Health };

export async function onboardingSteps(): Promise<OnboardingStep[]> {
  const s = await getSettings();
  const health = await integrationHealth();
  const h = (k: string) => health.find((r) => r.key === k)?.status;
  const [anyThought] = await db.select({ id: thoughts.id }).from(thoughts).limit(1);
  const [anyIssue] = await db.select({ id: issues.id }).from(issues).orderBy(desc(issues.updatedAt)).limit(1);
  const [anyTest] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.kind, "test")).limit(1);
  const [published] = await db.select({ id: issues.id }).from(issues).where(eq(issues.status, "published")).limit(1);
  const [owner] = await db.select({ name: users.name }).from(users).limit(1);
  return [
    { key: "publication", label: "Name & tagline", done: !!(s.name && s.tagline && s.onboarding.publication), href: "/studio/settings#publication" },
    { key: "profile", label: "Profile & sender information (incl. mailing address)", done: senderComplianceGaps(s).length === 0 && !!owner, href: "/studio/settings#sender" },
    { key: "email", label: "Email delivery", done: h("email") === "configured", status: h("email"), href: "/studio/settings#integrations" },
    { key: "ai", label: "AI provider (optional)", done: h("ai") === "configured" || h("ai") === "ok", status: h("ai"), href: "/studio/settings#integrations" },
    { key: "thought", label: "Capture your first thought", done: !!anyThought, href: "/studio/inbox#capture" },
    { key: "issue", label: "Develop your first issue", done: !!anyIssue, href: "/studio/ideas" },
    { key: "preview", label: "Preview the issue", done: !!anyIssue && !!s.onboarding.previewed, href: anyIssue ? `/studio/issues/${anyIssue.id}` : "/studio/issues" },
    { key: "test", label: "Send a test email", done: !!anyTest, href: anyIssue ? `/studio/issues/${anyIssue.id}` : "/studio/issues" },
    { key: "signup", label: "Review signup & privacy policy", done: s.privacyReviewed, href: "/studio/settings#signup" },
    { key: "publish", label: "Publish after explicit approval", done: !!published, href: anyIssue ? `/studio/issues/${anyIssue.id}` : "/studio/issues" },
  ];
}
