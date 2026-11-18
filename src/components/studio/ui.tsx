import Link from "next/link";

export function PageHeader({ title, eyebrow, children, description }: { title: string; eyebrow?: string; description?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-5">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 font-serif text-3xl leading-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

const TONES: Record<string, string> = {
  ok: "border-ok/30 bg-ok/10 text-ok",
  warn: "border-warn/30 bg-warn/10 text-warn",
  danger: "border-danger/30 bg-danger/10 text-danger",
  neutral: "border-rule bg-card text-ink-soft",
  accent: "border-bronze/30 bg-bronze/10 text-bronze",
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-medium ${TONES[tone]}`}>{children}</span>;
}

export const STAGES = [
  ["captured", "Captured"],
  ["exploring", "Exploring"],
  ["ready_to_draft", "Ready to draft"],
  ["drafting", "Drafting"],
  ["editing", "Editing"],
  ["scheduled", "Scheduled"],
  ["published", "Published"],
] as const;

export function stageLabel(s: string) {
  return STAGES.find(([k]) => k === s)?.[1] ?? s;
}

export function issueStatusTone(s: string): keyof typeof TONES {
  return s === "published" || s === "sent" ? "ok" : s === "approved" || s === "scheduled" ? "accent" : "neutral";
}

export function Empty({ children, href, cta }: { children: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div className="card px-6 py-10 text-center">
      <p className="font-serif text-lg text-ink-soft">{children}</p>
      {href && cta && (
        <Link href={href} className="btn btn-ghost mt-4">
          {cta}
        </Link>
      )}
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-serif text-3xl tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

export function relTime(d: Date) {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export const SOURCE_LABELS: Record<string, string> = {
  note: "Note",
  journal: "Journal",
  voice: "Voice note",
  audio_upload: "Audio",
  quote: "Quote",
  link: "Link",
  question: "Question",
  observation: "Observation",
  story: "Story",
  lesson: "Lesson",
  concept: "Concept",
};
