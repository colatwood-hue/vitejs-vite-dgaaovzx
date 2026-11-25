/**
 * Writing rhythm: a gentle, honest view of publishing consistency.
 * Pure functions so they're easy to test.
 */
const DAY = 86_400_000;

export type Rhythm = {
  status: "first_letter" | "on_track" | "due_soon" | "due_today" | "overdue";
  nextDue: Date | null;
  daysUntil: number | null; // negative when overdue
  /** Share of the last (up to) 6 gaps that were within the cadence (+25% grace). */
  consistency: number | null;
  sentence: string;
};

export function computeRhythm(publishedDates: Date[], cadenceDays: number, now = new Date()): Rhythm {
  const dates = [...publishedDates].sort((a, b) => b.getTime() - a.getTime());
  if (!dates.length) {
    return { status: "first_letter", nextDue: null, daysUntil: null, consistency: null, sentence: "No letters yet. The first one is the hardest. Start small." };
  }
  const nextDue = new Date(dates[0].getTime() + cadenceDays * DAY);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueDay = new Date(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate()).getTime();
  const daysUntil = Math.round((dueDay - startOfToday) / DAY);

  const gaps = dates.slice(0, 7).slice(0, -1).map((d, i) => (d.getTime() - dates[i + 1].getTime()) / DAY);
  const consistency = gaps.length ? gaps.filter((g) => g <= cadenceDays * 1.25).length / gaps.length : null;

  const status: Rhythm["status"] = daysUntil < 0 ? "overdue" : daysUntil === 0 ? "due_today" : daysUntil <= Math.max(2, Math.round(cadenceDays / 4)) ? "due_soon" : "on_track";
  const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  const sentence =
    status === "overdue"
      ? `The next letter was due ${plural(-daysUntil)} ago. No guilt. A short, honest letter beats a perfect one.`
      : status === "due_today"
        ? "A letter is due today."
        : status === "due_soon"
          ? `Next letter due in ${plural(daysUntil)}.`
          : `On track. Next letter due in ${plural(daysUntil)}.`;
  return { status, nextDue, daysUntil, consistency, sentence };
}
