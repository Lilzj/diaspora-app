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

describe('a draft series is reachable and publishable', () => {
  // **The third time this platform has served a publish route nobody called.**
  // Events had one, organisations had one, and a series has
  // `POST /events/series/{id}/publish`. Creating a series always drafts it, so
  // without a caller a member could set up a weekly clinic and never announce
  // it — and the wizard sent them to a success page, leaving the thing they had
  // just made with nothing pointing at it.
  const seriesScreen = source('app', 'community-life', 'series', '[id].tsx');

  it('has an adapter for the route', () => {
    expect(api).toMatch(/\/events\/series\/\$\{encodeURIComponent\(seriesId\)\}\/publish/);
  });

  it('offers publishing only while it is a draft', () => {
    expect(seriesScreen).toMatch(/series\.status === 'Draft'/);
    expect(seriesScreen).toMatch(/publishEventSeries\(series\.seriesId\)/);
  });

  it('does not read a failed publish as a refusal', () => {
    // Unanswered is not a no. The series may well have published; what failed
    // is knowing. Telling the organiser it is still a draft would be a guess.
    expect(seriesScreen).not.toMatch(/It is still saved as a draft/);
    expect(seriesScreen).toMatch(/open it again in a moment/i);
  });

  it('sends the organiser to the series rather than a success page', () => {
    expect(screen).toMatch(/community-life\/series\/\$\{created\.id\}/);
  });
});

describe('the preview says it repeats', () => {
  it('shows the pattern when the organiser turned it on', () => {
    // The preview is the last thing read before Publish, and it showed a single
    // date and nothing else — the one fact that makes this a series.
    expect(screen).toMatch(/formData\.isRecurring \?[\s\S]{0,400}Repeats \{/);
  });

  it('calls a failed series a series', () => {
    expect(screen).toMatch(/formData\.isRecurring \? 'series' : 'event'/);
  });
});

describe('a member can find their own drafts', () => {
  // **The listing answers with published series unless asked otherwise.** The
  // handler sets `IncludeNonPublic = MineOnly` and resolves "mine" from the
  // token rather than the query string, so a call without the flag can never
  // contain a draft. The list screen offered Drafts and Paused chips over
  // exactly that listing, and a member who had just created a weekly clinic
  // found nothing under any of the four.
  const listScreen = source('app', 'community-life', 'series', 'index.tsx');
  const programmeApi = source('lib', 'community-programme-api.ts');

  it('declares the two parameters the platform takes', () => {
    // Neither was declared. `status` had been sent for as long as the screen
    // existed and typechecked only because the screen passes a `useMemo`
    // variable — excess property checking does not fire on a variable, so the
    // one check that would have caught it structurally could not.
    expect(programmeApi).toMatch(/\bstatus\?: string;/);
    expect(programmeApi).toMatch(/\bmine\?: boolean;/);
  });

  it('asks for its own when the filter is one only an owner has', () => {
    expect(listScreen).toMatch(/status === 'Draft' \|\| status === 'Paused'/);
    expect(listScreen).toMatch(/mine: isOwnOnly \|\| undefined/);
  });

  it('does not ask for its own when browsing everything', () => {
    // `mine` narrows to the caller's series, so sending it on the All and Live
    // chips would turn a discovery screen into a personal one.
    expect(listScreen).not.toMatch(/mine: true,/);
  });
});
