"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server page every few seconds while background work is pending. */
export function AutoRefresh({ everyMs = 4000, maxTries = 75 }: { everyMs?: number; maxTries?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      if (++n > maxTries) clearInterval(id);
      else router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, maxTries]);
  return null;
}
