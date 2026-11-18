/**
 * Email rendering. Table-based layout with inline styles for broad client
 * support. Every commercial message carries CASL identification: sender name,
 * mailing address, contact method, and a working unsubscribe link.
 */
import { absolutizeUrls, markdownToText, renderMarkdown } from "@/lib/markdown";
import type { PublicationSettings } from "@/lib/settings";

export type IssueForEmail = {
  number: number | null;
  title: string;
  subtitle: string;
  bodyMd: string;
  recommendationMd: string;
  closingMd: string;
  previewText: string;
  readingMinutes: number;
  slug: string;
  publishedAt: Date | null;
};

export type RecipientLinks = { unsubscribeUrl: string; preferencesUrl: string };

const C = {
  paper: "#f7f3ec",
  card: "#fffdf9",
  ink: "#1f1c18",
  muted: "#6b6358",
  rule: "#e4dccf",
  bronze: "#7a5c34",
};
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function issueLabel(n: number | null) {
  return n ? `No. ${String(n).padStart(3, "0")}` : "Draft";
}

/** Inline styles for the HTML Markdown produces (email clients ignore <style>). */
function styleProse(html: string): string {
  return html
    .replace(/<p>/g, `<p style="margin:0 0 20px;font-family:${SERIF};font-size:18px;line-height:1.65;color:${C.ink};">`)
    .replace(/<h2>/g, `<h2 style="margin:32px 0 12px;font-family:${SERIF};font-size:23px;line-height:1.3;font-weight:normal;color:${C.ink};">`)
    .replace(/<h3>/g, `<h3 style="margin:28px 0 10px;font-family:${SERIF};font-size:19px;line-height:1.3;color:${C.ink};">`)
    .replace(/<blockquote>/g, `<blockquote style="margin:24px 0;padding:0 0 0 18px;border-left:2px solid ${C.bronze};color:${C.muted};font-style:italic;">`)
    .replace(/<a /g, `<a style="color:${C.bronze};text-decoration:underline;" `)
    .replace(/<ul>/g, `<ul style="margin:0 0 20px;padding-left:22px;font-family:${SERIF};font-size:18px;line-height:1.65;color:${C.ink};">`)
    .replace(/<ol>/g, `<ol style="margin:0 0 20px;padding-left:22px;font-family:${SERIF};font-size:18px;line-height:1.65;color:${C.ink};">`)
    .replace(/<img /g, `<img style="max-width:100%;height:auto;display:block;margin:24px 0;" `)
    .replace(/<hr>/g, `<hr style="border:0;border-top:1px solid ${C.rule};margin:32px 0;">`);
}

export function renderIssueEmail(
  issue: IssueForEmail,
  settings: PublicationSettings,
  links: RecipientLinks,
  opts: { appUrl: string; isTest?: boolean },
): { html: string; text: string } {
  const webUrl = `${opts.appUrl}/issues/${issue.slug}`;
  const body = styleProse(absolutizeUrls(renderMarkdown(issue.bodyMd), opts.appUrl));
  const rec = issue.recommendationMd.trim()
    ? styleProse(absolutizeUrls(renderMarkdown(issue.recommendationMd), opts.appUrl))
    : "";
  const closing = issue.closingMd.trim() ? styleProse(renderMarkdown(issue.closingMd)) : "";
  const dateStr = (issue.publishedAt ?? new Date()).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const section = (label: string, inner: string) => `
    <tr><td style="padding:8px 0 0;">
      <hr style="border:0;border-top:1px solid ${C.rule};margin:24px 0 20px;">
      <p style="margin:0 0 12px;font-family:${SANS};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${C.bronze};">${label}</p>
      ${inner}
    </td></tr>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(issue.title)}</title></head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(issue.previewText)}${"&#847; &zwnj; &nbsp; ".repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};">
<tr><td align="center" style="padding:32px 16px;">
${opts.isTest ? `<table role="presentation" width="100%" style="max-width:600px;"><tr><td style="padding:10px 14px;margin-bottom:16px;background:#fff4d6;border:1px solid #e8d49a;font-family:${SANS};font-size:13px;color:#5c4a12;">Test send — this is a preview and has not gone to subscribers.</td></tr></table><div style="height:16px"></div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.card};border:1px solid ${C.rule};">
<tr><td style="padding:40px 40px 8px;">
  <p style="margin:0;font-family:${SANS};font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${C.muted};">${esc(settings.name)} &nbsp;·&nbsp; ${issueLabel(issue.number)}</p>
  <h1 style="margin:18px 0 8px;font-family:${SERIF};font-size:32px;line-height:1.2;font-weight:normal;color:${C.ink};">${esc(issue.title)}</h1>
  ${issue.subtitle ? `<p style="margin:0 0 8px;font-family:${SERIF};font-size:19px;line-height:1.5;font-style:italic;color:${C.muted};">${esc(issue.subtitle)}</p>` : ""}
  <p style="margin:12px 0 28px;font-family:${SANS};font-size:13px;color:${C.muted};">${dateStr} &nbsp;·&nbsp; ${issue.readingMinutes} min read &nbsp;·&nbsp; <a href="${webUrl}" style="color:${C.muted};">Read on the web</a></p>
</td></tr>
<tr><td style="padding:0 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td>${body}</td></tr>
    ${rec ? section("Worth your time", rec) : ""}
    ${closing ? section("Something to sit with", closing) : ""}
  </table>
</td></tr>
<tr><td style="padding:12px 40px 40px;">
  <hr style="border:0;border-top:1px solid ${C.rule};margin:20px 0;">
  <p style="margin:0;font-family:${SERIF};font-size:17px;line-height:1.6;color:${C.ink};">If something here stirred a thought, just hit reply. I read every response.</p>
  <p style="margin:12px 0 0;font-family:${SERIF};font-size:17px;color:${C.ink};">— ${esc(settings.authorName.split(" ")[0] || settings.authorName)}</p>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td style="padding:24px 24px 0;font-family:${SANS};font-size:12px;line-height:1.7;color:${C.muted};text-align:center;">
  ${esc(settings.name)} is a personal letter by ${esc(settings.authorName)}${settings.parentBrand ? ` · ${esc(settings.parentBrand)}` : ""}.<br>
  You're receiving this because you subscribed to ${esc(settings.name)}.<br>
  ${esc(settings.mailingAddress).replace(/\n/g, "<br>")}<br>
  ${settings.contactEmail ? `Contact: <a href="mailto:${esc(settings.contactEmail)}" style="color:${C.muted};">${esc(settings.contactEmail)}</a><br>` : ""}
  <a href="${links.preferencesUrl}" style="color:${C.muted};">Email preferences</a> &nbsp;·&nbsp;
  <a href="${links.unsubscribeUrl}" style="color:${C.muted};">Unsubscribe</a>
</td></tr></table>
</td></tr></table>
</body></html>`;

  const text = [
    opts.isTest ? "[TEST SEND — not delivered to subscribers]\n" : "",
    `${settings.name.toUpperCase()} · ${issueLabel(issue.number)}`,
    "",
    issue.title,
    issue.subtitle,
    `${dateStr} · ${issue.readingMinutes} min read`,
    `Read on the web: ${webUrl}`,
    "",
    markdownToText(issue.bodyMd),
    issue.recommendationMd.trim() ? `\n— Worth your time —\n${markdownToText(issue.recommendationMd)}` : "",
    issue.closingMd.trim() ? `\n— Something to sit with —\n${markdownToText(issue.closingMd)}` : "",
    "",
    "If something here stirred a thought, just hit reply. I read every response.",
    `— ${settings.authorName.split(" ")[0] || settings.authorName}`,
    "",
    "---",
    `${settings.name} is a personal letter by ${settings.authorName}.`,
    settings.mailingAddress,
    settings.contactEmail ? `Contact: ${settings.contactEmail}` : "",
    `Email preferences: ${links.preferencesUrl}`,
    `Unsubscribe: ${links.unsubscribeUrl}`,
  ]
    .filter((l) => l !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return { html, text };
}

export function renderConfirmEmail(settings: PublicationSettings, confirmUrl: string): { html: string; text: string; subject: string } {
  const subject = `Confirm your subscription to ${settings.name}`;
  const html = `<!doctype html><html><body style="margin:0;background:${C.paper};">
<table role="presentation" width="100%" style="background:${C.paper};"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" style="max-width:520px;background:${C.card};border:1px solid ${C.rule};"><tr><td style="padding:36px;">
<p style="margin:0 0 20px;font-family:${SANS};font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${C.muted};">${esc(settings.name)}</p>
<p style="font-family:${SERIF};font-size:18px;line-height:1.6;color:${C.ink};margin:0 0 20px;">Thanks for wanting to read along. Please confirm it was you who asked to subscribe.</p>
<p style="margin:0 0 24px;"><a href="${confirmUrl}" style="display:inline-block;background:${C.ink};color:#fff;padding:12px 22px;font-family:${SANS};font-size:15px;text-decoration:none;">Yes, subscribe me</a></p>
<p style="font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted};margin:0;">If you didn't request this, ignore this email and you won't hear from us again.</p>
</td></tr></table>
<p style="font-family:${SANS};font-size:12px;color:${C.muted};max-width:520px;line-height:1.6;">${esc(settings.name)} · ${esc(settings.authorName)}<br>${esc(settings.mailingAddress).replace(/\n/g, "<br>")}</p>
</td></tr></table></body></html>`;
  const text = `Thanks for wanting to read ${settings.name}.\n\nConfirm your subscription: ${confirmUrl}\n\nIf you didn't request this, ignore this email.\n\n${settings.authorName}\n${settings.mailingAddress}`;
  return { html, text, subject };
}

export function fromAddress(settings: PublicationSettings): string {
  const name = settings.senderName.replace(/[<>"]/g, "");
  return `${name} <${settings.senderEmail}>`;
}
