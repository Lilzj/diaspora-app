// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — no screen builds its own request (FSOLID-002)
//
// ── The finding ─────────────────────────────────────────────────────────────
//
// `src/lib` holds 44 `*-api.ts` modules whose job is to be the boundary between
// screens and HTTP. Thirteen screens imported `@/lib/apiClient` and called it
// directly, across 26 call sites.
//
// This is the one SOLID finding in the audit with a **correctness** consequence
// rather than only a maintainability one, and the repository's own history is
// the evidence: a card *"whose every tap went to `/marketplace/undefined`"* and
// *"a country-scoped housing search that returned nothing"* — both recorded in
// `.github/workflows/ci.yml` as the defects the runtime-integration job exists
// to catch, and both the class a typed service module prevents.
//
// ── Why a screen reaching past the boundary is not just untidy ──────────────
//
// A screen calling `apiClient.get('/housing/…')` owns the route string, the
// query-parameter shape **and** the response envelope. Migrating these thirteen
// found all of that in the wild:
//
//   * `conversation/media/[id].tsx` handed `attachment.url` to `<Image>`.
//     `MessageAttachmentResponse.Url` is documented *"populated only where a
//     deployment resolves Media URLs. Null by default."* — so every photograph
//     in every conversation gallery drew an empty box, while the bytes were
//     reachable the whole time through the required `MediaAssetId`.
//   * `marketplace/[id].tsx` read six sibling collections off the envelope.
//     Only the development handler has ever supplied any of them.
//   * `housing/[id].tsx` flattened the listing wire inline, in forty lines that
//     type-checked only because `response.data.data` is `any`. Four fields that
//     mapping can leave undefined were declared required, and one of them is
//     the currency on a **deposit payment button**.
//
// None of that is visible to `backend-request-binding-drift.test.ts` or
// `screen-response-field-drift.test.ts`, because those can only check what goes
// through a service module.
//
// ── What this test is, and what it is not ───────────────────────────────────
//
// The audit asked for exactly this and suggested seeding it with the thirteen
// as a named exemption list, to be worked down to zero. There is no exemption
// list here because the migration reached zero in one pass — and a list with
// nothing in it is a list that invites a first entry. Adding one back is a
// deliberate act with a diff to defend.
//
// This checks *imports*, not calls. Importing `API_BASE_URL` from that module
// to interpolate a media URL by hand is the same crossing as calling `get` —
// `community-life/org/[id].tsx` did precisely that — so the rule is about the
// module, not the binding.
// ─────────────────────────────────────────────────────────────────────────────

declare const __dirname: string;

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
}

const { readdirSync, readFileSync }: {
  readdirSync(p: string, o: { withFileTypes: true }): DirectoryEntry[];
  readFileSync(p: string, encoding: string): string;
} = require('fs');
const { join, relative, sep }: {
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
  sep: string;
} = require('path');

const SRC = join(__dirname, '..', '..');

/** The trees that must go through the api layer. */
const PRESENTATION = ['app', 'components'];

/**
 * An import of the transport module, in any spelling.
 *
 * `@/lib/apiClient` is how the codebase writes it, but a relative path reaches
 * the same file and a `require` reaches it without the word `import` — so the
 * pattern is the module's name, not one way of asking for it.
 */
// One quantifier over a negated class, deliberately. The first version spelled
// the relative form as `(?:\.\.?\/)+(?:lib\/)?`, which nests quantifiers and
// `security/detect-unsafe-regex` is right to object: a specifier crafted to
// backtrack through it is a denial of service in a test that reads every file
// in the repository. `\b` before the name keeps `mapsApiClient` out.
const TRANSPORT = /(?:from|require\()\s*['"][^'"]*\bapiClient['"]/;

function sourceFilesUnder(directory: string): string[] {
  const found: string[] = [];

  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      // Tests may reach for the transport directly: a test *is* allowed to know
      // how the platform talks, and several assert on `apiClient` itself.
      if (entry.name === '__tests__') continue;

      const full = join(current, entry.name);

      if (entry.isDirectory()) {
        walk(full);
        continue;
      }

      if (/\.tsx?$/.test(entry.name)) found.push(full);
    }
  };

  walk(join(SRC, directory));
  return found;
}

function importsTransport(file: string): boolean {
  return TRANSPORT.test(readFileSync(file, 'utf8'));
}

function shortName(file: string): string {
  return relative(SRC, file).split(sep).join('/');
}

describe('screens and components go through the api layer', () => {
  it.each(PRESENTATION)('finds a realistic number of files under src/%s — the canary', (tree) => {
    // Without this the rule below is satisfied by a walk that returns nothing:
    // a renamed directory, a changed extension, a `readdirSync` that throws
    // into an empty array would all read as "no screen imports the transport".
    expect(sourceFilesUnder(tree).length).toBeGreaterThan(50);
  });

  it.each(PRESENTATION)('no file under src/%s imports the transport module', (tree) => {
    const offenders = sourceFilesUnder(tree).filter(importsTransport).map(shortName).sort();

    // Named rather than counted. A count tells the next person how many; the
    // names tell them which, which is what they need to act.
    expect(offenders).toEqual([]);
  });

  it('still finds the transport where it belongs — the second canary', () => {
    // The rule above also passes if `apiClient` is deleted, renamed, or moved
    // out from under the pattern. The boundary is supposed to be *busy*: this
    // asserts the api layer is still full of callers, so a rename that makes
    // the pattern stop matching fails here instead of passing everywhere.
    const inLib = sourceFilesUnder('lib').filter(importsTransport);

    expect(inLib.length).toBeGreaterThan(40);
  });

  it('keeps the api layer the only place that knows the transport', () => {
    // `src/store` and `src/hooks` are allowed and do use it — they sit between
    // the screens and the modules. This is not a rule about them; it is here so
    // that the shape of the allowance is written down rather than inferred from
    // the absence of a test, and so that a future tightening starts from a
    // statement of where things stand.
    const everywhere = ['lib', 'store', 'hooks', 'mocks']
      .flatMap((tree) => sourceFilesUnder(tree))
      .filter(importsTransport)
      .map(shortName);

    const outsideLib = everywhere.filter((name) => !name.startsWith('lib/'));

    // Four, today: two stores, one hook and the development adapter. Asserted
    // as a named set rather than a count so that a new one is a decision.
    expect(outsideLib.sort()).toEqual([
      'hooks/analytics.ts',
      'mocks/index.ts',
      'store/auth.ts',
      'store/conversation.ts',
    ]);
  });
});
