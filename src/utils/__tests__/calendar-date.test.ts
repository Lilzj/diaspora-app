// ─────────────────────────────────────────────────────────────────────────────
// DEFECT-012 and DEFECT-013 — two hardcoded dates, one helper
//
// Both were found by driving the community-life screens on a device.
//
//   **DEFECT-012**  `event/create.tsx` opened its date field on `'2026-07-15'`.
//   By 20 August 2026 the platform refused every event the form proposed —
//   *"That event would already be over."* — and the member met that refusal at
//   the final Publish tap, after six steps, having never touched a field that
//   looked already filled in.
//
//   **DEFECT-013**  `events.tsx` hardcoded its whole calendar to July 2026:
//   31 cells, a Wednesday start, keys built as `2026-07-${day}`, a header
//   reading "July 2026", and a **Today** button that jumped to the 13th.
//
// The local-vs-UTC assertions are the ones worth keeping. `toISOString()` would
// pass every other test here and still report the wrong day west of Greenwich.
// ─────────────────────────────────────────────────────────────────────────────

import { defaultScheduleDate, toDateString } from '../calendar-date';

describe('toDateString', () => {
  it('formats as `YYYY-MM-DD`, zero-padded', () => {
    expect(toDateString(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toDateString(new Date(2026, 8, 9))).toBe('2026-09-09');
    expect(toDateString(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  /**
   * The trap. At 23:30 local in any zone behind UTC, `toISOString()` has already
   * rolled to tomorrow — so a calendar cell would highlight the wrong day and a
   * default would land a day out. The helper must answer from the local
   * calendar, which is the one the member is looking at.
   */
  it('uses the local calendar day, not the UTC one', () => {
    const lateEvening = new Date(2026, 7, 20, 23, 30);
    expect(toDateString(lateEvening)).toBe('2026-08-20');

    const earlyMorning = new Date(2026, 7, 20, 0, 15);
    expect(toDateString(earlyMorning)).toBe('2026-08-20');
  });

  it('agrees with the local date parts for today, whatever the clock says', () => {
    const now = new Date();
    const expected = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');

    expect(toDateString(now)).toBe(expected);
  });
});

describe('defaultScheduleDate — DEFECT-012', () => {
  it('is in the future, which the literal it replaced stopped being', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    expect(new Date(defaultScheduleDate()).getTime()).toBeGreaterThan(today.getTime());
  });

  it('is a week out, not merely tomorrow', () => {
    expect(defaultScheduleDate(new Date(2026, 7, 20))).toBe('2026-08-27');
  });

  it('rolls the month and the year', () => {
    expect(defaultScheduleDate(new Date(2026, 7, 28))).toBe('2026-09-04');
    expect(defaultScheduleDate(new Date(2026, 11, 28))).toBe('2027-01-04');
  });

  it('handles a leap year', () => {
    expect(defaultScheduleDate(new Date(2028, 1, 25))).toBe('2028-03-03');
  });

  it('does not mutate the date it was given', () => {
    const from = new Date(2026, 7, 20);
    defaultScheduleDate(from);
    expect(toDateString(from)).toBe('2026-08-20');
  });

  it('never returns the literal that caused the defect', () => {
    expect(defaultScheduleDate()).not.toBe('2026-07-15');
  });
});
