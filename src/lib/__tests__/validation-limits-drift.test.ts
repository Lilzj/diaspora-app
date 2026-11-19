// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the client's validation limits against the server's (FBL-004)
//
// ── What the row says, and what is actually true ────────────────────────────
//
// FBL-004 names seven client constants as "backend validation limits duplicated
// as client constants, correlated only by a comment". Checked one at a time
// against the backend, **four are duplicates and three are not**:
//
//   MIN_TITLE / MAX_SUMMARY     CommunityLifeLimits.MinTitle / .MaxSummary
//   AREA_INSIGHT_MAX_LENGTH     HousingLimits.MaxInsightBody
//   MAX_PARAMETER_JSON          AutomationOptions.MaximumParameterLength
//
//   MAX_NAME_LENGTH (80)        nothing. The Automation module has no length
//   MAX_DESCRIPTION_LENGTH      rule for a rule's name or description; the
//                               client's own comment says these are about how a
//                               row renders.
//   MIN_NATIONAL_DIGITS (6)     nothing, and its comment says so outright: the
//                               authoritative minimum is per country and lives
//                               on the server, and this only keeps a button off.
//
// Checking all seven would have meant inventing a server limit for three of
// them, which is a worse failure than the one the row describes: a test that
// asserts a number against a number somebody made up looks exactly like a
// contract check.
//
// ── Why this is per constant rather than generated ──────────────────────────
//
// The row's first option is to generate the limits as `served-routes.ts` is
// generated. Its second is "a drift test per constant group, in the style of
// `password-policy-drift.test.ts`, which already does exactly this". This is the
// second, because the four limits live in four different places on the backend —
// two domain policy classes and an options class — and a generator would need to
// learn all three shapes to emit four numbers.
//
// ── The risk, as the row states it, is narrow and one-directional ───────────
//
// Client-side pre-validation is correct practice and the server's validators
// remain authoritative. If the backend *tightens* a limit the member writes
// something the server refuses; if it *loosens* one the client refuses something
// the server would take. Neither is a security problem. Both are avoidable, and
// this is what makes them avoidable.
// ─────────────────────────────────────────────────────────────────────────────

import { MAX_SUMMARY, MIN_TITLE } from '../community-life-api';
import { AREA_INSIGHT_MAX_LENGTH } from '../area-insights-api';
import { MAX_PARAMETER_JSON } from '../automation/certified-client';
import { backendSourceRoot } from './support/backend-checkout';

// Required locally with narrow signatures, exactly as the sibling drift checks
// do. Adding `"node"` to `types` in `tsconfig.json` would compile these imports
// and break twenty other assertions.
declare const __dirname: string;

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
}

const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const readdirSync: (path: string, options: { withFileTypes: true }) => DirectoryEntry[] =
  require('fs').readdirSync;
const existsSync: (path: string) => boolean = require('fs').existsSync;
const join: (...parts: string[]) => string = require('path').join;

const BACKEND_SOURCE_ROOT = backendSourceRoot();

/** Where each mirrored limit is declared, relative to the backend's `src/`. */
const SOURCES = {
  communityLife: [
    'Diaspora.Modules.CommunityLife',
    'Domain',
    'Policies',
    'CommunityLifeLimits.cs',
  ],
  housing: ['Diaspora.Modules.Housing', 'Domain', 'Policies', 'HousingLimits.cs'],
  automation: ['Diaspora.Modules.Automation', 'Options', 'AutomationOptions.cs'],
} as const;

type SourceKey = keyof typeof SOURCES;

const describeAgainstBackend = BACKEND_SOURCE_ROOT === null ? describe.skip : describe;

describeAgainstBackend("the client's validation limits against the server's", () => {
  const read: Partial<Record<SourceKey, string>> = {};

  // Read in `beforeAll`, never in the describe body: jest executes a skipped
  // describe's body to collect its tests, so a read there runs with no checkout.
  beforeAll(() => {
    for (const [key, parts] of Object.entries(SOURCES) as [SourceKey, readonly string[]][]) {
      const path = join(BACKEND_SOURCE_ROOT as string, ...parts);

      if (!existsSync(path)) {
        // The support module's rule: a checkout that exists and does not hold
        // the file is a broken tree, not a developer without the sibling
        // repository. Skipping would hide it.
        throw new Error(
          `The backend checkout has no ${parts.join('/')}. That file declares a limit this ` +
            'client copies, and this suite is the only thing that notices when the copy rots.'
        );
      }

      read[key] = readFileSync(path, 'utf8');
    }
  });

  /** `public const int MaxInsightBody = 400;` — and `2_048`, which C# allows. */
  function constInt(key: SourceKey, name: string): number | null {
    const match = new RegExp(`public\\s+const\\s+int\\s+${name}\\s*=\\s*([\\d_]+)\\s*;`).exec(
      read[key] ?? ''
    );
    return match ? Number(match[1].replace(/_/g, '')) : null;
  }

  /** `public int MaximumParameterLength { get; set; } = 2_048;` */
  function optionDefault(key: SourceKey, name: string): number | null {
    const match = new RegExp(
      `public\\s+int\\s+${name}\\s*\\{[^}]*\\}\\s*=\\s*([\\d_]+)\\s*;`
    ).exec(read[key] ?? '');
    return match ? Number(match[1].replace(/_/g, '')) : null;
  }

  it('parses every file it reads — the canary', () => {
    // Guards the guard. Every assertion below is "the parsed value equals the
    // client's", and a parser returning null for everything makes them all
    // vacuous, which is how a drift check goes quietly blind after a rename on
    // the other side. A limit nothing here mirrors is parsed too, so a change
    // to the *shape* of these files fails even if the mirrored names survive.
    expect(constInt('communityLife', 'MinTitle')).not.toBeNull();
    expect(constInt('communityLife', 'MaxSummary')).not.toBeNull();
    expect(constInt('communityLife', 'MaxTitle')).not.toBeNull();
    expect(constInt('housing', 'MaxInsightBody')).not.toBeNull();
    expect(optionDefault('automation', 'MaximumParameterLength')).not.toBeNull();
  });

  it('uses the server’s minimum community-life title', () => {
    expect(MIN_TITLE).toBe(constInt('communityLife', 'MinTitle'));
  });

  it('uses the server’s maximum community-life summary', () => {
    expect(MAX_SUMMARY).toBe(constInt('communityLife', 'MaxSummary'));
  });

  it('uses the server’s maximum area-insight body', () => {
    expect(AREA_INSIGHT_MAX_LENGTH).toBe(constInt('housing', 'MaxInsightBody'));
  });

  it('uses the server’s maximum automation parameter length', () => {
    // The one mirrored value that is an options *default* rather than a
    // constant, so a deployment can change it without a code change and this
    // test cannot see that. Stated in the client constant's own comment.
    expect(MAX_PARAMETER_JSON).toBe(optionDefault('automation', 'MaximumParameterLength'));
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Naming a server symbol commits you to it existing
//
// The audit named seven constants. Sweeping `src/lib` for comments that cite a
// `*Limits` or `*Options` member finds **twenty-one**, in eleven files — so the
// practice the row describes is about three times as widespread as the row says,
// and most of it is not a duplicated number at all. `GuideLimits.DefaultPageSize`
// explains why a list pages where it does; `MovementLimits.FeeOn` is a *method*
// the client mirrors for rounding order, not a value.
//
// Demanding a value check for all twenty-one would mean inventing a client
// constant for each, which is a bigger lie than the comment. What every one of
// them can carry is the weaker claim that makes a comment worth reading: **the
// symbol it names is really there.** A renamed or deleted backend member leaves
// prose pointing at nothing, and nothing notices — which is the same failure as
// a drifted number, one step earlier.
//
// So: four values are checked above; all twenty-one names are checked below.
// ─────────────────────────────────────────────────────────────────────────────

/** Where each cited class lives, relative to the backend's `src/`. */
const DECLARING_FILE: Record<string, string[]> = {
  CommunityLifeLimits: ['Diaspora.Modules.CommunityLife', 'Domain', 'Policies', 'CommunityLifeLimits.cs'],
  HousingLimits: ['Diaspora.Modules.Housing', 'Domain', 'Policies', 'HousingLimits.cs'],
  HousingOptions: ['Diaspora.Modules.Housing', 'Options', 'HousingOptions.cs'],
  AutomationOptions: ['Diaspora.Modules.Automation', 'Options', 'AutomationOptions.cs'],
  GuideLimits: ['Diaspora.Modules.Guides', 'Domain', 'Policies', 'GuideLimits.cs'],
  IntelligenceLimits: ['Diaspora.Modules.Guides', 'Domain', 'Policies', 'IntelligenceLimits.cs'],
  MarketplaceLimits: ['Diaspora.Modules.Marketplace', 'Domain', 'Policies', 'MarketplaceLimits.cs'],
  AnalyticsOptions: ['Diaspora.Modules.Analytics', 'Options', 'AnalyticsOptions.cs'],
  PasswordPolicyOptions: ['Diaspora.Infrastructure', 'Identity', 'Options', 'PasswordPolicyOptions.cs'],
  // `FeeOn` is a method on the resolver's limits type rather than a constant,
  // which is the point: the client mirrors an order of operations, not a number.
  MovementLimits: ['Diaspora.Modules.Financial', 'Application', 'Services', 'FinancialLimitsResolver.cs'],
};

/**
 * Cited classes that are not the platform's, with the reason.
 *
 * `PayloadSerializerOptions` is SignalR's own options type; `realtime.ts` cites
 * it to explain why frames arrive camel-cased. Requiring a Diaspora file for it
 * would mean inventing one.
 */
const NOT_OURS: Record<string, string> = {
  PayloadSerializerOptions:
    'SignalR’s own options type, cited in realtime.ts to explain the naming policy on the hub.',
};

/** `CommunityLifeLimits.MinTitle` written inside a comment. */
const LIMIT_REFERENCE = /\b([A-Z][A-Za-z]*(?:Limits|Options))\.([A-Z][A-Za-z]*)\b/g;

/** A comment line, which is the only place this rule looks. */
const COMMENT = /^\s*(?:\/\/|\*|\/\*)/;

const LIB = join(__dirname, '..');

interface Citation {
  readonly file: string;
  readonly owner: string;
  readonly member: string;
}

function libSources(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') found.push(...libSources(path));
      continue;
    }

    if (/\.tsx?$/.test(entry.name)) found.push(path);
  }

  return found;
}

function citations(): Citation[] {
  const found: Citation[] = [];

  for (const path of libSources(LIB)) {
    const commented = readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => COMMENT.test(line));

    for (const line of commented) {
      for (const match of line.matchAll(LIMIT_REFERENCE)) {
        found.push({
          file: path.slice(LIB.length + 1).replace(/\\/g, '/'),
          owner: match[1],
          member: match[2],
        });
      }
    }
  }

  return found;
}

describe('every server symbol a comment in src/lib names', () => {
  let cited: Citation[] = [];

  beforeAll(() => {
    cited = citations();
  });

  it('is found by the sweep at all — the canary', () => {
    // This section asserts that sets are empty, and a sweep matching nothing
    // satisfies that while checking nothing. The two below are in comments that
    // predate this suite, so they are not circular.
    const names = cited.map((entry) => `${entry.owner}.${entry.member}`);

    expect(names).toContain('CommunityLifeLimits.MinTitle');
    expect(names).toContain('GuideLimits.MaxSummary');
    expect(cited.length).toBeGreaterThanOrEqual(20);
  });

  it('belongs to a class this suite can find, or is declared not ours', () => {
    const unknown = [...new Set(cited.map((entry) => entry.owner))]
      .filter((owner) => !(owner in DECLARING_FILE) && !(owner in NOT_OURS))
      .sort();

    expect(unknown).toEqual([]);
  });

  it('keeps a reason with every class excused from the check', () => {
    for (const [owner, reason] of Object.entries(NOT_OURS)) {
      expect(cited.some((entry) => entry.owner === owner)).toBe(true);
      expect(reason.length).toBeGreaterThan(30);
    }
  });
});

describeAgainstBackend('every cited server symbol really exists', () => {
  const sources = new Map<string, string>();
  let cited: Citation[] = [];

  beforeAll(() => {
    cited = citations();

    for (const [owner, parts] of Object.entries(DECLARING_FILE)) {
      const path = join(BACKEND_SOURCE_ROOT as string, ...parts);

      if (!existsSync(path)) {
        throw new Error(
          `The backend checkout has no ${parts.join('/')}, which src/lib comments cite as ` +
            `${owner}. A citation to a file that is not there is the defect this suite exists for.`
        );
      }

      sources.set(owner, readFileSync(path, 'utf8'));
    }
  });

  it('read a file for every class it maps — the canary', () => {
    // Without this, a mapping whose file read empty would let every member
    // below "not be missing" for the wrong reason.
    for (const owner of Object.keys(DECLARING_FILE)) {
      expect((sources.get(owner) ?? '').length).toBeGreaterThan(200);
    }
  });

  it('is declared in the file this suite maps its class to', () => {
    const missing: string[] = [];

    for (const entry of cited) {
      if (entry.owner in NOT_OURS) continue;

      const source = sources.get(entry.owner) ?? '';
      // A const, a property or a method — the three shapes a cited member takes.
      const declared = new RegExp(`\\b${entry.member}\\b\\s*(?:=|\\{|\\()`).test(source);

      if (!declared) missing.push(`${entry.file} names ${entry.owner}.${entry.member}`);
    }

    expect(missing).toEqual([]);
  });
});
