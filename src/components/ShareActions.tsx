"use client";

import { useState } from "react";

export function ShareActions({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const enc = encodeURIComponent;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={async () => {
          if (navigator.share) {
            try {
              await navigator.share({ title, url });
              return;
            } catch {
              /* fall back to copy */
            }
          }
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Link copied" : "Share"}
      </button>
      <a className="btn btn-ghost btn-sm" href={`mailto:?subject=${enc(title)}&body=${enc(`I thought you'd like this: ${url}`)}`}>
        Email a friend
      </a>
      <a className="btn btn-ghost btn-sm" href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`} target="_blank" rel="noopener noreferrer">
        LinkedIn
      </a>
    </div>
  );
}
