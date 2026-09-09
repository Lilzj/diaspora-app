// ─────────────────────────────────────────────────────────────────────────────
// The event on the wire, and the event this application draws
//
// These assertions are written against the *platform's* shape — `eventId`,
// `schedule.startsAt`, `coverMediaId`, `viewerRsvpStatus` — because the bug
// they pin is that the client read its own shape off the wire and got
// `undefined` for almost everything that matters.
//
// The fixtures below are copied from `EventResponse` and `EventSummaryResponse`
// field by field. That is deliberate: a fixture written from the client's type
// would have passed against the broken code, which is exactly how this survived
// a green suite for as long as it did.
// ─────────────────────────────────────────────────────────────────────────────

import { describeEventPrice, toEvent, type EventWire } from '../event-wire';

/** `EventResponse`, as the detail route answers it. */
function detailWire(overrides: Partial<EventWire> = {}): EventWire {
  return {
    eventId: '01a083f8-a050-7465-90c6-3ba0f0adfb3e',
    title: 'Diaspora test evening',
    slug: 'diaspora-test-evening',
    categoryKey: 'social',
    categoryName: 'Social',
    summary: 'An evening to test with.',
    description: 'The long version of the evening.',
    organizationId: null,
    organizationName: null,
    organizerUserId: '0198f0aa-1111-2222-3333-444455556666',
    hostName: 'Joshua Gbogodor',
    isOrganizerVerified: true,
    schedule: {
      startsAt: '2026-09-16T14:00:00+00:00',
      endsAt: '2026-09-16T17:30:00+00:00',
      timeZoneId: 'Indian/Mauritius',
    },
    attendanceMode: 'InPerson',
    location: {
      countryCode: 'MU',
      regionName: 'Port Louis District',
      cityName: 'Port Louis',
      neighborhoodName: 'Caudan',
      displayName: 'Caudan, Port Louis',
    },
    venue: { name: 'Caudan Waterfront', landmark: 'By the marina' },
    isFree: true,
    viewerRsvpStatus: null,
    viewCount: 3,
    createdAt: '2026-09-07T09:00:00+00:00',
    ...overrides,
  };
}

/** `EventSummaryResponse`, as every list answers it: flat, and thinner. */
function summaryWire(overrides: Partial<EventWire> = {}): EventWire {
  return {
    eventId: '01a083f8-a050-7465-90c6-3ba0f0adfb3e',
    title: 'Diaspora test evening',
    slug: 'diaspora-test-evening',
    categoryKey: 'social',
    summary: 'An evening to test with.',
    organizationId: null,
    organizationName: null,
    startsAt: '2026-09-16T14:00:00+00:00',
    endsAt: '2026-09-16T17:30:00+00:00',
    timeZoneId: 'Indian/Mauritius',
    attendanceMode: 'InPerson',
    venueName: 'Caudan Waterfront',
    location: {
      countryCode: 'MU',
      cityName: 'Port Louis',
      neighborhoodName: 'Caudan',
      displayName: 'Caudan, Port Louis',
    },
    isFree: true,
    isOrganizerVerified: true,
    ...overrides,
  };
}

describe('the id', () => {
  it('reads eventId, which is what the platform calls it', () => {
    // **The assertion that matters most.** `id` was undefined on every card, so
    // every tap opened `/community-life/event/undefined` — a dead screen the
    // list offered on all of its rows at once.
    expect(toEvent(detailWire()).id).toBe('01a083f8-a050-7465-90c6-3ba0f0adfb3e');
    expect(toEvent(summaryWire()).id).toBe('01a083f8-a050-7465-90c6-3ba0f0adfb3e');
  });

  it('is never the string undefined', () => {
    expect(toEvent({}).id).toBe('');
  });
});

describe('the date and the time', () => {
  it('reads the nested schedule the detail route sends', () => {
    const event = toEvent(detailWire());

    // 14:00 UTC in Mauritius (UTC+4) is 18:00, which is the time the organiser
    // typed and the time a person turns up.
    expect(event.date).toBe('2026-09-16');
    expect(event.time).toBe('18:00');
    expect(event.endTime).toBe('21:30');
    expect(event.timezone).toBe('Indian/Mauritius');
  });

  it('reads the flat schedule a list summary sends', () => {
    const event = toEvent(summaryWire());

    expect(event.date).toBe('2026-09-16');
    expect(event.time).toBe('18:00');
  });

  it('renders the event in its own zone, not where the reader is', () => {
    // The point of `timeZoneId` being on the wire at all. A Lagos event is at
    // its Lagos time however far away the person reading it is.
    const event = toEvent(detailWire({
      schedule: {
        startsAt: '2026-09-16T23:30:00+00:00',
        endsAt: '2026-09-17T01:00:00+00:00',
        timeZoneId: 'Africa/Lagos',
      },
    }));

    expect(event.date).toBe('2026-09-17');
    expect(event.time).toBe('00:30');
  });

  it('writes midnight as 00 rather than 24', () => {
    const event = toEvent(detailWire({
      schedule: {
        startsAt: '2026-09-16T00:00:00+00:00',
        endsAt: '2026-09-16T02:00:00+00:00',
        timeZoneId: 'UTC',
      },
    }));

    // `en-GB` says 24:00 for midnight, which reads as an hour that does not
    // exist.
    expect(event.time).toBe('00:00');
  });

  it('falls back rather than throwing on a zone this runtime does not know', () => {
    const event = toEvent(detailWire({
      schedule: {
        startsAt: '2026-09-16T14:00:00+00:00',
        endsAt: '2026-09-16T17:30:00+00:00',
        timeZoneId: 'Mars/Olympus_Mons',
      },
    }));

    // A time in the reader's zone still beats a screen that crashed, and a
    // crash is what an unguarded `timeZone` option produces.
    expect(event.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(event.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it('answers empty for an event with no schedule at all', () => {
    expect(toEvent({ eventId: 'e1' }).date).toBe('');
    expect(toEvent({ eventId: 'e1' }).time).toBe('');
  });

  it('answers empty rather than Invalid Date for a schedule it cannot parse', () => {
    const event = toEvent(detailWire({
      schedule: { startsAt: 'not a date', endsAt: '', timeZoneId: 'UTC' },
    }));

    expect(event.date).toBe('');
  });
});

describe('the description', () => {
  it('prefers the long description the detail route sends', () => {
    expect(toEvent(detailWire()).description).toBe('The long version of the evening.');
  });

  it('falls back to the summary a list sends, which is all it has', () => {
    expect(toEvent(summaryWire()).description).toBe('An evening to test with.');
  });
});

describe('the pictures', () => {
  it('turns a media id into somewhere the bytes actually are', () => {
    const event = toEvent(detailWire({ coverMediaId: 'abc-123' }));

    expect(event.coverImage).toContain('/media/abc-123/content');
  });

  it('does not build a url with undefined in it', () => {
    // The failure mode this replaces: `/media/undefined/content`, a request
    // that 404s on every single render.
    expect(toEvent(detailWire({ coverMediaId: null })).coverImage).toBe('');
    expect(toEvent(detailWire()).coverImage).toBe('');
  });

  it('orders the gallery the way the platform ordered it', () => {
    const event = toEvent(detailWire({
      media: [
        { mediaId: 'third', order: 3 },
        { mediaId: 'first', order: 1 },
        { mediaId: 'second', order: 2 },
      ],
    }));

    expect(event.gallery).toEqual([
      expect.stringContaining('first'),
      expect.stringContaining('second'),
      expect.stringContaining('third'),
    ]);
  });

  it('leads the gallery with the cover and does not repeat it', () => {
    const event = toEvent(detailWire({
      coverMediaId: 'cover',
      media: [{ mediaId: 'cover', order: 1 }, { mediaId: 'other', order: 2 }],
    }));

    expect(event.gallery).toHaveLength(2);
    expect(event.gallery[0]).toContain('cover');
  });

  it('uses the first picture as the cover when no cover was chosen', () => {
    const event = toEvent(detailWire({ media: [{ mediaId: 'only', order: 1 }] }));

    expect(event.coverImage).toContain('only');
  });
});

describe('money', () => {
  it('says free when the platform says free', () => {
    const event = toEvent(detailWire({ isFree: true }));

    expect(event.isFree).toBe(true);
    expect(describeEventPrice(event)).toBe('FREE');
  });

  it('does not label a paid event FREE', () => {
    // **The one wrong answer that costs somebody money at the door.** The
    // platform sends no amount, so the old badge — `!event.price ? 'FREE'` —
    // called every paid event free.
    const event = toEvent(detailWire({ isFree: false }));

    expect(event.isFree).toBe(false);
    expect(describeEventPrice(event)).toBe('PAID ENTRY');
  });

  it('invents no amount, because the platform sends none', () => {
    expect(toEvent(detailWire({ isFree: false })).price).toBeUndefined();
  });

  it('still names an amount when one is genuinely known', () => {
    expect(describeEventPrice({ price: 12, currency: 'GBP', isFree: false })).toBe('£12');
  });
});

describe('the RSVP the viewer already gave', () => {
  it('reads viewerRsvpStatus, which is what the platform calls it', () => {
    expect(toEvent(detailWire({ viewerRsvpStatus: 'Going' })).rsvpStatus).toBe('Going');
  });

  it('is null when the viewer has not answered', () => {
    expect(toEvent(detailWire()).rsvpStatus).toBeNull();
  });

  it('does not flatten a waitlist place into Going', () => {
    // Somebody fourth in a queue has not got a place. This is the one screen
    // they check, so it has to say so.
    expect(toEvent(detailWire({ viewerRsvpStatus: 'Waitlisted' })).rsvpStatus).toBe('Waitlisted');
    expect(toEvent(detailWire({ viewerRsvpStatus: 'CheckedIn' })).rsvpStatus).toBe('CheckedIn');
  });

  it('drops a status this client has no vocabulary for', () => {
    expect(toEvent(detailWire({ viewerRsvpStatus: 'Teleported' })).rsvpStatus).toBeNull();
  });
});

describe('the flat host fields', () => {
  it('carries them through for the presenter to read', () => {
    const event = toEvent(detailWire());

    expect(event.hostName).toBe('Joshua Gbogodor');
    expect(event.organizerUserId).toBe('0198f0aa-1111-2222-3333-444455556666');
    expect(event.isOrganizerVerified).toBe(true);
    expect(event.organizationId).toBeNull();
  });

describe('where it is', () => {
  it('reads a neighbourhood by the name the platform gives it', () => {
    // **The wire says `neighborhoodName`; every screen reads `areaName`.** So
    // the place line on every card and in the detail header said `undefined`
    // — "where is it" being the second thing a person wants to know.
    const event = toEvent(detailWire());

    expect(event.location.areaName).toBe('Caudan');
    expect(event.location.cityName).toBe('Port Louis');
    expect(event.location.countryCode).toBe('MU');
  });

  it('does the same for a list summary', () => {
    expect(toEvent(summaryWire()).location.areaName).toBe('Caudan');
  });

  it('falls back to the platform rendering of the whole place', () => {
    // An online event, or one placed only by city, has no neighbourhood. The
    // platform already renders the place as a sentence; use it rather than
    // showing nothing.
    const event = toEvent(detailWire({
      location: { countryCode: 'MU', cityName: 'Port Louis', displayName: 'Port Louis, Mauritius' },
    }));

    expect(event.location.areaName).toBe('Port Louis, Mauritius');
  });

  it('never says undefined', () => {
    const event = toEvent({ eventId: 'e1' });

    expect(event.location.areaName).toBe('');
    expect(event.location.cityName).toBe('');
  });

  it('takes the landmark and coordinates from the venue, where they live', () => {
    // They are not on `LocationResponse` at all. Reading them off the location
    // is how they came back undefined.
    const event = toEvent(detailWire({
      venue: { name: 'Caudan Waterfront', landmark: 'By the marina', latitude: -20.16, longitude: 57.5 },
    }));

    expect(event.location.landmark).toBe('By the marina');
    expect(event.location.latitude).toBe(-20.16);
  });
});

describe('the venue', () => {
  it('reads the name the platform calls `name`, not `venueName`', () => {
    expect(toEvent(detailWire()).venueName).toBe('Caudan Waterfront');
  });

  it('reads the flat spelling a list summary uses', () => {
    expect(toEvent(summaryWire()).venueName).toBe('Caudan Waterfront');
  });

  it('is null when no venue was named', () => {
    expect(toEvent({ eventId: 'e1' }).venueName).toBeNull();
  });
});

describe('the running order', () => {
  it('gives each item a clock time, which the platform does not send', () => {
    const event = toEvent(detailWire({
      agenda: [
        { id: 'a1', title: 'Doors', startsAt: '2026-09-16T14:00:00+00:00', order: 1 },
        { id: 'a2', title: 'Welcome', startsAt: '2026-09-16T14:30:00+00:00', order: 2 },
      ],
    }));

    // In Mauritius, as the rest of the page is.
    expect(event.agenda?.[0].time).toBe('18:00');
    expect(event.agenda?.[1].time).toBe('18:30');
  });

  it('turns an offset into a time of day', () => {
    // "45 minutes in" is a real way to write a running order and the platform
    // stores it that way. A reader wants a time.
    const event = toEvent(detailWire({
      agenda: [{ id: 'a1', title: 'Speeches', startOffsetMinutes: 45, order: 1 }],
    }));

    expect(event.agenda?.[0].time).toBe('18:45');
  });

  it('wraps past midnight rather than inventing a 25th hour', () => {
    const event = toEvent(detailWire({
      agenda: [{ id: 'a1', title: 'Last dance', startOffsetMinutes: 400, order: 1 }],
    }));

    expect(event.agenda?.[0].time).toBe('00:40');
  });

  it('follows the order the organiser set', () => {
    const event = toEvent(detailWire({
      agenda: [
        { id: 'b', title: 'Second', order: 2 },
        { id: 'a', title: 'First', order: 1 },
      ],
    }));

    expect(event.agenda?.map((item) => item.title)).toEqual(['First', 'Second']);
  });

  it('says nothing rather than undefined when an item has no time at all', () => {
    const event = toEvent(detailWire({ agenda: [{ id: 'a1', title: 'Sometime', order: 1 }] }));

    expect(event.agenda?.[0].time).toBe('');
  });

  it('is an empty running order when there is none', () => {
    expect(toEvent({ eventId: 'e1' }).agenda).toEqual([]);
  });
});

describe('how to reach the organiser', () => {
  it('passes the contact through, which already lines up', () => {
    const event = toEvent(detailWire({
      contact: { phone: '+230 5555 0000', email: 'a@b.mu', whatsapp: null, website: null },
    }));

    expect(event.contact?.phone).toBe('+230 5555 0000');
    expect(event.contact?.email).toBe('a@b.mu');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
  it('does not invent a nested host object', () => {
    // The crash this whole change started from. Nothing should put a `host`
    // back on a wire event.
    expect(toEvent(detailWire()).host).toBeUndefined();
  });
});// ─────────────────────────────────────────────────────────────────────────────
// The seam itself
//
// The defect was never in a function — it was in a *cast*. `read<Event>(...)`
// told the type checker the wire already spoke the client's language, so tsc
// had nothing to complain about and the mocks agreed. Nothing but a source
// assertion can hold this seam closed.
// ─────────────────────────────────────────────────────────────────────────────

describe('the events api reads the wire shape, not the client shape', () => {
  // Comments stripped first: the file *explains* the cast it used to make, and
  // a guard that reads prose fails on the sentence describing the bug it
  // exists to prevent. Same idiom as `events-no-proximity-claim.test.ts`.
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };

  const API = fs
    .readFileSync(path.join(process.cwd(), 'src', 'lib', 'community-life-api.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('never asserts a wire response is already a client Event', () => {
    expect(API).not.toMatch(/read<Event>/);
    expect(API).not.toMatch(/readList<Event>/);
    // The writes answer the same shape. `setEventCapacity` cast it too, so the
    // id it handed back was undefined and the invalidation after an organiser
    // changed the capacity refreshed nothing.
    expect(API).not.toMatch(/write<Event>/);
  });

  it('translates both the detail read and the list read', () => {
    expect(API).toMatch(/read<EventWire>/);
    expect(API).toMatch(/readList<EventWire>/);
    expect(API).toMatch(/toEvent/);
  });
});
