// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — request-binding drift against the real backend (Wave M-4)
//
// Every remediation wave in this programme found at least one defect that only a
// contract test would have caught, and they share one shape:
//
//   · `POST /auth/otp/send` and `/otp/verify` 404'd on every sign-in; the routes
//     are `/otp/start` and `/otp/sign-in`.
//   · Event creation sent one of six `required` fields, so it was refused at
//     deserialisation before any handler ran.
//   · `searchProviders` sent `categoryId`, `openNow` and `sortBy`; the binder
//     recognises `category`, `openNowOnly` and `sort`, discarded all three in
//     silence, and answered **200 with the entire unfiltered directory**.
//   · The media upload flattened its `FormData` to JSON because `apiClient`
//     carries a default `Content-Type`.
//
// **Almost every one of those returns a 200 or a plausible-looking result.** A
// test that asserts "the call succeeded" passes for all of them. A parameter the
// server does not bind is invisible in the response — it just returns more.
//
// ── What this asserts ────────────────────────────────────────────────────────
//
// For each flow in `LEDGER` below it drives the **real client function**, lets
// it build its own request, and captures what actually left the device through
// `axios-mock-adapter`'s history. It then resolves that request against a route
// inventory parsed out of `diaspora-backend` and checks, per the wave brief:
//
//   route        the path the client called is one the backend maps
//   method       under the verb the client used
//   request      every top-level body key is a property the bound DTO has
//   required     every `required` property of that DTO is present in the body
//   query        every query-parameter name is one the handler binds
//   auth         a route the backend does not mark `[AllowAnonymous]` is called
//                with an `Authorization` header
//
// Response schema, error envelope and pagination are asserted by
// `platform-envelope.test.ts` and the `*-api.integration.test.ts` suites, which
// exercise them against the mock handlers; this file is the *outbound* half,
// which nothing covered.
//
// ── What this does NOT catch ─────────────────────────────────────────────────
//
// Stated plainly, because a check whose blind spots are undocumented gets
// trusted for things it never did:
//
//   · **Only the flows in `LEDGER`.** This is not a sweep of every call site.
//     A client function nobody added here is not checked at all.
//   · **Top-level keys only.** A wrong key *inside* a nested object, or inside
//     an array element, is invisible here.
//   · **Names, not types or values.** Sending `"12"` where the server binds an
//     `int`, or an unrecognised enum name, passes.
//   · **`required` as C# declares it.** A property that is optional to the
//     serialiser but rejected by a FluentValidation rule is not a required field
//     to this check.
//   · **Route matching is segment-wise.** A route constraint (`:guid`) is not
//     enforced, so a slug sent where the server wants an id still matches.
//   · **Authorisation, only authentication.** Whether the caller holds the
//     *policy* the route requires is not knowable from here.
//   · **Routes the parser could not resolve are skipped, not failed** — see the
//     bias note below.
//
// ── The bias, stated deliberately ────────────────────────────────────────────
//
// Following `backend-gap-register-drift.test.ts`: **this under-reports on
// purpose.** A cross-repo check that cries wolf is `.skip`-ed within a fortnight
// and then protects nothing. So an ambiguous C# type name (two modules declaring
// `CheckInRequest` with different properties) yields no expectation rather than
// a guess, and an unparseable handler signature drops the route from the
// inventory rather than inventing an empty one. The floor tests under
// 'the parse is worth trusting' stop that under-reporting quietly becoming
// "reports nothing".
//
// ── Running without the backend ──────────────────────────────────────────────
//
// CI runs this repository alone most days. When `diaspora-backend` is not on
// disk the suite skips **loudly** rather than passing quietly, because a green
// tick that describes work which never happened is worse than a red one.
// ─────────────────────────────────────────────────────────────────────────────

// Node's globals are declared locally rather than by adding `"node"` to the
// project's `types`. That change is global: it surfaces pre-existing errors in
// roughly twenty assertions across the Phase 5, 7 and 12 suites, and a wave must
// not alter the typecheck configuration for every other phase to compile its own
// test. `require` is deliberately NOT re-declared — Jest's ambient typing already
// provides it, and shadowing it breaks every other `require` in the file.
declare const __dirname: string;

import MockAdapter from 'axios-mock-adapter';

import { apiClient, registerAuthBridge } from '@/lib/apiClient';
import { authTransport } from '@/lib/auth-api';
import * as auth from '@/lib/auth-api';
import * as discoverFilters from '@/lib/discover-filters';
import * as housingLandlord from '@/lib/housing-landlord';
import * as housingListings from '@/lib/housing-listings-api';
import * as housingViewings from '@/lib/housing-viewings-api';
import * as jobs from '@/lib/jobs-hiring-api';
import * as media from '@/lib/media-api';
import * as notifications from '@/lib/notifications-api';
import * as providers from '@/lib/providers-api';
import * as providerRegistration from '@/lib/provider-registration-api';
import * as recommendations from '@/lib/recommendations-api';

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

// ─────────────────────────────────────────────────────────────────────────────
// Locating the backend
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where `diaspora-backend` lives. Identical resolution to
 * `backend-gap-register-drift.test.ts`, and deliberately so: two cross-repo
 * checks that disagree about which checkout they read would produce two
 * different truths from one CI run.
 *
 * An explicitly-set `DIASPORA_BACKEND_PATH` is authoritative and does **not**
 * fall back. Quietly reading a different directory than the one the operator
 * named is how a green tick ends up describing the wrong backend.
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// A very small C# reader
//
// Shallow on purpose. It recognises the shapes this codebase actually writes and
// refuses everything else; each refusal is counted so the floor tests can fail
// if the number of refusals ever grows.
// ─────────────────────────────────────────────────────────────────────────────

/** Every `.cs` file under a root, skipping build output. */
function collectCSharpFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        // `obj/` holds generated copies of real source. Reading them would
        // double every declaration and turn honest lookups into "ambiguous".
        if (entry.name === 'obj' || entry.name === 'bin') continue;
        walk(join(directory, entry.name));
      } else if (entry.name.endsWith('.cs')) {
        found.push(join(directory, entry.name));
      }
    }
  };
  walk(root);
  return found;
}

/**
 * Comments stripped, whitespace flattened.
 *
 * Handler registrations span many lines — `group\n  .MapPost(…)` is the house
 * style — and flattening lets one scan see a whole statement. Line comments go
 * first so a commented-out `MapGet` never becomes a route; the XML doc comments
 * are line comments too and are full of route-shaped prose.
 */
function flattenSource(source: string): string {
  return source.replace(/\/\/[^\n]*/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Route parameters are noise for this comparison, and so is the API version
 * token.
 *
 * `{listingId:guid}` and `{id}` are the same hole. `ApiEndpoints.BaseUrl` is
 * `"/api/v{version:apiVersion}"`, which the routing layer fills from the version
 * set — this client only speaks v1, so the token resolves to `1` *before* the
 * general `{…}` collapse rather than after it, or the whole controller surface
 * would normalise to `/api/{}` and match nothing.
 *
 * Lower-cased because ASP.NET routing is case-insensitive.
 */
function normalisePath(path: string): string {
  const collapsed = path
    .replace(/\{version:apiVersion\}/g, '1')
    .replace(/\{[^}]*\}/g, '{}')
    .replace(/\/{2,}/g, '/')
    .toLowerCase();
  return collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
}

/** The substring between a bracket at `openIndex` and its match, exclusive. */
function balanced(source: string, openIndex: number, open = '(', close = ')'): string | null {
  if (openIndex < 0 || source[openIndex] !== open) return null;
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === open) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
  }
  return null;
}

/**
 * Splits a parameter list on commas that are not inside brackets.
 *
 * `IReadOnlyList<string, int>` and `[FromQuery(Name = "x,y")]` both contain
 * commas that are not separators, and a naive `.split(',')` turns one parameter
 * into two — which would then fail to parse and silently shrink the route's
 * bound surface.
 */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of list) {
    if (character === '(' || character === '[' || character === '<') depth += 1;
    else if (character === ')' || character === ']' || character === '>') depth -= 1;

    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

// ── Request DTOs ─────────────────────────────────────────────────────────────

interface DtoProperty {
  /** As declared, PascalCase. Compared camel-cased — see `Program.cs:126`. */
  name: string;
  /**
   * `required` on a property, or a positional parameter with neither a default
   * nor a nullable type.
   *
   * System.Text.Json enforces `required` members at deserialisation, so a body
   * missing one is a 400 *before* the handler runs. That is exactly the shape of
   * the event-creation defect: one of six required fields sent, and the refusal
   * came from the serialiser rather than from any validator anybody had read.
   */
  required: boolean;
  /**
   * The wire name, when a `[FromQuery(Name = "…")]` on the property overrides
   * it.
   *
   * Only meaningful on an `[AsParameters]` type. `ApplicationListParameters`
   * declares `Statuses` and binds it from `?status=`; reading the property name
   * would have accused `fetchApplications` — which sends `status` and documents
   * why — of sending a parameter the server ignores.
   */
  queryName?: string;
}

interface DtoDeclaration {
  file: string;
  properties: DtoProperty[];
}

/**
 * Every named type in the backend that has a readable property list.
 *
 * Keyed by bare type name, holding **every** declaration of that name. Six
 * thousand types across thirty projects contain genuine collisions —
 * `CheckInRequest` is declared in two modules with different properties — and
 * resolving one by picking the first would attribute the wrong field list to a
 * route. `lookupDto` refuses those instead.
 */
function readDtoDeclarations(files: string[]): Map<string, DtoDeclaration[]> {
  const declarations = new Map<string, DtoDeclaration[]>();

  // Not flattened: brace matching needs the real text, and line-comment
  // stripping is the only transformation that matters here.
  const declaration =
    /\b(?:public|internal)\s+(?:sealed\s+|abstract\s+|partial\s+|readonly\s+)*(?:record|class|struct)\s+(?:class\s+|struct\s+)?(\w+)/g;

  for (const file of files) {
    const source = readFileSync(file, 'utf8').replace(/\/\/[^\n]*/g, ' ');
    declaration.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = declaration.exec(source)) !== null) {
      const name = match[1];
      let cursor = declaration.lastIndex;
      while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;

      let properties: DtoProperty[] | null = null;

      if (source[cursor] === '(') {
        // A positional record: `record X(string A, string? B = null)`.
        const list = balanced(source, cursor);
        if (list !== null) {
          properties = splitTopLevel(list.replace(/\s+/g, ' '))
            .map((parameter) => {
              const parsed = /([\w.<>,?[\]]+)\s+(\w+)\s*(=.*)?$/.exec(parameter);
              if (parsed === null) return null;
              return {
                name: parsed[2],
                // A positional parameter is required unless it is nullable or
                // carries a default. Both of those are how the backend says
                // "you may leave this out".
                required: parsed[3] === undefined && !parsed[1].endsWith('?'),
              };
            })
            .filter((property): property is DtoProperty => property !== null);
        }
      } else if (source[cursor] === '{' || source[cursor] === ':') {
        const bodyStart = source.indexOf('{', cursor);
        const body = balanced(source, bodyStart, '{', '}');
        if (body !== null) {
          properties = [
            ...body.matchAll(
              /(?:\[FromQuery\(\s*Name\s*=\s*"([^"]*)"\s*\)\]\s*)?public\s+(required\s+)?[\w.<>,?[\]]+\s+(\w+)\s*\{\s*get;/g,
            ),
          ].map((property) => ({
            name: property[3],
            required: property[2] !== undefined,
            queryName: property[1],
          }));
        }
      }

      if (properties === null) continue;
      const existing = declarations.get(name) ?? [];
      existing.push({ file: relative(BACKEND_SOURCE_ROOT ?? '', file).replace(/\\/g, '/'), properties });
      declarations.set(name, existing);
    }
  }

  return declarations;
}

type DtoLookup =
  | { status: 'ok'; properties: DtoProperty[]; file: string }
  | { status: 'unknown' }
  | { status: 'ambiguous' };

/**
 * Resolves a C# type name to its property list, or declines.
 *
 * Declines rather than guesses in two cases, both of which would otherwise
 * manufacture a false accusation:
 *
 *   · the name is not declared anywhere the walker looked, and
 *   · the name is declared more than once with *different* property sets.
 *
 * Identical duplicates are fine — a type declared in two modules with the same
 * shape gives the same answer either way.
 */
function lookupDto(declarations: Map<string, DtoDeclaration[]>, typeName: string): DtoLookup {
  const bare = typeName.replace(/\?$/, '').replace(/^.*\./, '');
  const candidates = declarations.get(bare);
  if (candidates === undefined || candidates.length === 0) return { status: 'unknown' };

  const signatures = new Set(
    candidates.map((candidate) =>
      candidate.properties
        .map((property) => `${property.name}${property.required ? '!' : ''}`)
        .sort()
        .join(','),
    ),
  );
  if (signatures.size > 1) return { status: 'ambiguous' };

  return { status: 'ok', properties: candidates[0].properties, file: candidates[0].file };
}

// ── Handler signatures ───────────────────────────────────────────────────────

interface BackendRoute {
  verb: string;
  /** Normalised, `{}` for every route parameter. */
  path: string;
  file: string;
  /** The `[FromBody]`/implicit body DTO type name, when there is one. */
  bodyType: string | null;
  /** Names bound from the query string directly by the handler signature. */
  queryNames: string[];
  /** `[AsParameters]` types, whose *properties* are query names. */
  asParameterTypes: string[];
  /**
   * `true` for `[AllowAnonymous]`, `false` for a stated authorisation
   * requirement, `null` when the route says neither.
   *
   * Null is not "anonymous": the platform's default authorisation policy applies
   * to a route that states nothing, and treating null as anonymous would silence
   * the whole authentication check for two thirds of the surface. It is treated
   * as "unknown" and the auth assertion is skipped for it.
   */
  anonymous: boolean | null;
}

/** Types that never come off the wire. */
const INFRASTRUCTURE_TYPES = new Set([
  'HttpContext',
  'CancellationToken',
  'ClaimsPrincipal',
  'HttpRequest',
  'HttpResponse',
  'IFormFile',
  'IFormFileCollection',
]);

/**
 * The primitives minimal APIs bind from the route or the query string without
 * being asked. Anything else is a complex type, which binds from the body or
 * from the container.
 */
const SIMPLE_TYPES =
  /^(string|int|long|short|byte|bool|Guid|double|float|decimal|DateTime|DateTimeOffset|DateOnly|TimeOnly)\??$/;

interface Bindings {
  bodyType: string | null;
  queryNames: string[];
  asParameterTypes: string[];
  /** Parameters the classifier could not place. Counted by the floor test. */
  unclassified: string[];
}

/**
 * Classifies one handler's parameter list into what the wire can reach.
 *
 * The rules are ASP.NET's, not this file's invention:
 *
 *   · an explicit `[FromBody]`/`[FromQuery]`/`[AsParameters]` wins outright;
 *   · a simple type whose name matches a `{…}` in the route template is a route
 *     value, and otherwise binds from the query string — which is why
 *     `searchProviders`'s three unrecognised names vanished without an error;
 *   · an interface (`ISender`, `IClock`) resolves from the container;
 *   · any other complex type binds from the body. Only `*Request`, `*Command`
 *     and `*Payload` are accepted as that, because a type outside those
 *     conventions is more likely to be a service this reader does not recognise
 *     than a body — and a wrong body type is a false accusation.
 */
function classifyParameters(
  parameters: string[],
  routeParameterNames: Set<string>,
): Bindings {
  const bindings: Bindings = {
    bodyType: null,
    queryNames: [],
    asParameterTypes: [],
    unclassified: [],
  };

  for (const raw of parameters) {
    const attributeMatch = /^\[(\w+)([^\]]*)\]\s*/.exec(raw);
    const attribute = attributeMatch === null ? null : attributeMatch[1];
    // `[FromQuery(Name = "category")] string[]? categories` binds `?category=`,
    // **not** `?categories=`. Reading the parameter name instead of the
    // attribute's would have reported the notification inbox's category filter
    // and the job application list's status filter as unbound — two false
    // accusations against correct clients, which is precisely how a cross-repo
    // check earns the `.skip` that ends its usefulness.
    const renamed = attributeMatch === null ? null : /\bName\s*=\s*"([^"]*)"/.exec(attributeMatch[2]);
    const rest = attributeMatch === null ? raw : raw.slice(attributeMatch[0].length);

    const parsed = /^([\w.<>,?[\]]+)\s+(\w+)(\s*=[\s\S]*)?$/.exec(rest.trim());
    if (parsed === null) {
      bindings.unclassified.push(rest.slice(0, 60));
      continue;
    }
    const [, typeName, parameterName] = parsed;

    if (attribute === 'FromBody') {
      bindings.bodyType = typeName;
      continue;
    }
    if (attribute === 'AsParameters') {
      bindings.asParameterTypes.push(typeName);
      continue;
    }
    if (attribute === 'FromQuery') {
      bindings.queryNames.push(renamed === null ? parameterName : renamed[1]);
      continue;
    }
    // Route values, DI and headers are all out of scope for a body/query check.
    // `FromForm` is deliberately here: the form surface is asserted separately,
    // by `media-upload.test.ts` and the `content type` case below.
    if (
      attribute === 'FromRoute' ||
      attribute === 'FromServices' ||
      attribute === 'FromHeader' ||
      attribute === 'FromForm'
    ) {
      continue;
    }

    if (SIMPLE_TYPES.test(typeName)) {
      if (!routeParameterNames.has(parameterName.toLowerCase())) {
        bindings.queryNames.push(parameterName);
      }
      continue;
    }

    if (INFRASTRUCTURE_TYPES.has(typeName.replace(/\?$/, '')) || /^I[A-Z]/.test(typeName)) {
      continue;
    }

    if (/(Request|Command|Payload)\??$/.test(typeName)) {
      bindings.bodyType = typeName;
      continue;
    }

    bindings.unclassified.push(typeName);
  }

  return bindings;
}

/** The `{name}` holes in a route template, lower-cased. */
function routeParameterNames(template: string): Set<string> {
  return new Set([...template.matchAll(/\{(\w+)/g)].map((match) => match[1].toLowerCase()));
}

interface BackendInventory {
  routes: BackendRoute[];
  declarations: Map<string, DtoDeclaration[]>;
  /** Handler parameters no rule placed. Floor-tested. */
  unclassified: string[];
  minimalApiFilesScanned: number;
  controllerFilesScanned: number;
}

/** `MediaModuleMetadata.RoutePrefix` → `/api/v1/media`. */
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
 * The value is a list because four classes are genuinely mounted twice —
 * `RewardEndpoints` is mapped by both the Financial contributor under
 * `/api/v1/financial` and the Creator contributor under `/api/v1/rewards`, and
 * ASP.NET registers both.
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
 * One sequential pass per file, keeping a running map of which builder variable
 * stands for which prefix.
 *
 * Order matters, which is why this is one scan rather than four regexes.
 * `AnalyticsEndpoints.cs` holds two contributors in one file, each declaring its
 * own `var group`, one under `/api/v1/analytics` and one under
 * `/api/v1/telemetry`; harvesting assignments first and mappings second would
 * put the telemetry ingestion route under the analytics prefix.
 */
const ROUTE_TOKEN = new RegExp(
  [
    /var (\w+) = (\w+)\s*\.MapGroup\(\s*(?:"([^"]*)"|([\w.]+))\s*\)/.source,
    /(?:static )?void Map\(\s*RouteGroupBuilder (\w+)/.source,
    /(?:public |internal |sealed |static |abstract )*class (\w+)/.source,
    /(\w+)\s*\.Map(Get|Post|Put|Patch|Delete)\(\s*"([^"]*)"/.source,
  ].join('|'),
  'g',
);

function readMinimalApiRoutes(
  sourceRoot: string,
  apiFiles: string[],
  metadataFiles: string[],
  unclassified: string[],
): BackendRoute[] {
  const prefixes = readRoutePrefixes(metadataFiles);
  const sources = new Map<string, string>(
    apiFiles.map((file) => [file, flattenSource(readFileSync(file, 'utf8'))]),
  );
  const mounted = readContributorWiring(sources, prefixes);
  const routes: BackendRoute[] = [];

  for (const [file, source] of sources) {
    const repoRelative = relative(sourceRoot, file).replace(/\\/g, '/');
    const builders = new Map<string, string[]>();
    let classPrefixes: string[] = [];

    ROUTE_TOKEN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ROUTE_TOKEN.exec(source)) !== null) {
      const [, local, parent, literalSubPath, metadataConstant, groupParameter, className, receiver, verb, template] =
        match;

      if (local !== undefined) {
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
        continue;
      }
      if (groupParameter !== undefined) {
        builders.set(groupParameter, classPrefixes);
        continue;
      }
      if (className !== undefined) {
        classPrefixes = mounted.get(className) ?? [];
        continue;
      }
      if (receiver === undefined) continue;

      const bases = builders.get(receiver);
      // A mapping whose group could not be resolved is dropped rather than
      // guessed at. It becomes a route this check does not know about, which is
      // a miss; attributing it to the wrong prefix would be a false accusation.
      if (bases === undefined || bases.length === 0) continue;

      const statementStart = match.index + match[0].length;
      const lambda = /^\s*,\s*async\s*(?=\()/.exec(source.slice(statementStart));
      let bindings: Bindings = {
        bodyType: null,
        queryNames: [],
        asParameterTypes: [],
        unclassified: [],
      };
      if (lambda !== null) {
        const list = balanced(source, source.indexOf('(', statementStart + lambda[0].length - 1));
        if (list !== null) {
          bindings = classifyParameters(splitTopLevel(list), routeParameterNames(template));
        }
      }
      unclassified.push(...bindings.unclassified.map((item) => `${repoRelative}: ${item}`));

      // The chained metadata calls, up to the statement's semicolon. Reading
      // further would pick up the *next* route's metadata and mislabel this one.
      const semicolon = source.indexOf(';', match.index);
      const tail = semicolon > 0 ? source.slice(match.index, semicolon) : '';
      const anonymous = /\.AllowAnonymous\(\)/.test(tail)
        ? true
        : /\.RequireAuthorization\(/.test(tail)
          ? false
          : null;

      for (const base of bases) {
        routes.push({
          verb: verb.toUpperCase(),
          path: normalisePath(base + template),
          file: repoRelative,
          bodyType: bindings.bodyType,
          queryNames: bindings.queryNames,
          asParameterTypes: bindings.asParameterTypes,
          anonymous,
        });
      }
    }
  }

  return routes;
}

/**
 * The identity surface is MVC controllers, not minimal APIs.
 *
 * Worth stating because it is exactly the gap that let `/auth/otp/send` ship:
 * a reader that only understands `MapPost` sees no auth routes at all, concludes
 * the backend serves none, and has nothing to say about a client calling two
 * that do not exist. Ten controller files, all under `Diaspora.Api`.
 */
function readControllerRoutes(
  sourceRoot: string,
  controllerFiles: string[],
  unclassified: string[],
): BackendRoute[] {
  const routes: BackendRoute[] = [];

  for (const file of controllerFiles) {
    const source = flattenSource(readFileSync(file, 'utf8'));
    const repoRelative = relative(sourceRoot, file).replace(/\\/g, '/');

    const routeAttribute = /\[Route\(\s*(?:ApiEndpoints\.BaseUrl\s*\+\s*)?"([^"]*)"\s*\)\]/.exec(source);
    if (routeAttribute === null) continue;
    const base =
      (/ApiEndpoints\.BaseUrl/.test(routeAttribute[0]) ? '/api/v{version:apiVersion}' : '') +
      routeAttribute[1];

    const verbAttribute = /\[Http(Get|Post|Put|Patch|Delete)(?:\(\s*"([^"]*)"\s*\))?\]/g;
    let match: RegExpExecArray | null;
    while ((match = verbAttribute.exec(source)) !== null) {
      const template = base + (match[2] === undefined ? '' : `/${match[2]}`);

      // The action signature follows the attribute block. A 1500-character
      // window comfortably spans the `[ProducesResponseType]` stack without
      // running into the next action.
      const window = source.slice(verbAttribute.lastIndex, verbAttribute.lastIndex + 1500);
      const signature = /public\s+(?:async\s+)?[\w<>,\s.[\]]+?\s(\w+)\s*\(/.exec(window);

      let bindings: Bindings = {
        bodyType: null,
        queryNames: [],
        asParameterTypes: [],
        unclassified: [],
      };
      if (signature !== null) {
        const open = verbAttribute.lastIndex + signature.index + signature[0].length - 1;
        const list = balanced(source, open);
        if (list !== null) {
          bindings = classifyParameters(splitTopLevel(list), routeParameterNames(template));
        }
      }
      unclassified.push(...bindings.unclassified.map((item) => `${repoRelative}: ${item}`));

      // Only the attributes between this verb attribute and the action's own
      // signature belong to this action.
      const head = window.slice(0, signature === null ? 400 : signature.index);
      const anonymous = /\[AllowAnonymous\]/.test(head)
        ? true
        : /\[Authorize/.test(head)
          ? false
          : null;

      routes.push({
        verb: match[1].toUpperCase(),
        path: normalisePath(template),
        file: repoRelative,
        bodyType: bindings.bodyType,
        queryNames: bindings.queryNames,
        asParameterTypes: bindings.asParameterTypes,
        anonymous,
      });
    }
  }

  return routes;
}

function readBackendInventory(sourceRoot: string): BackendInventory {
  const allFiles = collectCSharpFiles(sourceRoot);
  const metadataFiles = allFiles.filter((file) => /ModuleMetadata\.cs$/.test(file));
  const apiFiles = allFiles.filter((file) =>
    /[\\/]Api[\\/].*(Endpoints|EndpointContributors?)\.cs$/.test(file),
  );
  const controllerFiles = allFiles.filter((file) => /Controller\.cs$/.test(file));

  const unclassified: string[] = [];
  const routes = [
    ...readMinimalApiRoutes(sourceRoot, apiFiles, metadataFiles, unclassified),
    ...readControllerRoutes(sourceRoot, controllerFiles, unclassified),
  ];

  return {
    routes,
    declarations: readDtoDeclarations(allFiles),
    unclassified,
    minimalApiFilesScanned: apiFiles.length,
    controllerFilesScanned: controllerFiles.length,
  };
}

const INVENTORY: BackendInventory | null =
  BACKEND_SOURCE_ROOT === null ? null : readBackendInventory(BACKEND_SOURCE_ROOT);

// ─────────────────────────────────────────────────────────────────────────────
// Matching a captured request to a backend route
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `/auth/register` (as the client writes it) → `/api/v1/auth/register`.
 *
 * `API_BASE_URL` ends in `/v1`, one segment short of the platform's canonical
 * `/api/v1`, because `RoutePrefixCompatibilityMiddleware` rewrites `/v1/*` onto
 * `/api/v1/*` before routing. The rewrite is what makes the two spellings the
 * same endpoint object, so it has to be applied here too.
 */
function toBackendPath(clientUrl: string): string {
  const withoutOrigin = clientUrl.replace(/^https?:\/\/[^/]+/, '').replace(/^\/v1/, '');
  const withoutQuery = withoutOrigin.split('?')[0];
  return `/api/v1${withoutQuery.startsWith('/') ? '' : '/'}${withoutQuery}`;
}

/**
 * Segment-wise match: a `{}` in the template accepts any one segment.
 *
 * Deliberately not a regex over the whole path — `/housing/listings/{}/publish`
 * and `/housing/listings/search` have the same segment count and must not be
 * confused, and a `.*` in the middle of a generated pattern would confuse them.
 */
function matchesTemplate(actualPath: string, template: string): boolean {
  const actual = actualPath.toLowerCase().split('/');
  const expected = template.split('/');
  if (actual.length !== expected.length) return false;
  return expected.every((segment, index) => segment === '{}' || segment === actual[index]);
}

function findRoute(inventory: BackendInventory, verb: string, path: string): BackendRoute | null {
  const candidates = inventory.routes.filter(
    (route) => route.verb === verb.toUpperCase() && matchesTemplate(path, route.path),
  );
  if (candidates.length === 0) return null;
  // A literal segment beats a `{}` at the same position, which is ASP.NET's own
  // precedence. `/notifications/read-all` must resolve to itself and not to
  // `/notifications/{id}`.
  candidates.sort(
    (a, b) => a.path.split('{}').length - b.path.split('{}').length,
  );
  return candidates[0];
}

/** PascalCase → camelCase, the platform's serialiser policy (`Program.cs:126`). */
function camel(name: string): string {
  return name.length === 0 ? name : name[0].toLowerCase() + name.slice(1);
}

/**
 * Every query-string name a route binds: the handler's own parameters plus the
 * properties of any `[AsParameters]` type.
 *
 * Returns null when an `[AsParameters]` type could not be resolved — the route's
 * bound surface is then unknown, and asserting against a partial list would
 * report every property of the missing type as unbound.
 */
function boundQueryNames(inventory: BackendInventory, route: BackendRoute): Set<string> | null {
  const names = new Set(route.queryNames.map((name) => name.toLowerCase()));
  for (const typeName of route.asParameterTypes) {
    const dto = lookupDto(inventory.declarations, typeName);
    if (dto.status !== 'ok') return null;
    for (const property of dto.properties) {
      names.add((property.queryName ?? property.name).toLowerCase());
    }
  }
  return names;
}

// ─────────────────────────────────────────────────────────────────────────────
// The ledger
//
// One entry per flow. `invoke` drives the **real client function** — nothing
// here reimplements a request, because a test against a reimplementation of the
// thing under test proves nothing.
//
// `sends` names the fields the caller supplied, so a reviewer can see at a
// glance which of the captured keys came from this file and which the client
// added on its own. It is documentation, not an assertion: the assertion is
// always against what actually left the device.
// ─────────────────────────────────────────────────────────────────────────────

interface LedgerEntry {
  /** Shown in the test name. */
  label: string;
  /** Drives the real client. Rejections are swallowed — see `capture`. */
  invoke: () => Promise<unknown>;
  /**
   * Body keys this flow is allowed to send that the DTO does not declare,
   * each with the reason. Empty for every entry that is simply correct.
   *
   * A ratchet, not an escape hatch: an entry here is a defect somebody has
   * looked at and decided not to fix in this wave, and it is named in the test
   * output either way.
   */
  knownUnbound?: Record<string, string>;
  /**
   * Query-parameter names this flow is allowed to send that the handler does
   * not bind, each with the reason. Same two-way ratchet as `knownUnbound`: a
   * name that stops being a finding must be deleted from the table.
   */
  knownUnboundQuery?: Record<string, string>;
}

/**
 * Why every array-valued query parameter in this application is discarded by
 * the server.
 *
 * Axios 1.x's default serialiser writes an array as `?status[]=A&status[]=B`.
 * ASP.NET Core binds a `string[]` from a **repeated bare key** —
 * `?status=A&status=B` — and `status[]` is simply a different query key, so the
 * value never reaches the parameter. `apiClient` sets no `paramsSerializer`, so
 * this is every array filter the application has.
 *
 * The failure is the one this programme keeps rediscovering: the route answers
 * **200 with the unfiltered set**, and the screen renders it as a filtered
 * result. `jobs-hiring-api.ts:472` even documents the opposite in a comment —
 * *"axios serialises an array as `status=A&status=B`, which is what
 * `string[]? Statuses` binds from"* — which is how the belief survived review.
 *
 * Not fixed here. The fix is a `paramsSerializer` on `apiClient` (and on
 * `authTransport`), which changes the wire form of **every** request the
 * application makes; that belongs in a change that can be verified against a
 * running server, not in a test wave. Recorded so it is loud and so it cannot
 * grow quietly.
 */
/**
 * RETIRED — the defect this described is fixed.
 *
 * This constant named the finding that made the whole check worth building:
 * axios 1.x serialises `{ status: ['A'] }` as `?status[]=A`, ASP.NET binds a
 * repeated bare key, and so **every array-valued query parameter in the
 * application was discarded** — with the route answering 200 and the unfiltered
 * set, which each screen rendered as though it had filtered.
 *
 * `apiClient` now sets `paramsSerializer: { indexes: null }`, verified by
 * serialising both forms and comparing rather than by reading the docs — the
 * previous belief was also stated confidently, in a comment sitting directly
 * above the call it was wrong about.
 *
 * The constant is kept, unreferenced, because the ratchet that retired it is
 * the point: the entries it annotated were deleted only when the check proved
 * they were no longer true. A future array parameter that regresses will fail
 * as a *surprise* rather than quietly reusing this excuse.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const AXIOS_BRACKET_ARRAY =
  'axios serialises arrays as `key[]=`, which ASP.NET never binds — see AXIOS_BRACKET_ARRAY';

const SESSION_TOKEN = 'contract-test-access-token';

const LEDGER: LedgerEntry[] = [
  // ── Identity ───────────────────────────────────────────────────────────────
  {
    label: 'registration',
    invoke: () =>
      auth.register({
        fullName: 'Ama Mensah',
        phoneNumber: '+233201234567',
        email: 'member233201234567@diaspora.test',
        password: 'a-long-enough-passphrase',
        nationality: 'GH',
        countryOfResidence: 'GB',
        preferredLanguage: 'en',
        preferredTimeZone: 'Europe/London',
      }),
  },
  {
    label: 'phone verification (the call that issues the first token pair)',
    invoke: () => auth.verifyPhone({ phoneNumber: '+233201234567', code: '123456' }),
  },
  {
    label: 'OTP start',
    invoke: () => auth.startOtpSignIn({ phoneNumber: '+233201234567' }),
  },
  {
    label: 'OTP sign-in',
    invoke: () => auth.otpSignIn({ phoneNumber: '+233201234567', code: '123456' }),
  },
  {
    label: 'OTP resend',
    invoke: () => auth.resendOtp({ phoneNumber: '+233201234567', purpose: 'SignIn' }),
  },
  {
    label: 'password sign-in',
    invoke: () =>
      auth.loginWithPassword({ email: 'member233201234567@diaspora.test', password: 'a-long-enough-passphrase' }),
  },
  {
    label: 'session refresh',
    invoke: () => auth.refreshSession('a-refresh-token'),
  },
  {
    label: 'logout',
    invoke: () => auth.logout({ revokeAllSessions: false }),
  },
  {
    label: 'the current member',
    invoke: () => auth.fetchCurrentUser(),
  },
  {
    label: 'the session list',
    invoke: () => auth.fetchSessions({ includeRevoked: true }),
  },
  {
    label: 'revoking one session',
    invoke: () => auth.revokeSession('11111111-1111-1111-1111-111111111111'),
  },

  // ── Media ──────────────────────────────────────────────────────────────────
  //
  // Captured through the mock transport, because `__DEV__` is true under Jest
  // and `uploadDirect` keeps axios for mock builds. That is fine for *this*
  // ledger, whose subject is the route and the verb — both transports post to
  // the same `/uploads/direct` literal. The headers and the body of the release
  // transport are a different question, and the case at the foot of this file is
  // where it is asked.
  {
    label: 'direct media upload',
    invoke: () =>
      media.uploadDirect(
        { uri: 'file:///tmp/photo.jpg', name: 'photo.jpg', mimeType: 'image/jpeg' },
        { kind: 'image' },
      ),
  },
  {
    label: 'attaching an uploaded asset to its owner',
    invoke: () =>
      media.attachMedia({
        mediaId: '22222222-2222-2222-2222-222222222222',
        ownerType: 'marketplaceListing',
        ownerId: '33333333-3333-3333-3333-333333333333',
        role: 'gallery',
        position: 0,
      }),
  },

  // ── Notifications ──────────────────────────────────────────────────────────
  {
    label: 'the notification inbox',
    invoke: () =>
      notifications.fetchInbox({
        scope: 'all',
        unreadOnly: true,
        category: ['Marketplace'],
        priority: ['High'],
        search: 'offer',
        source: 'Marketplace',
        entityType: 'Listing',
        from: '2026-01-01T00:00:00Z',
        to: '2026-02-01T00:00:00Z',
        cursor: 'abc',
        limit: 20,
      }),
  },
  {
    label: 'the unread count',
    invoke: () => notifications.fetchUnreadCount(),
  },
  {
    label: 'marking a notification read',
    invoke: () => notifications.markNotificationRead('44444444-4444-4444-4444-444444444444'),
  },
  {
    label: 'recording a notification click',
    invoke: () =>
      notifications.recordNotificationClick('44444444-4444-4444-4444-444444444444', 'open-listing'),
  },
  {
    label: 'registering a push endpoint',
    invoke: () =>
      notifications.registerNotificationDevice({
        token: 'expo-push-token',
        platform: 'IOS',
        deviceIdentifier: 'device-1',
        friendlyName: "Ama's phone",
        appVersion: '1.0.0',
      }),
  },

  // ── Housing ────────────────────────────────────────────────────────────────
  //
  // `createHousingListing` is deliberately absent from this ledger. It takes a
  // `Record<string, unknown>` and passes it through untouched, so a body written
  // here would be testing this file's fixture rather than the application's
  // request. The real body is assembled by `housing/create.tsx`, and it is
  // checked statically further down — where the failure is genuinely the
  // screen's.
  {
    label: 'publishing a housing listing',
    invoke: () => housingListings.publishHousingListing('55555555-5555-5555-5555-555555555555'),
  },
  {
    label: 'requesting a viewing',
    invoke: () =>
      housingViewings.requestViewing('55555555-5555-5555-5555-555555555555', {
        message: 'Could I see it on Saturday?',
      }),
  },
  {
    // 15 Sep 2026. Discover's housing sheet with every filter set, sorted by
    // rating, asking for a second page. Before that day the rent range went out
    // with no `currency` or `rentPeriod`, which the route needs before it
    // applies one — bound names, and still no filter.
    label: "Discover's housing search, every filter set",
    invoke: () =>
      apiClient.get('/housing/search', {
        params: discoverFilters.housingSearchParams(
          'studio',
          {
            kind: 'distance',
            countryCode: 'MU',
            cityName: 'Rose Hill',
            latitude: -20.241,
            longitude: 57.4769,
            radiusKm: 5,
          },
          {
            rentMin: '5,000',
            rentMax: '10000',
            bedrooms: 2,
            bathrooms: 1,
            furnished: 'Furnished',
            billsIncluded: true,
            internetIncluded: true,
            parking: true,
            verifiedHost: true,
            lifestyle: {
              'Student Friendly': true,
              'Family Friendly': true,
              'Shared Living': true,
              'Pet Friendly': true,
            },
          },
          'rating',
          'cursor-from-page-one'
        ),
      }),
  },

  {
    // 16 Sep 2026. A landlord's own page lists their homes through the ordinary
    // search; `landlordId` is the name `SearchHousingRequest` binds for it, and
    // there was no way to ask the question at all before that day.
    label: "a landlord's homes, for their profile page",
    invoke: () =>
      apiClient.get('/housing/search', {
        params: housingLandlord.landlordHomesParams('55555555-5555-5555-5555-555555555555'),
      }),
  },

  // ── Marketplace ────────────────────────────────────────────────────────────
  {
    // Sorted by the seller's rating, which the server has done across every
    // page since 15 Sep 2026 — before, the phone re-sorted twenty at a time.
    label: "Discover's marketplace search, every filter set",
    invoke: () =>
      apiClient.post(
        '/marketplace/search',
        discoverFilters.marketplaceSearchBody(
          'phone',
          { kind: 'town', countryCode: 'MU', cityName: 'Rose Hill' },
          {
            intent: 'Selling',
            condition: 'Very Good',
            minPrice: '1,000',
            maxPrice: '12000',
            verifiedSeller: true,
            delivery: true,
            pickupOnly: true,
          },
          'rating',
          'cursor-from-page-one'
        )
      ),
  },

  // ── Jobs ───────────────────────────────────────────────────────────────────
  {
    label: 'applying to a job',
    invoke: () =>
      jobs.applyToJob('66666666-6666-6666-6666-666666666666', {
        coverLetter: 'I have five years in the trade.',
      }),
  },
  {
    label: 'the application list',
    invoke: () => jobs.fetchApplications({ statuses: ['Submitted'], limit: 20 }),
  },
  {
    label: 'withdrawing an application',
    invoke: () =>
      jobs.withdrawApplication('77777777-7777-7777-7777-777777777777', { reason: 'Took another role.' }),
  },

  // ── Providers ──────────────────────────────────────────────────────────────
  {
    label: 'the provider directory search',
    invoke: () =>
      providers.searchProviders({
        query: 'plumbing',
        categoryId: 'plumbing',
        cityName: 'Accra',
        countryCode: 'GH',
        latitude: 5.6,
        longitude: -0.19,
        radiusKm: 10,
        verifiedOnly: true,
        openNow: true,
        sortBy: 'rating',
        cursor: 'abc',
        limit: 20,
      }),
  },

  // ── Home ───────────────────────────────────────────────────────────────────
  {
    label: 'the home feed',
    invoke: () => recommendations.fetchHomeFeed('GH'),
  },

  // ── Registering a provider (UAT-002) ───────────────────────────────────────
  //
  // Added because the ledger's blind spot was the reason three create flows
  // shipped broken. Its own header names this class of defect — "Event creation
  // sent one of six `required` fields, so it was refused at deserialisation
  // before any handler ran" — and then covered exactly one create flow, housing
  // publish, which happened to be the one that worked. Creating a provider, an
  // organization, a job, a guide, an update, a marketplace listing and an event
  // were all absent.
  //
  // The provider wizard is now wired, so it goes in here at the same time. Each
  // of the four calls it makes is driven separately, because a create that binds
  // and a publish that does not is precisely the half-failure the outcome type
  // exists to report.
  {
    label: 'registering a provider',
    invoke: () =>
      providerRegistration.registerProvider({
        name: 'Mama Afrika Kitchen',
        providerType: 'Business',
        category: 'Food & Restaurants',
        description: 'Home cooking from Accra, in Peckham.',
        countryCode: 'GB',
        cityName: 'London',
        phone: '+447700900000',
        email: 'hello@example.org',
        website: 'https://example.org',
        tags: ['catering'],
      }),
  },
  {
    label: 'adding a service to a provider',
    invoke: () =>
      providerRegistration.addProviderService('9f1c1f6e-6c1a-4a3f-9a4a-2f2c9a1b0001', {
        name: 'Jollof Rice & Chicken',
        pricing: { model: 'Range', minAmount: 8, maxAmount: 12, currency: 'GBP' },
      }),
  },
  {
    label: "setting a provider's opening hours",
    invoke: () =>
      providerRegistration.setProviderOperatingHours('9f1c1f6e-6c1a-4a3f-9a4a-2f2c9a1b0001', [
        { dayOfWeek: 'Monday', isClosed: false, windows: [{ opensAt: '09:00', closesAt: '18:00' }] },
        { dayOfWeek: 'Sunday', isClosed: true, windows: [] },
      ]),
  },
  {
    label: 'publishing a provider',
    invoke: () =>
      providerRegistration.publishProvider('9f1c1f6e-6c1a-4a3f-9a4a-2f2c9a1b0001'),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Driving the ledger
// ─────────────────────────────────────────────────────────────────────────────

interface CapturedRequest {
  verb: string;
  /** Backend-absolute, e.g. `/api/v1/auth/register`. */
  path: string;
  /** Top-level body keys, or null when the body was not a JSON object. */
  bodyKeys: string[] | null;
  queryKeys: string[];
  hasAuthorization: boolean;
  contentType: string | null;
}

const VERBS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/**
 * Runs one flow and returns every request it made.
 *
 * Two adapters, because the identity routes deliberately run on
 * `authTransport`: it carries no interceptor, so the refresh call it makes on a
 * 401 cannot recurse through the interceptor that triggered it.
 *
 * The invocation's rejection is swallowed. Several clients assert on the
 * response — `assertSession` refuses a token pair that is half-present — and a
 * canned `{}` will not satisfy them. **What the client sent is already captured
 * by then**, which is the only thing this file reads, and demanding a
 * response-shaped fixture per entry would make the ledger expensive enough that
 * nobody extends it.
 */
async function capture(entry: LedgerEntry): Promise<CapturedRequest[]> {
  const api = new MockAdapter(apiClient, { delayResponse: 0 });
  const identity = new MockAdapter(authTransport, { delayResponse: 0 });

  // A permissive stand-in. `data: {}` satisfies the envelope unwrappers that
  // only look for presence; anything stricter belongs in an integration test.
  api.onAny().reply(200, { data: {}, meta: {} });
  identity.onAny().reply(200, { data: {}, meta: {} });

  // A signed-in session, so the interceptor attaches a bearer and the
  // authentication assertion has something to see.
  registerAuthBridge({
    getAccessToken: () => SESSION_TOKEN,
    ensureFreshToken: () => Promise.resolve(SESSION_TOKEN),
    refreshAfterUnauthorized: () => Promise.resolve(SESSION_TOKEN),
  });

  try {
    await entry.invoke();
  } catch {
    // Deliberate — see the doc comment.
  }

  const captured: CapturedRequest[] = [];
  for (const [mock, instance] of [
    [api, apiClient],
    [identity, authTransport],
  ] as const) {
    for (const verb of VERBS) {
      for (const request of mock.history[verb] ?? []) {
        const url = request.url ?? '';
        const headers = (request.headers ?? {}) as Record<string, unknown>;

        let bodyKeys: string[] | null = null;
        if (typeof request.data === 'string' && request.data.length > 0) {
          try {
            const parsed: unknown = JSON.parse(request.data);
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
              bodyKeys = Object.keys(parsed as Record<string, unknown>);
            }
          } catch {
            // A non-JSON body — a `FormData`, most often. Left as null; the
            // form surface is asserted by its own case below.
            bodyKeys = null;
          }
        }

        // ── The query names are read off the serialised URL, not off
        //    `config.params` ────────────────────────────────────────────────
        //
        // They are not the same thing, and the difference is a defect class of
        // its own. Axios 1.x serialises `{ status: ['A', 'B'] }` as
        // **`?status[]=A&status[]=B`**, and ASP.NET Core binds `?status=A&
        // status=B` — `status[]` is simply a different query key, so an array
        // filter arrives unbound and the route answers with everything.
        //
        // Reading `config.params` would have reported the key as `status` and
        // found it perfectly bound. `getUri` runs the same `buildURL` the
        // adapter would, against the same merged config, so what is compared
        // here is what would have gone on the wire.
        //
        // Undefined values need no filtering: the serialiser drops them, so
        // they never appear in the string at all.
        const serialised = instance.getUri(request);
        const queryString = serialised.split('?')[1] ?? '';
        const queryKeys = queryString
          .split('&')
          .filter((pair) => pair.length > 0)
          .map((pair) => decodeURIComponent(pair.split('=')[0]));

        captured.push({
          verb: verb.toUpperCase(),
          path: toBackendPath(url),
          bodyKeys,
          queryKeys,
          hasAuthorization: typeof headers.Authorization === 'string',
          contentType: typeof headers['Content-Type'] === 'string' ? headers['Content-Type'] : null,
        });
      }
    }
  }

  registerAuthBridge(null);
  api.restore();
  identity.restore();
  return captured;
}

// ─────────────────────────────────────────────────────────────────────────────
// The checks
// ─────────────────────────────────────────────────────────────────────────────

const describeWithBackend = INVENTORY === null ? describe.skip : describe;

if (INVENTORY === null) {
  // Loud, not silent. A cross-repo check that quietly succeeds when it cannot
  // see the other repo is worse than no check.
  describe('request-binding drift', () => {
    it('SKIPPED — diaspora-backend is not on disk; set DIASPORA_BACKEND_PATH', () => {
      expect(BACKEND_SOURCE_ROOT).toBeNull();
    });
  });
}

describeWithBackend('the parse is worth trusting', () => {
  // These are floors, not exact counts: the backend grows, and a check that had
  // to be edited on every backend commit would be edited into uselessness. They
  // fail when the reader has *stopped seeing* things it used to see, which is
  // the only way under-reporting turns into reporting nothing.
  it('reads the whole endpoint surface, minimal APIs and controllers alike', () => {
    const inventory = INVENTORY as BackendInventory;

    expect(inventory.minimalApiFilesScanned).toBeGreaterThanOrEqual(120);
    expect(inventory.controllerFilesScanned).toBeGreaterThanOrEqual(9);
    expect(inventory.routes.length).toBeGreaterThanOrEqual(880);

    // The identity surface is MVC, and a reader that missed it would have
    // nothing to say about the OTP routes — the defect that started this wave.
    const identityRoutes = inventory.routes.filter((route) => route.path.startsWith('/api/v1/auth/'));
    expect(identityRoutes.length).toBeGreaterThanOrEqual(18);
  });

  it('resolves the request DTOs it finds', () => {
    const inventory = INVENTORY as BackendInventory;
    const bodyTypes = [
      ...new Set(inventory.routes.map((route) => route.bodyType).filter((type): type is string => type !== null)),
    ];

    expect(bodyTypes.length).toBeGreaterThanOrEqual(300);

    const unresolvable = bodyTypes.filter(
      (type) => lookupDto(inventory.declarations, type).status !== 'ok',
    );
    // Eight at the time of writing: namespace-qualified spellings and genuine
    // duplicate names across modules. Held rather than fixed, because the fix is
    // in the other repository; the ratchet stops it growing.
    expect(unresolvable.length).toBeLessThanOrEqual(8);
  });

  it('places every handler parameter it reads', () => {
    const inventory = INVENTORY as BackendInventory;
    // One at the time of writing (`ReleaseQuarantineBody`, which is a body under
    // a name the convention does not cover). An unplaced parameter is a route
    // whose bound surface is understated, so this must not drift upwards.
    expect(inventory.unclassified.length).toBeLessThanOrEqual(2);
  });
});

describeWithBackend('what the client sends is what the server binds', () => {
  for (const entry of LEDGER) {
    describe(entry.label, () => {
      let requests: CapturedRequest[];

      beforeAll(async () => {
        requests = await capture(entry);
      });

      it('reaches a route the backend maps, under the verb it used', () => {
        const inventory = INVENTORY as BackendInventory;
        expect(requests.length).toBeGreaterThan(0);

        const unmatched = requests
          .filter((request) => findRoute(inventory, request.verb, request.path) === null)
          .map((request) => `${request.verb} ${request.path}`);

        // This is the `/auth/otp/send` class of defect: a 404 on every attempt,
        // which no amount of response-shape testing would have found because the
        // request never reached a handler.
        expect(unmatched).toEqual([]);
      });

      it('sends no body key the bound request type does not declare', () => {
        const inventory = INVENTORY as BackendInventory;
        const unbound: Record<string, string> = {};

        for (const request of requests) {
          if (request.bodyKeys === null) continue;
          const route = findRoute(inventory, request.verb, request.path);
          if (route === null || route.bodyType === null) continue;

          const dto = lookupDto(inventory.declarations, route.bodyType);
          // Unknown or ambiguous: no expectation rather than a guess.
          if (dto.status !== 'ok') continue;

          const declared = new Set(dto.properties.map((property) => camel(property.name).toLowerCase()));
          for (const key of request.bodyKeys) {
            if (declared.has(key.toLowerCase())) continue;
            unbound[key] =
              `${request.verb} ${request.path} sends "${key}", which ${route.bodyType} ` +
              `(${dto.file}) does not declare — the serialiser drops it in silence`;
          }
        }

        const surprises = Object.entries(unbound)
          .filter(([key]) => entry.knownUnbound?.[key] === undefined)
          .map(([, message]) => message);
        expect(surprises).toEqual([]);

        // The other half of the ratchet: a recorded defect that has been fixed
        // must have its entry deleted, or the table becomes the same kind of
        // stale claim the gap registers were.
        const stale = Object.keys(entry.knownUnbound ?? {}).filter((key) => unbound[key] === undefined);
        expect(stale).toEqual([]);
      });

      it('sends every field the bound request type marks required', () => {
        const inventory = INVENTORY as BackendInventory;
        const findings: string[] = [];

        for (const request of requests) {
          if (request.bodyKeys === null) continue;
          const route = findRoute(inventory, request.verb, request.path);
          if (route === null || route.bodyType === null) continue;

          const dto = lookupDto(inventory.declarations, route.bodyType);
          if (dto.status !== 'ok') continue;

          const sent = new Set(request.bodyKeys.map((key) => key.toLowerCase()));
          for (const property of dto.properties) {
            if (!property.required) continue;
            if (sent.has(camel(property.name).toLowerCase())) continue;
            findings.push(
              `${request.verb} ${request.path} omits "${camel(property.name)}", which ` +
                `${route.bodyType} (${dto.file}) marks required — System.Text.Json refuses ` +
                `the body before the handler runs`,
            );
          }
        }

        expect(findings).toEqual([]);
      });

      it('sends no query parameter the handler does not bind', () => {
        const inventory = INVENTORY as BackendInventory;
        const unbound: Record<string, string> = {};

        for (const request of requests) {
          if (request.queryKeys.length === 0) continue;
          const route = findRoute(inventory, request.verb, request.path);
          if (route === null) continue;

          const bound = boundQueryNames(inventory, route);
          // An `[AsParameters]` type this reader could not resolve leaves the
          // bound surface unknown. Asserting against a partial list would report
          // every one of its properties as unbound.
          if (bound === null) continue;

          for (const key of request.queryKeys) {
            if (bound.has(key.toLowerCase())) continue;
            unbound[key] =
              `${request.verb} ${request.path} sends "?${key}=", which ${route.file} does not ` +
              `bind — the model binder discards it and the route answers 200 with more rows ` +
              `than the member asked for`;
          }
        }

        const surprises = Object.entries(unbound)
          .filter(([key]) => entry.knownUnboundQuery?.[key] === undefined)
          .map(([, message]) => message);
        expect(surprises).toEqual([]);

        const stale = Object.keys(entry.knownUnboundQuery ?? {}).filter(
          (key) => unbound[key] === undefined,
        );
        expect(stale).toEqual([]);
      });

      it('carries a bearer on every route the backend does not allow anonymously', () => {
        const inventory = INVENTORY as BackendInventory;
        const findings: string[] = [];

        for (const request of requests) {
          const route = findRoute(inventory, request.verb, request.path);
          // `anonymous === null` is "the route states nothing", which is not the
          // same as "anonymous" — the platform's fallback policy decides. No
          // expectation is formed from an unknown.
          if (route === null || route.anonymous !== false) continue;
          if (request.hasAuthorization) continue;

          findings.push(
            `${request.verb} ${request.path} went out with no Authorization header, but ` +
              `${route.file} requires authorisation — every call 401s`,
          );
        }

        expect(findings).toEqual([]);
      });
    });
  }
});

describeWithBackend('the media upload keeps its multipart body', () => {
  // Its own case rather than a ledger assertion, because the defect it pins is
  // invisible to every check above: the request still went out, to the right
  // route, with the right verb. `apiClient` is created with a default
  // `Content-Type: application/json`, and axios's `transformRequest` reads the
  // resolved content type *before* its FormData branch —
  //
  //   `return hasJSONContentType ? JSON.stringify(formDataToJSON(data)) : data;`
  //
  // — so the form was serialised to JSON and the server saw
  // `HasFormContentType == false`, which is the route's first statement. **No
  // upload in this application could ever have succeeded.** The fix is one
  // header on the call, and this is the check that would have caught it.
  //
  // ── Corrected again, after UAT drove a real upload ────────────────────────
  //
  // Naming the header fixed the JSON serialisation and broke the upload a
  // second way: React Native does **not** append `; boundary=…` to a
  // Content-Type the caller has set. It builds the body with a boundary of its
  // own and sends the header verbatim, so the server got a multipart body it
  // had no delimiter for, read to the end of the content, and failed with
  // "Unexpected end of request content" — logged as a 500 once the response
  // write hit a closed connection.
  //
  // Measured against the deployment, one byte-identical body sent twice:
  //
  //     Content-Type: multipart/form-data; boundary=…   → 201
  //     Content-Type: multipart/form-data               → 500
  //
  // So the property is the opposite of what this asserted: **no Content-Type is
  // sent at all**, leaving the one layer that knows the boundary to declare it.
  it('sends no Content-Type, so the platform declares multipart with its boundary', async () => {
    // Driven against a fake `XMLHttpRequest` rather than `capture()`, because
    // the transport this property belongs to is not axios any more — it cannot
    // be, for the reason above. `__DEV__` is forced off so `uploadDirect` takes
    // the branch a signed release takes.
    const sent: { headers: Record<string, string>; body: unknown }[] = [];
    const originalXhr = (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest;
    const wasDev = (global as { __DEV__?: boolean }).__DEV__;

    class FakeXhr {
      status = 201;
      responseText = JSON.stringify({ data: { mediaId: 'a', status: 'pending' } });
      responseType = '';
      timeout = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      onabort: (() => void) | null = null;
      upload: { onprogress: null } = { onprogress: null };
      readonly headers: Record<string, string> = {};

      open() {}
      setRequestHeader(key: string, value: string) {
        this.headers[key] = value;
      }
      abort() {}
      send(body: unknown) {
        sent.push({ headers: this.headers, body });
        setTimeout(() => this.onload?.(), 0);
      }
    }

    (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
    (global as { __DEV__?: boolean }).__DEV__ = false;

    try {
      await media.uploadDirect(
        { uri: 'file:///tmp/photo.jpg', name: 'photo.jpg', mimeType: 'image/jpeg' },
        { kind: 'image' },
      );
    } finally {
      (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = originalXhr;
      (global as { __DEV__?: boolean }).__DEV__ = wasDev;
    }

    expect(sent).toHaveLength(1);

    // The assertion is on the *absence* of the header, case-insensitively: the
    // one layer that knows the boundary has to be the one that declares it.
    const names = Object.keys(sent[0].headers).map((name) => name.toLowerCase());
    expect(names).not.toContain('content-type');

    // And the body must still be a form. A `FormData` that arrived here as a
    // string would mean something serialised it on the way — the first version
    // of this bug, in a new place.
    expect(typeof sent[0].body).not.toBe('string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Payloads a screen assembles and a pass-through client forwards
//
// Two of this application's create flows take a `Record<string, unknown>` and
// forward it untouched — `createHousingListing` says so in as many words: *"the
// request type is deliberately left to the caller"*. For those the client is not
// where the contract lives, and driving the client with a body written in this
// file would only prove that this file can write a correct body.
//
// So the body is read from the screen's own source instead. It is a static read,
// which buys robustness at the cost of precision — see the limits on
// `readObjectLiteralKeys`.
// ─────────────────────────────────────────────────────────────────────────────

/** `<repo>/…`, from `<repo>/src/lib/__tests__`. */
function repoFile(relativePath: string): string {
  return join(__dirname, '..', '..', '..', relativePath);
}

/**
 * Comments out, strings preserved.
 *
 * Necessary before any key scan: these screens carry long explanatory comments,
 * several of which name payload fields in prose (*"`status: 'Active'` was
 * removed"*), and a scanner that read those would report fields the screen does
 * not send. String literals are stepped over rather than stripped so that a
 * `'//'` inside one — a URL, a date format — cannot start a comment.
 */
function stripCommentsPreservingStrings(source: string): string {
  let out = '';
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (character === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      out += character;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') {
          out += source[index] + (source[index + 1] ?? '');
          index += 2;
          continue;
        }
        out += source[index];
        const closed = source[index] === character;
        index += 1;
        if (closed) break;
      }
      continue;
    }

    out += character;
    index += 1;
  }

  return out;
}

interface ObjectLiteralKeys {
  keys: string[];
  /** True when a `...spread` was seen, which makes the key list incomplete. */
  spread: boolean;
}

/**
 * The top-level keys of an object literal body.
 *
 * Not a parser. It tracks bracket depth, steps over string literals, and only
 * reads an identifier when it is in *key position* — the start of the object or
 * just after a top-level comma. That last part is what stops a ternary value
 * (`negotiable: intent === 'Giving Away' ? false : negotiable,`) contributing
 * `false` and `negotiable` as two extra keys, and a literal value
 * (`deliveryAvailable: true,`) contributing `true`.
 *
 * **Limits, and they are real:**
 *   · a computed key (`[name]: …`) is not read;
 *   · a `...spread` makes the list incomplete, so `spread` is reported and the
 *     caller declines to check rather than reporting the spread's contents as
 *     absent;
 *   · a nested object's keys are invisible — the same top-level-only limit the
 *     runtime checks have.
 */
function readObjectLiteralKeys(objectBody: string): ObjectLiteralKeys {
  const keys: string[] = [];
  let depth = 0;
  let index = 0;
  let atKeyPosition = true;
  let spread = false;

  while (index < objectBody.length) {
    const character = objectBody[index];

    if (character === '"' || character === "'" || character === '`') {
      index += 1;
      while (index < objectBody.length) {
        if (objectBody[index] === '\\') {
          index += 2;
          continue;
        }
        const closed = objectBody[index] === character;
        index += 1;
        if (closed) break;
      }
      continue;
    }
    if (character === '(' || character === '{' || character === '[') {
      depth += 1;
      index += 1;
      continue;
    }
    if (character === ')' || character === '}' || character === ']') {
      depth -= 1;
      index += 1;
      continue;
    }
    if (depth === 0 && character === ',') {
      atKeyPosition = true;
      index += 1;
      continue;
    }
    if (depth === 0 && atKeyPosition && character === '.') {
      spread = true;
      atKeyPosition = false;
      index += 1;
      continue;
    }
    if (depth === 0 && atKeyPosition && /[A-Za-z_$]/.test(character)) {
      let end = index;
      while (end < objectBody.length && /[\w$]/.test(objectBody[end])) end += 1;
      keys.push(objectBody.slice(index, end));
      atKeyPosition = false;
      index = end;
      continue;
    }
    if (depth === 0 && atKeyPosition && !/\s/.test(character)) {
      atKeyPosition = false;
    }
    index += 1;
  }

  return { keys, spread };
}

interface ScreenPayload {
  /** Repo-relative, quoted in failures so it can be opened. */
  file: string;
  /** The `const <name> = {` this reads. */
  variable: string;
  verb: string;
  /** Backend-absolute, already normalised. */
  path: string;
  /**
   * Keys the bound DTO does not declare, each mapped to why the entry is still
   * here rather than fixed.
   *
   * **A ratchet, and a two-way one.** A key that stops being a finding must be
   * deleted from this table or the test fails — which is what stops a fixed
   * defect leaving a permanent excuse behind, the way a stale gap register does.
   */
  knownUnbound: Record<string, string>;
  /** Required DTO properties the screen never sends. Same two-way ratchet. */
  knownMissing: Record<string, string>;
}

const HOUSING_CREATE_REASON =
  'housing/create.tsx builds a payload against the mock listing shape, not against ' +
  'CreateHousingListingRequest. Wave M-4 found it; correcting it is a screen rewrite ' +
  '(the flat rent/currency/deposit trio, the nested location and host blocks, and the ' +
  'listingType/propertyType pair that the server expresses as one accommodationTypeKey), ' +
  'so it is recorded here rather than half-done.';

const MARKETPLACE_CREATE_REASON =
  'marketplace/create.tsx builds a payload against the mock listing shape, not against ' +
  'CreateListingRequest. Wave M-4 found it; the nested seller and location blocks and the ' +
  'category/subcategory pair have no one-to-one equivalent on the wire contract.';

const SCREEN_PAYLOADS: ScreenPayload[] = [
  {
    file: 'src/app/housing/create.tsx',
    variable: 'payload',
    verb: 'POST',
    path: '/api/v1/housing/listings',
    // ── Cleared. The screen was fixed; the ratchet made it say so. ──────────
    //
    // Thirteen unbound keys and three missing required fields, all closed. The
    // second pawl is what forced this edit: the moment the payload stopped
    // sending `host` and started sending `summary`, these entries became false
    // and the build failed until they were deleted. A one-way baseline would
    // have carried "housing create is broken" indefinitely after it was fixed.
    //
    // The `host` block is worth remembering rather than only removing. The DTO
    // has no such member, so none of it ever reached the server — but it was
    // assembled on every submission carrying `providerId: 'user-123'`,
    // `name: 'Amara Kone'`, `isVerified: true` and `rating: 4.9`. A fabricated
    // landlord identity with a fabricated verification badge.
    knownUnbound: {},
    knownMissing: {},
  },
  {
    file: 'src/app/marketplace/create.tsx',
    variable: 'payload',
    verb: 'POST',
    path: '/api/v1/marketplace/listings',
    // ── Cleared. Nine unbound keys and two missing required fields, closed. ──
    //
    // The `seller` block is the one worth remembering. The DTO has no such
    // member, so none of it reached the server — but it was assembled on every
    // submission carrying `sellerId: 'user-123'`, `name: 'Amara Kone'`,
    // `isVerified: true`, `rating: 4.8`, and **two fabricated
    // `countryVerifications`**, each with `isVerified: true`, an arrival year
    // and a years-of-residence figure.
    //
    // Fabricated *trust* data, on the object a buyer uses to decide whether a
    // stranger is safe to meet. Trust owns whether anybody is verified, and the
    // seller is whoever the token says it is.
    knownUnbound: {},
    knownMissing: {},
  },
  {
    // 15 Sep 2026. The swap screen used to post `intent`, `swapDetails`, a
    // nested `location` and a `seller` block naming "Amara Kone" — none of which
    // the DTO declares — without a category key or a country. Rebuilt on the
    // real contract; the payload lives in the lib the screen calls.
    file: 'src/lib/swap-listings.ts',
    variable: 'payload',
    verb: 'POST',
    path: '/api/v1/marketplace/listings',
    knownUnbound: {},
    knownMissing: {},
  },
];

/** The body of `const <variable> = { … }` in a file, comments removed. */
function readScreenPayloadKeys(entry: ScreenPayload): ObjectLiteralKeys {
  const source = stripCommentsPreservingStrings(readFileSync(repoFile(entry.file), 'utf8'));
  const assignment = new RegExp(`const ${entry.variable}\\s*=\\s*\\{`).exec(source);
  if (assignment === null) return { keys: [], spread: true };

  const body = balanced(source, source.indexOf('{', assignment.index), '{', '}');
  if (body === null) return { keys: [], spread: true };

  return readObjectLiteralKeys(body);
}

describeWithBackend('the payloads screens assemble for pass-through clients', () => {
  for (const entry of SCREEN_PAYLOADS) {
    describe(`${entry.file} → ${entry.verb} ${entry.path}`, () => {
      it('still assembles a readable object literal', () => {
        const payload = readScreenPayloadKeys(entry);
        // A rename or a refactor to a spread would otherwise turn both checks
        // below into vacuous passes.
        expect(payload.spread).toBe(false);
        expect(payload.keys.length).toBeGreaterThan(5);
      });

      it('sends no key the bound request type does not declare, beyond the recorded ones', () => {
        const inventory = INVENTORY as BackendInventory;
        const route = findRoute(inventory, entry.verb, entry.path);
        expect(route).not.toBeNull();

        const dto = lookupDto(inventory.declarations, (route as BackendRoute).bodyType ?? '');
        expect(dto.status).toBe('ok');
        if (dto.status !== 'ok') return;

        const declared = new Set(dto.properties.map((property) => camel(property.name).toLowerCase()));
        const unbound = readScreenPayloadKeys(entry)
          .keys.filter((key) => !declared.has(key.toLowerCase()));

        // Two-way. New findings fail because they are not in the table; a
        // finding that has been fixed fails because the table still names it,
        // which is what forces the entry to be deleted rather than left behind
        // as a permanent excuse.
        expect(unbound.sort()).toEqual(Object.keys(entry.knownUnbound).sort());
      });

      it('omits no required field beyond the recorded ones', () => {
        const inventory = INVENTORY as BackendInventory;
        const route = findRoute(inventory, entry.verb, entry.path);
        const dto = lookupDto(inventory.declarations, (route as BackendRoute).bodyType ?? '');
        if (dto.status !== 'ok') throw new Error('the request type no longer resolves');

        const sent = new Set(readScreenPayloadKeys(entry).keys.map((key) => key.toLowerCase()));
        const missing = dto.properties
          .filter((property) => property.required)
          .map((property) => camel(property.name))
          .filter((name) => !sent.has(name.toLowerCase()));

        // Every name here is a field System.Text.Json refuses the body over,
        // *before* any handler or validator runs. A create flow with one of
        // these is a create flow that has never once succeeded.
        expect(missing.sort()).toEqual(Object.keys(entry.knownMissing).sort());
      });
    });
  }
});
