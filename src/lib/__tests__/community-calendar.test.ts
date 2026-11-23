// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the Community Life calendar, read as the route sends it
// (RMD-008)
//
// **The calendar tab had never shown a platform entry.** `fetchCalendar` read
// `GET /community-life/calendar` as `CalendarEvent[]`; the route answers one
// `CommunityCalendarResponse`, a window with the entries inside it. The Events
// screen spread that object into an array, which threw inside the promise's own
// `catch`, and the tab drew only the member's own reminders.
//
// The fixtures are typed as `CommunityCalendarWire` and `CalendarEntryWire`,
// which `backend-response-field-drift` compares field by field with the
// published contract, so they carry only what the route sends.
//
// **The events are in Kolkata, on purpose.** Its half-hour offset matches
// neither UTC, where CI runs, nor West Africa, where this was written — the
// first draft used Lagos and passed here for the wrong reason, because a
// device-zone reading in Lagos also says 19:00. 18:00 UTC is 23:30 in Kolkata,
// which no device-zone or UTC reading produces by accident, and the first test
// below fails if it is ever run somewhere it would.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/transport/apiClient';
import { fetchCalendar, toCalendarEvent } from '@/lib/api/community-life-api';
import type { CalendarEntryWire, CommunityCalendarWire } from '@/types/community-life';

const VENUE_ZONE = 'Asia/Kolkata';

/** 18:00 UTC on the 5th — 23:30 at the venue. */
const EVENING = '2026-12-05T18:00:00+00:00';

/** Midnight at the venue on the 5th is 18:30 UTC on the 4th. */
const VENUE_MIDNIGHT = '2026-12-04T18:30:00+00:00';

const pad = (value: number) => String(value).padStart(2, '0');

/** The device's own wall clock for an instant, from Date's local getters — not the formatter under test. */
function deviceClock(iso: string): { date: string; time: string } {
  const local = new Date(iso);
  return {
    date: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`,
    time: `${pad(local.getHours())}:${pad(local.getMinutes())}`,
  };
}

function entry(overrides: Partial<CalendarEntryWire> & Pick<CalendarEntryWire, 'id' | 'title'>): CalendarEntryWire {
  return {
    startsAt: EVENING,
    endsAt: '2026-12-05T20:00:00+00:00',
    timeZoneId: VENUE_ZONE,
    isAllDay: false,
    // The event source's entry type is the category key, never "Event".
    entryType: 'community-meeting',
    description: null,
    countryCode: 'IN',
    eventId: null,
    sourceKey: 'community-events',
    ...overrides,
  };
}

/** A calendar as the route answers it: an object, with the entries inside. */
function calendar(entries: CalendarEntryWire[]): { data: CommunityCalendarWire } {
  return {
    data: {
      from: '2026-12-01T00:00:00+00:00',
      to: '2026-12-31T00:00:00+00:00',
      countryCode: 'IN',
      neighborhoodAreaId: null,
      entries,
      sources: ['community-events'],
    },
  };
}

const MEETING = entry({
  id: 'meeting',
  title: 'Kolkata newcomers meeting',
  eventId: '3f2b6c1e-8a1d-4c55-9a51-0f1f0b7a9e21',
});

const FESTIVAL = entry({
  id: 'festival',
  title: 'Kolkata street festival',
  startsAt: VENUE_MIDNIGHT,
  endsAt: '2026-12-05T18:30:00+00:00',
  isAllDay: true,
  eventId: '0c7d3b9a-5e8f-4f21-8d2c-6b4a1e9f3c70',
});

describe('the zone these tests depend on', () => {
  it('is not the zone they run in, or they could not tell the two apart', () => {
    // If this fails, the device is in the venue's zone and the venue-time
    // assertions below would pass whether or not the venue's zone was used.
    expect(deviceClock(EVENING).time).not.toBe('23:30');
    expect(deviceClock(VENUE_MIDNIGHT).date).not.toBe('2026-12-05');
  });
});

describe('fetchCalendar — RMD-008', () => {
  let mock: MockAdapter;
  const asked: Record<string, unknown>[] = [];

  beforeAll(() => {
    mock = new MockAdapter(apiClient, { delayResponse: 0 });
    mock.onGet(/\/community-life\/calendar$/).reply((config) => {
      asked.push(config.params ?? {});
      return [200, calendar([MEETING, FESTIVAL])];
    });
    mock.onAny().reply(404);
  });

  afterAll(() => {
    mock.restore();
  });

  it('reads the entries out of the calendar, rather than taking the calendar for them', async () => {
    const events = await fetchCalendar({ countryCode: 'IN' });

    expect(Array.isArray(events)).toBe(true);
    expect(events.map((event) => event.id)).toEqual(['meeting', 'festival']);
    expect(asked[asked.length - 1]).toMatchObject({ countryCode: 'IN' });
  });

  it('can be spread beside the reminders, which is the line that threw', async () => {
    const events = await fetchCalendar({ countryCode: 'IN' });
    const reminders = [{ id: 'r1', title: 'Call home', date: '2026-12-05', type: 'Reminder' as const }];

    const merged = [...events, ...reminders];

    expect(merged.map((item) => item.id)).toEqual(['meeting', 'festival', 'r1']);
  });
});

describe('toCalendarEvent — one row as the screen draws it', () => {
  it("puts an event at its venue's time, the time its own page shows", () => {
    expect(toCalendarEvent(MEETING)).toEqual({
      id: 'meeting',
      title: 'Kolkata newcomers meeting',
      date: '2026-12-05',
      time: '23:30',
      type: 'Event',
      associatedId: MEETING.eventId,
    });
  });

  it('keeps an all-day entry on its own day, not the day it starts on anywhere else', () => {
    const event = toCalendarEvent(FESTIVAL);

    expect(event?.date).toBe('2026-12-05');
    expect(event?.time).toBeUndefined();
  });

  it('opens an entry only when it is one of the platform events', () => {
    const observance = toCalendarEvent(
      entry({ id: 'diwali', title: 'Diwali', entryType: 'public-holiday', isAllDay: true, sourceKey: 'holidays' })
    );

    // Not an event, so the screen must not route a tap to /community-life/event/undefined.
    expect(observance?.type).toBe('Holiday');
    expect(observance?.associatedId).toBeUndefined();
  });

  it("falls back to the device's clock only when a source names no zone", () => {
    const event = toCalendarEvent(entry({ id: 'zoneless', title: 'A zoneless row', timeZoneId: null }));

    expect(event?.date).toBe(deviceClock(EVENING).date);
    expect(event?.time).toBe(deviceClock(EVENING).time);
  });

  it('drops a row whose instant does not parse, rather than drawing it on no day', () => {
    expect(toCalendarEvent(entry({ id: 'broken', title: 'Broken', startsAt: 'not a date' }))).toBeNull();
  });
});
