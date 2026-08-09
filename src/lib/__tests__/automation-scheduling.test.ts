// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Scheduling and timezone (Frontend Phase 18, §41 · §42 · §43)
//
// The area where this phase could most plausibly go quietly wrong.
//
// §42's failure mode is specific and silent: a schedule interpreted in the
// wrong timezone runs an hour or five out, with no error and nothing to notice
// until somebody misses something. So these tests assert against **fixed
// dates** — including both DST transitions, in both hemispheres — rather than
// against whatever day they happen to run on. `previewNextOccurrence` takes
// `now` as a parameter for exactly this reason.
//
// ── The property that matters most ───────────────────────────────────────────
//
// §41 forbids the client being an authoritative scheduler. Every preview this
// module produces reports `isAuthoritative: false`, and the first test below
// asserts it exhaustively — because the day somebody adds a code path that
// returns `true`, the UI starts presenting a client-computed time as the
// platform's promise.
// ─────────────────────────────────────────────────────────────────────────────

import {
  REMINDER_OFFSETS,
  defaultEventSchedule,
  defaultSchedule,
  describeOffset,
  describeSchedule,
  deviceTimeZone,
  friendlyZone,
  isZoneKnown,
  previewNextOccurrence,
  resolveTimezone,
  validateSchedule,
} from '@/lib/automation/schedule';
import type { AutomationSchedule } from '@/types/automation';

/** A fixed "now" every test reasons from. A Wednesday, in the northern summer. */
const NOW = new Date('2026-08-05T10:00:00.000Z');

function scheduleIn(zoneId: string, overrides: Partial<AutomationSchedule> = {}): AutomationSchedule {
  return {
    ...defaultSchedule('daily'),
    timezone: { mode: 'userSelected', ianaId: zoneId, label: friendlyZone(zoneId), isExact: true },
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════

describe('§41 · the client is never the authoritative scheduler', () => {
  it('every preview reports itself as an estimate', () => {
    const frequencies: AutomationSchedule['frequency'][] = [
      'once',
      'daily',
      'weekly',
      'monthly',
      'custom',
      'eventRelative',
    ];

    for (const frequency of frequencies) {
      const preview = previewNextOccurrence(
        scheduleIn('Africa/Lagos', { frequency, daysOfWeek: [1], dayOfMonth: 15 }),
        NOW
      );

      // Never `true`, on any path. A `true` here would let the UI present a
      // client-computed time as the platform's promise.
      expect(preview.isAuthoritative).toBe(false);
    }
  });

  it('a custom schedule is never parsed', () => {
    const preview = previewNextOccurrence(
      scheduleIn('Africa/Lagos', { frequency: 'custom', customDescription: '0 9 * * 1-5' }),
      NOW
    );

    // §41: a client that interpreted a cron expression would be the local
    // scheduler the brief forbids, wearing a hat.
    expect(preview.instant).toBeNull();
    expect(preview.unavailableReason).toBeTruthy();
  });

  it('an event-relative schedule has no computable next time', () => {
    const preview = previewNextOccurrence(
      { ...defaultEventSchedule('Africa/Lagos'), timezone: { mode: 'event', ianaId: 'Africa/Lagos', label: 'Lagos', isExact: true } },
      NOW
    );

    expect(preview.instant).toBeNull();
  });

  it('the schedule module contains no timer', () => {
    const fs = require('fs') as { readFileSync(p: string, e: string): string };
    const path = require('path') as { join(...s: string[]): string };

    const source = fs
      .readFileSync(path.join(process.cwd(), 'src', 'lib', 'automation', 'schedule.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join('\n');

    for (const forbidden of ['setTimeout', 'setInterval', 'requestAnimationFrame']) {
      expect(source).not.toContain(forbidden);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§42 · a schedule is interpreted in the zone it names', () => {
  it('09:00 in Lagos is 08:00 UTC, not 09:00 UTC', () => {
    // Lagos is UTC+1 with no DST. The canonical failure this test exists for is
    // a client that treated the wall clock as UTC, which would fire an hour
    // late every day of the year.
    const preview = previewNextOccurrence(
      scheduleIn('Africa/Lagos', { hour: 9, minute: 0 }),
      new Date('2026-08-05T06:00:00.000Z')
    );

    expect(preview.instant?.toISOString()).toBe('2026-08-05T08:00:00.000Z');
  });

  it('09:00 in Auckland is a different instant again', () => {
    // UTC+12 in August (southern winter, no DST). Chosen because a bug that
    // only reversed the sign of the offset would still pass the Lagos test.
    const preview = previewNextOccurrence(
      scheduleIn('Pacific/Auckland', { hour: 9, minute: 0 }),
      new Date('2026-08-04T00:00:00.000Z')
    );

    expect(preview.instant?.toISOString()).toBe('2026-08-04T21:00:00.000Z');
  });

  it('the same wall clock in two zones is two different instants', () => {
    // **Not** Lagos and London: in August, Lagos is UTC+1 and London is on BST,
    // which is also UTC+1. They produce the same instant, correctly, and a test
    // using that pair would assert nothing. Auckland is UTC+12 in August.
    const lagos = previewNextOccurrence(
      scheduleIn('Africa/Lagos', { hour: 18, minute: 0 }),
      new Date('2026-08-05T06:00:00.000Z')
    );
    const auckland = previewNextOccurrence(
      scheduleIn('Pacific/Auckland', { hour: 18, minute: 0 }),
      new Date('2026-08-05T06:00:00.000Z')
    );

    expect(lagos.instant?.toISOString()).not.toBe(auckland.instant?.toISOString());
  });

  it('handles the northern spring-forward transition', () => {
    // London goes UTC+0 → UTC+1 at 01:00 UTC on 29 March 2026. `now` is the day
    // *before* deliberately, so the computed occurrence lands on the far side of
    // the transition — a `now` already past it would exercise nothing.
    //
    // 28 March 12:00 UTC is 12:00 GMT, so 09:00 has passed and the next
    // occurrence is the 29th. 09:00 BST on the 29th is 08:00 UTC — a one-pass
    // conversion returns 09:00 UTC here, which is the silent one-hour error §42
    // exists to prevent.
    const preview = previewNextOccurrence(
      scheduleIn('Europe/London', { hour: 9, minute: 0 }),
      new Date('2026-03-28T12:00:00.000Z')
    );

    expect(preview.instant?.toISOString()).toBe('2026-03-29T08:00:00.000Z');
  });

  it('handles the northern autumn-back transition', () => {
    // London goes UTC+1 → UTC+0 at 01:00 UTC on 25 October 2026. Again `now` is
    // the day before, so the occurrence crosses the boundary in the other
    // direction: 09:00 GMT on the 25th is 09:00 UTC.
    const preview = previewNextOccurrence(
      scheduleIn('Europe/London', { hour: 9, minute: 0 }),
      new Date('2026-10-24T12:00:00.000Z')
    );

    expect(preview.instant?.toISOString()).toBe('2026-10-25T09:00:00.000Z');
  });

  it('the two transitions produce different offsets for the same wall clock', () => {
    // The clearest statement of what DST handling is for: 09:00 London in March
    // and 09:00 London in October are the same wall clock and different
    // instants, and a converter that ignored the zone's history would return
    // the same offset for both.
    const spring = previewNextOccurrence(
      scheduleIn('Europe/London', { hour: 9, minute: 0 }),
      new Date('2026-06-01T12:00:00.000Z')
    );
    const winter = previewNextOccurrence(
      scheduleIn('Europe/London', { hour: 9, minute: 0 }),
      new Date('2026-12-01T12:00:00.000Z')
    );

    expect(spring.instant?.getUTCHours()).toBe(8);
    expect(winter.instant?.getUTCHours()).toBe(9);
  });

  it('handles a southern-hemisphere transition, where the direction is reversed', () => {
    // Auckland goes UTC+12 → UTC+13 on 27 September 2026. A DST implementation
    // that assumed the northern calendar gets this backwards.
    const preview = previewNextOccurrence(
      scheduleIn('Pacific/Auckland', { hour: 9, minute: 0 }),
      new Date('2026-09-27T00:00:00.000Z')
    );

    expect(preview.instant).not.toBeNull();
    // NZDT is UTC+13, so 09:00 local is 20:00 UTC the previous day.
    expect(preview.instant!.getUTCHours()).toBe(20);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§42 · the five timezone modes', () => {
  it('device resolves to the runtime’s own zone', () => {
    const resolved = resolveTimezone('device');
    const device = deviceTimeZone();

    expect(resolved.ianaId).toBe(device.id);
    expect(resolved.mode).toBe('device');
  });

  it('event mode is null until an event is chosen, rather than falling back', () => {
    const resolved = resolveTimezone('event');

    // Deliberately null. Substituting the device's zone would let a half-built
    // automation save and then fire at the wrong time — the exact silent error
    // §42 forbids.
    expect(resolved.ianaId).toBeNull();
    expect(resolved.isExact).toBe(false);
  });

  it('event mode resolves to the event’s own zone once one is chosen', () => {
    const resolved = resolveTimezone('event', {
      eventZoneId: 'Africa/Lagos',
      eventLabel: 'Lagos Tech Meetup',
    });

    expect(resolved.ianaId).toBe('Africa/Lagos');
    expect(resolved.label).toContain('Lagos');
    expect(resolved.isExact).toBe(true);
  });

  it('an unresolvable zone falls back and says so, rather than silently', () => {
    const resolved = resolveTimezone('userSelected', { selectedZoneId: 'Not/AZone' });

    expect(resolved.isExact).toBe(false);
    // The label has to carry the caveat, because a schedule silently
    // reinterpreted in the device's zone is precisely what §42 forbids.
    expect(resolved.ianaId).toBe('Not/AZone');
  });

  it('a missing community or country zone falls back visibly', () => {
    for (const mode of ['community', 'country'] as const) {
      const resolved = resolveTimezone(mode);

      expect(resolved.isExact).toBe(false);
      expect(resolved.label).toMatch(/no set timezone/);
    }
  });

  it('a zone the runtime knows is reported as known', () => {
    expect(isZoneKnown('Africa/Lagos')).toBe(true);
    expect(isZoneKnown('Europe/London')).toBe(true);
    expect(isZoneKnown('Not/AZone')).toBe(false);
  });

  it('a zone is shown by its city rather than its region prefix', () => {
    expect(friendlyZone('Africa/Lagos')).toBe('Lagos');
    expect(friendlyZone('America/Port_of_Spain')).toBe('Port of Spain');
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('frequency arithmetic', () => {
  it('a daily schedule whose time has passed moves to tomorrow', () => {
    const preview = previewNextOccurrence(
      scheduleIn('Africa/Lagos', { hour: 9, minute: 0 }),
      // 12:00 Lagos on 5 August — 09:00 has gone.
      new Date('2026-08-05T11:00:00.000Z')
    );

    expect(preview.instant?.toISOString()).toBe('2026-08-06T08:00:00.000Z');
  });

  it('a daily schedule whose time is still ahead stays today', () => {
    const preview = previewNextOccurrence(
      scheduleIn('Africa/Lagos', { hour: 18, minute: 0 }),
      new Date('2026-08-05T11:00:00.000Z')
    );

    expect(preview.instant?.toISOString()).toBe('2026-08-05T17:00:00.000Z');
  });

  it('a weekly schedule finds the next chosen day', () => {
    // 5 August 2026 is a Wednesday. Asking for Friday should land on the 7th.
    const preview = previewNextOccurrence(
      scheduleIn('Africa/Lagos', { frequency: 'weekly', daysOfWeek: [5], hour: 9, minute: 0 }),
      new Date('2026-08-05T11:00:00.000Z')
    );

    expect(preview.instant?.toISOString().slice(0, 10)).toBe('2026-08-07');
  });

  it('a weekly schedule wraps into next week when the day has passed', () => {
    // Wednesday, asking for Monday.
    const preview = previewNextOccurrence(
      scheduleIn('Africa/Lagos', { frequency: 'weekly', daysOfWeek: [1], hour: 9, minute: 0 }),
      new Date('2026-08-05T11:00:00.000Z')
    );

    expect(preview.instant?.toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  it('a monthly schedule on the 31st is clamped in a short month', () => {
    const preview = previewNextOccurrence(
      scheduleIn('Africa/Lagos', { frequency: 'monthly', dayOfMonth: 31, hour: 9, minute: 0 }),
      new Date('2026-09-15T11:00:00.000Z')
    );

    // September has 30 days. The server owns the real rule; this only has to
    // stay inside the month rather than rolling silently into October.
    expect(preview.instant?.toISOString().slice(0, 10)).toBe('2026-09-30');
  });

  it('a schedule past its end date has no next occurrence', () => {
    const preview = previewNextOccurrence(
      scheduleIn('Africa/Lagos', { endsAt: '2026-08-01T00:00:00.000Z' }),
      NOW
    );

    expect(preview.instant).toBeNull();
    expect(preview.unavailableReason).toMatch(/end date/);
  });

  it('a schedule with no timezone has no next occurrence', () => {
    const preview = previewNextOccurrence(
      { ...defaultSchedule('daily'), timezone: { mode: 'event', ianaId: null, label: '', isExact: false } },
      NOW
    );

    expect(preview.instant).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§43 · schedule conflicts', () => {
  const errorsIn = (schedule: AutomationSchedule) =>
    validateSchedule(schedule, NOW).filter((issue) => issue.severity === 'error');
  const warningsIn = (schedule: AutomationSchedule) =>
    validateSchedule(schedule, NOW).filter((issue) => issue.severity === 'warning');

  it('rejects an end date before the start date', () => {
    const issues = errorsIn(
      scheduleIn('Africa/Lagos', {
        startsAt: '2026-09-01T00:00:00.000Z',
        endsAt: '2026-08-01T00:00:00.000Z',
      })
    );

    expect(issues.some((issue) => /end date is before/.test(issue.message))).toBe(true);
  });

  it('rejects an end date that has already passed', () => {
    const issues = errorsIn(scheduleIn('Africa/Lagos', { endsAt: '2026-01-01T00:00:00.000Z' }));

    expect(issues.some((issue) => /already passed/.test(issue.message))).toBe(true);
  });

  it('rejects a one-off schedule in the past', () => {
    const issues = errorsIn(
      scheduleIn('Africa/Lagos', { frequency: 'once', startsAt: '2026-01-01T00:00:00.000Z' })
    );

    expect(issues.some((issue) => /already passed/.test(issue.message))).toBe(true);
  });

  it('rejects a weekly schedule with no days', () => {
    const issues = errorsIn(scheduleIn('Africa/Lagos', { frequency: 'weekly', daysOfWeek: [] }));

    expect(issues.some((issue) => /at least one day/.test(issue.message))).toBe(true);
  });

  it('rejects an invalid day of the month', () => {
    const issues = errorsIn(
      scheduleIn('Africa/Lagos', { frequency: 'monthly', dayOfMonth: 45 })
    );

    expect(issues.some((issue) => /between 1 and 31/.test(issue.message))).toBe(true);
  });

  it('rejects an invalid time of day', () => {
    const issues = errorsIn(scheduleIn('Africa/Lagos', { hour: 25, minute: 0 }));

    expect(issues.some((issue) => /time of day is not valid/.test(issue.message))).toBe(true);
  });

  it('rejects a missing timezone', () => {
    const issues = errorsIn({
      ...defaultSchedule('daily'),
      timezone: { mode: 'event', ianaId: null, label: '', isExact: false },
    });

    expect(issues.some((issue) => /which timezone/.test(issue.message))).toBe(true);
  });

  it('rejects an event-relative schedule with no offset', () => {
    const issues = errorsIn(
      scheduleIn('Africa/Lagos', { frequency: 'eventRelative', eventOffset: null })
    );

    expect(issues.some((issue) => /how far before/.test(issue.message))).toBe(true);
  });

  it('rejects a maximum-execution count below one', () => {
    const issues = errorsIn(scheduleIn('Africa/Lagos', { maxExecutions: 0 }));

    expect(issues.some((issue) => /at least 1/.test(issue.message))).toBe(true);
  });

  it('warns rather than blocks on the 31st of the month', () => {
    // A legitimate choice with a consequence the member should know about.
    // Blocking would be the UI overruling a decision that is theirs.
    const schedule = scheduleIn('Africa/Lagos', { frequency: 'monthly', dayOfMonth: 31 });

    expect(errorsIn(schedule)).toHaveLength(0);
    expect(warningsIn(schedule).some((issue) => /Not every month/.test(issue.message))).toBe(true);
  });

  it('warns rather than blocks on an unresolvable timezone', () => {
    const schedule: AutomationSchedule = {
      ...defaultSchedule('daily'),
      timezone: { mode: 'userSelected', ianaId: 'Not/AZone', label: 'Not/AZone', isExact: false },
    };

    // The automation can still run — it just may not run at the minute the
    // member pictured, and saying so is the honest middle ground.
    expect(warningsIn(schedule).some((issue) => /could not confirm/.test(issue.message))).toBe(
      true
    );
  });

  it('a valid schedule produces no errors', () => {
    expect(errorsIn(scheduleIn('Africa/Lagos', { hour: 9, minute: 0 }))).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§12 · reminder offsets and their wording', () => {
  it('offers the five offsets the brief names', () => {
    const minutes = REMINDER_OFFSETS.map((offset) => offset.minutes);

    expect(minutes).toEqual([0, 60, 180, 60 * 24, 60 * 24 * 7]);
  });

  it('describes each offset in words, with correct plurals', () => {
    expect(describeOffset({ minutesBefore: 0, anchor: 'start' })).toBe('When it starts');
    expect(describeOffset({ minutesBefore: 60, anchor: 'start' })).toBe('1 hour before it starts');
    expect(describeOffset({ minutesBefore: 180, anchor: 'start' })).toBe('3 hours before it starts');
    expect(describeOffset({ minutesBefore: 60 * 24, anchor: 'start' })).toBe('1 day before it starts');
    expect(describeOffset({ minutesBefore: 60 * 24 * 7, anchor: 'start' })).toBe(
      '1 week before it starts'
    );
  });

  it('describes an end-anchored offset differently', () => {
    // A reminder at the end of a two-day festival is a real ask, and a wording
    // that said "before it starts" would be wrong.
    expect(describeOffset({ minutesBefore: 60, anchor: 'end' })).toBe('1 hour before it ends');
  });

  it('an event reminder defaults to the event’s own zone', () => {
    const schedule = defaultEventSchedule('Africa/Lagos', 'Lagos Tech Meetup');

    expect(schedule.frequency).toBe('eventRelative');
    expect(schedule.timezone.mode).toBe('event');
    expect(schedule.timezone.ianaId).toBe('Africa/Lagos');
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§63 · schedules are described without hardcoded assumptions', () => {
  it('describes each frequency in words', () => {
    expect(describeSchedule(scheduleIn('Africa/Lagos', { frequency: 'once' }))).toMatch(/Once/);
    expect(describeSchedule(scheduleIn('Africa/Lagos', { frequency: 'daily' }))).toMatch(
      /Every day/
    );
    expect(
      describeSchedule(scheduleIn('Africa/Lagos', { frequency: 'weekly', daysOfWeek: [1, 3] }))
    ).toMatch(/Monday, and Wednesday|Monday and Wednesday/);
    expect(
      describeSchedule(scheduleIn('Africa/Lagos', { frequency: 'monthly', dayOfMonth: 15 }))
    ).toMatch(/day 15/);
  });

  it('pads the time so 09:05 does not read as 9:5', () => {
    expect(describeSchedule(scheduleIn('Africa/Lagos', { hour: 9, minute: 5 }))).toContain('09:05');
  });

  it('a custom schedule is described from what the member wrote', () => {
    expect(
      describeSchedule(
        scheduleIn('Africa/Lagos', {
          frequency: 'custom',
          customDescription: 'Every other Tuesday',
        })
      )
    ).toBe('Every other Tuesday');
  });
});
