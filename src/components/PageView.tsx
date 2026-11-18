"use client";

import { useEffect } from "react";

/** Cookie-free, first-party page view count (path only). */
export function PageView({ path, kind = "view" }: { path: string; kind?: "view" | "subscribe_view" }) {
  useEffect(() => {
    const body = JSON.stringify({ path, kind });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/pv", new Blob([body], { type: "application/json" }));
    else fetch("/api/pv", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
  }, [path, kind]);
  return null;
}
