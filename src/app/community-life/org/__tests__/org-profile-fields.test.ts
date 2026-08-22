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

import { mediaUri, openingHoursLabel } from '../[id]';
import { API_BASE_URL } from '@/lib/apiClient';

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
  it('builds the address the platform serves the bytes from', () => {
    expect(mediaUri('abc-123')).toBe(`${API_BASE_URL}/media/abc-123/content`);
  });

  it('returns undefined rather than a URL containing "undefined"', () => {
    // `coverMediaId` and `logoMediaId` are both nullable and both were null on
    // the organisation this was found on. A string with `undefined` in it is a
    // request that 404s on every render; `undefined` is nothing to load.
    expect(mediaUri(null)).toBeUndefined();
    expect(mediaUri(undefined)).toBeUndefined();
    expect(mediaUri('')).toBeUndefined();
  });
});
