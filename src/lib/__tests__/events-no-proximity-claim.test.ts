// ─────────────────────────────────────────────────────────────────────────────
// The events screen never claims a proximity it cannot measure.
//
// Captured on a release APK, 1 Sep 2026. A few hundred pixels apart, the same
// screen said both of these:
//
//     DIASPORA CANNOT FILTER EVENTS BY
//     Nearby · Distance radius · Recommended · AI recommendations · Popular ·
//     Recently added. The event search narrows by words, category, city and
//     date. Distance is not one of the questions it can be asked, so those
//     controls were removed rather than left to look as though they worked.
//
//     No events nearby
//     Be the first to create an event, or expand your filter range!
//
// The empty state pointed at a filter range that the screen itself had just
// finished explaining does not exist, and called a city-scoped search a
// proximity one. `UNSUPPORTED_EVENT_BROWSE_FILTERS` was right and the empty
// state had never been re-read.
//
// ── The larger half ──────────────────────────────────────────────────────────
//
// Every event card also rendered `{areaName} ({distanceKm} km away)`, and the
// detail screen rendered `· {distanceKm} km away`. `EventLocation.distanceKm` is
// optional and the events mapper in `community-life-api.ts` never sets it — the
// screen's own comment says it "is only ever populated when the server resolved
// a geographic centre, which a browse never does". Confirmed against the served
// contract: no response schema publishes a distance at all; the single match for
// "distance" is `UpdateGeographicPreferencesRequest.searchRadiusKm`, which is a
// preference a member sets, not a measurement.
//
// So every card on a live screen read `Peckham ( km away)`.
//
// The rule: this feature may narrow by city, words, category and date, and may
// say so. It may not offer a range, and it may not put a distance on screen
// until something on the wire carries one.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

/** A file's code with its comments removed. See `password-auth.test.ts`. */
function read(...segments: string[]): string {
  return fs
    .readFileSync(path.join(process.cwd(), ...segments), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .filter((line: string) => !/^\s*(\/\/|\*|\{\/\*)/.test(line))
    .join(String.fromCharCode(10));
}

const EVENTS = read('src', 'app', 'community-life', 'events.tsx');
const DETAIL = read('src', 'app', 'community-life', 'event', '[id].tsx');
const API = read('src', 'lib', 'community-life-api.ts');

describe('the events screen offers no filter range', () => {
  it('never tells a member to expand one', () => {
    // There is no range control. The radius filter was removed because it
    // compared an always-undefined distance as 999 and emptied every list.
    expect(EVENTS).not.toMatch(/expand your filter range/i);
    expect(EVENTS).not.toMatch(/widen your (search )?radius/i);
  });

  it('does not call a city-scoped result "nearby"', () => {
    // The search narrowed by city. Calling that proximity is the same untruth
    // the notice above it exists to correct.
    expect(EVENTS).not.toMatch(/title="No events nearby"/);
  });
});

describe('no distance is put on screen', () => {
  it('the event card shows where an event is, not how far away it is', () => {
    expect(EVENTS).not.toMatch(/km away/);
    expect(EVENTS).not.toMatch(/location\.distanceKm/);
  });

  it('the event detail screen does not either', () => {
    // The header line that read `areaName, cityName · {distanceKm} km away`.
    expect(DETAIL).not.toMatch(/cityName\} · \{event\.location\.distanceKm\}/);
    expect(DETAIL).not.toMatch(/event\.location\.distanceKm\} km away/);
  });

  it('the card still says where the event is', () => {
    // The direction that matters: removing the false half must not remove the
    // useful half. A card with no place on it is worse than one with a wrong
    // distance, because a member cannot tell whether they can get there.
    // Optional chaining allowed: the card reads `item.location?.areaName`, and
    // pinning the exact punctuation would fail a change that kept the place and
    // only stopped assuming the object was there.
    expect(EVENTS).toMatch(/item\.location\??\.areaName/);
    expect(EVENTS).toMatch(/item\.location\??\.cityName/);
  });
});

describe('the empty state describes the search that was actually run', () => {
  it('is built from the filters that were applied', () => {
    expect(EVENTS).toMatch(/function describeEmptyEventSearch/);
    expect(EVENTS).toMatch(/desc=\{describeEmptyEventSearch\(\{/);
  });

  it('names the city, which is what the search narrowed by', () => {
    // The place is the town browsed, else the whole residence country (14 Oct
    // 2026) — never a fixed London/Lagos/Accra list that opened on London.
    expect(EVENTS).toMatch(/title=\{`No events in \$\{placeName\}`\}/);
    expect(EVENTS).toMatch(/const placeName = placeLabel\(selectedLocation\)/);
    expect(EVENTS).toMatch(/return location\.city \|\| location\.country \|\| 'your area'/);
    expect(EVENTS).not.toMatch(/'London'|'Lagos'|'Accra'/);
  });

  it('passes every filter the route genuinely binds', () => {
    // category, words, date and free are real predicates on
    // GET /community-life/events. Nothing else is, and nothing else is offered.
    for (const applied of [
      'city: placeName',
      'category: selectedEventCat',
      'query: eventQuery',
      'timeFilter: eventTimeFilter',
      'freeOnly: eventFree',
    ]) {
      expect(EVENTS).toContain(applied);
    }
  });

  it('suggests only controls that exist on this screen', () => {
    const helper = EVENTS.slice(
      EVENTS.indexOf('function describeEmptyEventSearch'),
      EVENTS.indexOf('const EVENT_CATEGORIES')
    );

    expect(helper).toMatch(/change the city from the picker at the top/);
    expect(helper).toMatch(/another category or a wider date range/);

    // And never the one that does not exist.
    expect(helper).not.toMatch(/radius|distance|nearby|filter range/i);
  });

  it('does not imply a filter to relax when only the city is applied', () => {
    // "Try another category" is useless advice to somebody who has not chosen
    // one. The no-filters branch says the city is empty and stops there.
    const helper = EVENTS.slice(
      EVENTS.indexOf('function describeEmptyEventSearch'),
      EVENTS.indexOf('const EVENT_CATEGORIES')
    );

    expect(helper).toMatch(/if \(narrowedBy\.length === 0\)/);
    expect(helper).toMatch(/Nothing is listed in \$\{city\} yet/);
  });
});

describe('the notice and the empty state agree', () => {
  it('the unsupported-filter notice is still there', () => {
    // The empty state was corrected to match this. If the notice ever goes, the
    // assertions above stop meaning what they were written to mean.
    expect(EVENTS).toMatch(/UNSUPPORTED_EVENT_BROWSE_FILTERS/);
  });

  it('distance is still named as something the search cannot do', () => {
    // The register the notice is drawn from. It lives in `community-life-api`
    // rather than the screen, which is why the screen could drift away from it
    // without anything complaining.
    expect(API).toMatch(/label: 'Distance radius'/);
  });
});
