import { and, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { consentRecords, subscribers, suppressions } from "@/db/schema";
import {
  addSubscriberAction,
  adminUnsubscribeAction,
  importCsvAction,
  removeSuppressionAction,
  suppressAction,
  toggleTestRecipientAction,
  updateTagsAction,
} from "@/actions/subscribers";
import { eligibleRecipients } from "@/lib/subscribers";
import { ActionForm } from "@/components/studio/ActionForm";
import { Badge, PageHeader, Stat } from "@/components/studio/ui";

export const metadata = { title: "Subscribers" };

export default async function Subscribers({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; tag?: string; view?: string }> }) {
  const sp = await searchParams;
  const where: SQL[] = [];
  if (sp.status) where.push(eq(subscribers.status, sp.status as "active"));
  if (sp.q) where.push(ilike(subscribers.email, `%${sp.q.trim()}%`));
  if (sp.tag) where.push(sql`${sp.tag} = any(${subscribers.tags})`);
  const [rows, counts, eligible, supp, tags] = await Promise.all([
    db.select().from(subscribers).where(where.length ? and(...where) : undefined).orderBy(desc(subscribers.signupAt)).limit(500),
    db.select({ status: subscribers.status, n: sql<number>`count(*)::int` }).from(subscribers).groupBy(subscribers.status),
    eligibleRecipients(),
    db.select().from(suppressions).orderBy(desc(suppressions.createdAt)).limit(200),
    db.execute<{ tag: string }>(sql`select distinct unnest(tags) as tag from subscribers order by 1`),
  ]);
  const c = Object.fromEntries(counts.map((x) => [x.status, x.n]));
  const openId = sp.view;
  const history = openId ? await db.select().from(consentRecords).where(eq(consentRecords.subscriberId, openId)).orderBy(desc(consentRecords.createdAt)) : [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Audience" title="Subscribers" description="Consent is recorded for every address. Suppressed addresses are never emailed.">
        <a href="/studio/subscribers/export" className="btn btn-ghost btn-sm">
          Export CSV
        </a>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Will receive next issue" value={eligible.length} />
        <Stat label="Active" value={c.active ?? 0} />
        <Stat label="Awaiting confirmation" value={c.pending ?? 0} />
        <Stat label="Unsubscribed" value={c.unsubscribed ?? 0} />
        <Stat label="Bounced / complained" value={(c.bounced ?? 0) + (c.complained ?? 0)} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <details className="card p-4">
          <summary className="cursor-pointer font-medium">Add a subscriber by hand</summary>
          <ActionForm action={addSubscriberAction} submitLabel="Add subscriber" className="mt-4 space-y-3" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="a-email">
                  Email
                </label>
                <input id="a-email" name="email" type="email" required className="input" />
              </div>
              <div>
                <label className="field-label" htmlFor="a-name">
                  Name
                </label>
                <input id="a-name" name="name" className="input" />
              </div>
              <div>
                <label className="field-label" htmlFor="a-type">
                  Consent type
                </label>
                <select id="a-type" name="consentType" className="input">
                  <option value="express">Express: they asked to receive it</option>
                  <option value="implied">Implied: existing business relationship</option>
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="a-date">
                  Consent date
                </label>
                <input id="a-date" name="consentDate" type="date" className="input" />
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="a-evidence">
                Consent evidence (required)
              </label>
              <textarea id="a-evidence" name="evidence" required rows={2} className="input text-sm" placeholder="e.g. Asked me to add her after the March community dinner; confirmed by text on 2026-03-14." />
              <p className="field-hint">Knowing someone personally doesn&rsquo;t on its own count as consent under CASL. Record how they asked. Implied consent expires after two years.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="a-tags">
                  Tags
                </label>
                <input id="a-tags" name="tags" className="input" placeholder="friends, toronto" />
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" name="isTestRecipient" className="accent-[#7a5c34]" /> Test recipient
              </label>
            </div>
          </ActionForm>
        </details>

        <details className="card p-4">
          <summary className="cursor-pointer font-medium">Import CSV</summary>
          <div className="mt-3 text-xs text-muted">
            Required columns: <code>email, consent_type, consent_date, consent_evidence</code>. Optional: <code>name, tags</code> (tags separated by semicolons). Each row is validated; suppressed addresses and expired implied consent are skipped.
          </div>
          <ActionForm action={importCsvAction} submitLabel="Import" pendingLabel="Importing…" className="mt-4 space-y-3">
            <input type="file" name="file" accept=".csv,text/csv" required className="block text-sm" aria-label="CSV file" />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="attest" required className="mt-1 accent-[#7a5c34]" />
              <span>I confirm every person in this file has consented to receive The Dash, and the evidence column describes how.</span>
            </label>
          </ActionForm>
        </details>
      </div>

      <form className="mt-8 flex flex-wrap items-end gap-2" role="search">
        <div className="min-w-48 flex-1">
          <label className="field-label" htmlFor="q">
            Search email
          </label>
          <input id="q" name="q" defaultValue={sp.q} className="input" />
        </div>
        <div>
          <label className="field-label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="input">
            <option value="">All</option>
            {["active", "pending", "unsubscribed", "bounced", "complained"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="tag">
            Tag
          </label>
          <select id="tag" name="tag" defaultValue={sp.tag ?? ""} className="input">
            <option value="">Any</option>
            {tags.map((t) => (
              <option key={t.tag}>{t.tag}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-ghost">Filter</button>
      </form>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="border-b border-rule text-xs text-muted">
            <tr>
              <th className="py-2 pr-3 font-medium">Email</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Consent</th>
              <th className="py-2 pr-3 font-medium">Tags</th>
              <th className="py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.map((s) => (
              <tr key={s.id} className="align-top">
                <td className="py-3 pr-3">
                  <a href={`?view=${s.id}`} className="font-medium hover:text-bronze">
                    {s.email}
                  </a>
                  {s.name && <span className="block text-xs text-muted">{s.name}</span>}
                  {s.isTestRecipient && <Badge tone="accent">test</Badge>}
                </td>
                <td className="py-3 pr-3">
                  <Badge tone={s.status === "active" ? "ok" : s.status === "pending" ? "warn" : s.status === "unsubscribed" ? "neutral" : "danger"}>{s.status}</Badge>
                  <span className="mt-1 block text-xs text-muted">since {s.signupAt.toLocaleDateString("en-CA")}</span>
                </td>
                <td className="py-3 pr-3 text-xs">
                  {s.consentType} · {s.consentSource}
                  <span className="block text-muted">{s.consentAt?.toLocaleDateString("en-CA")}</span>
                  {s.consentExpiresAt && <span className={`block ${s.consentExpiresAt < new Date() ? "text-danger" : "text-muted"}`}>expires {s.consentExpiresAt.toLocaleDateString("en-CA")}</span>}
                </td>
                <td className="py-3 pr-3">
                  <ActionForm action={updateTagsAction} hidden={{ id: s.id }} submitLabel="Save" buttonClassName="text-xs text-bronze underline" className="flex items-center gap-2">
                    <input name="tags" defaultValue={s.tags.join(", ")} className="w-36 rounded-sm border border-rule bg-card px-2 py-1 text-xs" aria-label={`Tags for ${s.email}`} />
                  </ActionForm>
                </td>
                <td className="space-y-1 py-3 text-right text-xs">
                  <form action={toggleTestRecipientAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="underline">{s.isTestRecipient ? "Remove test flag" : "Make test recipient"}</button>
                  </form>
                  {s.status !== "unsubscribed" && (
                    <form action={adminUnsubscribeAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="text-danger underline">Unsubscribe</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-8 text-center text-sm text-muted">No subscribers yet.</p>}
      </div>

      {openId && (
        <section className="card mt-6 p-4" aria-labelledby="consent-history">
          <h2 id="consent-history" className="eyebrow">
            Consent history · {rows.find((r) => r.id === openId)?.email}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="rounded-sm bg-paper p-2">
                <span className="font-medium">{h.action}</span> · {h.consentType} · {h.source} · {h.createdAt.toLocaleString("en-CA")}
                {h.ipAddress && <span className="text-xs text-muted"> · IP {h.ipAddress}</span>}
                <p className="text-xs text-ink-soft">{h.evidence}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10" aria-labelledby="suppression">
        <h2 id="suppression" className="eyebrow border-b border-rule pb-2">
          Suppression list ({supp.length})
        </h2>
        <ActionForm action={suppressAction} submitLabel="Suppress" buttonClassName="btn btn-ghost btn-sm" className="mt-3 flex flex-wrap items-end gap-2" resetOnSuccess>
          <input name="email" type="email" placeholder="email to never contact" className="input w-64" aria-label="Email to suppress" />
          <input name="detail" placeholder="reason (optional)" className="input w-48" aria-label="Reason" />
        </ActionForm>
        <ul className="mt-3 divide-y divide-rule text-sm">
          {supp.map((s) => (
            <li key={s.email} className="flex items-center justify-between gap-2 py-2">
              <span>
                {s.email} <Badge tone={s.reason === "complained" || s.reason === "bounced" ? "danger" : "neutral"}>{s.reason}</Badge>
                <span className="ml-2 text-xs text-muted">{s.createdAt.toLocaleDateString("en-CA")}</span>
              </span>
              {s.reason === "manual" && (
                <form action={removeSuppressionAction}>
                  <input type="hidden" name="email" value={s.email} />
                  <button className="text-xs underline">Lift</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
