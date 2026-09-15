// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — client surface against the published contract (Wave M-1)
//
// Three checks in this directory already compare this repository against
// `diaspora-backend`, and all three reverse-engineer the backend's contract from
// C# with hand-written regular expressions:
//
//   · `backend-gap-register-drift.test.ts`  parses `Map{Get,Post,…}` calls.
//   · `backend-row-property-drift.test.ts`  sweeps `Contracts/V1/Responses/`.
//   · `backend-request-binding-drift.test.ts` parses request DTOs and handler
//     signatures.
//
// Each of them documents blind spots that exist only because a parser is
// guessing at what a compiler already knows: routes assembled in a `$"/{route}"`
// loop, Identity's MVC `[HttpPost]` controllers, `required` as C# declares it.
//
// **The server can simply state its contract instead.** `Diaspora.Api` now emits
// an OpenAPI document at build time — the same document `AddOpenApi()` has always
// produced at runtime, written to `contracts/Diaspora.Api.json` in the backend
// repository by any `dotnet build`. It is the application's own answer about what
// it serves, produced by starting the host and asking it, not an inference drawn
// from its source. This file reads that document.
//
// ── What this asserts ────────────────────────────────────────────────────────
//
// Every HTTP route this client calls is described in the published contract,
// under the method the client uses. That is the wave brief's floor, and it is
// also — see "What the document contains" — very close to its ceiling.
//
// ── What the document contains, measured rather than assumed ─────────────────
//
// At the time of writing the emitted document holds 768 paths / 885 operations
// and 469 component schemas, and:
//
//   · **routes and methods** — complete, and that is what this file uses. It
//     includes the Identity MVC controllers (`POST /api/v1/auth/login` is a
//     `[HttpPost]` action, not a minimal API), which is a whole class of route
//     the gap-register parser cannot see.
//   · **request bodies** — 352 of 885 operations carry a `requestBody` with a
//     `$ref` to a named schema, and 334 of the 469 schemas declare `required`.
//     Usable, but not by *this* file: a static sweep knows which route a call
//     site targets, not what object it will send at run time. Comparing bodies
//     needs the client actually driven, which is what
//     `backend-request-binding-drift.test.ts` does.
//   · **parameters** — 666 of 885 operations describe their path and query
//     parameters, with `in`, `required` and a type. Same limitation as bodies.
//   · **responses** — every operation lists status codes, but only **54 of 885**
//     attach a typed JSON schema to a 2xx. The minimal-API endpoints return
//     `IResult` without `.Produces<T>()`, so the generator has nothing to
//     describe. **Response-shape checking against this document is therefore not
//     possible**, and an attempt at it would assert almost nothing while looking
//     thorough. Recorded here so the next reader does not try it and conclude the
//     client is fine.
//   · **security** — `components.securitySchemes` is empty. The document cannot
//     say which routes need a bearer token.
//
// ── What this does NOT catch ─────────────────────────────────────────────────
//
//   · **A route assembled at run time.** The sweep resolves string and template
//     literals; a path built from a variable, a lookup table or a config value is
//     invisible.
//   · **Gap adapters.** `*-gap-*.ts` files exist precisely to call routes the
//     backend does not serve, behind a disabled flag. Sweeping them would report
//     every one of them as a mismatch, every run, for ever — the definition of a
//     check that gets skipped. Whether a gap adapter has been overtaken by the
//     backend is `backend-gap-register-drift.test.ts`'s question, and it asks it.
//   · **Prefixes imported from another module.** A transport whose root constant
//     comes from an import is dropped, not guessed — see `UNRESOLVABLE`.
//   · **Bodies, parameters, responses, auth.** Per the section above.
//   · **Route constraints.** `{id}` matches `{employerId:guid}`; a slug sent
//     where the server wants a GUID still matches.
//
// ── The bias, stated deliberately ────────────────────────────────────────────
//
// Following its two siblings: **this under-reports on purpose.** A cross-repo
// check that cries wolf is `.skip`-ed within a fortnight and then protects
// nothing. Every ambiguity resolves towards silence — an unrecognised path
// expression is dropped rather than guessed at. The tests under 'the sweep is
// worth trusting' are the floor that stops deliberate under-reporting drifting
// into reporting nothing at all.
//
// ── Running without the contract ─────────────────────────────────────────────
//
// Two ways this cannot run, and both skip **loudly**: no `diaspora-backend`
// checkout at all, and a checkout that has never been built. A cross-repo check
// that passes quietly when it cannot see the other side is worse than no check,
// because the green tick then describes work that never happened.
// ─────────────────────────────────────────────────────────────────────────────

// Node's globals are declared locally rather than by adding `"node"` to the
// project's `types`. That change is global: it surfaces pre-existing errors in
// roughly twenty assertions across the Phase 5, 7 and 12 suites, and a wave must
// not alter the typecheck configuration for every other phase to compile its own
// test. `require` is deliberately NOT re-declared: Jest's ambient typing already
// provides it, and shadowing it with a narrower signature breaks every other
// `require` in the file.
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

// ─────────────────────────────────────────────────────────────────────────────
// Locating the backend and its published contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where `diaspora-backend` lives.
 *
 * Resolution is deliberately identical to `backend-gap-register-drift.test.ts`
 * and `backend-request-binding-drift.test.ts`: `DIASPORA_BACKEND_PATH` when it is
 * set, the sibling directory otherwise. Three cross-repo checks that disagreed
 * about which checkout they read would produce three answers about one question.
 *
 * An explicitly-set variable is **authoritative and does not fall back**. A path
 * that was named and does not resolve is a misconfigured job, and quietly
 * reading a different directory than the one the operator named is how a green
 * tick ends up describing the wrong backend.
 *
 * Returns the repository *root* rather than `src/` — unlike its siblings this
 * file reads a build artefact next to `src/`, not the sources inside it — but it
 * still uses `src/` as the marker for "this is a checkout", because a bare
 * directory of the right name is not one.
 */
function resolveBackendRepositoryRoot(): string | null {
  const configured = process.env.DIASPORA_BACKEND_PATH;
  // `__dirname` is `<repo>/src/lib/__tests__`.
  const candidate =
    configured !== undefined && configured !== ''
      ? configured
      : join(__dirname, '..', '..', '..', '..', 'diaspora-backend');

  return existsSync(join(candidate, 'src')) ? candidate : null;
}

const BACKEND_REPOSITORY_ROOT = resolveBackendRepositoryRoot();

/**
 * The emitted document.
 *
 * `contracts/Diaspora.Api.json` is where `Diaspora.Api.csproj` points
 * `OpenApiDocumentsDirectory`. It is a committed artefact rather than a build
 * output on purpose: `bin/` is per-configuration, gitignored, and invisible to a
 * sibling checkout, and this file is read by a different repository.
 *
 * Refreshed by any `dotnet build` of the API project. A diff in it is the API
 * surface changing, and is meant to be reviewed as such.
 */
const CONTRACT_PATH =
  BACKEND_REPOSITORY_ROOT === null
    ? null
    : join(BACKEND_REPOSITORY_ROOT, 'contracts', 'Diaspora.Api.json');

const CONTRACT_AVAILABLE = CONTRACT_PATH !== null && existsSync(CONTRACT_PATH);

// ─────────────────────────────────────────────────────────────────────────────
// Reading the published contract
// ─────────────────────────────────────────────────────────────────────────────

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

const HTTP_METHODS: readonly HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value);
}

/**
 * Only the parts of OpenAPI 3.1 this file reads.
 *
 * Declared rather than pulled from a schema package: the document is 1.1 MB of
 * JSON and every field below is one this file actually looks at, so a reader can
 * see the whole of what is being trusted without opening another dependency.
 */
interface PublishedOperation {
  readonly requestBody?: { readonly required?: boolean };
  readonly parameters?: readonly { readonly name?: string; readonly in?: string }[];
  readonly responses?: Readonly<Record<string, unknown>>;
}

interface PublishedDocument {
  readonly openapi?: string;
  readonly info?: { readonly title?: string; readonly version?: string };
  readonly paths?: Readonly<Record<string, Readonly<Record<string, PublishedOperation>>>>;
  readonly components?: { readonly schemas?: Readonly<Record<string, unknown>> };
}

interface PublishedContract {
  /** Normalised path → the methods the server answers on it. */
  readonly operations: Map<string, Set<HttpMethod>>;
  readonly openapiVersion: string;
  readonly pathCount: number;
  readonly operationCount: number;
  readonly schemaCount: number;
  /** Operations carrying a request body schema — reported by the floor test. */
  readonly withRequestBody: number;
  /** Operations describing path/query parameters — reported by the floor test. */
  readonly withParameters: number;
}

/**
 * Route parameters and casing are noise for this comparison.
 *
 * The client writes `/events/${eventId}` and the contract writes
 * `/events/{eventId}`; the contract writes `/employers/{employerId}` where a
 * register writes `/employers/{id}`. They are the same route, and the point of
 * the check is to notice that. Every `{...}` segment collapses to `{}`, a query
 * string is discarded, duplicate slashes go, and a trailing slash goes — a group
 * mapped at `"/"` is the group's own path, not a child of it.
 *
 * Lower-cased because ASP.NET routing is case-insensitive, so a client that
 * differs only in case is calling a route the server really would answer.
 */
function normaliseRoutePath(path: string): string {
  const withoutQuery = path.split('?')[0];
  const collapsed = withoutQuery
    .replace(/\{[^}]*\}/g, '{}')
    .replace(/\/{2,}/g, '/')
    .toLowerCase();
  return collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
}

function readPublishedContract(path: string): PublishedContract {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const document = parsed as PublishedDocument;

  const operations = new Map<string, Set<HttpMethod>>();
  let operationCount = 0;
  let withRequestBody = 0;
  let withParameters = 0;

  const paths = document.paths ?? {};
  for (const routePath of Object.keys(paths)) {
    const item = paths[routePath];
    const key = normaliseRoutePath(routePath);
    const methods = operations.get(key) ?? new Set<HttpMethod>();

    for (const rawMethod of Object.keys(item)) {
      if (!isHttpMethod(rawMethod)) continue;
      const operation = item[rawMethod];
      methods.add(rawMethod);
      operationCount += 1;
      if (operation.requestBody !== undefined) withRequestBody += 1;
      if (operation.parameters !== undefined && operation.parameters.length > 0) {
        withParameters += 1;
      }
    }

    operations.set(key, methods);
  }

  return {
    operations,
    openapiVersion: document.openapi ?? '',
    pathCount: Object.keys(paths).length,
    operationCount,
    schemaCount: Object.keys(document.components?.schemas ?? {}).length,
    withRequestBody,
    withParameters,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the client's own API surface
//
// The client reaches the network through exactly one axios instance, so every
// request in the application is an `apiClient.{get,post,put,patch,delete}` call
// — either at the call site, or inside a per-module transport helper that a
// dozen exported functions share. Both shapes are resolved below; anything else
// is dropped rather than guessed at.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sentinel for a path expression this file refuses to resolve.
 *
 * The distinction that matters: `${eventId}` is a *value* and becomes `{}`,
 * because that is what the route parameter is. `${ANALYTICS_GAP_PREFIX}` is a
 * *constant imported from another module* and becomes this — resolving it to
 * `{}` would invent a path segment the client never sends and report a mismatch
 * that does not exist. Anything carrying this marker leaves the sweep entirely.
 */
const UNRESOLVABLE = '\u0000';

/** Placeholder for the path parameter of a transport helper, before binding. */
const TRANSPORT_SLOT = '\u0001';

interface ResolvedCall {
  readonly method: HttpMethod;
  /** The path as the client writes it, e.g. `/community-life/events/{}`. */
  readonly clientPath: string;
  /** The path the server routes on: `/api/v1` + clientPath, normalised. */
  readonly serverPath: string;
  /** Repo-relative file, for the failure message. */
  readonly file: string;
}

interface ClientSweep {
  readonly calls: readonly ResolvedCall[];
  /** Call sites recognised as requests but whose path could not be resolved. */
  readonly unresolved: readonly string[];
  readonly filesScanned: number;
  readonly transportsFound: number;
}

/**
 * The base URL is one segment short of the platform's canonical prefix.
 *
 * `apiClient` is created with a base URL ending `/v1`, and
 * `RoutePrefixCompatibilityMiddleware` prepends `/api` before routing — so a
 * client path of `/auth/me` reaches the endpoint the document lists as
 * `/api/v1/auth/me`. Hard-coding the two halves here rather than importing
 * `API_BASE_URL` is deliberate: if somebody changes the client's base URL
 * without changing the server's rewrite, this file should notice, and it cannot
 * notice a value it derives from the thing under test.
 */
const CLIENT_BASE_PATH = '/v1';
const SERVER_ROOT_PREFIX = '/api';

function toServerPath(clientPath: string): string {
  return normaliseRoutePath(`${SERVER_ROOT_PREFIX}${CLIENT_BASE_PATH}${clientPath}`);
}

/**
 * Every `.ts`/`.tsx` file that could contain a request.
 *
 * Screens are included, not just `src/lib`: twenty screens call `apiClient`
 * directly, and one of the two routes this check found missing is in a screen.
 *
 * Skipped, with reasons:
 *   · `__tests__` — a test that deliberately calls a made-up route is not the
 *     application calling it.
 *   · `mocks` — MSW handlers *serve* routes, they do not call them.
 *   · anything with `gap` in its filename — the gap adapters, per the header.
 */
function collectClientSourceFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'mocks') continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
      if (entry.name.includes('gap')) continue;
      found.push(full);
    }
  };
  walk(root);
  return found;
}

/** Module-level `const NAME = '…'` string constants, which is how roots are written. */
function readModuleConstants(source: string): Map<string, string> {
  const constants = new Map<string, string>();
  const declaration = /^(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*(`[^`]*`|'[^']*'|"[^"]*")\s*;/gm;

  let match = declaration.exec(source);
  while (match !== null) {
    constants.set(match[1], match[2].slice(1, -1));
    match = declaration.exec(source);
  }

  // A root is routinely written in terms of another (`const ROOT = `${BASE}/x``),
  // so one pass of substitution is applied over the collected set. One pass and
  // not a fixpoint: two levels is all the codebase uses, and a loop here would
  // need cycle detection to be safe for no gain.
  for (const [name, value] of constants) {
    constants.set(name, expandTemplate(value, constants));
  }
  return constants;
}

/**
 * A template literal's text with its interpolations resolved.
 *
 * Three cases, and the third is the one that keeps this check honest:
 *   · a known local constant   → its value
 *   · any ordinary expression  → `{}`, the route parameter it fills
 *   · an unknown SCREAMING_CASE identifier → `UNRESOLVABLE`
 *
 * The third case is an imported constant — `${ANALYTICS_GAP_PREFIX}` — and there
 * is no way to know from here what it holds. Treating it as a route parameter
 * would fabricate a path and report a mismatch against a route the client never
 * calls, which is exactly the false positive that gets a check switched off.
 */
function expandTemplate(literal: string, constants: Map<string, string>): string {
  return literal.replace(/\$\{([^}]*)\}/g, (_whole, expression: string) => {
    const trimmed = expression.trim();
    const known = constants.get(trimmed);
    if (known !== undefined) return known;
    if (/^[A-Z][A-Z0-9_]*$/.test(trimmed)) return UNRESOLVABLE;
    return '{}';
  });
}

/** The literal's text if it is one, `null` otherwise. */
function literalText(expression: string, constants: Map<string, string>): string | null {
  if (expression.length < 2) return null;
  const quote = expression[0];
  if (quote === '`') return expandTemplate(expression.slice(1, -1), constants);
  if (quote === "'" || quote === '"') return expression.slice(1, -1);
  const known = constants.get(expression);
  return known ?? null;
}

/**
 * The index just past the end of a comment opening at `start`, or `start` if
 * nothing opens there.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Without it, an ordinary English apostrophe inside a comment opens a string
 * literal as far as the scanner is concerned, and everything up to the next
 * apostrophe — often hundreds of lines — is swallowed. The function body it was
 * measuring then ends in the wrong place, the enclosing transport is never
 * registered, and the `apiClient.get` inside it is re-counted as a *direct*
 * call with the transport's own path parameter left unresolved.
 *
 * That is not hypothetical. On 22 Aug 2026 adding one comment to
 * `community-life-api.ts` — containing the possessive in "the response's own" —
 * made this suite report that the client had started calling
 * `get /api/v1/community-life{}`, "a route the backend does not publish". The
 * client had not changed; only a comment had.
 *
 * The false positive is the visible half. The same mis-parse also drops every
 * route at that transport's call sites, so a genuinely undeclared route in an
 * affected module would go **unreported** — a guard failing open, which is the
 * failure mode this suite exists to prevent in others.
 */
function skipComment(source: string, start: number): number {
  if (source[start] !== '/') return start;

  if (source[start + 1] === '/') {
    const newline = source.indexOf('\n', start);
    return newline === -1 ? source.length : newline;
  }

  if (source[start + 1] === '*') {
    const close = source.indexOf('*/', start + 2);
    return close === -1 ? source.length : close + 2;
  }

  return start;
}

/**
 * The index just past the `)` that closes a call whose `(` is at `open`.
 *
 * Depth counting with string, template and comment awareness. Without the string
 * awareness a `')'` inside a message would close the call early and the argument
 * list would be truncated; without the template awareness a `${a ? b : c}` would
 * do the same; without the comment awareness a prose apostrophe would do the
 * same and much more quietly. See `skipComment`.
 */
function findCallEnd(source: string, open: number): number {
  let depth = 1;
  let index = open;
  while (index < source.length && depth > 0) {
    const character = source[index];
    if (character === '/') {
      const past = skipComment(source, index);
      if (past !== index) {
        index = past;
        continue;
      }
    }
    if (character === '(' || character === '[' || character === '{') depth += 1;
    else if (character === ')' || character === ']' || character === '}') depth -= 1;
    else if (character === '`' || character === "'" || character === '"') {
      index = skipStringLiteral(source, index);
      continue;
    }
    index += 1;
  }
  return index;
}

/** The index just past a string or template literal opening at `start`. */
function skipStringLiteral(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length && source[index] !== quote) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (quote === '`' && source[index] === '$' && source[index + 1] === '{') {
      let braces = 1;
      index += 2;
      while (index < source.length && braces > 0) {
        if (source[index] === '{') braces += 1;
        else if (source[index] === '}') braces -= 1;
        index += 1;
      }
      continue;
    }
    index += 1;
  }
  return index + 1;
}

/**
 * The `{ … }` block of a function whose parameter list ends at `afterParameters`.
 *
 * Brace-matched rather than "up to the next `function` keyword", and that is not
 * a refinement. Bounding a helper's body by the next declaration makes the *last*
 * helper in a file own everything after it, and every one of its call sites then
 * looks like a recursive call inside the helper and is skipped. Written the naive
 * way, this file silently lost `financial-api.ts` entirely — forty requests,
 * reported as nothing to check.
 *
 * A return-type annotation can itself contain braces (`: Promise<{ id: string }>`),
 * so candidate blocks are tried in order and the first one containing a request
 * call is taken as the body. `null` when there is none, which drops the helper.
 */
function findFunctionBody(source: string, afterParameters: number): [number, number] | null {
  let cursor = afterParameters;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const open = source.indexOf('{', cursor);
    if (open === -1) return null;
    const end = findCallEnd(source, open + 1);
    if (TRANSPORT_MEMBER.test(source.slice(open, end))) return [open, end];
    cursor = end;
  }
  return null;
}

/** Top-level comma-separated arguments of a call, given the text between the parens. */
function splitArguments(argumentText: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  let index = 0;

  while (index < argumentText.length) {
    const character = argumentText[index];
    if (character === '(' || character === '[' || character === '{') depth += 1;
    else if (character === ')' || character === ']' || character === '}') depth -= 1;
    else if (character === '`' || character === "'" || character === '"') {
      index = skipStringLiteral(argumentText, index);
      continue;
    } else if (character === ',' && depth === 0) {
      args.push(argumentText.slice(start, index).trim());
      start = index + 1;
    }
    index += 1;
  }

  const last = argumentText.slice(start).trim();
  if (last.length > 0) args.push(last);
  return args;
}

/**
 * A per-module transport helper: `read(path)`, `write('post', path, body)`.
 *
 * Most of the client's surface goes through one of these rather than calling
 * `apiClient` directly, so a sweep that only looked at direct calls would see a
 * fraction of the routes and quietly report the rest as fine.
 */
interface Transport {
  /** The root, with `TRANSPORT_SLOT` marking where the argument is spliced in. */
  readonly template: string;
  /** Argument position of the path. */
  readonly pathIndex: number;
  /** Argument position of the method, when the helper takes one. */
  readonly methodIndex: number | null;
  /** The single method, when it does not. */
  readonly method: HttpMethod | null;
  readonly start: number;
  readonly end: number;
}

/**
 * The client reaches the network through two axios instances, not one.
 *
 * `authTransport` is `apiClient` without interceptors, on the same `baseURL`, and
 * it carries the anonymous identity routes — register, login, the OTP pair,
 * refresh. Sweeping only `apiClient` would exempt exactly the routes with the
 * worst history in this programme: `POST /auth/otp/send` and `/otp/verify` 404'd
 * on every sign-in for a whole release because the routes are `/otp/start` and
 * `/otp/sign-in`. `it('knows about every transport in the application')` fails if
 * a third instance appears.
 */
const TRANSPORT_INSTANCES: readonly string[] = ['apiClient', 'authTransport'];

const REQUEST_CALL = new RegExp(
  `(?:${TRANSPORT_INSTANCES.join('|')})` +
    String.raw`\.(get|post|put|patch|delete)\s*(?:<[\s\S]*?>)?\s*\(\s*` +
    String.raw`(\`[^\`]*\`|'[^']*'|"[^"]*"|[A-Za-z_$][\w$]*)`,
  'g',
);

/** Matches the transport member access alone, for the helper-body test below. */
const TRANSPORT_MEMBER = new RegExp(`(?:${TRANSPORT_INSTANCES.join('|')})\\.`);

const FUNCTION_DECLARATION =
  /\n(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<[^(]*?>)?\s*\(([^)]*)\)/g;

/**
 * Transport helpers in one file, keyed by name.
 *
 * A function qualifies when it calls `apiClient` with a template that splices
 * exactly one of its own parameters into a resolvable root. Everything else —
 * including a helper whose root is an imported constant — is not a transport as
 * far as this file is concerned, and its call sites are simply not swept.
 *
 * The body is taken as the text up to the next top-level `function`, rather than
 * by matching braces. It over-reads into trailing comments and under-reads
 * nothing, and the only consequence of over-reading is recognising a transport
 * that is not one — which then finds no literal call sites and contributes
 * nothing.
 */
function findTransports(source: string, constants: Map<string, string>): Map<string, Transport> {
  const declarations: { start: number; afterParameters: number; name: string; parameters: string }[] =
    [];
  FUNCTION_DECLARATION.lastIndex = 0;
  let declaration = FUNCTION_DECLARATION.exec(source);
  while (declaration !== null) {
    declarations.push({
      start: declaration.index,
      afterParameters: declaration.index + declaration[0].length,
      name: declaration[1],
      parameters: declaration[2],
    });
    declaration = FUNCTION_DECLARATION.exec(source);
  }

  const transports = new Map<string, Transport>();

  for (const { start, afterParameters, name, parameters } of declarations) {
    const bounds = findFunctionBody(source, afterParameters);
    if (bounds === null) continue;
    const end = bounds[1];
    const body = source.slice(bounds[0], end);

    const parameterNames = parameters
      .split(',')
      .map((parameter) => parameter.split(':')[0].trim())
      .filter((parameter) => parameter.length > 0);

    REQUEST_CALL.lastIndex = 0;
    const requests: { method: HttpMethod; argument: string }[] = [];
    let request = REQUEST_CALL.exec(body);
    while (request !== null) {
      const method = request[1];
      if (isHttpMethod(method)) requests.push({ method, argument: request[2] });
      request = REQUEST_CALL.exec(body);
    }
    if (requests.length === 0) continue;

    let template: string | null = null;
    let pathParameter: string | null = null;

    for (const { argument } of requests) {
      // The path is either the template itself, or a `const url = ...` one line
      // above it — both shapes are in the codebase and both mean the same thing.
      let inner: string | null = null;
      if (argument.startsWith('`')) {
        inner = argument.slice(1, -1);
      } else {
        const assigned = new RegExp(`const\\s+${argument}\\s*=\\s*(\`[^\`]*\`)`).exec(body);
        if (assigned !== null) inner = assigned[1].slice(1, -1);
      }
      if (inner === null) continue;

      const interpolations = (inner.match(/\$\{([^}]*)\}/g) ?? []).map((raw) =>
        raw.slice(2, -1).trim(),
      );
      const fromParameters = interpolations.filter((entry) => parameterNames.includes(entry));
      if (fromParameters.length !== 1) continue;

      pathParameter = fromParameters[0];
      template = inner.replace(/\$\{([^}]*)\}/g, (_whole, expression: string) => {
        const trimmed = expression.trim();
        if (trimmed === pathParameter) return TRANSPORT_SLOT;
        const known = constants.get(trimmed);
        return known ?? UNRESOLVABLE;
      });
      break;
    }

    if (template === null || pathParameter === null) continue;
    if (template.includes(UNRESOLVABLE)) continue;

    const methods = new Set(requests.map((entry) => entry.method));
    let methodIndex: number | null = null;
    let method: HttpMethod | null = null;

    if (methods.size === 1) {
      method = requests[0].method;
    } else {
      // A helper that can send more than one verb chooses between them by
      // comparing one of its parameters against a literal. If no parameter does
      // that, the verb is not knowable from here and the helper is dropped.
      for (const candidate of parameterNames) {
        if (new RegExp(`\\b${candidate}\\s*===\\s*'(?:get|post|put|patch|delete)'`).test(body)) {
          methodIndex = parameterNames.indexOf(candidate);
          break;
        }
      }
      if (methodIndex === null) continue;
    }

    transports.set(name, {
      template,
      pathIndex: parameterNames.indexOf(pathParameter),
      methodIndex,
      method,
      start,
      end,
    });
  }

  return transports;
}

function sweepClientSurface(sourceRoot: string, repositoryRoot: string): ClientSweep {
  const calls: ResolvedCall[] = [];
  const unresolved: string[] = [];
  const files = collectClientSourceFiles(sourceRoot);
  let transportsFound = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (!TRANSPORT_INSTANCES.some((instance) => source.includes(instance))) continue;

    const relativeFile = relative(repositoryRoot, file).replace(/\\/g, '/');
    const constants = readModuleConstants(source);
    const transports = findTransports(source, constants);
    transportsFound += transports.size;

    const insideTransport = (position: number): boolean => {
      for (const transport of transports.values()) {
        if (position >= transport.start && position < transport.end) return true;
      }
      return false;
    };

    const record = (method: HttpMethod, clientPath: string, origin: string): void => {
      if (clientPath.includes(UNRESOLVABLE) || !clientPath.startsWith('/')) {
        unresolved.push(origin);
        return;
      }
      calls.push({
        method,
        clientPath,
        serverPath: toServerPath(clientPath),
        file: relativeFile,
      });
    };

    // ── Direct calls ─────────────────────────────────────────────────────────
    // Calls inside a recognised transport are skipped: the path there is the
    // helper's own parameter, and the real routes are at the helper's call sites,
    // swept below. Counting both would report `/community-life{}` as a route.
    REQUEST_CALL.lastIndex = 0;
    let direct = REQUEST_CALL.exec(source);
    while (direct !== null) {
      const method = direct[1];
      if (isHttpMethod(method) && !insideTransport(direct.index)) {
        const resolved = literalText(direct[2], constants);
        const origin = `${relativeFile} · ${method}(${direct[2]})`;
        if (resolved === null) unresolved.push(origin);
        else record(method, resolved, origin);
      }
      direct = REQUEST_CALL.exec(source);
    }

    // ── Transport call sites ─────────────────────────────────────────────────
    for (const [name, transport] of transports) {
      const invocation = new RegExp(`(?<![\\w$.])${name}\\s*(?:<[^(]*?>)?\\s*\\(`, 'g');
      let site = invocation.exec(source);
      while (site !== null) {
        const open = site.index + site[0].length;
        // The helper's own declaration matches this pattern too, and its
        // "arguments" are its parameter list. Skipping its body skips it.
        if (!insideTransport(site.index)) {
          const close = findCallEnd(source, open);
          const args = splitArguments(source.slice(open, close - 1));
          const origin = `${relativeFile} · ${name}(…)`;
          const rawPath = transport.pathIndex < args.length ? args[transport.pathIndex] : null;
          const resolvedPath = rawPath === null ? null : literalText(rawPath, constants);

          let method: HttpMethod | null = transport.method;
          if (transport.methodIndex !== null) {
            const rawMethod =
              transport.methodIndex < args.length ? args[transport.methodIndex] : null;
            const literal = rawMethod === null ? null : literalText(rawMethod, constants);
            method = literal !== null && isHttpMethod(literal) ? literal : null;
          }

          if (resolvedPath === null || method === null) unresolved.push(origin);
          else record(method, transport.template.replace(TRANSPORT_SLOT, resolvedPath), origin);
        }
        site = invocation.exec(source);
      }
    }
  }

  return { calls, unresolved, filesScanned: files.length, transportsFound };
}

// ─────────────────────────────────────────────────────────────────────────────
// The check
// ─────────────────────────────────────────────────────────────────────────────

const describeAgainstContract = CONTRACT_AVAILABLE ? describe : describe.skip;

/**
 * Read once, and only when there is something to read.
 *
 * `describe.skip` skips the *tests*, not the callback — Jest still runs the body
 * to collect them. Parsing at describe scope on a machine without the contract
 * would therefore turn the intended skip into "Test suite failed to run", which
 * is the failure this file exists to avoid. The empty values below are never
 * compared against anything, because every test that would use them is skipped;
 * they exist so the collection pass has something to hold.
 */
let cachedContract: PublishedContract | null = null;
function publishedContract(): PublishedContract {
  if (CONTRACT_PATH === null || !CONTRACT_AVAILABLE) {
    return {
      operations: new Map(),
      openapiVersion: '',
      pathCount: 0,
      operationCount: 0,
      schemaCount: 0,
      withRequestBody: 0,
      withParameters: 0,
    };
  }
  if (cachedContract === null) cachedContract = readPublishedContract(CONTRACT_PATH);
  return cachedContract;
}

const REPOSITORY_ROOT = join(__dirname, '..', '..', '..');

let cachedSweep: ClientSweep | null = null;
function clientSweep(): ClientSweep {
  if (cachedSweep === null) {
    cachedSweep = sweepClientSurface(join(REPOSITORY_ROOT, 'src'), REPOSITORY_ROOT);
  }
  return cachedSweep;
}

describe('the scanner reads code, not prose', () => {
  const NEWLINE = String.fromCharCode(10);
  // The bug this pins made the suite blame the client for a comment. Both
  // directions matter: the false positive was noticed, and the matching false
  // negative (routes silently dropped from an affected module) would not have
  // been.
  it('does not let an apostrophe in a comment run past the end of a body', () => {
    const body = [
      '{',
      '  // the response is the module own shape, and this is the transport',
      '  return 1;',
      '}',
      'const after = 2;',
    ].join(NEWLINE);

    // Written with the possessive that broke it, inserted rather than typed so
    // this stays legible.
    const withApostrophe = body.replace('module own', 'module' + String.fromCharCode(39) + 's own');

    const end = findCallEnd(withApostrophe, withApostrophe.indexOf('{') + 1);

    // The body closes at its own brace, not somewhere past it.
    expect(withApostrophe.slice(0, end)).toContain('return 1;');
    expect(withApostrophe.slice(0, end)).not.toContain('const after');
  });

  it('does not end a body early on a brace inside a comment', () => {
    const source = ['{', '  // a shape like } this', '  return 1;', '}'].join(NEWLINE);

    const end = findCallEnd(source, source.indexOf('{') + 1);

    expect(source.slice(0, end)).toContain('return 1;');
  });

  it('skips block comments too', () => {
    const source = ['{', '  /* the caller}s own quote ' + String.fromCharCode(39) + ' */', '  return 1;', '}'].join(NEWLINE);

    const end = findCallEnd(source, source.indexOf('{') + 1);

    expect(source.slice(0, end)).toContain('return 1;');
  });

  it('still treats a real string as a string', () => {
    // The comment handling must not cost the string handling: a brace inside a
    // quoted message still must not change the depth.
    const source = ['{', "  const message = 'a } brace';", '  return 1;', '}'].join(NEWLINE);

    const end = findCallEnd(source, source.indexOf('{') + 1);

    expect(source.slice(0, end)).toContain('return 1;');
  });

  it('does not mistake division for a comment', () => {
    const source = ['{', '  const half = total / 2;', '  return half;', '}'].join(NEWLINE);

    const end = findCallEnd(source, source.indexOf('{') + 1);

    expect(source.slice(0, end)).toContain('return half;');
    expect(end).toBe(source.length);
  });
});

describe('the published backend contract this suite compares against', () => {
  it('is present, or this file has told you why it is not', () => {
    if (!CONTRACT_AVAILABLE) {
      // Not an assertion. A cross-repo check that cannot see the other repo has
      // not passed and has not failed — it has not run, and the log is the only
      // place that can say so. The two causes are separated because the fixes
      // are completely different.
      const configured = process.env.DIASPORA_BACKEND_PATH;
      console.warn(
        [
          'SKIPPED: the client surface was not checked against the published API contract.',
          BACKEND_REPOSITORY_ROOT === null
            ? configured !== undefined && configured !== ''
              ? `No diaspora-backend checkout: DIASPORA_BACKEND_PATH is set to "${configured}" and` +
                ' there is no src/ under it. The variable is authoritative, so the sibling' +
                ' directory was not tried.'
              : 'No diaspora-backend checkout: DIASPORA_BACKEND_PATH is unset and the sibling' +
                ' ../diaspora-backend has no src/.'
            : `The checkout at "${BACKEND_REPOSITORY_ROOT}" has no contracts/Diaspora.Api.json.` +
              ' The document is written by the build — run `dotnet build Diaspora.slnx` there' +
              ' (or `dotnet build src/Diaspora.Api/Diaspora.Api.csproj`) and re-run this suite.',
          'The client may be calling routes the backend does not serve, and this run did not look.',
        ].join(' '),
      );
    }
    expect(CONTRACT_AVAILABLE || BACKEND_REPOSITORY_ROOT === null || CONTRACT_PATH !== null).toBe(
      true,
    );
  });
});

describeAgainstContract('the contract the backend publishes', () => {
  const contract = publishedContract();

  it('is a document worth trusting', () => {
    // Floors, not equalities. The backend gains routes constantly and this test
    // must not become the thing that fails when it does. What it catches is the
    // document silently becoming empty or partial — a generator that ran against
    // a half-composed host, a truncated write, a `MapModuleEndpoints()` that
    // stopped being called — at which point every assertion below "passes"
    // because there is nothing to disagree with.
    expect(contract.openapiVersion.startsWith('3.')).toBe(true);
    expect(contract.pathCount).toBeGreaterThanOrEqual(700);
    expect(contract.operationCount).toBeGreaterThanOrEqual(800);
    expect(contract.schemaCount).toBeGreaterThanOrEqual(400);
  });

  it('describes the shapes this file claims it does', () => {
    // The header states what the document contains and therefore what can and
    // cannot be checked against it. Those numbers are load-bearing — the reason
    // this file does not assert response shapes is that only 54 of 885
    // operations describe one — so they are asserted rather than left as prose
    // that ages.
    expect(contract.withRequestBody).toBeGreaterThanOrEqual(300);
    expect(contract.withParameters).toBeGreaterThanOrEqual(600);
  });

  it('includes the MVC controllers the source parsers cannot see', () => {
    // `backend-gap-register-drift.test.ts` documents Identity's `[HttpPost]`
    // controllers as a blind spot: it parses `Map{Get,Post,…}` calls and these
    // are attribute-routed actions. They are in the document, because the
    // document is produced by asking the built host rather than reading the
    // source — which is the single largest thing this mechanism buys.
    expect(contract.operations.get('/api/v1/auth/login')?.has('post')).toBe(true);
    expect(contract.operations.get('/api/v1/auth/otp/start')?.has('post')).toBe(true);
  });
});

describeAgainstContract('the client surface this check sweeps', () => {
  const sweep = clientSweep();

  it('resolves enough of the client to be worth trusting', () => {
    // The floor against this file's own deliberate under-reporting. Every
    // ambiguity above resolves towards silence, and silence is indistinguishable
    // from "nothing is wrong" unless something asserts that the sweep still
    // sees the application. A refactor that moved every request behind a new
    // transport shape would otherwise turn this suite green by seeing nothing.
    expect(sweep.filesScanned).toBeGreaterThanOrEqual(400);
    expect(sweep.transportsFound).toBeGreaterThanOrEqual(8);
    expect(sweep.calls.length).toBeGreaterThanOrEqual(200);
  });

  it('knows about every transport in the application', () => {
    // The sweep can only see requests sent through a name it was told about. A
    // third `axios.create(...)` would be a whole surface exempt from this check
    // with nothing turning red — the failure mode where the list of things
    // checked silently stops matching the list of things that exist.
    //
    // Discovered from disk rather than asserted from memory, so adding an
    // instance without adding it to TRANSPORT_INSTANCES is a red build.
    const created: string[] = [];
    for (const file of collectClientSourceFiles(join(REPOSITORY_ROOT, 'src'))) {
      const source = readFileSync(file, 'utf8');
      const declaration = /const\s+([A-Za-z_$][\w$]*)\s*=\s*axios\.create\s*\(/g;
      let match = declaration.exec(source);
      while (match !== null) {
        created.push(match[1]);
        match = declaration.exec(source);
      }
    }
    expect(created.sort()).toEqual([...TRANSPORT_INSTANCES].sort());
  });

  it('resolves calls from both shapes, in both layers', () => {
    // A sweep that had quietly lost one of the two resolution strategies would
    // still clear the count above, because the direct calls alone nearly do.
    // These are the specific things that must keep working: a direct call in a
    // screen, and a transport call site in the api layer.
    const paths = new Set(sweep.calls.map((call) => `${call.method} ${call.serverPath}`));
    expect(paths.has('post /api/v1/auth/otp/start')).toBe(true);
    expect(paths.has('get /api/v1/community-life/events/{}')).toBe(true);

    const layers = new Set(sweep.calls.map((call) => call.file.split('/')[1]));
    expect(layers.has('lib')).toBe(true);
    expect(layers.has('app')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The debt this wave inherited
//
// **One** route the client calls is not in the published contract, and no verb
// mismatch remains. This paragraph said "three" until Wave M-5, having been
// written when there were three and never re-read as the other two were cleared
// directly beneath it -- a count in prose is a claim with no check on it, which
// is the whole argument for the ratchet below.
//
// The list is written out rather than counted, because a threshold ("no more
// than three") lets one new defect appear for every one that gets fixed and
// reports the same green tick throughout.
//
// This list is a ratchet and it fails in **both** directions:
//
//   · a new unpublished route is not in the list, so it fails;
//   · a route that gets fixed is in the list and no longer a mismatch, so it
//     also fails, until the line below is deleted along with the fix.
//
// That second direction is the point. The list can only shrink, and it is meant
// to reach zero. Nothing here is approved — every line is a request that reaches
// no endpoint, or reaches one that will refuse the verb.
//
// Keyed on method and path only, deliberately: a route called from two files is
// one defect, and keying on the call site would let it be half-fixed.
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_UNPUBLISHED: readonly string[] = [
  // `maps-api.ts` · `fetchAlert`, whose doc comment calls this "the real
  // community-update route". It is not: the backend maps no `/updates` route at
  // all, and no endpoint anywhere in it mentions `CommunityUpdate`. Every alert
  // detail open is a 404. The neighbouring `searchAlerts` reads the same objects
  // from `/location/nearby`, which is published and does exist — so the list
  // works and the detail does not, which is why nobody noticed.
  // ── Cleared. `get /api/v1/updates/{}` is fixed. ────────────────────────────
  //
  // `maps-api.ts` called it and its own doc comment called it "the real
  // community-update route". The platform maps no `/updates` route at all, so
  // **every alert a member opened was a 404** — while the list above it worked,
  // because `searchAlerts` reads the same objects from `/location/nearby`. The
  // surface looked healthy right up to the tap.
  //
  // Now on `GET /community/posts/{id}`: an update *is* a post, and the backend
  // shaped `CommunityPostResponse` to the client's own field names to the point
  // of serving `postId` and `updateId` as the same value.

  // ── Cleared. `get /api/v1/employers/{}` is fixed (15 Sep 2026). ─────────────
  //
  // `app/employer/[id].tsx` called it for its whole life and its header said the
  // backend had no employer read. The Jobs module had one — `GET
  // /jobs/employers/{idOrSlug}`, anonymous — and the note here quoted the three
  // routes it mapped *before* that was added. The screen reads the real route.
];

const KNOWN_METHOD_DRIFT: readonly string[] = [
  // `community-life-api.ts` · `updateEvent` sends PUT. `EventEndpoints.cs:102`
  // maps `MapPatch("/events/{eventId:guid}")`, and the contract lists GET,
  // PATCH and DELETE on that path — no PUT. The request is refused with 405
  // before any handler runs, so every event edit fails.
  //
  // Worth noting how it hid: the same file's `write` helper sends PUT to
  // `/events/{}/rsvp` and `/events/{}/capacity`, and both of those really are
  // PUT. The verb was right four times out of five in one file.
  // ── Cleared. The event edit verb is fixed. ────────────────────────────────
  //
  // `EventEndpoints.cs:102` maps `MapPatch`; the client sent PUT, so **every
  // event edit was refused with 405 before any handler ran**. It hid because
  // the four routes immediately below the edit in that same file — `/capacity`,
  // `/agenda`, `/speakers`, `/linked-resources` — genuinely are `MapPut`, and
  // this helper sends PUT to two of them correctly. Right four times out of
  // five in one file.
  //
  // The dev handler served `onPut` as well, which is why the integration test
  // named "updates an event" passed against the wrong verb. Both corrected.
];

describeAgainstContract('routes the client calls that the contract does not describe', () => {
  const contract = publishedContract();
  const sweep = clientSweep();

  /** One entry per distinct method+path, with every file that calls it. */
  const byRoute = new Map<string, { readonly files: Set<string>; readonly call: ResolvedCall }>();
  for (const call of sweep.calls) {
    const key = `${call.method} ${call.serverPath}`;
    const existing = byRoute.get(key);
    if (existing === undefined) byRoute.set(key, { files: new Set([call.file]), call });
    else existing.files.add(call.file);
  }

  const unpublished: string[] = [];
  const methodDrift: string[] = [];
  const detail = new Map<string, string>();

  for (const [key, { files, call }] of byRoute) {
    const published = contract.operations.get(call.serverPath);
    if (published === undefined) {
      unpublished.push(key);
      detail.set(key, [...files].sort().join(', '));
      continue;
    }
    if (!published.has(call.method)) {
      const line = `${key} · contract has: ${[...published].sort().join(', ')}`;
      methodDrift.push(line);
      detail.set(line, [...files].sort().join(', '));
    }
  }

  it('has not started calling a route the backend does not publish', () => {
    const baseline = new Set(KNOWN_UNPUBLISHED);
    expect(
      unpublished
        .filter((line) => !baseline.has(line))
        .sort()
        .map(
          (line) =>
            `\n${line}\n    called from: ${detail.get(line) ?? 'unknown'}` +
            '\n    → no path in contracts/Diaspora.Api.json matches. The request 404s.' +
            '\n      Fix the client, or — if the backend genuinely serves it — rebuild the' +
            '\n      backend so the contract is current, then re-run.',
        ),
    ).toEqual([]);
  });

  it('has not started calling a published route with a method it does not answer', () => {
    const baseline = new Set(KNOWN_METHOD_DRIFT);
    expect(
      methodDrift
        .filter((line) => !baseline.has(line))
        .sort()
        .map(
          (line) =>
            `\n${line}\n    called from: ${detail.get(line) ?? 'unknown'}` +
            '\n    → the path exists; the verb does not. The request is refused with 405' +
            '\n      before any handler runs, which reads as a server fault in the client.',
        ),
    ).toEqual([]);
  });

  it('has not kept a KNOWN_UNPUBLISHED line that is no longer true', () => {
    // The ratchet's other pawl. Fixing a call site without deleting its line
    // here would leave the list claiming debt that no longer exists, and a debt
    // list nobody trusts is one nobody pays down.
    const current = new Set(unpublished);
    expect(
      KNOWN_UNPUBLISHED.filter((line) => !current.has(line)).map(
        (line) =>
          `\n${line}\n    → no longer unpublished. Delete this line from KNOWN_UNPUBLISHED.` +
          '\n      (Or the call site was removed, in which case delete it too.)',
      ),
    ).toEqual([]);
  });

  it('has not kept a KNOWN_METHOD_DRIFT line that is no longer true', () => {
    const current = new Set(methodDrift);
    expect(
      KNOWN_METHOD_DRIFT.filter((line) => !current.has(line)).map(
        (line) =>
          `\n${line}\n    → no longer drifting. Delete this line from KNOWN_METHOD_DRIFT.` +
          '\n      (Or the contract changed which verbs it answers, in which case update it.)',
      ),
    ).toEqual([]);
  });
});
