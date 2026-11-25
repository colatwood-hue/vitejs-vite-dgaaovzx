"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveIssueAction, uploadImageAction, type SaveResult } from "@/actions/issues";
import { attachUpload } from "./upload";

type Pillar = { id: number; name: string };

export type EditorIssue = {
  id: string;
  title: string;
  subtitle: string;
  bodyMd: string;
  recommendationMd: string;
  closingMd: string;
  subject: string;
  previewText: string;
  slug: string;
  number: number | null;
  primaryPillarId: number | null;
  secondaryThemes: string[];
  readingMinutes: number;
  status: string;
  published: boolean;
};

type Tab = "write" | "web" | "email-desktop" | "email-mobile";

function words(s: string) {
  return (s.match(/\S+/g) ?? []).length;
}

export function IssueEditor({ issue, pillars }: { issue: EditorIssue; pillars: Pillar[] }) {
  const [f, setF] = useState(issue);
  const [tab, setTab] = useState<Tab>("write");
  const [state, setState] = useState<{ kind: "idle" | "dirty" | "saving" | "saved" | "error"; text?: string }>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(f);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    latest.current = f;
  }, [f]);

  const save = useCallback(async (mode: "autosave" | "manual", note?: string) => {
    if (timer.current) clearTimeout(timer.current);
    setState({ kind: "saving" });
    const d = latest.current;
    const r: SaveResult = await saveIssueAction({
      id: d.id,
      title: d.title,
      subtitle: d.subtitle,
      bodyMd: d.bodyMd,
      recommendationMd: d.recommendationMd,
      closingMd: d.closingMd,
      subject: d.subject,
      previewText: d.previewText,
      slug: d.published ? undefined : d.slug,
      number: d.number,
      primaryPillarId: d.primaryPillarId,
      secondaryThemes: d.secondaryThemes,
      mode,
      note,
    });
    if (!r.ok) {
      setState({ kind: "error", text: r.message ?? "Couldn't save." });
      return;
    }
    setState({ kind: "saved", text: new Date(r.savedAt!).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }) });
    setF((prev) => ({ ...prev, readingMinutes: r.readingMinutes ?? prev.readingMinutes, status: r.status ?? prev.status, slug: r.slug ?? prev.slug }));
    setPreviewVersion((v) => v + 1);
    if (r.approvalRevoked) setNotice("You edited an approved issue, so its approval was removed. Re-approve when ready.");
  }, []);

  const update = <K extends keyof EditorIssue>(k: K, v: EditorIssue[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setState({ kind: "dirty" });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save("autosave"), 1500);
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (state.kind === "dirty" || state.kind === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save("manual");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  function wrap(before: string, after = before, placeholder = "") {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const sel = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    update("bodyMd", next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  }

  function linePrefix(prefix: string) {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: s, value } = el;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    update("bodyMd", value.slice(0, lineStart) + prefix + value.slice(lineStart));
    requestAnimationFrame(() => el.focus());
  }

  async function onImage(file: File) {
    const alt = window.prompt("Describe the image for readers who can't see it (alt text):", "") ?? "";
    const fd = new FormData();
    fd.set("id", f.id);
    fd.set("alt", alt);
    try {
      await attachUpload(fd, "image", file, "file", "key");
    } catch (err) {
      setNotice((err as Error).message);
      return;
    }
    const r = await uploadImageAction(fd);
    if (!r.ok || !r.markdown) {
      setNotice(r.message ?? "Upload failed.");
      return;
    }
    wrap(`\n\n${r.markdown}\n\n`, "", "");
  }

  const statusText =
    state.kind === "saving" ? "Saving…" : state.kind === "dirty" ? "Unsaved changes" : state.kind === "saved" ? `Saved ${state.text}` : state.kind === "error" ? state.text : "All changes saved";

  return (
    <div className="card">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-card/95 px-3 py-2 backdrop-blur">
        <div role="tablist" aria-label="Editor view" className="flex gap-1">
          {(
            [
              ["write", "Write"],
              ["web", "Web preview"],
              ["email-desktop", "Email · desktop"],
              ["email-mobile", "Email · mobile"],
            ] as [Tab, string][]
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-sm px-2.5 py-1.5 text-xs ${tab === k ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-deep"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className={`text-xs ${state.kind === "error" ? "text-danger" : "text-muted"}`}>
            {statusText}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => save("manual")} title="Ctrl/Cmd + S">
            Save version
          </button>
        </div>
      </div>

      {notice && (
        <div className="flex items-start justify-between gap-2 border-b border-warn/30 bg-warn/10 px-4 py-2 text-sm text-warn">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-xs">
            ✕
          </button>
        </div>
      )}

      {tab === "write" ? (
        <div className="space-y-5 p-4 sm:p-6">
          <div>
            <label htmlFor="ed-title" className="sr-only">
              Title
            </label>
            <input id="ed-title" value={f.title} onChange={(e) => update("title", e.target.value)} placeholder="Title" className="w-full border-0 bg-transparent font-serif text-3xl leading-tight outline-none placeholder:text-muted/60 sm:text-4xl" />
            <label htmlFor="ed-subtitle" className="sr-only">
              Subtitle
            </label>
            <input id="ed-subtitle" value={f.subtitle} onChange={(e) => update("subtitle", e.target.value)} placeholder="Subtitle (optional)" className="mt-2 w-full border-0 bg-transparent font-serif text-xl italic text-ink-soft outline-none placeholder:text-muted/60" />
          </div>

          <div>
            <div className="mb-1 flex flex-wrap items-center gap-1 text-xs" role="toolbar" aria-label="Formatting">
              <button type="button" className="btn btn-ghost btn-sm font-bold" onClick={() => wrap("**", "**", "bold")} aria-label="Bold">B</button>
              <button type="button" className="btn btn-ghost btn-sm italic" onClick={() => wrap("_", "_", "italic")} aria-label="Italic">I</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => linePrefix("## ")}>Heading</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => linePrefix("> ")}>Quote</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => wrap("[", "](https://)", "link text")}>Link</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => wrap("\n\n---\n\n", "", "")}>Break</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => imgRef.current?.click()}>Image</button>
              <input ref={imgRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" tabIndex={-1} onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])} />
              <span className="ml-auto text-muted">
                {words(f.bodyMd)} words · {f.readingMinutes} min · Markdown
              </span>
            </div>
            <label htmlFor="ed-body" className="sr-only">
              Main essay
            </label>
            <textarea
              id="ed-body"
              ref={bodyRef}
              value={f.bodyMd}
              onChange={(e) => update("bodyMd", e.target.value)}
              rows={24}
              placeholder="Begin the letter…"
              className="input min-h-[50vh] font-serif text-[1.12rem] leading-[1.75]"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label htmlFor="ed-rec" className="field-label">
                Worth your time (optional recommendation)
              </label>
              <textarea id="ed-rec" value={f.recommendationMd} onChange={(e) => update("recommendationMd", e.target.value)} rows={4} className="input font-serif" placeholder="A book, conversation, place or idea, and why." />
            </div>
            <div>
              <label htmlFor="ed-close" className="field-label">
                Closing reflection or question
              </label>
              <textarea id="ed-close" value={f.closingMd} onChange={(e) => update("closingMd", e.target.value)} rows={4} className="input font-serif" placeholder="What would you do?" />
            </div>
          </div>

          <fieldset className="grid gap-4 border-t border-rule pt-5 lg:grid-cols-2">
            <legend className="eyebrow mb-3">Email & metadata</legend>
            <div>
              <label htmlFor="ed-subject" className="field-label">
                Subject line <span className="font-normal text-muted">({f.subject.length}/60 recommended)</span>
              </label>
              <input id="ed-subject" value={f.subject} onChange={(e) => update("subject", e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="ed-preview" className="field-label">
                Preview text <span className="font-normal text-muted">({f.previewText.length}/110)</span>
              </label>
              <input id="ed-preview" value={f.previewText} onChange={(e) => update("previewText", e.target.value)} className="input" />
            </div>
            <div className="grid grid-cols-[6rem_1fr] gap-3">
              <div>
                <label htmlFor="ed-number" className="field-label">
                  Issue no.
                </label>
                <input id="ed-number" type="number" min={1} value={f.number ?? ""} onChange={(e) => update("number", e.target.value ? Number(e.target.value) : null)} placeholder="auto" className="input" />
              </div>
              <div>
                <label htmlFor="ed-slug" className="field-label">
                  URL slug {f.published && <span className="font-normal text-muted">(locked after publishing)</span>}
                </label>
                <input id="ed-slug" value={f.slug} disabled={f.published} onChange={(e) => update("slug", e.target.value)} className="input disabled:opacity-60" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ed-pillar" className="field-label">
                  Primary pillar
                </label>
                <select id="ed-pillar" value={f.primaryPillarId ?? ""} onChange={(e) => update("primaryPillarId", e.target.value ? Number(e.target.value) : null)} className="input">
                  <option value="">None</option>
                  {pillars.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ed-themes" className="field-label">
                  Secondary themes
                </label>
                <input
                  id="ed-themes"
                  defaultValue={f.secondaryThemes.join(", ")}
                  onChange={(e) =>
                    update(
                      "secondaryThemes",
                      e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    )
                  }
                  className="input"
                  placeholder="faith, family"
                />
              </div>
            </div>
          </fieldset>
        </div>
      ) : (
        <div className={`bg-paper-deep/50 p-3 sm:p-6 ${tab === "email-mobile" ? "flex justify-center" : ""}`}>
          <iframe
            key={`${tab}-${previewVersion}`}
            title="Preview"
            src={tab === "web" ? `/studio/preview/${f.id}?v=${previewVersion}` : `/studio/issues/${f.id}/email?v=${previewVersion}`}
            className={`h-[75vh] border border-rule bg-white ${tab === "email-mobile" ? "w-[375px] max-w-full rounded-[1.5rem] border-4 border-ink" : "w-full"}`}
            sandbox="allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}
