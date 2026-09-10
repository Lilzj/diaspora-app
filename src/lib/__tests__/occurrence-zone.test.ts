// ─────────────────────────────────────────────────────────────────────────────
// An occurrence is shown at the time it happens
//
// Seen on the device. A clinic set for 18:00 in Port Louis rendered on the
// series screen as "Sep 17, 2026 at 14:00" — the UTC instant, four hours out,
// on the one screen whose whole purpose is a repeating local time.
//
// `splitInstant` slices the ISO string, so it returns the UTC wall clock and
// calls it the time. The zone was on the wire and was being carried into the
// model unused: `toOccurrence` set `timezone: wire.timeZoneId` and then
// formatted without it.
//
// Worse than four hours out: `date` came from the server's own `localDate` and
// `time` from the UTC slice, so the two halves of one row were computed in
// different zones and disagreed with each other near midnight.
// ─────────────────────────────────────────────────────────────────────────────

import { partsInZone } from '../event-wire';

describe('the parts of an instant in a named zone', () => {
  it('shows a Mauritius evening as an evening', () => {
    // 18:00 Indian/Mauritius is 14:00Z. The organiser said six; six is what a
    // reader must see, wherever they are reading from.
    expect(partsInZone('2026-09-17T14:00:00Z', 'Indian/Mauritius')).toEqual({
      date: '2026-09-17',
      time: '18:00',
    });
  });

  it('shows a Lagos evening as an evening', () => {
    expect(partsInZone('2026-09-17T18:00:00Z', 'Africa/Lagos')).toEqual({
      date: '2026-09-17',
      time: '19:00',
    });
  });

  it('keeps a late occurrence on its own day', () => {
    // 23:30 in Lagos is 22:30Z the same day, but the point is the general one:
    // a date read in the wrong zone names the wrong day, and "moved from" rows
    // are dates.
    expect(partsInZone('2026-09-17T22:30:00Z', 'Africa/Lagos')).toEqual({
      date: '2026-09-17',
      time: '23:30',
    });
  });

  it('rolls the date when the zone is far enough east', () => {
    // 23:00Z is the following morning in Mauritius. Slicing the ISO string
    // would have named the 17th.
    expect(partsInZone('2026-09-17T23:00:00Z', 'Indian/Mauritius')).toEqual({
      date: '2026-09-18',
      time: '03:00',
    });
  });

  it('rolls the other way when the zone is west', () => {
    expect(partsInZone('2026-09-17T02:00:00Z', 'America/New_York')).toEqual({
      date: '2026-09-16',
      time: '22:00',
    });
  });

  it('answers nothing rather than a wrong instant for an unreadable one', () => {
    expect(partsInZone('not a date', 'Indian/Mauritius')).toBeNull();
  });

  it('falls back to the reader\'s own zone rather than failing on an unknown one', () => {
    // Not UTC — the reader's device zone, because `zoneIsUsable` refusing the
    // name drops the `timeZone` option and `Intl` then uses the runtime's. A
    // time in the wrong zone still beats a blank row, and this is the only
    // wrong zone available once the named one is unresolvable.
    //
    // Asserted as a shape rather than a value: the answer depends on where the
    // machine running this test is, and pinning a number here would make the
    // suite fail on a colleague's laptop for no defect.
    const parts = partsInZone('2026-09-17T14:00:00Z', 'Mars/Olympus_Mons');

    expect(parts).not.toBeNull();
    expect(parts?.time).toMatch(/^\d{2}:\d{2}$/);
    expect(parts?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('the mapper uses it', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };

  const api = fs
    .readFileSync(path.join(process.cwd(), 'src', 'lib', 'community-programme-api.ts'), 'utf8')
    .replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), ' ')
    .replace(new RegExp('//[^\\n]*', 'g'), ' ');

  it('formats an occurrence in the zone the wire named', () => {
    expect(api).toMatch(/const zone = wire\.timeZoneId \?\? 'UTC';/);
    expect(api).toMatch(/partsInZone\(wire\.startsAt, zone\)/);
    expect(api).toMatch(/partsInZone\(wire\.endsAt, zone\)/);
  });

  it('does not take an occurrence time straight off the ISO string', () => {
    expect(api).not.toMatch(/const start = splitInstant\(wire\.startsAt\);\s+const end = splitInstant\(wire\.endsAt\);\s+return \{\s+occurrenceId/);
  });

  it('reads the moved-from date in that zone too', () => {
    expect(api).toMatch(/partsInZone\(wire\.originalStartsAt, zone\)/);
  });
});
