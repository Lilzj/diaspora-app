// ─────────────────────────────────────────────────────────────────────────────
// A screen may not read a field its route does not send
//
// ── The defect this exists to end ────────────────────────────────────────────
//
// `OrgProfileScreen` rendered `org.openingHours.map(...)`. The route serves
// `operatingHours`. The value was therefore always `undefined`, the `.map` was
// unguarded, and **every organisation profile crashed the whole application**
// with `TypeError: Cannot read property 'map' of undefined`.
//
// The same screen read `org.gallery`, which the route calls `media`. That one
// was guarded, so it did not crash — it silently rendered "no photos" for every
// organisation, including ones with photos.
//
// Both survived `tsc` (the state is `any`), a full unit suite (fixtures were
// written to match the screen, not the route), and a runtime probe (the route
// answered 200 — the payload was never compared to what the screen reads).
//
// ── Why this is narrow on purpose ────────────────────────────────────────────
//
// The general check — "for every screen, which route does it call, and does
// every property it reads exist on that response type" — needs a call graph.
// The published OpenAPI document cannot stand in for it: only 54 of 885
// operations attach a typed schema to a 2xx, so for most routes it has nothing
// to say.
//
// What is cheap and exact is a **registered** pairing: a screen, the C# response
// type its route returns, and the variable it holds the payload in. Each entry
// costs three lines and buys a whole screen. The list starting below is the one
// screen this defect was found on; adding the next is deliberately trivial.
//
// Under-reporting is the bias, following the three sibling cross-repo checks: a
// property that cannot be resolved is skipped, never guessed at.
// ─────────────────────────────────────────────────────────────────────────────

// Node's globals are declared locally rather than by adding `"node"` to the
// project's `types` — that change is global and surfaces pre-existing errors in
// other suites. Matches `backend-row-property-drift.test.ts`.
declare const __dirname: string;

const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const existsSync: (path: string) => boolean = require('fs').existsSync;
const join: (...parts: string[]) => string = require('path').join;

/** Identical resolution to the three sibling cross-repo checks. */
function resolveBackendSourceRoot(): string | null {
  const configured = process.env.DIASPORA_BACKEND_PATH;
  const candidate =
    configured !== undefined && configured !== ''
      ? configured
      : join(__dirname, '..', '..', '..', '..', 'diaspora-backend');

  const sourceRoot = join(candidate, 'src');
  return existsSync(sourceRoot) ? sourceRoot : null;
}

const BACKEND_SOURCE_ROOT = resolveBackendSourceRoot();
const CLIENT_ROOT = join(__dirname, '..', '..');

interface Pairing {
  /** Path segments under `src/`. */
  screen: string[];
  /** Path segments under the backend's `src/`. */
  responseType: string[];
  /**
   * Further contracts whose properties also count as declared.
   *
   * For a reader that takes more than one shape. The events adapter is the
   * case: the detail route answers `EventResponse` with a nested schedule, and
   * every list answers `EventSummaryResponse` with a flat one, and one function
   * reads both — a summary being an event with fewer facts, not a different
   * kind of thing.
   */
  unionWith?: string[][];
  /** The variable the screen holds the payload in. */
  variable: string;
  /**
   * Names read off that variable which are **not** response properties, with
   * the reason. Keeping them here rather than silently allowing them is what
   * stops this check from being widened until it asserts nothing.
   */
  allowed?: Record<string, string>;
}

const PAIRINGS: Pairing[] = [
  {
    screen: ['app', 'community-life', 'org', '[id].tsx'],
    responseType: [
      'Diaspora.Modules.CommunityLife',
      'Contracts',
      'V1',
      'Responses',
      'OrganizationResponse.cs',
    ],
    variable: 'org',
    allowed: {
      // The screen still joins its mock associated-content against a local
      // `id`. `OrganizationResponse` spells the identifier `organizationId`,
      // so this is real drift — but it feeds mock filters rather than a
      // render, so it degrades to "no associated events" instead of crashing.
      // Listed rather than fixed here because the mock join is a separate
      // question from the two fields that took the screen down.
      id: 'mock associated-content join; the response spells it organizationId',
    },
  },
  {
    // **The seam this check was written for, arrived at the long way round.**
    // The events path had no pairing, and every field below was drifting: the
    // screen read `event.host.type` against an object the wire does not send
    // and took the whole application down, and `date`, `time`, `areaName` and
    // the running order all rendered `undefined`. `lib/event-wire.ts` is now
    // the one place the wire is read, so it is the one place to check.
    screen: ['lib', 'event-wire.ts'],
    responseType: [
      'Diaspora.Modules.CommunityLife',
      'Contracts',
      'V1',
      'Responses',
      'EventResponse.cs',
    ],
    unionWith: [
      [
        'Diaspora.Modules.CommunityLife',
        'Contracts',
        'V1',
        'Responses',
        'EventSummaryResponse.cs',
      ],
    ],
    variable: 'wire',
    allowed: {
      // Mock events and anything cached before the adapter existed spell the
      // identifier `id`. Read only as a fallback behind `eventId`.
      id: 'mock and cached events; the response spells it eventId',
    },
  },
  {
    // The "Going to" screen reads an `EventSummaryResponse` straight, with no
    // adapter, because its type was written from the contract rather than
    // asserted over it. Registered to keep it that way.
    screen: ['app', 'community-life', 'rsvps.tsx'],
    responseType: [
      'Diaspora.Modules.CommunityLife',
      'Contracts',
      'V1',
      'Responses',
      'EventSummaryResponse.cs',
    ],
    variable: 'event',
  },
];

/**
 * Property names declared on a C# response record.
 *
 * A shallow parse of `public [required] <Type> <Name> { get; ... }`, camelCased
 * to match the wire. Deliberately unclever, following
 * `backend-row-property-drift.test.ts`: anything it cannot read is absent from
 * the set, and an absent property can only make this check quieter.
 */
function responseProperties(source: string): Set<string> {
  const names = new Set<string>();
  const declaration = /public\s+(?:required\s+)?[\w<>?,.\[\]\s]+?\s+(\w+)\s*\{\s*get/g;

  let match = declaration.exec(source);
  while (match !== null) {
    const name = match[1];
    names.add(name.charAt(0).toLowerCase() + name.slice(1));
    match = declaration.exec(source);
  }

  return names;
}

/**
 * Source with comments removed.
 *
 * Necessary, not tidy: this repository writes long explanatory comments that
 * quote the very field names being discussed, so a scan that reads prose finds
 * `org.openingHours` inside the paragraph explaining why `org.openingHours` was
 * removed — and reports the fix as the defect. The same omission in
 * `backend-openapi-contract-drift.test.ts` let one apostrophe in a comment blame
 * the client for a route it had never called.
 */
function withoutComments(source: string): string {
  const block = new RegExp('/\\*[\\s\\S]*?\\*/', 'g');
  const line = new RegExp('//[^\\n]*', 'g');
  return source.replace(block, ' ').replace(line, ' ');
}

/** Every `<variable>.<name>` read in a screen, ignoring prose. */
function fieldsReadFrom(rawSource: string, variable: string): Set<string> {
  const source = withoutComments(rawSource);
  const names = new Set<string>();
  const access = new RegExp(`(?<![\\w$.])${variable}\\??\\.(\\w+)`, 'g');

  let match = access.exec(source);
  while (match !== null) {
    names.add(match[1]);
    match = access.exec(source);
  }

  return names;
}

describe('screens read fields their routes send', () => {
  if (BACKEND_SOURCE_ROOT === null) {
    // Skips loudly. A cross-repo check that passes quietly when it cannot see
    // the other side is worse than no check, because the green tick then
    // describes work that never happened.
    it.skip('needs a diaspora-backend checkout (set DIASPORA_BACKEND_PATH)', () => undefined);
    return;
  }

  it.each(PAIRINGS.map((p) => [p.screen.join('/'), p] as const))(
    '%s reads only properties its response type declares',
    (_name, pairing) => {
      const screen = readFileSync(join(CLIENT_ROOT, ...pairing.screen), 'utf8');
      const contract = readFileSync(join(BACKEND_SOURCE_ROOT, ...pairing.responseType), 'utf8');

      const declared = responseProperties(contract);

      for (const also of pairing.unionWith ?? []) {
        for (const name of responseProperties(readFileSync(join(BACKEND_SOURCE_ROOT, ...also), 'utf8'))) {
          declared.add(name);
        }
      }

      expect(declared.size).toBeGreaterThan(5);

      const allowed = pairing.allowed ?? {};
      const unknown = Array.from(fieldsReadFrom(screen, pairing.variable))
        .filter((field) => !declared.has(field))
        .filter((field) => !(field in allowed))
        .sort();

      const report = unknown
        .map((field) => `  ${pairing.variable}.${field} — not declared on ${pairing.responseType.at(-1)}`)
        .join('\n');

      expect(
        unknown.length === 0
          ? ''
          : `${unknown.length} field(s) read from a payload that does not carry them.\n` +
              `An unguarded read of one of these crashed every organisation profile.\n` +
              `Fix the screen, or add the name to this pairing's \`allowed\` with a reason.\n\n${report}`,
      ).toBe('');
    },
  );

  it('detects a field the contract does not declare', () => {
    // A guard that cannot fail proves nothing. This is the exact defect, run
    // through the same two functions the sweep uses.
    const contract = `
      public sealed record OrganizationResponse
      {
          public required Guid OrganizationId { get; init; }
          public IReadOnlyList<OperatingHourResponse> OperatingHours { get; init; } = [];
      }
    `;
    const screen = 'const a = org.operatingHours; const b = org.openingHours.map(x => x);';

    const declared = responseProperties(contract);
    const read = fieldsReadFrom(screen, 'org');

    expect(declared.has('operatingHours')).toBe(true);
    expect(read.has('openingHours')).toBe(true);
    expect(declared.has('openingHours')).toBe(false);
  });

  it('reads through optional chaining too', () => {
    // `org?.media` is the same read as `org.media`, and the fix for this very
    // defect uses the optional form.
    expect(fieldsReadFrom('const m = org?.media ?? [];', 'org').has('media')).toBe(true);
  });

  it('does not mistake another variable ending in the same name', () => {
    expect(fieldsReadFrom('const x = suborg.gallery;', 'org').size).toBe(0);
  });
});
