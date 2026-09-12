// ─────────────────────────────────────────────────────────────────────────────
// Counting the wait — 12 Sep 2026
//
// One function, in its own file, because it was wrong on the device the first
// time it ran and both screens that count the thirty days need to be wrong or
// right together.
//
// ── What went wrong ─────────────────────────────────────────────────────────
//
// The owner asked Diaspora to close a community and the screen said **"31 days
// to go"**, two lines under copy promising thirty. The server had stamped
// `EffectiveAt` exactly thirty days out; the phone's clock was a little behind
// it, so the difference was thirty days *plus a bit*, and `Math.ceil` on that
// milliseconds difference turns any positive skew at all — a minute, a second —
// into a whole extra day.
//
// Counting calendar days cannot drift, because the sub-day part is never read:
// 12 September to 12 October is thirty days whatever either clock believes the
// time is.
// ─────────────────────────────────────────────────────────────────────────────

/** Midnight local, expressed as a UTC instant. The unit a person counts days in. */
function startOfDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Whole calendar days from today until `iso`, or null if it is not a date.
 *
 * Floors at zero: a wait that is over is over, and a negative count on the
 * owner's screen would read as a community that closed some time ago.
 *
 * @param now injected only by tests — production always means "now".
 */
export function daysUntil(iso: string, now: Date = new Date()): number | null {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;

  return Math.max(0, Math.round((startOfDay(target) - startOfDay(now)) / 86_400_000));
}

/**
 * How the count reads in a sentence.
 *
 * Shared so the owner's screen and the review queue cannot drift into saying
 * "1 days" and "the wait is over" on different thresholds.
 */
export function daysLeftLabel(days: number): string {
  if (days === 0) return 'The wait is over.';
  if (days === 1) return '1 day to go.';
  return `${days} days to go.`;
}
