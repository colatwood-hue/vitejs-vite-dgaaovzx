import { marked } from 'marked'
import type { Issue, Settings } from './store'

const md = (s: string) => marked.parse(s || '', { async: false, breaks: true }) as string
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const validLinks = (i: Issue) => i.links.filter((l) => l.title.trim() || l.url.trim())

export const wordCount = (i: Issue) =>
  [i.opening, i.bigIdea, i.learning, i.question, ...i.links.map((l) => `${l.title} ${l.why}`)]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length

export const readMinutes = (i: Issue) => Math.max(1, Math.round(wordCount(i) / 230))

/** Inline styles on every tag, because email clients strip <style> blocks. */
function inlineStyles(html: string, accent: string) {
  return html
    .replace(/<p>/g, '<p style="margin:0 0 16px;font-size:17px;line-height:1.65;color:#2b2622;">')
    .replace(/<ul>/g, '<ul style="margin:0 0 16px;padding-left:22px;font-size:17px;line-height:1.65;color:#2b2622;">')
    .replace(/<ol>/g, '<ol style="margin:0 0 16px;padding-left:22px;font-size:17px;line-height:1.65;color:#2b2622;">')
    .replace(/<li>/g, '<li style="margin:0 0 8px;">')
    .replace(/<a /g, `<a style="color:${accent};text-decoration:underline;" `)
    .replace(/<blockquote>/g, `<blockquote style="margin:0 0 16px;padding:4px 0 4px 16px;border-left:3px solid ${accent};color:#5a524b;font-style:italic;">`)
    .replace(/<h([1-6])>/g, '<h3 style="margin:24px 0 10px;font-size:19px;color:#1d1a17;">')
    .replace(/<\/h[1-6]>/g, '</h3>')
}

export function toEmailHtml(i: Issue, s: Settings) {
  const a = s.accent
  const label = (t: string) =>
    `<p style="margin:32px 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${a};font-weight:bold;">${esc(t)}</p>`
  const links = validLinks(i)
    .map(
      (l) =>
        `<li style="margin:0 0 12px;"><a href="${esc(l.url)}" style="color:${a};font-weight:bold;">${esc(l.title || l.url)}</a>${l.why ? ` &mdash; ${esc(l.why)}` : ''}</li>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(i.subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f1ea;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(i.preview)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1ea;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fffdf9;border-radius:6px;">
<tr><td style="padding:40px 40px 8px;font-family:Georgia,'Times New Roman',serif;">
<p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#8a8079;">${esc(s.name)} &middot; No. ${i.number}</p>
<h1 style="margin:12px 0 28px;font-size:30px;line-height:1.25;color:#1d1a17;font-weight:normal;">${esc(i.bigIdeaTitle || i.subject)}</h1>
${inlineStyles(md(i.opening), a)}
<hr style="border:none;border-top:1px solid #e8e0d6;margin:28px 0;">
${inlineStyles(md(i.bigIdea), a)}
${i.learning.trim() ? label("What I'm learning") + inlineStyles(md(i.learning), a) : ''}
${links ? label('Worth your time') + `<ul style="margin:0 0 16px;padding-left:22px;font-size:17px;line-height:1.65;color:#2b2622;">${links}</ul>` : ''}
${i.question.trim() ? label('A question for you') + `<div style="background:#f6f1ea;border-left:3px solid ${a};padding:16px 20px;margin:0 0 16px;">${inlineStyles(md(i.question), a).replace(/margin:0 0 16px;/, 'margin:0;')}</div>` : ''}
<p style="margin:32px 0 4px;font-size:17px;color:#2b2622;">${esc(s.signoff)}</p>
<p style="margin:0 0 32px;font-size:17px;color:#2b2622;">${esc(s.author)}</p>
</td></tr>
<tr><td style="padding:20px 40px 32px;border-top:1px solid #e8e0d6;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#8a8079;">
You're getting this because you're one of the people I care about. Just hit reply. I read everything.
</td></tr>
</table></td></tr></table></body></html>`
}

export function toMarkdown(i: Issue, s: Settings) {
  const links = validLinks(i)
    .map((l) => `- **[${l.title || l.url}](${l.url})**${l.why ? ` — ${l.why}` : ''}`)
    .join('\n')
  return [
    `# ${i.bigIdeaTitle || i.subject}`,
    i.opening,
    '---',
    i.bigIdea,
    i.learning.trim() && `## What I'm learning\n\n${i.learning}`,
    links && `## Worth your time\n\n${links}`,
    i.question.trim() && `## A question for you\n\n> ${i.question}`,
    `${s.signoff}\n${s.author}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function toPlainText(i: Issue, s: Settings) {
  const strip = (t: string) => t.replace(/\*\*|__|\*|_/g, '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
  const links = validLinks(i)
    .map((l) => `- ${l.title}${l.why ? ` — ${l.why}` : ''}\n  ${l.url}`)
    .join('\n')
  return [
    `${s.name.toUpperCase()} · No. ${i.number}`,
    (i.bigIdeaTitle || i.subject).toUpperCase(),
    strip(i.opening),
    '———',
    strip(i.bigIdea),
    i.learning.trim() && `WHAT I'M LEARNING\n${strip(i.learning)}`,
    links && `WORTH YOUR TIME\n${links}`,
    i.question.trim() && `A QUESTION FOR YOU\n${strip(i.question)}`,
    `${s.signoff}\n${s.author}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}
