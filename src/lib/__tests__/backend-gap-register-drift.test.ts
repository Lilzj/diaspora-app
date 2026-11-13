// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — gap-register drift against the real backend (Wave M-2)
//
// The platform audit counted 164 of 305 routes declared "missing" in this
// repository's gap registers as already served by `diaspora-backend`. One
// register opened with *"None. No automation, rule, workflow or trigger contract
// exists anywhere in the certified surface"* while the backend was serving
// twenty-four routes under `/api/v1/automations`.
//
// Nothing had gone wrong at the moment those entries were written. They went
// wrong later, when the backend shipped the contract and nobody came back to
// delete the entry. A register is a claim about *another repository*, and a
// claim about another repository decays the instant that repository moves. The
// only thing that stops the decay is a check that reads both sides, and this is
// it.
//
// ── What this asserts ────────────────────────────────────────────────────────
//
// For every endpoint a register declares missing, the backend must not serve it.
// When it does, the test names the register, the gap id, the declared endpoint
// and the backend file that serves it — enough for somebody to open both files
// and delete the entry without doing this investigation again.
//
// ── The bias, stated deliberately ────────────────────────────────────────────
//
// **This check under-reports on purpose.** A cross-repo check that cries wolf
// gets `.skip`-ed within a fortnight, and a skipped check protects nothing. So
// every ambiguity below resolves towards silence: unparseable route forms are
// dropped rather than guessed, prose that does not begin with a verb and a path
// is not treated as a contract, and wildcards are ignored. The cost is that some
// stale entries survive; the benefit is that a red build here always means
// something real. `it('parses the backend well enough to be worth trusting')`
// guards the floor so the under-reporting cannot quietly become "reports
// nothing".
//
// ── Running without the backend ──────────────────────────────────────────────
//
// CI runs this repository on its own most days. When `diaspora-backend` is not
// on disk the suite skips loudly rather than passing quietly — a cross-repo
// check that silently succeeds when it cannot see the other repo is worse than
// no check, because the green tick is then a lie about work that never happened.
// ─────────────────────────────────────────────────────────────────────────────

// Node's globals are declared locally rather than by adding `"node"` to the
// project's `types`. That change is global: it surfaces pre-existing errors in
// roughly twenty assertions across the Phase 5, 7 and 12 suites, and a wave must
// not alter the typecheck configuration for every other phase to compile its own
// test. `require` is deliberately NOT re-declared: Jest's ambient typing already
// provides it, and shadowing it with a narrower signature breaks every other
// `require` in the file.
import { backendSourceRoot } from './support/backend-checkout';

declare const __dirname: string;

const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const readdirSync: (path: string, options: { withFileTypes: true }) => DirectoryEntry[] =
  require('fs').readdirSync;
const existsSync: (path: string) => boolean = require('fs').existsSync;
const join: (...parts: string[]) => string = require('path').join;
const relative: (from: string, to: string) => string = require('path').relative;

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
}

// The backend checkout is located by `support/backend-checkout`, which is
// also where the rule lives: not configured and absent is a skip, configured
// and absent is a failure. Eleven suites resolved this separately until
// 11 November 2026; FBL-001 is what that cost.
const BACKEND_SOURCE_ROOT = backendSourceRoot();

// ─────────────────────────────────────────────────────────────────────────────
// Reading the backend's route inventory
//
// The backend registers routes as minimal APIs, not attributes, so there is no
// manifest to read and no reflection available from here. The parse below is
// deliberately shallow — it recognises the four shapes the codebase actually
// uses and refuses anything else — and `unparseable` records every refusal so
// the guard test can fail if that number ever grows.
// ─────────────────────────────────────────────────────────────────────────────

interface BackendRoute {
  /** `GET /api/v1/media/{}` — verb, space, normalised path. */
  key: string;
  /** Repo-relative path of the file that maps it, for the failure message. */
  file: string;
}

interface BackendInventory {
  routes: Map<string, string>;
  /** Map calls whose receiving group could not be resolved. Should stay empty. */
  unparseable: string[];
  filesScanned: number;
}

/**
 * Route parameters are noise for this comparison.
 *
 * A register writes `/automations/{id}` and the backend writes
 * `/automations/{automationId:guid}`. They are the same route, and the whole
 * point of the check is to notice that. Every `{...}` segment collapses to `{}`,
 * duplicate slashes go, and a trailing slash goes — the backend's `MapGet("/")`
 * on a group is the group's own path, not a child of it.
 *
 * Lower-cased because ASP.NET routing is case-insensitive, so a register that
 * differs only in case is describing a route the backend really would answer.
 */
function normalisePath(path: string): string {
  const collapsed = path.replace(/\{[^}]*\}/g, '{}').replace(/\/{2,}/g, '/').toLowerCase();
  return collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
}

/** Every `.cs` file under a root, recursively. */
function collectCSharpFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.cs')) found.push(full);
    }
  };
  walk(root);
  return found;
}

/**
 * Comments stripped and whitespace flattened.
 *
 * The mapping calls span many lines — `endpoints\n  .MapGroup(...)` is the house
 * style — and flattening lets one regex see a whole statement. Line comments go
 * first so a commented-out `group.MapGet("/…")` never becomes a route; the
 * backend's XML doc comments are line comments too and are full of route-shaped
 * prose, which would otherwise be read as a live surface.
 */
function flattenSource(source: string): string {
  return source.replace(/\/\/[^\n]*/g, ' ').replace(/\s+/g, ' ');
}

/**
 * `MediaModuleMetadata.RoutePrefix` → `/api/v1/media`.
 *
 * Read from the metadata classes rather than hardcoded here, because a module
 * that renames its prefix must move this check with it rather than silently
 * stop matching. Only `/api/…` constants are collected: the metadata classes
 * also carry schema names and version strings, and a schema called `media` is
 * not a route prefix.
 */
function readRoutePrefixes(files: string[]): Map<string, string> {
  const prefixes = new Map<string, string>();

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const className = /public static class (\w+)/.exec(source);
    if (className === null) continue;

    const constant = /public const string (\w+)\s*=\s*"(\/api\/[^"]*)"/g;
    let match = constant.exec(source);
    while (match !== null) {
      prefixes.set(`${className[1]}.${match[1]}`, match[2]);
      match = constant.exec(source);
    }
  }

  return prefixes;
}

/**
 * Which prefixes each endpoint class is mounted under.
 *
 * A contributor either binds the group to a local and hands it round —
 * `var group = endpoints.MapGroup(Prefix); UploadEndpoints.Map(group);` — or
 * passes it inline: `RewardEndpoints.Map(endpoints.MapGroup(Prefix))`. Both
 * forms are here.
 *
 * The value is a list, not a single prefix, because four classes are genuinely
 * mounted twice. `RewardEndpoints` lives in Financial and is mapped by both the
 * Financial contributor under `/api/v1/financial` and the Creator contributor
 * under `/api/v1/rewards`; ASP.NET registers both, so both are real routes, and
 * treating this as last-one-wins would hide thirteen live endpoints.
 */
function readContributorWiring(
  sources: Map<string, string>,
  prefixes: Map<string, string>,
): Map<string, string[]> {
  const mounted = new Map<string, string[]>();

  const mount = (className: string, prefix: string | undefined): void => {
    if (prefix === undefined) return;
    const existing = mounted.get(className) ?? [];
    if (!existing.includes(prefix)) existing.push(prefix);
    mounted.set(className, existing);
  };

  for (const source of sources.values()) {
    const groupLocals = new Map<string, string | undefined>();
    let match: RegExpExecArray | null;

    const localGroup = /var (\w+) = (?:endpoints|app)\s*\.MapGroup\(\s*([\w.]+)\s*\)/g;
    while ((match = localGroup.exec(source)) !== null) {
      groupLocals.set(match[1], prefixes.get(match[2]));
    }

    const inlineGroup = /(\w+)\.Map\(\s*(?:endpoints|app)\s*\.MapGroup\(\s*([\w.]+)\s*\)/g;
    while ((match = inlineGroup.exec(source)) !== null) {
      mount(match[1], prefixes.get(match[2]));
    }

    const handOff = /(\w+)\.Map\(\s*(\w+)\s*\)/g;
    while ((match = handOff.exec(source)) !== null) {
      if (groupLocals.has(match[2])) mount(match[1], groupLocals.get(match[2]));
    }
  }

  return mounted;
}

/**
 * One pass over a file, in source order, keeping a running map of which builder
 * variable stands for which prefix.
 *
 * Order matters and that is why this is a single sequential scan rather than
 * four independent regexes. `AnalyticsEndpoints.cs` holds two contributors in
 * one file, each declaring its own `var group`, one under `/api/v1/analytics`
 * and one under `/api/v1/telemetry`. Harvesting the assignments first and the
 * `MapGet` calls second would attribute all nine routes to whichever `var group`
 * was seen last, and put the telemetry ingestion route under the analytics
 * prefix — a wrong route in the inventory is a false positive waiting to happen.
 *
 * The four alternatives, in order: a sub-group assignment, the `Map` method's
 * own `RouteGroupBuilder` parameter, a class declaration (which selects the
 * prefixes the following method body sits under), and a route mapping.
 */
const ROUTE_TOKEN = new RegExp(
  [
    // 1: local, 2: parent builder, 3: literal sub-path, 4: metadata constant
    /var (\w+) = (\w+)\s*\.MapGroup\(\s*(?:"([^"]*)"|([\w.]+))\s*\)/.source,
    // 5: the parameter name the helper receives its group as
    /(?:static )?void Map\(\s*RouteGroupBuilder (\w+)/.source,
    // 6: class whose mounting prefixes apply to what follows
    /(?:public |internal |sealed |static |abstract )*class (\w+)/.source,
    // 7: receiving builder, 8: verb, 9: literal path
    /(\w+)\s*\.Map(Get|Post|Put|Patch|Delete)\(\s*"([^"]*)"/.source,
  ].join('|'),
  'g',
);

function readBackendInventory(sourceRoot: string): BackendInventory {
  const allFiles = collectCSharpFiles(sourceRoot);
  const metadataFiles = allFiles.filter((file) => /ModuleMetadata\.cs$/.test(file));
  const apiFiles = allFiles.filter((file) =>
    /[\\/]Api[\\/].*(Endpoints|EndpointContributors?)\.cs$/.test(file),
  );

  const prefixes = readRoutePrefixes(metadataFiles);
  const sources = new Map<string, string>(
    apiFiles.map((file) => [file, flattenSource(readFileSync(file, 'utf8'))]),
  );
  const mounted = readContributorWiring(sources, prefixes);

  const collected: BackendRoute[] = [];
  const unparseable: string[] = [];

  for (const [file, source] of sources) {
    const repoRelative = relative(sourceRoot, file).replace(/\\/g, '/');
    // Which builder variable currently stands for which set of full prefixes.
    const builders = new Map<string, string[]>();
    // The prefixes the class being read is mounted under; `void Map(group)`
    // inside it binds its parameter to these.
    let classPrefixes: string[] = [];

    ROUTE_TOKEN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ROUTE_TOKEN.exec(source)) !== null) {
      const [, local, parent, literalSubPath, metadataConstant, groupParameter, className, receiver, verb, routePath] =
        match;

      if (local !== undefined) {
        // A group is either rooted at a module's prefix constant, or hung off a
        // builder already in scope. An unrecognised constant yields no bases
        // rather than a guess, so its routes are dropped from the inventory and
        // never become a false accusation against a register.
        const rootedAtConstant =
          metadataConstant === undefined ? undefined : prefixes.get(metadataConstant);
        const bases =
          metadataConstant !== undefined
            ? rootedAtConstant === undefined
              ? []
              : [rootedAtConstant]
            : (builders.get(parent) ?? []);
        builders.set(
          local,
          literalSubPath !== undefined ? bases.map((base) => base + literalSubPath) : bases,
        );
      } else if (groupParameter !== undefined) {
        builders.set(groupParameter, classPrefixes);
      } else if (className !== undefined) {
        classPrefixes = mounted.get(className) ?? [];
      } else if (receiver !== undefined) {
        const bases = builders.get(receiver);
        if (bases === undefined || bases.length === 0) {
          unparseable.push(`${repoRelative}: ${receiver}.Map${verb}("${routePath}")`);
          continue;
        }
        for (const base of bases) {
          collected.push({
            key: `${verb.toUpperCase()} ${normalisePath(base + routePath)}`,
            file: repoRelative,
          });
        }
      }
    }
  }

  // First writer wins so the reported file is the one that mapped it first,
  // which for a dual-mounted class is the module that owns the code.
  const routes = new Map<string, string>();
  for (const route of collected) {
    if (!routes.has(route.key)) routes.set(route.key, route.file);
  }

  return { routes, unparseable, filesScanned: apiFiles.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading what the registers claim is missing
//
// The registers are not one shape and never were — they were written by
// different phases against different briefs. Two families exist:
//
//   · `requiredContracts: [{ endpoint: 'GET /automations', method, … }]`
//     — Analytics, Automation, Integration, Multi-Community. Structured, and
//       the path is written *without* the `/api/v1` prefix.
//   · `missingContract: string[]`
//     — Community, Creator, Financial, Maps, Monetization. Prose lines, most of
//       which happen to open with `VERB /full/path — why`, and some of which are
//       not routes at all ("A `MembershipTier` aggregate carrying …").
//
// Both are read here rather than normalising the registers into one shape,
// because rewriting nine registers to make a check easier to write is how you
// get a check that tests the rewrite instead of the platform.
// ─────────────────────────────────────────────────────────────────────────────

interface DeclaredContract {
  endpoint?: string;
}

interface GapEntry {
  id?: string;
  /** Read to skip resolved gaps — see `collectDeclaredEndpoints`. */
  frontendStatus?: string;
  missingContract?: string[];
  requiredContracts?: DeclaredContract[];
  /**
   * What the register says the backend *already* serves.
   *
   * Read by `collectClaimedEndpoints` for the inverse check. Prose, so only the
   * backtick-quoted `VERB /path` forms inside it are treated as route claims.
   */
  existingBackendCapability?: string[];
}

type GapRegister = Record<string, GapEntry>;

interface RegisterSource {
  /** Repo-relative file, quoted verbatim in failures so it can be opened. */
  file: string;
  /** The exported symbol, likewise. */
  symbol: string;
  load: () => GapRegister;
}

/**
 * Static `require`s, not a loop over a glob.
 *
 * Jest resolves a computed `require` at runtime, so a loop would work — but a
 * register that got renamed would then vanish from the check silently, which is
 * the exact failure mode this wave exists to close. Listed by hand, and
 * `it('covers every register in src/config')` fails if the list falls behind
 * the directory.
 */
const REGISTERS: RegisterSource[] = [
  {
    file: 'src/config/analytics-gaps.ts',
    symbol: 'ANALYTICS_GAPS',
    load: () => require('@/config/analytics-gaps').ANALYTICS_GAPS,
  },
  {
    file: 'src/config/automation-gaps.ts',
    symbol: 'AUTOMATION_GAPS',
    load: () => require('@/config/automation-gaps').AUTOMATION_GAPS,
  },
  {
    file: 'src/config/community-gaps.ts',
    symbol: 'COMMUNITY_GAPS',
    load: () => require('@/config/community-gaps').COMMUNITY_GAPS,
  },
  {
    file: 'src/config/creator-gaps.ts',
    symbol: 'CREATOR_GAPS',
    load: () => require('@/config/creator-gaps').CREATOR_GAPS,
  },
  {
    file: 'src/config/financial-gaps.ts',
    symbol: 'BACKEND_GAPS',
    load: () => require('@/config/financial-gaps').BACKEND_GAPS,
  },
  {
    file: 'src/config/integration-gaps.ts',
    symbol: 'INTEGRATION_GAPS',
    load: () => require('@/config/integration-gaps').INTEGRATION_GAPS,
  },
  {
    file: 'src/config/maps-gaps.ts',
    symbol: 'MAPS_GAPS',
    load: () => require('@/config/maps-gaps').MAPS_GAPS,
  },
  {
    file: 'src/config/monetization-gaps.ts',
    symbol: 'MONETIZATION_GAPS',
    load: () => require('@/config/monetization-gaps').MONETIZATION_GAPS,
  },
  {
    file: 'src/config/multi-community-gaps.ts',
    symbol: 'MULTI_COMMUNITY_GAPS',
    load: () => require('@/config/multi-community-gaps').MULTI_COMMUNITY_GAPS,
  },
];

interface DeclaredEndpoint {
  register: RegisterSource;
  /** The gap's stable id where it has one, else its key in the record. */
  gapId: string;
  /** The declaration exactly as written, so the failure can be grepped for. */
  declaration: string;
  /** `GET /api/v1/automations/{}`, ready to compare. */
  candidateKeys: string[];
}

/**
 * `POST /api/v1/x — because …` → verb and path. Anything else → nothing.
 *
 * Only the *opening* of the string counts. `existingSeams` and
 * `whyNotImplementable` are full of routes that exist — that is what a seam is —
 * and they are never read here, but even within `missingContract` a line like
 * "A payout-destination contract (create, list, …)" is a capability and not a
 * route, and must not be guessed at.
 */
function parseDeclaration(declaration: string): { verb: string; path: string } | null {
  const match = /^\s*`?(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s`]*)/.exec(declaration);
  if (match === null) return null;

  const path = match[2];
  // A wildcard or a query string cannot be compared to a mapped route without
  // inventing what it expands to, and inventing is how false positives start.
  if (path.includes('*') || path.includes('?')) return null;

  return { verb: match[1], path };
}

/**
 * The keys a declaration could match.
 *
 * The prose registers write full paths (`/api/v1/communities/…`). The structured
 * ones write module-relative paths (`GET /automations`, `GET /analytics/growth`)
 * because they were describing a contract to be built rather than a URL to call.
 * A relative path is therefore also tried with `/api/v1` in front, which is the
 * only reading it can have — the backend mounts every module under `/api/v1`.
 */
function candidateKeysFor(verb: string, path: string): string[] {
  const normalised = normalisePath(path);
  if (normalised.startsWith('/api/')) return [`${verb} ${normalised}`];
  return [`${verb} ${normalised}`, `${verb} ${normalisePath(`/api/v1${path}`)}`];
}

function collectDeclaredEndpoints(): DeclaredEndpoint[] {
  const declared: DeclaredEndpoint[] = [];

  for (const register of REGISTERS) {
    const entries = register.load();

    for (const [key, gap] of Object.entries(entries)) {
      const gapId = gap.id ?? key;

      // ── A resolved gap's contracts are a record, not a live claim ──────────
      //
      // Added after Wave C-05 ran into a contradiction in this file's own
      // design. The instruction it was given — keep `requiredContracts` and
      // delete the `KNOWN_STALE` line — is impossible while this function reads
      // every declaration regardless of status: the contract is still declared,
      // so the check still reports it, so the baseline line still has to exist.
      // That agent tested it, watched the build fail, and said so rather than
      // working around it.
      //
      // The contradiction was in the instruction, but the wart is here. Wave
      // C-02 established the right way to record a resolution — keep the
      // contract, change `frontendStatus`, rewrite `existingBackendCapability`
      // to quote the sentence it used to carry — and under the old reading that
      // left twenty-one automation lines permanently baselined as "stale"
      // *because they had been fixed*. A ratchet whose list grows as you repair
      // things is measuring the wrong quantity.
      //
      // So a gap whose `frontendStatus` says the backend is connected is no
      // longer making a claim of absence. Its contracts stay in the file as the
      // historical record this remediation keeps arguing for, and drop out of
      // this comparison. The check now tracks *unresolved* declarations, which
      // is what it was always meant to count.
      //
      // `BACKEND PARTIAL` is treated as resolved for this purpose. It means some
      // of the contract landed, so an entry still declaring the whole of it is a
      // description of what remains rather than an assertion that none of it
      // exists — and the register's prose is the right place to carry that
      // nuance, not a route-by-route diff.
      const status = gap.frontendStatus ?? '';
      if (status.includes('BACKEND CONNECTED') || status.includes('BACKEND PARTIAL')) {
        continue;
      }

      const declarations: string[] = [
        ...(gap.missingContract ?? []),
        ...(gap.requiredContracts ?? []).map((contract) => contract.endpoint ?? ''),
      ];

      for (const declaration of declarations) {
        const parsed = parseDeclaration(declaration);
        if (parsed === null) continue;
        declared.push({
          register,
          gapId,
          declaration,
          candidateKeys: candidateKeysFor(parsed.verb, parsed.path),
        });
      }
    }
  }

  return declared;
}

/**
 * Routes a register claims the backend **already serves**.
 *
 * The inverse of `collectDeclaredEndpoints`, and it exists because Wave K found
 * the drift running the other way. `analytics-gaps.ts` asserted, in prose:
 *
 *   "`GET /employers/{id}` is a real employer profile."
 *
 * It is not. `EmployerEndpoints.cs` maps register, update and dashboard, and
 * none of them reads a profile by id — so a screen was built against a route
 * that has never existed, answered only by a development fixture, and the
 * register vouched for it.
 *
 * The check below could not see that. It reads *declared-missing* endpoints and
 * fails when the backend serves them — the 164-stale-entries direction. A
 * register claiming a route exists when it does not passed silently, because
 * nothing looked that way.
 *
 * Both directions are the same underlying failure: **a register is a claim with
 * a date on it, and nothing was re-reading it.** One direction costs a feature
 * that was already built and nobody connected. The other costs a screen built on
 * a route that was never there — which is worse, because it fails for a member
 * rather than for a developer.
 *
 * Only backtick-quoted `VERB /path` forms are read. The rest of these arrays is
 * capability prose — "B15's `/financial/capabilities` is a real, live example of
 * exactly this shape" — and parsing prose for route claims would produce false
 * alarms, which is how a check gets switched off.
 */
function collectClaimedEndpoints(): DeclaredEndpoint[] {
  const claimed: DeclaredEndpoint[] = [];

  for (const register of REGISTERS) {
    const entries = register.load();

    for (const [key, gap] of Object.entries(entries)) {
      const gapId = gap.id ?? key;
      const claims: string[] = [...(gap.existingBackendCapability ?? [])];

      for (const claim of claims) {
        // Every backtick-quoted route in the sentence, not just a leading one:
        // these are prose, and the route is rarely the first token.
        const quoted = claim.match(/`(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s`]*)`/g) ?? [];

        for (const token of quoted) {
          const parsed = parseDeclaration(token.replace(/`/g, ''));
          if (parsed === null) continue;

          // A `*-gap/v0` path is a development adapter, and the registers say so
          // in the same sentence — "They are development-adapter contracts, not
          // certified ones." Comparing one against the backend would report a
          // route missing that was never claimed to be there.
          if (/-gap\/v\d/.test(parsed.path)) continue;
          claimed.push({
            register,
            gapId,
            declaration: claim,
            candidateKeys: candidateKeysFor(parsed.verb, parsed.path),
          });
        }
      }
    }
  }

  return claimed;
}

// ─────────────────────────────────────────────────────────────────────────────
// The check
// ─────────────────────────────────────────────────────────────────────────────

const describeAgainstBackend = BACKEND_SOURCE_ROOT === null ? describe.skip : describe;

/**
 * The inventory, read once and only when there is something to read.
 *
 * `describe.skip` skips the *tests*, not the callback — Jest still runs the body
 * to collect them. Parsing at describe scope therefore ran `readdirSync(null)`
 * on a machine without the backend and turned the intended skip into "Test suite
 * failed to run", which is the failure this file is supposed to avoid. The empty
 * inventory below is never compared against anything, because every test that
 * would use it is skipped; it exists so the collection pass has something to
 * hold.
 */
let cachedInventory: BackendInventory | null = null;
function backendInventory(): BackendInventory {
  if (BACKEND_SOURCE_ROOT === null) return { routes: new Map(), unparseable: [], filesScanned: 0 };
  if (cachedInventory === null) cachedInventory = readBackendInventory(BACKEND_SOURCE_ROOT);
  return cachedInventory;
}

describe('the backend checkout this suite compares against', () => {
  it('is present, or this file has told you why it is not', () => {
    if (BACKEND_SOURCE_ROOT === null) {
      // Not an assertion. A cross-repo check that cannot see the other repo has
      // not passed and has not failed — it has not run, and the log is the only
      // place that can say so.
      const configured = process.env.DIASPORA_BACKEND_PATH;
      console.warn(
        [
          'SKIPPED: gap-register drift was not checked — no diaspora-backend checkout.',
          configured !== undefined && configured !== ''
            ? `DIASPORA_BACKEND_PATH is set to "${configured}", and there is no src/ under it.` +
              ' The variable is authoritative, so the sibling directory was not tried.'
            : 'DIASPORA_BACKEND_PATH is unset and the sibling ../diaspora-backend has no src/.',
          'Registers may be declaring contracts the backend already serves, and this run did not look.',
        ].join(' '),
      );
    }
    expect(BACKEND_SOURCE_ROOT === null || BACKEND_SOURCE_ROOT.length > 0).toBe(true);
  });
});

describeAgainstBackend('the routes the backend actually serves', () => {
  const inventory = backendInventory();

  it('parses the backend well enough to be worth trusting', () => {
    // A floor, not an equality. The backend gains routes constantly and this
    // test must not become the thing that fails when it does. What it catches is
    // the parse quietly breaking — a refactor to the contributor convention that
    // leaves this file reading nothing, at which point every register below
    // "passes" because the inventory is empty.
    expect(inventory.filesScanned).toBeGreaterThanOrEqual(100);
    expect(inventory.routes.size).toBeGreaterThanOrEqual(700);
  });

  it('resolves every mapped route to a group', () => {
    // Each entry here is a `MapGet`/`MapPost` whose receiving builder this file
    // could not trace back to a prefix, which means a real route is missing from
    // the inventory and a stale register entry about it would go unnoticed.
    // Empty today; if it stops being empty, extend the scan rather than raising
    // the number.
    expect(inventory.unparseable).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The debt this wave inherited
//
// 136 declarations across eight registers already name a route the backend
// serves. They are written out below rather than counted, because a threshold
// ("no more than 136") lets one entry go stale for every one that gets fixed
// and reports the same green tick throughout.
//
// This list is a ratchet and it fails in **both** directions:
//
//   · a new stale declaration is not in the list, so it fails;
//   · a declaration that gets fixed is in the list and no longer stale, so it
//     also fails, until the line below is deleted along with the register entry.
//
// That second direction is the point. The list can only shrink, and it is meant
// to reach zero. Nothing here is approved — every line is a screen running
// against a simulated adapter while the real contract sits unconsumed in
// `diaspora-backend`, which is the condition the platform audit found and the
// reason this file exists.
//
// The key is `register file · gap id · the backend route matched`. The matched
// route rather than the declaration verbatim, because several declarations are
// two hundred characters of prose and this list has to stay readable.
//
// ── What is correctly absent from this list ──────────────────────────────────
//
// The value of the list is as much in what it leaves out. Of Automation's 39
// declared contracts, 21 are here and 18 are not, and the 18 include all
// fourteen `/automations/triggers/**/context` routes — the module was right
// about those, the backend has never served one, and a check that flagged them
// would be telling a register to delete a true statement.
//
// `src/config/maps-gaps.ts` contributes nothing at all: every contract it
// declares missing is still missing. Neither does the Trust/Media cross-module
// gap appear, because it is real. Those are the entries that prove the check
// discriminates rather than simply objecting to every register it can read.
// ─────────────────────────────────────────────────────────────────────────────

/** `register · gapId · VERB /path`, the line a reader pastes into the list below. */
function claimKey(claim: DeclaredEndpoint): string {
  return `${claim.register.file} · ${claim.gapId} · ${claim.candidateKeys[0]}`;
}

/**
 * Register claims of "the backend already serves this" that are known to be wrong.
 *
 * **This docblock said "Deliberately empty" above a list of seventeen entries,
 * in two places, for the whole of this remediation.** It was written when the
 * list *was* empty and was never re-read as the list grew — which is the same
 * failure the entries below record, committed by the check that records them.
 *
 * What is actually here is a list of inherited claims, each a register vouching
 * for a route the backend has never served. They are listed rather than
 * corrected because each needs the owning register's prose rewritten rather than
 * a find-and-replace. **The list may only shrink**, in both directions: a new
 * wrong claim fails the forward check, and a line that has stopped being true
 * fails the reverse one below it.
 *
 * **No count is given here, deliberately.** The first attempt at this docblock
 * said "thirteen" and the array held twelve -- wrong within the same hour, in the
 * file whose entire subject is documentation that stopped matching the thing it
 * documents. A number in prose that no assertion reads is a claim with nothing
 * holding it, and the honest fix is not a better number, it is no number: count
 * the array.
 */
const KNOWN_ABSENT_CLAIMS: readonly string[] = [
  // -- Where the twenty nonexistent frontend calls came from -----------------
  //
  // Every line below is a register asserting the backend serves a path it has
  // never served. Read together they answer a question the platform audit left
  // open: the client's nonexistent calls were not invented at the call site,
  // they were **written against a register that vouched for the route**, and
  // nothing re-read either side.
  //
  // The sharpest is `POST /auth/otp/send`. INTEGRATION_GAPS called it and
  // `/auth/otp/verify` *"the only authentication contracts"* -- and Wave A found
  // both 404ing on every sign-in attempt, because the real routes are
  // `/auth/otp/start` and `/auth/otp/sign-in`. Three separate gap entries repeat
  // the claim.
  //
  // `GET /listings`, `/housing`, `/neighborhood/{id}` and `/discovery/search`
  // are the same story: all four were corrected as *call sites* in Wave A', and
  // the registers that recommended them were never touched. A future screen
  // reading these entries would make the identical mistake.
  //
  // Inherited debt, listed rather than corrected here because each needs the
  // owning register's prose rewritten rather than a find-and-replace. The list
  // may only shrink -- the ratchet fails when a line stops being true.
  //
  // `FRONTEND-PHASE15-GAP-012 · GET /employers/{}` stood here until 15 Sep 2026
  // as a parser artefact: the entry read "`GET /employers/{id}` does NOT exist",
  // and the check saw the quoted route inside the negation. The sentence was
  // also wrong about the capability -- the server serves the profile at
  // `GET /jobs/employers/{idOrSlug}` -- and now names that route instead.
  //
  // `FRONTEND-PHASE15-GAP-010 · GET /listings` stood here until 13 Sep 2026, when
  // the provider dashboard was built on that entry and its prose was rewritten:
  // providers are listed by `GET /providers`.
  // `FRONTEND-PHASE15-GAP-006 · GET /communities/{}/statistics` stood here until
  // 20 Oct 2026, when CommunityProgramme began serving the statistics route
  // (d07a707) and the claim became true.
  // `FRONTEND-PHASE15-GAP-007 · GET /neighborhood/{}` stood here until 20 Oct
  // 2026, when the neighbourhood dataset was wired to `/geo/area` and
  // `/community-life/area/activity` and the entry was rewritten to name them.
  'src/config/analytics-gaps.ts · FRONTEND-PHASE15-GAP-013 · GET /housing',
  'src/config/analytics-gaps.ts · FRONTEND-PHASE15-GAP-019 · GET /explore/recommendations',
  'src/config/analytics-gaps.ts · FRONTEND-PHASE15-GAP-020 · GET /discovery/search',
  'src/config/analytics-gaps.ts · FRONTEND-PHASE15-GAP-024 · GET /neighborhood/{}',
  // ── Closed by Remediation Wave M-5 ──
  //
  // The four `integration-gaps.ts` lines that stood here were the sharpest
  // entries in this list: GAP-002 called `/auth/otp/send` and `/auth/otp/verify`
  // "the only authentication contracts", and Wave A had already found both
  // 404ing on every sign-in attempt because the real routes are
  // `/auth/otp/start` and `/auth/otp/sign-in`. Three gap entries repeated the
  // claim.
  //
  // A note here said Wave C-05 had corrected all of them. **It had not.** The
  // register still carried the two sentences verbatim, and the four baseline
  // lines sat directly above the note saying they were gone — a retraction and
  // its own contradiction in one file, which is how the claim survived three
  // more waves of people reading this list. They are corrected now, in the
  // register, and verified against `AuthController.cs`.
  //
  // One of the four had **already stopped being true** before that: GAP-007 no
  // longer quoted the route at all, and nothing noticed, because this list had
  // only a forward ratchet. That is the reverse check below.
  //
  // The corrected sentences name the real paths **without route syntax** —
  // `` `/auth/otp/start` `` rather than `` `POST /auth/otp/start` ``. That is
  // not evasion of this check, it is accuracy about what it can see: those are
  // Identity **controller** routes (`AuthController.cs:158`, `:183`), and this
  // file's inventory reads mapped module endpoints. Quoting them in route form
  // would make a true statement fail `does not claim the backend serves a route
  // it does not`, which reads the inventory rather than the platform.
  'src/config/multi-community-gaps.ts · FRONTEND-PHASE13-GAP-002 · GET /neighborhood/{}',
  'src/config/multi-community-gaps.ts · FRONTEND-PHASE13-GAP-007 · GET /neighborhood/{}',
  // `FRONTEND-PHASE13-GAP-009 · GET /housing` stood here and was **found by the
  // reverse check above on the first run after it was written**. The register had
  // already been corrected — GAP-009 now quotes `GET /housing/search`, which is
  // real — and the baseline line outlived the claim by however many waves.
  // Two lines in this list were wrong in that direction, and the list had no way
  // to say so until now.
  'src/config/multi-community-gaps.ts · FRONTEND-PHASE13-GAP-010 · GET /discovery/search',
  'src/config/multi-community-gaps.ts · FRONTEND-PHASE13-GAP-011 · GET /explore/recommendations',
];

const KNOWN_STALE: readonly string[] = [
  // -- 20 Oct 2026: creator recommendations are real ----------------------
  // `POST /recommendations/{id}/dismiss` is served by Recommendations
  // (CreatorRecommendationEndpoints.cs) and the creator rail calls it.
  //
  // COMMUNITY-LIFE-GAP-018's line went the same day: the Community Life hub's
  // rail reads `GET /recommendations/communities` and dismisses through
  // `POST /recommendations/dismiss`, and the register records the entry as
  // BACKEND PARTIAL — so its declarations left the comparison.
  'src/config/creator-gaps.ts · CREATOR-GAP-013 · POST /api/v1/recommendations/{}/dismiss',

  // -- src/config/monetization-gaps.ts -- 9 (B16 Advertising) ----------------
  //
  // Nine declarations that were true when they were written. B16 shipped the
  // advertising campaign: the aggregate, its lifecycle, its review and its
  // performance are all real routes and the client calls them.
  //
  // **The lines stay because the declarations stay.** Same rule as everywhere
  // else in this list: a gap the backend serves is marked resolved *in the
  // register* -- `backendStatus` becomes `connected` and `existingSeams` says
  // what exists -- while `missingContract` keeps the contract it asked for.
  // Emptying it would delete the declaration this check reads, so the entry
  // would stop being monitored rather than be recorded as resolved.
  //
  // Two of MON-GAP-001's declarations are *not* here, and their absence is the
  // interesting part:
  //
  //   * `POST /campaigns/{id}/resume` -- the register wrote pause and resume as
  //     one line, so only the `/pause` spelling is matched.
  //   * The `campaign.status.changed` event and the `CampaignStatus` enum are
  //     prose rather than routes, so this check never saw them. Both shipped.
  //
  // MON-GAP-006 and -007 contribute nothing below: their declarations name
  // routes that were *not* built as declared. The review lives on the campaign
  // rather than on `PlacementStatus`, and the targeting options route takes a
  // dimension rather than a country. Both are recorded in the register as
  // divergences with the reasoning; neither declaration became stale, because
  // neither was served at the path it named.
  'src/config/monetization-gaps.ts · MON-GAP-001 · POST /api/v1/financial/campaigns',
  'src/config/monetization-gaps.ts · MON-GAP-001 · GET /api/v1/financial/campaigns/{}',
  'src/config/monetization-gaps.ts · MON-GAP-001 · PUT /api/v1/financial/campaigns/{}',
  'src/config/monetization-gaps.ts · MON-GAP-001 · POST /api/v1/financial/campaigns/{}/submit',
  'src/config/monetization-gaps.ts · MON-GAP-001 · POST /api/v1/financial/campaigns/{}/pause',
  'src/config/monetization-gaps.ts · MON-GAP-001 · POST /api/v1/financial/campaigns/{}/cancel',
  'src/config/monetization-gaps.ts · MON-GAP-002 · GET /api/v1/financial/campaigns/{}/performance',
  'src/config/monetization-gaps.ts · MON-GAP-002 · GET /api/v1/financial/placements/{}/performance',
  'src/config/monetization-gaps.ts · MON-GAP-002 · GET /api/v1/financial/placements/me/performance/summary',

  // ── src/config/multi-community-gaps.ts — 6 (B18 Phase 1) ──────────────────
  //
  // Six declarations that were true when they were written and are not now.
  // B18 shipped the community entity: the directory, the profile, the join and
  // leave transitions and the capability set are all real routes, and the
  // client calls them.
  //
  // **The lines stay because the declarations stay**, which is the rule this
  // file records at length further down: a gap the backend now serves is
  // marked resolved *in the register* — `backendStatus` becomes `connected`,
  // `coverage` becomes `full`, and `existingBackendCapability` says what exists
  // — while `requiredContracts` keeps the contract it asked for. Emptying that
  // array would delete the declaration this check reads, so the entry would
  // stop being monitored rather than be recorded as resolved. The register is a
  // historical record; a resolved entry says it was wrong, it does not vanish.
  //
  // Two of the six are worth reading rather than skimming, because the route
  // that shipped is **not** the route declared:
  //
  //   · GAP-003's set is served at `/communities/me/memberships`, not
  //     `/communities/memberships/me` — that path was already taken by B18's
  //     *programme* memberships, a different concept wearing the same word, and
  //     this register had GAP-003 marked connected against it for a whole
  //     phase. It does not appear below because the declared path is still
  //     genuinely unserved.
  //   · GAP-005's primary is at `/communities/me/primary`, not
  //     `/users/me/primary-community` — no module owns `/api/v1/users`, so the
  //     entry named a prefix that does not exist. Same reason for its absence.
  //
  // GAP-022 is here too and is `partial`, not connected: the lifecycle status
  // and its reason are real on the profile route, and the notification path
  // that tells a member their community changed state is not.
  'src/config/multi-community-gaps.ts · FRONTEND-PHASE13-GAP-001 · GET /api/v1/communities',
  'src/config/multi-community-gaps.ts · FRONTEND-PHASE13-GAP-002 · GET /api/v1/communities/{}',
  'src/config/multi-community-gaps.ts · FRONTEND-PHASE13-GAP-004 · POST /api/v1/communities/{}/membership',
  'src/config/multi-community-gaps.ts · FRONTEND-PHASE13-GAP-004 · DELETE /api/v1/communities/{}/membership',
  'src/config/multi-community-gaps.ts · FRONTEND-PHASE13-GAP-006 · GET /api/v1/communities/{}/capabilities',
  'src/config/multi-community-gaps.ts · FRONTEND-PHASE13-GAP-022 · GET /api/v1/communities/{}',

  // ── Empty. 136 -> 0. ──────────────────────────────────────────────────────
  //
  // Everything below this line is the record of how it emptied, kept because
  // the reasoning is the useful part and a list with nothing in it explains
  // nothing. **Read it as history, not as inventory** -- it describes lines
  // that are no longer here, and it said "these fifteen lines" above an empty
  // array from the wave that emptied it until Wave M-5 corrected the heading.
  //
  // -- Restored after a mid-wave interruption (Wave C-05) --------------------
  //
  // The Integrations/Maps wave deleted fifteen lines as it connected the
  // routes, which is the ratchet working exactly as designed. It then emptied
  // the matching `requiredContracts` arrays in `integration-gaps.ts` -- and did
  // not survive to finish the wave.
  //
  // The register edit was reverted for two reasons. Emptying `requiredContracts`
  // removes the declaration this check reads, so the entry silently stops being
  // monitored rather than being recorded as resolved; and Wave C-02 had already
  // established the right pattern for a connected gap, which is to keep the
  // contract and change `frontendStatus` and `existingBackendCapability` so the
  // historical claim stays legible.
  //
  // So the declarations are back, and their baseline lines are back with them.
  // The clients and hooks the wave wrote remain on disk and are typechecked, but
  // the wave is not finished and the register should not claim it is.

  // ── src/config/analytics-gaps.ts — 0 ──
  //
  // Four closed by Remediation Wave C-06, and one of the four was closed by
  // reading rather than by writing: GAP-029's telemetry transport had been
  // connected since Wave C-03, and the register still said `deliver()` pushed to
  // a buffer nothing drained. It is PARTIAL rather than CONNECTED because what
  // remains is at the emitter: the server registry accepts seven client-
  // submittable event names, this app emits four of them, and every other name
  // in five client vocabularies is refused — invisibly, until this wave made
  // `flushTelemetry` read the per-event verdicts it was already receiving.
  //
  // The other three needed the arm built: `fetchAnalyticsAccess`,
  // `fetchAnalyticsDefinitions` and `fetchContentAnalytics` in
  // `lib/analytics-api.ts`, with `useAnalyticsAccess`, `useAnalyticsDefinitions`
  // and `useAnalyticsDataset` reading them.
  //
  // Three divergences worth the reader's time, none of which a path comparison
  // could have seen:
  //
  //   · `/analytics/definitions` answers `{ version, definitions }` — an
  //     envelope — where GAP-030 declared a bare array. The `undefined.map`
  //     that `/rewards/rules` produced, waiting to happen again.
  //   · The content dataset's `changePercent` is a **ratio**, while the Phase 7
  //     creator summary the same client reads sends a percentage. Copying the
  //     adapter's `/100` would have rendered a 12% change as 0.12%.
  //   · `/analytics/access` sends Phase 7 snake metric keys and the dataset
  //     sends Phase 15 dotted ones, so `restrictedMetrics` could never match
  //     anything and no metric was ever restricted. One module, two key spaces,
  //     on two routes a screen reads together.
  //
  // And one failure that only existed in release builds: `useAnalyticsAccess`
  // ran the gap query and nothing else, so with the gap switch off it never ran
  // and every screen fell back to all-capabilities-false. A release build was
  // not showing a member less analytics than a development build — it was
  // showing them none.

  // ── src/config/automation-gaps.ts — 0 ──
  //
  // The register that opened "None. No automation, rule, workflow or trigger
  // contract exists anywhere in the certified surface" while the backend was
  // serving twenty-four routes under `/api/v1/automations`. Its thirteen
  // trigger-context contracts were never listed here, because those really are
  // absent — which is what makes the rest of this file worth reading.
  //
  // The last line was GAP-030's template catalogue, and it survived two waves for
  // a reason worth recording. Wave C-02 wrote that the route "exists and is
  // consumed"; the arm existed and nothing called it. An arm that is never called
  // is not a connected route, and the honest move on finding that was to correct
  // the sentence rather than the status — which is what C-06 did first, before
  // building the consumer that let the status change be true.
  //
  // What it consumes is narrower than the obvious reading, and the route's own
  // contract is why. `/automations/templates` is filtered to what the member may
  // create and the unfiltered catalogue is never served, so an id missing from
  // the response is either one they lack a capability for or one this deployment
  // does not publish. Nothing can tell those apart, so nothing narrows the
  // gallery on it. It answers the one question it can: which templates the
  // deployment publishes that this build cannot render.

  // ── src/config/community-gaps.ts — 0 ──
  //
  // Was 46, then 10. Remediation Wave C-04 connected GAP-001, -002, -003, -004,
  // -009, -010, -011, -012, -013 and -016 to
  // `Diaspora.Modules.CommunityProgramme` and, for the event series, to
  // `Diaspora.Modules.CommunityLife`; the resolution is recorded in the
  // register's `frontendStatus` and `existingBackendCapability`.
  //
  // The last ten — the fundraising campaign wrapper (GAP-006), campaign
  // transparency (GAP-007) and recurring donations (GAP-008) — were the ones
  // that had a served route and **no client arm calling it**, which is why they
  // stayed baselined rather than resolved. The arm now exists:
  // `community-programme-api.ts` calls the campaign routes B18 maps at the
  // register's own paths and the two B15.1 giving routes at B15's, and
  // `hooks/community-life.ts` reads them. GAP-008 is recorded PARTIAL rather
  // than CONNECTED because the scheduler behind it sits on a deployment switch
  // that nothing on the wire reports — see its entry.
  //
  // This register is now empty of stale lines. That is the state the check was
  // built to reach, and an entry reappearing here means a register started
  // claiming absence again.


  // ── src/config/financial-gaps.ts — 0 ──
  //
  // All six closed. `deposit`, `withdrawal` and `rewards` are now
  // `frontendStatus: 'BACKEND PARTIAL'`, so they drop out of the comparison
  // above and their baseline lines had to go with them — the second pawl.
  //
  // PARTIAL rather than CONNECTED, and the distinction is the whole finding.
  // All six routes exist and all three capabilities are **switched off**:
  //
  //   · `POST /wallets/me/deposits` → 503 `financial.deposits.not_supported`
  //     unless `FinancialOptions.EnableDeposits`, which defaults to false
  //     (`DepositHandlers.cs:100`, `FinancialOptions.cs:84`).
  //   · `POST /wallets/me/withdrawals` → 503 `financial.payouts.not_supported`
  //     whenever no `ISettlementProvider` is registered, and none ships
  //     (`WithdrawalHandlers.cs:96`, `FinancialModule.cs:233`).
  //   · `POST /rewards/conversions` → 409 `financial.rewards.conversion_not_supported`
  //     unless `EnableRewardConversion` **and** a published rate above zero
  //     (`RewardHandlers.cs:78`, `:305`).
  //
  // A route existing is not a capability existing. The gap arms stay, the
  // `GapNotice` stays, and the registers now say why — which is a different
  // statement from "no contract exists", the one they used to make.

  // ── src/config/integration-gaps.ts — 15, and they are listed at the TOP ──
  //
  // **The fifteen lines for this register are the block at the head of this
  // list, not here.** They stay, and they stay for the same reason Automation's
  // twenty-one stay: a connected gap keeps its `requiredContracts`, so the check
  // above keeps matching them, so their baseline lines keep being needed.
  //
  // This heading said "— 0 —" and claimed all fifteen were closed. That was
  // written by the wave that emptied the `requiredContracts` arrays, which is
  // the one edit that would have made it true and is the one edit that was
  // reverted — emptying the array removes the declaration this check reads, so
  // the entry stops being monitored rather than being recorded as resolved.
  //
  // The distinction is worth stating plainly, because "resolved" and "deleted"
  // look identical from inside this file and are opposite things:
  //
  //   · A gap the backend now serves is marked resolved **in the register** —
  //     `frontendStatus` becomes `BACKEND CONNECTED`/`PARTIAL` and
  //     `existingBackendCapability` says what exists, quoting the sentence it
  //     used to carry. The contract stays declared. The `KNOWN_STALE` line stays.
  //   · A `KNOWN_STALE` line is deleted only when the *declaration* goes — a
  //     contract genuinely withdrawn, or a gap id or path that moved.
  //
  // Wave C-05 did the first for eleven entries. None of the fifteen lines below
  // became deletable, and deleting one while its contract is still declared
  // fails `has not grown a declaration that is newly wrong` — verified by doing
  // it. The register is a historical record; a resolved entry says it was
  // wrong, it does not vanish.
  //
  // It was the second-worst entry in this file after Automation's, and for the
  // same reason: the register opened with "Calendar, government, and
  // third-party identity — nothing at all. No OAuth of any kind exists anywhere
  // in the application" while `Diaspora.Modules.Integrations` was serving
  // fifteen routes under `/api/v1/integrations` — a module whose own endpoint
  // contributor says the shapes were taken *from this client*: "Route shapes
  // come from the frontend, not from this module … Only the prefix changes."
  //
  // What the wave found that the ratchet could not have:
  //
  //   · GAP-007 asked for `/auth/identities`. That path has never existed. The
  //     capability is real and lives at `/integrations/identities`, so the
  //     declaration was simultaneously stale *and* wrong about where — which is
  //     invisible to a check that compares declared paths against served ones.
  //   · GAP-004 declared the calendar delete as `{ data: { deleted: boolean } }`.
  //     It answers `data: null`, so a client reading `.deleted` gets `undefined`
  //     and a successful delete renders as a failure.
  //   · GAP-002 declared a `session` on the exchange. There is none, and
  //     `intent: "signIn"` is refused at both ends by design.
  //   · Three entries — GAP-014, GAP-016, GAP-017 — declared an *existing*
  //     route as a required contract because what they actually wanted was a
  //     new **field** on it. Two of those fields have since shipped.
  //   · GAP-005 is the one the wave could not finish closing, and the register
  //     now says so rather than rounding it up. Export sync is connected;
  //     `direction: "import"` and `"both"` are refused on every deployment,
  //     by design rather than by omission, so the entry is BACKEND PARTIAL.
  //
  // The four `government*` contracts remain declared and remain genuinely
  // missing, which is what keeps `reads a contract out of every register`
  // meaningful for this file.

  // ── src/config/monetization-gaps.ts — 0 ──
  //
  // All seven closed by Remediation Wave C-06, and closed by building the client
  // arms rather than by relabelling the entries. The wave before it had verified
  // that all eleven monetization and analytics routes were served and that **no
  // client arm called any of them**, and refused to mark them connected on the
  // grounds that a wired-looking register over an unconsumed route is the same
  // failure in the opposite direction. That was the right call, and the answer to
  // it was the arms:
  //
  //   · MON-GAP-003 — `previewSubscriptionChange`, `changeSubscriptionPlan`,
  //     consumed by `app/monetization/change-plan.tsx`.
  //   · MON-GAP-004 — `renewPlacement`, `setPlacementAutoRenew`, and
  //     MON-GAP-005 — `pausePlacement`, `resumePlacement`, all four consumed by
  //     `app/monetization/promotions/[id].tsx`.
  //   · MON-GAP-008 — `fetchMyEntitlements`, consumed by `useEntitlements`.
  //   · MON-GAP-009 — `fetchUpcomingCharges`, consumed by
  //     `app/monetization/billing.tsx`.
  //
  // Two are PARTIAL rather than CONNECTED and the reason is on the wire in both
  // cases: GAP-004 still has no `placement.expiring` event, and GAP-009's two
  // invoice routes did not exist then. They do since backend 9d0caaf
  // (`InvoiceEndpoints.cs`, 20 Oct 2026), with a tax field that is honestly
  // zero; GAP-009 is CONNECTED and read by `useInvoices` / `useInvoice`.
  //
  // Three divergences the ratchet could not have seen, recorded in the entries:
  // renew answers a **purchase** and not a placement, and its payment intent is
  // created rather than captured; `/subscriptions/me/upcoming` answers a **list**
  // where the entry declared one charge; and `PlanChangePreviewResponse
  // .nextChargeAt` is nullable where the adapter's was not, which rendered
  // "Invalid Date" on any plan with no next charge.

  // ── src/config/multi-community-gaps.ts — 0 ──
  //
  // GAP-003 was closed by *reading* rather than by writing. `MembershipEndpoints
  // .cs:67` was already called by `community-programme-api.ts` and already read by
  // `hooks/community-life.ts` — the entry was baselined here on the assumption
  // that nothing consumed it, and the assumption was never checked.
  //
  // It is recorded PARTIAL, not CONNECTED, because the check found the register
  // wrong about the *shape* as well as the status: the entry declares
  // `{ data: { memberships: [...], primaryCommunityId } }` and the route answers a
  // bare array with no `primaryCommunityId` at all. A client reading
  // `.memberships` gets `undefined`, and §7's primary community still has no
  // contract behind it. That is invisible to a check comparing paths.
];

describeAgainstBackend('gap registers that describe a contract the backend now serves', () => {
  const inventory = backendInventory();
  const declared = collectDeclaredEndpoints();

  /** Every declaration that names a route the backend really answers. */
  const stale = declared
    .map((entry) => {
      const matched = entry.candidateKeys.find((key) => inventory.routes.has(key));
      return matched === null || matched === undefined ? null : { entry, matched };
    })
    .filter((found): found is { entry: DeclaredEndpoint; matched: string } => found !== null);

  it('reads a contract out of every register', () => {
    // Guards the other half of the parse. If `parseDeclaration` stopped matching
    // — a register switching from `GET /x` to `Get: /x`, say — the check would
    // still be green with nothing left to check.
    for (const register of REGISTERS) {
      const fromThisRegister = declared.filter((entry) => entry.register === register);
      expect(`${register.file}: ${fromThisRegister.length} contracts`).not.toBe(
        `${register.file}: 0 contracts`,
      );
    }
  });

  it('has not grown a declaration that is newly wrong', () => {
    const baseline = new Set(KNOWN_STALE);
    const appeared = stale.filter(
      ({ entry, matched }) => !baseline.has(`${entry.register.file} · ${entry.gapId} · ${matched}`),
    );

    // Formatted as instructions rather than a diff, because whoever reads this
    // failure has to go and edit a register, and `toEqual` over two hundred
    // strings tells them nothing about which file to open.
    //
    // The first line of each entry is the `KNOWN_STALE` line verbatim, quotes
    // and comma included. That is deliberate: the honest resolution is to fix
    // the register, but when a wave lands a hundred of these at once the
    // maintainer needs to be able to paste the list rather than retype it, and a
    // retyped ratchet list is a wrong ratchet list.
    expect(
      appeared.map(
        ({ entry, matched }) =>
          `\n  '${entry.register.file} · ${entry.gapId} · ${matched}',` +
          `\n    in:               ${entry.register.symbol}` +
          `\n    declares missing: ${entry.declaration}` +
          `\n    mapped in:        ${inventory.routes.get(matched) ?? 'unknown'}` +
          '\n    → the backend shipped this. Point the screen at the real route and' +
          '\n      delete the declaration, or add the quoted line to KNOWN_STALE.',
      ),
    ).toEqual([]);
  });

  /**
   * The other direction of drift.
   *
   * A register that says "the backend already does this" about a route the
   * backend does not serve is how `app/employer/[id].tsx` came to call
   * `GET /employers/{id}` — a path answered only by a development fixture, which
   * 404s in any real deployment and which the screen reported to the member as a
   * loading failure.
   *
   * `KNOWN_ABSENT_CLAIMS` holds the inherited claims, each a register vouching
   * for a route that has never existed. A new one fails here; a fixed one fails
   * the reverse check below. The count is in the array and nowhere else — see
   * the note on its declaration.
   */
  it('does not claim the backend serves a route it does not', () => {
    const served = new Set(inventory.routes.keys());
    const wrong = collectClaimedEndpoints().filter(
      (claim) => !claim.candidateKeys.some((candidate) => served.has(candidate))
    );

    // Each report is one array of lines rather than a concatenated template.
    // The escaping in a multi-line template is the kind of detail that makes a
    // failure message wrong at exactly the moment somebody needs to read it.
    const reported = wrong
      .filter((claim) => !KNOWN_ABSENT_CLAIMS.includes(claimKey(claim)))
      .map((claim) =>
        [
          '',
          `'${claimKey(claim)}',`,
          `      in:            ${claim.register.symbol}`,
          `      claims exists: ${claim.declaration}`,
          '      -> the backend does not serve this. A screen built on it will 404',
          '         against a real deployment. Correct the register, or add the',
          '         quoted line to KNOWN_ABSENT_CLAIMS with a reason.',
        ].join('\n')
      );

    expect(reported).toEqual([]);
  });

  it('has not kept a KNOWN_ABSENT_CLAIMS line that is no longer true', () => {
    // ── The pawl this list spent the whole remediation without ───────────────
    //
    // `KNOWN_STALE` has had both pawls since it was written: a new stale
    // declaration fails, and a repaired one fails until its line is deleted.
    // This list had only the first. So a register could be corrected and its
    // baseline line left behind, and the list would go on asserting debt that
    // had been paid — which is exactly what happened to
    // `FRONTEND-PHASE16-GAP-007`, and to the note that said Wave C-05 had
    // cleared four lines while the four lines were still in the file.
    //
    // A baseline nobody is forced to prune stops describing the codebase and
    // starts describing the past, and it does it silently, which is worse than
    // not having one.
    const served = new Set(inventory.routes.keys());
    const current = new Set(
      collectClaimedEndpoints()
        .filter((claim) => !claim.candidateKeys.some((candidate) => served.has(candidate)))
        .map(claimKey)
    );

    expect(
      KNOWN_ABSENT_CLAIMS.filter((line) => !current.has(line)).map(
        (line) =>
          `\n${line}\n    → this register no longer claims that route. Delete the line` +
          '\n      from KNOWN_ABSENT_CLAIMS. (Or the gap id / route moved, in which' +
          '\n      case update it — but check the register first: a claim that moved' +
          '\n      is still a claim.)'
      )
    ).toEqual([]);
  });

  it('has not kept a KNOWN_STALE line that is no longer true', () => {
    const current = new Set(
      stale.map(({ entry, matched }) => `${entry.register.file} · ${entry.gapId} · ${matched}`),
    );

    // The ratchet's other pawl. Fixing a register without deleting its line here
    // would leave the list claiming debt that no longer exists, and a debt list
    // nobody trusts is one nobody pays down.
    expect(
      KNOWN_STALE.filter((line) => !current.has(line)).map(
        (line) =>
          `\n${line}\n    → no longer stale. Delete this line from KNOWN_STALE.` +
          '\n      (Or the gap id / route moved, in which case update the line.)',
      ),
    ).toEqual([]);
  });
});

describe('the register list this check runs over', () => {
  it('covers every register in src/config', () => {
    // The check is only as complete as `REGISTERS`, and a new `*-gaps.ts` that
    // declares contracts would otherwise be exempt from it forever. Discovered
    // from disk so adding a register without adding it here is a red build.
    const configDirectory = join(__dirname, '..', '..', 'config');
    const declaringFiles = readdirSync(configDirectory, { withFileTypes: true })
      .filter((entry) => !entry.isDirectory() && entry.name.endsWith('-gaps.ts'))
      .filter((entry) => {
        const source = readFileSync(join(configDirectory, entry.name), 'utf8');
        // `missingContract:` / `requiredContracts:` as a *property*, so the
        // interface declarations and prose mentions do not count a file in.
        return /^\s*(missingContract|requiredContracts):/m.test(source);
      })
      .map((entry) => `src/config/${entry.name}`);

    expect(declaringFiles.sort()).toEqual(REGISTERS.map((register) => register.file).sort());
  });
});
