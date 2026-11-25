import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { SecurityPanel } from "@/components/studio/SecurityPanel";
import { integrationHealth } from "@/lib/integrations";
import { saveSettingsAction, testAiAction, testEmailProviderAction } from "@/actions/settings";
import { PRIVACY_TEMPLATE } from "@/lib/privacy-template";
import { aiConfigured } from "@/lib/ai/client";
import { env } from "@/lib/env";
import { ActionForm } from "@/components/studio/ActionForm";
import { Badge, PageHeader } from "@/components/studio/ui";

export const metadata = { title: "Settings" };

const TONE = { ok: "ok", configured: "ok", unconfigured: "warn", failed: "danger", optional: "neutral" } as const;

export default async function Settings({ searchParams }: { searchParams: Promise<{ recovery?: string }> }) {
  const { recovery } = await searchParams;
  const user = await requireUser();
  const [s, health, [sec]] = await Promise.all([
    getSettings(),
    integrationHealth(),
    db.select({ on: users.totpEnabledAt, codes: users.recoveryCodeHashes }).from(users).where(eq(users.id, user.id)),
  ]);
  const text = (name: keyof typeof s, label: string, opts: { type?: string; hint?: string; rows?: number; placeholder?: string } = {}) => (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
      </label>
      {opts.rows ? (
        <textarea id={name} name={name} defaultValue={String(s[name] ?? "")} rows={opts.rows} placeholder={opts.placeholder} className="input text-sm" />
      ) : (
        <input id={name} name={name} type={opts.type ?? "text"} defaultValue={String(s[name] ?? "")} placeholder={opts.placeholder} className="input" />
      )}
      {opts.hint && <p className="field-hint">{opts.hint}</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader eyebrow="Configuration" title="Settings" />

      <section id="integrations" className="card p-5" aria-labelledby="int-h">
        <h2 id="int-h" className="font-serif text-xl">
          Integrations
        </h2>
        <p className="mt-1 text-xs text-muted">Credentials live in environment variables, never in the database. See docs/SETUP.md.</p>
        <ul className="mt-4 divide-y divide-rule">
          {health.map((h) => (
            <li key={h.key} className="flex flex-wrap items-start justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{h.label}</p>
                <p className="break-words text-xs text-muted">{h.detail}</p>
              </div>
              <Badge tone={TONE[h.status]}>{h.status}</Badge>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-4">
          <ActionForm action={testEmailProviderAction} submitLabel="Send connection test email" pendingLabel="Sending…" buttonClassName="btn btn-ghost btn-sm" />
          {aiConfigured() && <ActionForm action={testAiAction} submitLabel="Test AI connection" pendingLabel="Testing…" buttonClassName="btn btn-ghost btn-sm" />}
        </div>
      </section>

      <section id="security" className="card p-5" aria-labelledby="sec-h">
        <h2 id="sec-h" className="font-serif text-xl">
          Security
        </h2>
        <SecurityPanel totpEnabled={!!sec?.on} recoveryLeft={sec?.codes.length ?? 0} recoveryJustUsed={recovery === "used"} />
      </section>

      <section id="publication" className="card p-5" aria-labelledby="pub-h">
        <h2 id="pub-h" className="font-serif text-xl">
          Publication & profile
        </h2>
        <ActionForm action={saveSettingsAction} hidden={{ section: "publication" }} submitLabel="Save" className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {text("name", "Publication name")}
            {text("parentBrand", "Parent brand")}
          </div>
          {text("tagline", "Tagline")}
          {text("description", "Homepage description", { rows: 2 })}
          {text("authorName", "Author name")}
          {text("authorBioShort", "Short bio (homepage)", { rows: 3 })}
          {text("aboutMd", "About page (Markdown)", { rows: 10, hint: "Leave empty to use the default introduction." })}
        </ActionForm>
      </section>

      <section id="sender" className="card p-5" aria-labelledby="send-h">
        <h2 id="send-h" className="font-serif text-xl">
          Sender identification
        </h2>
        <p className="mt-1 text-xs text-muted">CASL requires every commercial email to identify the sender, include a mailing address and contact method, and offer a working unsubscribe. Broadcasts are blocked until these are complete.</p>
        <ActionForm action={saveSettingsAction} hidden={{ section: "sender" }} submitLabel="Save" className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {text("senderName", "From name", { placeholder: "Col from The Dash" })}
            {text("senderEmail", "From address", { type: "email", hint: "Must be on a domain verified with your email provider." })}
            {text("replyToEmail", "Reply-to address", { type: "email", hint: "Where reader replies go." })}
            {text("contactEmail", "Public contact email", { type: "email" })}
          </div>
          {text("mailingAddress", "Mailing address", { rows: 3, hint: "A valid physical address (a PO box or virtual mailbox is commonly used). Shown in every email footer." })}
        </ActionForm>
      </section>

      <section id="signup" className="card p-5" aria-labelledby="sign-h">
        <h2 id="sign-h" className="font-serif text-xl">
          Signup & privacy
        </h2>
        <ActionForm action={saveSettingsAction} hidden={{ section: "signup" }} submitLabel="Save" className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="signupEnabled" defaultChecked={s.signupEnabled} className="accent-[#7a5c34]" /> Accept new signups
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="doubleOptIn" defaultChecked={s.doubleOptIn} className="accent-[#7a5c34]" /> Require double opt-in (recommended: strongest consent evidence)
          </label>
          <div>
            <label htmlFor="privacyPolicyMd" className="field-label">
              Privacy policy (Markdown)
            </label>
            <textarea id="privacyPolicyMd" name="privacyPolicyMd" defaultValue={s.privacyPolicyMd || PRIVACY_TEMPLATE} rows={14} className="input font-mono text-xs" />
            <p className="field-hint">
              Starts from a template. It is not legal advice; review it before relying on it. Placeholders like {"{{author}}"} are filled in automatically.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="privacyReviewed" defaultChecked={s.privacyReviewed} className="mt-1 accent-[#7a5c34]" /> I&rsquo;ve reviewed this policy and it accurately describes how I handle subscriber data.
          </label>
        </ActionForm>
      </section>

      <section id="rhythm" className="card p-5" aria-labelledby="rhythm-h">
        <h2 id="rhythm-h" className="font-serif text-xl">
          Writing rhythm
        </h2>
        <p className="mt-1 text-xs text-muted">How often you&rsquo;d like to send a letter. Only used for gentle reminders on the dashboard. Nothing is ever sent automatically.</p>
        <ActionForm action={saveSettingsAction} hidden={{ section: "rhythm" }} submitLabel="Save" className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="cadenceDays" className="field-label">
              A letter every
            </label>
            <select id="cadenceDays" name="cadenceDays" defaultValue={String(s.cadenceDays)} className="input w-40">
              {[7, 10, 14, 21, 30].includes(s.cadenceDays) ? null : <option value={s.cadenceDays}>{s.cadenceDays} days</option>}
              <option value="7">week</option>
              <option value="10">10 days</option>
              <option value="14">two weeks</option>
              <option value="21">three weeks</option>
              <option value="30">month</option>
            </select>
          </div>
        </ActionForm>
      </section>

      <section id="voice" className="card p-5" aria-labelledby="voice-h">
        <h2 id="voice-h" className="font-serif text-xl">
          Voice guidelines
        </h2>
        <p className="mt-1 text-xs text-muted">Given to the AI on every request. Describe how you sound, words you&rsquo;d never use, and what you care about.</p>
        <ActionForm action={saveSettingsAction} hidden={{ section: "voice" }} submitLabel="Save" className="mt-4 space-y-3">
          {text("voiceGuidelines", "Guidelines", {
            rows: 10,
            placeholder:
              "- I write like I talk to a friend over coffee.\n- Short paragraphs. No bullet-point listicles.\n- Never: 'hustle', 'grind', 'level up', 'game-changer'.\n- I'm allowed to not know.\n- Faith comes up naturally, never preachy.",
          })}
        </ActionForm>
      </section>

      <p className="text-xs text-muted">
        App URL: {env.appUrl()} · Email provider: {env.emailProvider()} · Broadcasts {env.allowBroadcasts() ? "enabled" : "locked"}
      </p>
    </div>
  );
}
