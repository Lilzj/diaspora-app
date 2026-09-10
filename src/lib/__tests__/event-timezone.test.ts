// ─────────────────────────────────────────────────────────────────────────────
// Which clock an event is on
//
// The create form takes the event's timezone from the **device** and its
// country from the member's **residence**. Two different questions, and when
// they disagree nothing said so.
//
// It happened on the first event this platform ever published: created in Port
// Louis, on a handset set to `Africa/Lagos`, stored as 18:00 Lagos — 21:00
// where the event actually is. Every reminder and calendar export counts from
// the wrong instant, and the screen renders the stored zone faithfully, so it
// looks right.
// ─────────────────────────────────────────────────────────────────────────────

import {
  deviceTimeZone,
  isKnownTimeZone,
  knownTimeZones,
  suggestTimeZones,
} from '../event-timezone';

describe('validating a typed zone', () => {
  it('accepts an identifier this runtime knows', () => {
    expect(isKnownTimeZone('Indian/Mauritius')).toBe(true);
    expect(isKnownTimeZone('Africa/Lagos')).toBe(true);
    expect(isKnownTimeZone('UTC')).toBe(true);
  });

  it('refuses one it does not', () => {
    // A name that cannot be resolved would be stored and then silently ignored
    // by every reader of it, which is the failure this check exists to stop.
    expect(isKnownTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isKnownTimeZone('Port Louis')).toBe(false);
  });

  it('refuses nothing at all', () => {
    expect(isKnownTimeZone('')).toBe(false);
    expect(isKnownTimeZone('   ')).toBe(false);
  });
});

describe('the device zone', () => {
  it('answers something usable rather than throwing', () => {
    const zone = deviceTimeZone();

    expect(typeof zone).toBe('string');
    expect(zone.length).toBeGreaterThan(0);
    expect(isKnownTimeZone(zone)).toBe(true);
  });
});

describe('suggesting zones for a place', () => {
  it('matches a city against the zone that names it', () => {
    // An IANA name encodes a city, not a country — `Indian/Mauritius` names
    // the island. So the match is on the city segment, and it is a shortlist
    // to choose from rather than an answer.
    const zones = knownTimeZones();

    if (zones.length === 0) {
      // This runtime will not enumerate them. The form lets the organiser type
      // instead, and pretending otherwise is what this returns nothing for.
      expect(suggestTimeZones('MU', 'Port Louis')).toEqual([]);
      return;
    }

    expect(suggestTimeZones('NG', 'Lagos')).toContain('Africa/Lagos');
  });

  it('suggests nothing rather than guessing when there is no city', () => {
    expect(suggestTimeZones('MU', '')).toEqual([]);
    expect(suggestTimeZones('MU', undefined)).toEqual([]);
  });

  it('suggests nothing for a city no zone is named after', () => {
    // Most cities are not in a zone name. Offering a wrong zone is worse than
    // offering none, because a chosen zone reads as a confirmed one.
    expect(suggestTimeZones('MU', 'Curepipe')).toEqual([]);
  });
});
