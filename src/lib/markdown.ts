import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";

const marked = new Marked({ gfm: true, breaks: false });

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr", "h2", "h3", "h4", "blockquote", "ul", "ol", "li", "strong", "em", "b", "i",
    "a", "img", "code", "pre", "figure", "figcaption", "del", "sup", "sub",
  ],
  allowedAttributes: { a: ["href", "title", "rel", "target"], img: ["src", "alt", "title", "width", "height"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  transformTags: {
    a: (tag, attribs) => ({
      tagName: "a",
      attribs: /^https?:/.test(attribs.href ?? "") ? { ...attribs, rel: "noopener noreferrer" } : attribs,
    }),
  },
};

/** Markdown → sanitised HTML. Safe to render with dangerouslySetInnerHTML. */
export function renderMarkdown(md: string): string {
  const raw = marked.parse(md ?? "", { async: false }) as string;
  return sanitizeHtml(raw, SANITIZE);
}

/** Resolve relative /api/assets/ image URLs to absolute ones (needed in email). */
export function absolutizeUrls(html: string, baseUrl: string): string {
  return html.replace(/(src|href)="\/(?!\/)/g, `$1="${baseUrl}/`);
}

export function markdownToText(md: string): string {
  return (md ?? "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^>\s?/gm, "")
    .replace(/`([^`]*)`/g, "$1")
    .trim();
}

export function wordCount(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}

/** ~230 wpm for considered reading, minimum one minute. */
export function readingMinutes(...parts: string[]): number {
  const words = parts.reduce((n, p) => n + wordCount(markdownToText(p)), 0);
  return Math.max(1, Math.round(words / 230));
}

export function excerpt(md: string, max = 200): string {
  const text = markdownToText(md).replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled"
  );
}
