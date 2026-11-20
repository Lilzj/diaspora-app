// ─────────────────────────────────────────────────────────────────────────────
// The organisation profile reads fields the route actually sends
//
// ── The crash ────────────────────────────────────────────────────────────────
//
// `OrgProfileScreen` rendered `org.openingHours.map(...)` with no guard. The
// route serves `operatingHours`, and has never served anything called
// `openingHours` — so the value was always `undefined` and **every organisation
// profile crashed the entire application on open**:
//
//     TypeError: Cannot read property 'map' of undefined
//         at OrgProfileScreen
//
// Found by opening one on a device on 22 Aug 2026. The About tab renders
// unconditionally, so this did not depend on the organisation having any data.
//
// ── The silent half ──────────────────────────────────────────────────────────
//
// `org.gallery` does not exist either — the route calls it `media` — but that
// one *was* guarded, so instead of crashing it showed the "no photos" empty
// state for every organisation, including ones that had published photos. The
// crash was found in a minute; this had been invisible.
//
// ── Why a rename would not have been enough ──────────────────────────────────
//
// Neither field is only misnamed. `OperatingHourResponse` sends
// `{ id, day, opensAt, closesAt, isClosed, note }` and the screen wanted a
// ready-made `hours` string; `MediaReferenceResponse` sends
// `{ mediaId, role, order, caption }` and the screen wanted a URL. Renaming
// alone would have rendered a column of blanks and a grid of broken images —
// which is why this asserts on the rendered values, not on the field names.
// ─────────────────────────────────────────────────────────────────────────────

// `tsconfig` declares only jest's types, so these come in the way
// `suppression-ceilings.test.ts` brings them in.
declare const __dirname: string;
const { readFileSync }: { readFileSync(p: string, e: string): string } = require('fs');
const { join }: { join(...parts: string[]): string } = require('path');

import { eventWhen, mediaUri, openingHoursLabel } from '../[id]';
import { API_BASE_URL } from '@/lib/transport/apiClient';

describe('an opening-hours row becomes a sentence', () => {
  it('renders a range when the day has both ends', () => {
    expect(openingHoursLabel({ opensAt: '09:00', closesAt: '17:30', isClosed: false })).toBe(
      '09:00 – 17:30',
    );
  });

  it('says Closed rather than an empty range', () => {
    expect(openingHoursLabel({ opensAt: null, closesAt: null, isClosed: true })).toBe('Closed');
  });

  it('prefers the note the organisation wrote', () => {
    // "By arrangement" is more use than a time range they qualified for a
    // reason, so the note wins even over a populated range.
    expect(
      openingHoursLabel({ opensAt: '09:00', closesAt: '17:00', isClosed: false, note: 'By arrangement' }),
    ).toBe('By arrangement');
  });

  it('does not render a half-open range', () => {
    // The old shape would have produced "09:00 – " here.
    expect(openingHoursLabel({ opensAt: '09:00', closesAt: null, isClosed: false })).toBe(
      'Hours not published',
    );
  });

  it('survives a row with nothing on it', () => {
    expect(openingHoursLabel({})).toBe('Hours not published');
  });

  it('ignores a note that is only whitespace', () => {
    expect(openingHoursLabel({ isClosed: true, note: '   ' })).toBe('Closed');
  });
});

describe('an image comes from the media id the route sends', () => {
  // A real media identifier. The fixture here used to be `'abc-123'`, which no
  // media id has ever looked like: `MediaReferenceResponse.mediaId` is a C#
  // `Guid`. It passed because the screen interpolated whatever it was given
  // straight into a URL.
  //
  // Since FSOLID-002 this delegates to `mediaImageUrl`, which checks the shape
  // and answers null for anything that is not an identifier — so the fixture
  // had to become a realistic one, and the looser case below is now an
  // assertion in its own right rather than an accident.
  const MEDIA_ID = '6f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d';

  it('builds the address the platform serves the bytes from', () => {
    expect(mediaUri(MEDIA_ID)).toBe(`${API_BASE_URL}/media/${MEDIA_ID}/content`);
  });

  it('returns undefined rather than a URL containing "undefined"', () => {
    // `coverMediaId` and `logoMediaId` are both nullable and both were null on
    // the organisation this was found on. A string with `undefined` in it is a
    // request that 404s on every render; `undefined` is nothing to load.
    expect(mediaUri(null)).toBeUndefined();
    expect(mediaUri(undefined)).toBeUndefined();
    expect(mediaUri('')).toBeUndefined();
  });

  it('refuses a value that is not a media identifier', () => {
    // The guarantee the old version did not have. A caption, a filename or a
    // half-built address used to become `/media/<that>/content` and 404 on
    // every render; there is now nothing to load instead.
    expect(mediaUri('abc-123')).toBeUndefined();
    expect(mediaUri('cover.png')).toBeUndefined();
    expect(mediaUri('   ')).toBeUndefined();
  });
});

describe('an event row shows when it starts', () => {
  // ── What this section used to claim ───────────────────────────────────────
  //
  // That the list route serves `startsAt`, `categoryKey`, `eventId` and a
  // `location` whose readable form is `displayName`, and that reading `date`,
  // `category`, `id` and `location.areaName` was the bug.
  //
  // It is the other way round. `fetchEvents` maps every row through `toEvent`
  // — `community-life-api.ts` says why, in the same words, about the same
  // symptom — so `page.items` are client `Event`s and the wire names are gone
  // by the time this screen sees them. The card had been fixed in the opposite
  // direction, so the date and category rendered blank and every row navigated
  // to `/community-life/event/undefined`.
  //
  // Both halves of that contradiction were invisible because `orgEvents` was
  // `useState<any[]>` (FSOLID-006). The two tests below only ever exercised
  // `eventWhen` as a formatter, so they passed whichever field was handed to
  // it; the third is the one that would have failed.
  it('formats the instant the route sends', () => {
    expect(eventWhen('2026-09-05T11:29:35.666+00:00')).toMatch(/2026/);
  });

  it('formats the date-only form a mapped Event carries', () => {
    // `Event.date` is `YYYY-MM-DD`, which is what the card now passes.
    expect(eventWhen('2026-09-05')).toMatch(/2026/);
  });

  it('reads the mapped Event, not the wire row', () => {
    const screen = readFileSync(
      join(__dirname, '..', '[id].tsx'),
      'utf8'
    );

    // The block between the Events tab and its empty state.
    const card = screen.slice(
      screen.indexOf('{/* EVENTS TAB */}'),
      screen.indexOf('{/* EVENTS TAB */}') + 2000
    );

    expect(card).toContain('key={evt.id}');
    expect(card).toContain('event/${evt.id}');
    expect(card).toContain('{evt.category}');
    expect(card).toContain('eventWhen(evt.date)');
    expect(card).toContain('evt.location?.areaName');

    // And none of the wire names, which is the half a rename would miss.
    for (const wire of ['evt.eventId', 'evt.categoryKey', 'evt.startsAt', 'evt.location?.displayName']) {
      expect(card).not.toContain(wire);
    }
  });

  it('renders nothing rather than "Invalid Date"', () => {
    // The only thing worse than a blank where a date should be.
    expect(eventWhen('not a date')).toBe('');
    expect(eventWhen(null)).toBe('');
    expect(eventWhen(undefined)).toBe('');
  });
});
