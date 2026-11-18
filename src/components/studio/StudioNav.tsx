"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/studio", label: "Dashboard", short: "Home" },
  { href: "/studio/inbox", label: "Thought Inbox", short: "Inbox" },
  { href: "/studio/ideas", label: "Ideas & Pipeline", short: "Ideas" },
  { href: "/studio/issues", label: "Issues", short: "Issues" },
  { href: "/studio/subscribers", label: "Subscribers", short: "Readers" },
  { href: "/studio/analytics", label: "Analytics & Feedback", short: "Insights" },
  { href: "/studio/settings", label: "Settings", short: "Settings" },
];

function isActive(path: string, href: string) {
  return href === "/studio" ? path === "/studio" : path.startsWith(href);
}

export function StudioSidebar() {
  const path = usePathname();
  return (
    <ul className="space-y-0.5">
      {NAV.map((n) => (
        <li key={n.href}>
          <Link
            href={n.href}
            aria-current={isActive(path, n.href) ? "page" : undefined}
            className={`block rounded-sm px-3 py-2 text-sm ${isActive(path, n.href) ? "bg-paper-deep font-medium text-ink" : "text-ink-soft hover:bg-paper-deep/60"}`}
          >
            {n.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function StudioBottomNav() {
  const path = usePathname();
  const items = NAV.filter((n) => ["/studio", "/studio/inbox", "/studio/ideas", "/studio/issues", "/studio/analytics"].includes(n.href));
  return (
    <nav aria-label="Studio" className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {items.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={isActive(path, n.href) ? "page" : undefined}
              className={`flex h-14 items-center justify-center text-xs ${isActive(path, n.href) ? "font-semibold text-ink" : "text-muted"}`}
            >
              {n.short}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
