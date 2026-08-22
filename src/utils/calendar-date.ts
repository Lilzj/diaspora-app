// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — local calendar dates
//
// One helper, because two screens got the same thing wrong in two ways and a
// third would have got it wrong in a third.
//
// **DEFECT-012** — `community-life/event/create.tsx` opened its date field on
// the literal `'2026-07-15'`. A hardcoded date is a future date exactly once.
// By 20 August 2026 the platform refused every event the form proposed —
// *"That event would already be over."* — and the member met that refusal at
// the final Publish tap, after six steps, having never touched a field that
// looked already filled in.
//
// **DEFECT-013** — `community-life/events.tsx` hardcoded its whole calendar to
// July 2026: 31 cells, a Wednesday start, keys built as `2026-07-${day}`, a
// header reading "July 2026" and a **Today** button that jumped to the 13th.
//
// ── Why not `toISOString().slice(0, 10)` ─────────────────────────────────────
//
// Because it converts to UTC first. At 23:30 in London during winter that is
// still the same day, but in New York it is already tomorrow — and west of
// Greenwich the same call late in the evening reports *yesterday* for a
// `Date` that means today. A calendar cell that highlights the wrong day, or a
// default that lands a day early, is the same class of silent wrong-date bug as
// the literals these functions replace.
//
// So the parts are read from the local calendar, which is the one the member is
// looking at.
// ─────────────────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` for a date, in the **local** calendar. */
export function toDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A sensible default date for something being scheduled: a week out.
 *
 * A week rather than tomorrow because an event nobody has been told about yet
 * needs notice, and because a member who leaves the field alone should end up
 * with something plausible rather than something merely valid.
 */
export function defaultScheduleDate(from: Date = new Date()): string {
  const when = new Date(from);
  when.setDate(when.getDate() + 7);

  return toDateString(when);
}
