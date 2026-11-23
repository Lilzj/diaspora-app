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
// ── Why this is narrow on purpose, and what it is narrow beside ───────────────
//
// `backend-response-field-drift.test.ts` is the general check: every request
// the client makes, the type its body is read as, against the schema the route
// documents. It reads types, so it is exactly as good as the types are — and a
// screen that holds a payload in a variable the type checker cannot connect to
// a route is invisible to it.
//
// This one reads the *screen*: every `<variable>.<name>` in a registered file,
// against the schema that variable holds. Each entry costs three lines and buys
// a whole file, and the list below is the four seams where a payload has been
// read under the wrong names before.
//
// ── Where the declared names come from ───────────────────────────────────────
//
// **From the published contract, since RMD-005.** Until then this parsed the
// backend's C# response records with a regular expression — a parser guessing
// at what the backend's own generator already states in
// `contracts/Diaspora.Api.json`, which names a schema for 1,076 of 1,093 success
// bodies (RMD-003) and, since RMD-006, means one type by each name. The regex is
// gone; `support/published-contract` reads the document.
//
// Under-reporting is the bias, following the sibling cross-repo checks: a
// property that cannot be resolved is skipped, never guessed at.
// ─────────────────────────────────────────────────────────────────────────────

// Node's globals are declared locally rather than by adding `"node"` to the
// project's `types` — that change is global and surfaces pre-existing errors in
// other suites. Matches `backend-row-property-drift.test.ts`.
import { backendContractFile } from './support/backend-checkout';
import {
  readPublishedContract,
  schemaNamed,
  schemaProperties,
  type PublishedContract,
} from './support/published-contract';

declare const __dirname: string;

const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const join: (...parts: string[]) => string = require('path').join;

// The backend checkout is located by `support/backend-checkout`, which is
// also where the rule lives: not configured and absent is a skip, configured
// and absent is a failure. Eleven suites resolved this separately until
// 11 November 2026; FBL-001 is what that cost.
const CONTRACT_FILE = backendContractFile();
const CLIENT_ROOT = join(__dirname, '..', '..');

interface Pairing {
  /** Path segments under `src/`. */
  screen: string[];
  /** The contract component the route answers with. */
  schema: string;
  /**
   * Further components whose properties also count as declared.
   *
   * For a reader that takes more than one shape. The events adapter is the
   * case: the detail route answers `EventResponse` with a nested schedule, and
   * every list answers `EventSummaryResponse` with a flat one, and one function
   * reads both — a summary being an event with fewer facts, not a different
   * kind of thing.
   */
  unionWith?: string[];
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
    schema: 'OrganizationResponse',
    variable: 'org',
    allowed: {
      // `socialLinks` and `statistics` are read as whole objects before their
      // own fields; both are declared on the response.
    },
  },
  {
    // **The seam this check was written for, arrived at the long way round.**
    // The events path had no pairing, and every field below was drifting: the
    // screen read `event.host.type` against an object the wire does not send
    // and took the whole application down, and `date`, `time`, `areaName` and
    // the running order all rendered `undefined`. `lib/event-wire.ts` is now
    // the one place the wire is read, so it is the one place to check.
    screen: ['lib', 'api', 'event-wire.ts'],
    schema: 'EventResponse',
    unionWith: ['EventSummaryResponse'],
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
    schema: 'EventSummaryResponse',
    variable: 'event',
  },
  {
    // The marketplace listing seam. The screen used to flatten the wire inside
    // its own fetch effect, where this check could not see it — which is how
    // `intent` and `images` stayed wrong after everything around them was
    // fixed.
    screen: ['lib', 'api', 'marketplace-wire.ts'],
    schema: 'ListingResponse',
    variable: 'wire',
    allowed: {
      // Mock and cached listings spell the identifier `id`. Read only as a
      // fallback behind `listingId`.
      id: 'mock and cached listings; the response spells it listingId',
    },
  },
];

/** The property names a component declares, as the wire spells them. */
function declaredBy(contract: PublishedContract, name: string): Set<string> {
  return new Set(Object.keys(schemaProperties(contract, schemaNamed(contract, name)) ?? {}));
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
  if (CONTRACT_FILE === null) {
    // Skips loudly. A cross-repo check that passes quietly when it cannot see
    // the other side is worse than no check, because the green tick then
    // describes work that never happened.
    it.skip('needs a diaspora-backend checkout (set DIASPORA_BACKEND_PATH)', () => undefined);
    return;
  }

  const contract = readPublishedContract(CONTRACT_FILE);

  it.each(PAIRINGS.map((p) => [p.screen.join('/'), p] as const))(
    '%s reads only properties its response type declares',
    (_name, pairing) => {
      const screen = readFileSync(join(CLIENT_ROOT, ...pairing.screen), 'utf8');

      const declared = declaredBy(contract, pairing.schema);
      for (const also of pairing.unionWith ?? []) {
        for (const name of declaredBy(contract, also)) declared.add(name);
      }

      // A component this cannot read has no properties, and an empty set would
      // make every read look like drift — or, worse, a typo'd name that threw
      // would be indistinguishable from one that resolved to nothing.
      expect(declared.size).toBeGreaterThan(5);

      const allowed = pairing.allowed ?? {};
      const unknown = Array.from(fieldsReadFrom(screen, pairing.variable))
        .filter((field) => !declared.has(field))
        .filter((field) => !(field in allowed))
        .sort();

      const report = unknown
        .map((field) => `  ${pairing.variable}.${field} — not declared on ${pairing.schema}`)
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

  it('names components the contract actually carries', () => {
    // `schemaNamed` throws for a name the document does not carry, which is
    // the failure this wants: a pairing renamed on one side only must not
    // quietly compare against nothing.
    for (const pairing of PAIRINGS) {
      for (const name of [pairing.schema, ...(pairing.unionWith ?? [])]) {
        expect(() => schemaNamed(contract, name)).not.toThrow();
      }
    }
  });
});

describe('the comparison this file makes', () => {
  // A guard that cannot fail proves nothing. This is the exact defect, run
  // through the same two functions the sweep uses, against a contract of one
  // schema.
  const contract: PublishedContract = {
    schemas: {
      OrganizationResponse: {
        type: 'object',
        properties: {
          organizationId: { type: 'string' },
          operatingHours: { type: 'array', items: { type: 'object' } },
        },
      },
    },
    operations: new Map(),
  };

  it('detects a field the contract does not declare', () => {
    const screen = 'const a = org.operatingHours; const b = org.openingHours.map(x => x);';

    const declared = declaredBy(contract, 'OrganizationResponse');
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
