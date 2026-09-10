// ─────────────────────────────────────────────────────────────────────────────
// A repeating event is its own thing
//
// The create wizard had a "Recurring Event (Future-ready)" toggle that
// collected a frequency and threw it away: `CreateEventRequest` has no
// recurrence fields, so somebody who set up a weekly clinic got one event on
// one Thursday and nothing said otherwise.
//
// `POST /events/series` had been served since the module shipped. The client's
// only reference to it was in `community-gap-api.ts`, behind
// `assertEnabled('eventSeries')` — which throws in every real build. A route
// that exists, a caller that cannot run: the shape this repository keeps
// producing.
//
// These assertions are on the *screen's* source rather than on a function,
// because what went wrong was never arithmetic. It was a payload built against
// a contract nobody had read.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

const source = (...segments: string[]) =>
  fs
    .readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8')
    .replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), ' ')
    .replace(new RegExp('//[^\\n]*', 'g'), ' ');

const screen = source('app', 'community-life', 'event', 'create.tsx');
const api = source('lib', 'community-life-api.ts');

describe('the toggle reaches a route', () => {
  it('posts a series when the organiser said it repeats', () => {
    expect(screen).toMatch(/if \(formData\.isRecurring\)/);
    expect(screen).toMatch(/createEventSeries\(series\)/);
  });

  it('calls the ungated adapter, not the gap one', () => {
    // `community-gap-api` throws before it reaches the network in any build a
    // member could install, so a call routed there is a call that cannot land.
    expect(screen).not.toMatch(/community-gap-api/);
    expect(api).toMatch(/'post', '\/events\/series'/);
  });

  it('no longer calls itself future-ready', () => {
    expect(screen).not.toContain('Recurring Event (Future-ready)');
  });
});

describe('the shape the platform declares', () => {
  it('sends a date, a time and a duration rather than two instants', () => {
    // A series has no single start, so `CreateEventSeriesRequest` takes a local
    // wall-clock time and a zone. Seven in the evening stays seven in the
    // evening across a daylight-saving boundary; an instant would not, and the
    // meeting would move by an hour twice a year with nobody touching it.
    expect(screen).toMatch(/startDate: formData\.date/);
    expect(screen).toMatch(/durationMinutes,/);
    expect(screen).not.toMatch(/startsAt: instants\.startsAt,[\s\S]{0,80}recurrence/);
  });

  it('pads the hour, because TimeOnly is read as ISO 8601', () => {
    // The form's own regex takes `9:30` and the single-event path parses that
    // itself, so half nine works there. `System.Text.Json` reads a `TimeOnly`
    // strictly and refuses a one-digit hour — unpadded, this path alone would
    // 400, and only for people who happen not to type a leading zero.
    expect(screen).toMatch(/padStart\(2, '0'\)/);
  });

  it('uses the platform vocabulary for how often', () => {
    // The form says "Annual". `RecurrenceFrequency` says `Yearly`.
    expect(screen).toMatch(/Annual: 'Yearly'/);
  });
});

describe('who writes the sentence', () => {
  it('renders the description the server sent', () => {
    // `RecurrenceRuleRequest` is explicit: a client should render the server's
    // description rather than compose one, because the semantics live on the
    // platform and a sentence written beside a different set of rules drifts
    // from them. This screen used to compose "it repeats weekly".
    expect(screen).toMatch(/created\.description/);
    expect(screen).not.toMatch(/it repeats \$\{/);
  });

  it('still says something when the platform sends no description', () => {
    // An older platform omitting it must not produce an alert reading
    // "undefined. Saved as a draft".
    expect(screen).toMatch(/created\.description\s*\?[\s\S]{0,200}:\s*`Saved as a draft/);
  });

  it('reads the id back out of the response', () => {
    // Nothing consumes it yet. It is here because a series with no id in hand
    // is one whose occurrences cannot be read back, and that is the next thing
    // this flow needs.
    expect(api).toMatch(/seriesId \?\? wire\?\.id/);
  });
});

describe('what the wizard says it did', () => {
  it('calls it a series rather than an event', () => {
    expect(screen).toMatch(/title: 'Series created'/);
  });

  it('does not claim it is visible', () => {
    // `CreateEventSeriesRequest` lands as a draft unless `publish` says
    // otherwise, and this call passes `false`. The wizard used to report
    // published for a single event too, which is a defect this repository has
    // now shipped twice.
    expect(screen).toMatch(/buildSeriesPayload\(false\)/);
    expect(screen).toMatch(/nobody else can see it yet/);
  });
});
