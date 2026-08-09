// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Calendar capability (Frontend Phase 16, §7 · §8 · §62)
//
// §62 is the section this file exists for, and it is the one place in this
// phase where a bug would be invisible, plausible, and wrong in the real world.
//
// A Diaspora event carries a wall clock and an IANA zone — 18:00,
// `Africa/Lagos`. A calendar needs an absolute instant. The naive conversion,
// `new Date('2026-09-01T18:00')`, parses in the *device's* zone, so a member in
// London gets a calendar entry an hour before the event starts. Nothing errors.
// Nothing looks wrong. They arrive early.
//
// So the assertions below are about real instants, checked against
// independently-known offsets rather than against the implementation's own
// arithmetic:
//
//   Africa/Lagos  UTC+1 all year — no DST, so it isolates the base conversion
//   Europe/London UTC+0 in winter, UTC+1 in summer — isolates the DST handling
//   America/New_York  UTC−5 / UTC−4 — isolates the sign
//
// The DST-boundary cases are included because the two-pass algorithm exists for
// them specifically, and a single-pass implementation passes every other test
// in this file.
// ─────────────────────────────────────────────────────────────────────────────

import { convertToInstant, eventToDraft, DEFAULT_CALENDAR_SETTINGS } from '@/lib/integrations/calendar';
import type { Event } from '@/types/community-life';

function event(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-1',
    title: 'Community meeting',
    description: 'A meeting.',
    coverImage: '',
    gallery: [],
    category: 'Other' as Event['category'],
    date: '2026-09-01',
    time: '18:00',
    endTime: '20:00',
    timezone: 'Africa/Lagos',
    location: {
      cityName: 'Lagos',
      areaName: 'Ikeja',
      addressLine: '1 Example Road',
    },
    host: { id: 'h1', name: 'Host', type: 'Organization', isVerified: true },
    rsvpStatus: null,
    viewCount: 0,
    shareCount: 0,
    saveCount: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('§62 · a wall clock in a named zone becomes the right instant', () => {
  it('converts a zone with no daylight saving', () => {
    // Lagos is UTC+1 all year. 18:00 WAT is 17:00 UTC.
    const { instant, isExact } = convertToInstant(
      { year: 2026, month: 9, day: 1, hour: 18, minute: 0 },
      'Africa/Lagos'
    );

    expect(isExact).toBe(true);
    expect(instant.toISOString()).toBe('2026-09-01T17:00:00.000Z');
  });

  it('converts a northern-summer date in a DST zone', () => {
    // 1 September 2026 is BST, UTC+1. 18:00 London is 17:00 UTC.
    const { instant } = convertToInstant(
      { year: 2026, month: 9, day: 1, hour: 18, minute: 0 },
      'Europe/London'
    );
    expect(instant.toISOString()).toBe('2026-09-01T17:00:00.000Z');
  });

  it('converts a northern-winter date in the same zone', () => {
    // 1 January 2026 is GMT, UTC+0. 18:00 London is 18:00 UTC. A one-pass
    // implementation that cached an offset would get one of these two wrong.
    const { instant } = convertToInstant(
      { year: 2026, month: 1, day: 1, hour: 18, minute: 0 },
      'Europe/London'
    );
    expect(instant.toISOString()).toBe('2026-01-01T18:00:00.000Z');
  });

  it('gets the sign right for a zone behind UTC', () => {
    // New York on 1 September 2026 is EDT, UTC−4. 18:00 is 22:00 UTC.
    const { instant } = convertToInstant(
      { year: 2026, month: 9, day: 1, hour: 18, minute: 0 },
      'America/New_York'
    );
    expect(instant.toISOString()).toBe('2026-09-01T22:00:00.000Z');
  });

  it('handles the hour after a spring-forward transition', () => {
    // London springs forward at 01:00 GMT on 29 March 2026. 03:00 local that
    // day is BST, UTC+1, so 02:00 UTC. The two-pass algorithm is what gets this
    // right — a first pass that guessed GMT would return 03:00 UTC.
    const { instant } = convertToInstant(
      { year: 2026, month: 3, day: 29, hour: 3, minute: 0 },
      'Europe/London'
    );
    expect(instant.toISOString()).toBe('2026-03-29T02:00:00.000Z');
  });

  it('handles the hour before an autumn-back transition', () => {
    // London falls back at 02:00 BST on 25 October 2026. 00:30 local is still
    // BST, UTC+1, so 23:30 UTC on the 24th.
    const { instant } = convertToInstant(
      { year: 2026, month: 10, day: 25, hour: 0, minute: 30 },
      'Europe/London'
    );
    expect(instant.toISOString()).toBe('2026-10-24T23:30:00.000Z');
  });

  it('reports inexactness rather than guessing when the zone is unknown', () => {
    // A runtime with trimmed ICU, or a zone it does not know. The conversion
    // still returns something usable — the alternative is refusing to export —
    // and says it could not be confirmed, so the sheet can warn. A silent
    // one-hour error is what §62 is about; a visible caveat is not.
    const { isExact } = convertToInstant(
      { year: 2026, month: 9, day: 1, hour: 18, minute: 0 },
      'Not/AZone'
    );
    expect(isExact).toBe(false);
  });
});

describe('§62 · an event keeps its own timezone by default', () => {
  it('carries the event’s zone into the draft', () => {
    const { draft } = eventToDraft(event());

    // The field whose omission is §62's exact prohibition.
    expect(draft.timeZone).toBe('Africa/Lagos');
    expect(draft.startsAt).toBe('2026-09-01T17:00:00.000Z');
    expect(draft.endsAt).toBe('2026-09-01T19:00:00.000Z');
  });

  it('the default setting is the event’s zone, not the device’s', () => {
    // §62's rule as the default rather than as an option somebody has to find.
    expect(DEFAULT_CALENDAR_SETTINGS.timeZoneBehaviour).toBe('eventTimeZone');
  });

  it('converts to the device zone only when explicitly asked', () => {
    const { draft } = eventToDraft(event(), { timeZoneBehaviour: 'deviceTimeZone' });
    expect(draft.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('§7 · a Diaspora event becomes a calendar draft', () => {
  it('treats an end time before the start as running past midnight', () => {
    // A 22:00–01:00 community event is ordinary. Rejecting it would make the
    // export fail for exactly the events most worth having a reminder for.
    const { draft } = eventToDraft(event({ time: '22:00', endTime: '01:00' }));

    expect(new Date(draft.endsAt).getTime()).toBeGreaterThan(new Date(draft.startsAt).getTime());
    expect(new Date(draft.endsAt).getTime() - new Date(draft.startsAt).getTime()).toBe(
      3 * 60 * 60 * 1000
    );
  });

  it('defaults to an hour when the event has no end time', () => {
    const { draft } = eventToDraft(event({ endTime: '' }));
    expect(new Date(draft.endsAt).getTime() - new Date(draft.startsAt).getTime()).toBe(
      60 * 60 * 1000
    );
  });

  it('assembles a location a maps app can find', () => {
    const { draft } = eventToDraft(event());
    expect(draft.location).toBe('1 Example Road, Ikeja, Lagos');
  });

  it('truncates a long description rather than putting it all on a lock screen', () => {
    const { draft } = eventToDraft(event({ description: 'x'.repeat(1000) }));
    expect((draft.notes ?? '').length).toBeLessThanOrEqual(400);
  });

  it('carries the source id, so a second export can be recognised as a duplicate', () => {
    const { draft } = eventToDraft(event());
    expect(draft.sourceId).toBe('evt-1');
  });

  it('refuses an event whose time cannot be parsed rather than inventing one', () => {
    // An export at a made-up time is worse than no export: the member believes
    // they have a reminder.
    expect(() => eventToDraft(event({ date: 'not-a-date' }))).toThrow();
  });
});

describe('§8 · the settings defaults are the safe ones', () => {
  it('two-way sync is off', () => {
    // Reading a member's calendar is a far larger privacy step than writing one
    // event to it. Defaulting it on would grant, by omission, the access §37
    // says must be explicitly consented to.
    expect(DEFAULT_CALENDAR_SETTINGS.twoWaySyncEnabled).toBe(false);
  });

  it('automatic export is off', () => {
    expect(DEFAULT_CALENDAR_SETTINGS.autoExportRsvps).toBe(false);
  });

  it('a duplicate export is skipped rather than duplicated', () => {
    expect(DEFAULT_CALENDAR_SETTINGS.conflictBehaviour).toBe('skip');
  });
});
