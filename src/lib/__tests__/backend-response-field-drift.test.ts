// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — what the client reads, against what each route sends
// (RMD-005)
//
// ── The defect class ─────────────────────────────────────────────────────────
//
// A client type that declares a field its route never sends is a promise the
// type checker then enforces on the wrong side: every screen may read the
// field, `tsc` approves, and every screen gets `undefined`. FSOLID-006 found
// two of these by hand — the housing page read `item.rating.average` off a
// `ProviderSummary` that has no `rating` and threw, and the organisation page
// navigated every event card to `/community-life/event/undefined` — and both
// were found only because somebody was reading `any`s for another reason.
//
// The list-shaped version is worse. A route that answers a page
// (`{ items, nextCursor, … }`) read as a bare array reaches `.flatMap` on an
// object and throws — or, inside a `catch`, quietly renders nothing for ever.
//
// ── What this asserts ────────────────────────────────────────────────────────
//
// For every request the client makes through `apiClient` or `authTransport`:
//
//   1. **the route is published** — a stronger form of
//      `backend-openapi-contract-drift`'s check, because this one resolves a
//      path through a helper that is handed a whole URL, which that file's
//      text sweep cannot follow. It found three it had never seen.
//   2. **the type the body is read as declares nothing the route does not
//      send**, recursively through objects and lists, and a list is not read
//      where the route sends an object or the reverse.
//
// How a request's route and body type are found — through readers, type
// arguments, casts and generic helpers bound at their call sites — is
// `support/response-reads`, which a TypeScript type checker drives. It is about
// six seconds and half a gigabyte to build, once.
//
// ── What the contract is ─────────────────────────────────────────────────────
//
// `contracts/Diaspora.Api.json`, read through `support/published-contract`. It
// names a schema for 1,076 of 1,093 success bodies (RMD-003), and since RMD-006
// each name stands for one backend type. **Before RMD-006 this comparison
// would have been wrong in the worst direction**: the document said
// `POST /trust/verifications` took one field where the route binds nine, and a
// client that sent all nine would have been reported as the one in error.
//
// ── Measured when this landed, 23 November 2026 ──────────────────────────────
//
// 289 transport calls in the swept files; 699 requests once helpers are bound
// at their call sites; 581 compared against a documented body, matching 14,308
// client fields. 68 client types declared 335 fields their routes do not send,
// seven of them reading a list where the route sends an object. Every one is
// in `KNOWN_RESPONSE_DRIFT` below with what is known about it.
//
// ── What this does NOT catch ─────────────────────────────────────────────────
//
//   · **A read the checker cannot type.** `apiClient.get<unknown>`, a body
//     handed to a function this does not recognise, `response.data.data` read
//     off an untyped call. Counted in `OPAQUE_READS` and not allowed to grow.
//   · **A path that cannot be resolved.** Counted in `UNRESOLVED_PATHS`, same.
//   · **A union read after narrowing.** `A | B` is skipped, not guessed at.
//   · **Types, beyond list against object against value.** A `string` read where
//     the route sends a number is not this file's question.
//   · **Fields the client reads less of.** A type with fewer fields than the
//     route sends is a type that reads less, which is fine.
//   · **Gap adapters, mocks and tests**, following
//     `backend-openapi-contract-drift`: a gap adapter calls a route that does
//     not exist on purpose, and a mock serves rather than calls.
//
// ── The bias ─────────────────────────────────────────────────────────────────
//
// Following its siblings, every ambiguity resolves towards silence, and the
// floors under 'the client this sweeps' are what stop deliberate silence
// drifting into seeing nothing at all.
// ─────────────────────────────────────────────────────────────────────────────

import * as ts from 'typescript';
import { backendContractFile } from './support/backend-checkout';
import {
  readPublishedContract,
  type PublishedContract,
  type Schema,
} from './support/published-contract';
import {
  compareRead,
  reachedOperation,
  relativeTo,
  sweepResponseReads,
  type RequestRead,
} from './support/response-reads';

declare const __dirname: string;

const join: (...parts: string[]) => string = require('path').join;

const CONTRACT_FILE = backendContractFile();
const CLIENT_ROOT = join(__dirname, '..', '..', '..');

/**
 * Client types written to read more than one documented shape, and the other
 * components whose fields they may also declare.
 *
 * `EventWire` is the events adapter's input: the detail route answers
 * `EventResponse` with a nested schedule and every list answers
 * `EventSummaryResponse` flat, and `lib/api/event-wire.ts` reads both through
 * one type on purpose. `screen-response-field-drift` registers the same union.
 */
const READS_EITHER_SHAPE: ReadonlyMap<string, readonly string[]> = new Map([
  ['EventWire', ['EventResponse', 'EventSummaryResponse']],
]);

// ─────────────────────────────────────────────────────────────────────────────
// The instrument, driven with programs small enough to read
// ─────────────────────────────────────────────────────────────────────────────

const LIBRARY_FILES = new Map<string, ts.SourceFile>();

/** A program of the given files, with the standard library cached between programs. */
function programOf(files: Readonly<Record<string, string>>): ts.Program {
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts'],
    types: [],
  };
  const host = ts.createCompilerHost(options, true);
  const disk = {
    getSourceFile: host.getSourceFile.bind(host),
    fileExists: host.fileExists.bind(host),
    readFile: host.readFile.bind(host),
    directoryExists: host.directoryExists?.bind(host),
  };

  // Module resolution asks whether a directory exists before it asks about a
  // file in it. Without this, `import … from '../transport'` resolves to
  // nothing, every type from it is an error type, and every read is opaque —
  // which an example would report as agreement.
  host.directoryExists = (directory) =>
    Object.keys(files).some((fileName) => fileName.startsWith(`${directory.replace(/\/$/, '')}/`)) ||
    (disk.directoryExists?.(directory) ?? false);

  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = files[fileName];
    if (text !== undefined) return ts.createSourceFile(fileName, text, languageVersion, true);
    const cached = LIBRARY_FILES.get(fileName);
    if (cached !== undefined) return cached;
    const loaded = disk.getSourceFile(fileName, languageVersion, onError, shouldCreate);
    if (loaded !== undefined) LIBRARY_FILES.set(fileName, loaded);
    return loaded;
  };
  host.fileExists = (fileName) => fileName in files || disk.fileExists(fileName);
  host.readFile = (fileName) => files[fileName] ?? disk.readFile(fileName);

  return ts.createProgram(Object.keys(files), options, host);
}

const VIRTUAL_ROOT = '/virtual';

/** What every example imports: the transport, its envelope and two readers. */
const TRANSPORT = `
  export interface Envelope<T> { data: T; meta?: unknown }
  type Response<T> = Promise<{ data: T }>;
  export declare const apiClient: {
    get<T = unknown>(url: string, config?: unknown): Response<T>;
    post<T = unknown>(url: string, body?: unknown, config?: unknown): Response<T>;
    put<T = unknown>(url: string, body?: unknown, config?: unknown): Response<T>;
    delete<T = unknown>(url: string, config?: unknown): Response<T>;
  };
  export declare function readPage<T>(body: unknown): { items: T[] };
  export declare function toList<T>(body: unknown): T[];
`;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const nullable = (schema: Schema): Schema => ({ oneOf: [{ type: 'null' }, schema] });
const text: Schema = { type: 'string' };

function contractOf(
  schemas: Readonly<Record<string, Schema>>,
  operations: Readonly<Record<string, Schema>>,
): PublishedContract {
  return {
    schemas,
    operations: new Map(
      Object.entries(operations).map(([key, data]) => [key, { status: '200', data: nullable(data) }]),
    ),
  };
}

interface Outcome {
  readonly requests: readonly RequestRead[];
  /** `label` → `field: problem`, every drift the examples produce. */
  readonly drift: Readonly<Record<string, readonly string[]>>;
  readonly matched: number;
}

/** Sweeps one example and compares it, exactly as the real sweep does below. */
function examine(api: string, contract: PublishedContract, extra: Readonly<Record<string, string>> = {}): Outcome {
  const files: Record<string, string> = {
    [`${VIRTUAL_ROOT}/src/lib/transport.ts`]: TRANSPORT,
    [`${VIRTUAL_ROOT}/src/lib/api/example.ts`]: api,
    ...extra,
  };
  const program = programOf(files);

  // An example that does not compile is read as error types, and an error type
  // compares as nothing. Silence from a broken example is not a pass.
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  expect(diagnostics).toEqual([]);

  const sweep = sweepResponseReads(
    program,
    (file) => file.fileName.startsWith(`${VIRTUAL_ROOT}/src/lib/api/`),
    VIRTUAL_ROOT,
  );

  const drift: Record<string, string[]> = {};
  let matched = 0;
  for (const request of sweep.requests) {
    if (request.read.kind !== 'data' && request.read.kind !== 'row') continue;
    const reached = reachedOperation(contract.operations, request);
    const body = reached === null ? undefined : contract.operations.get(reached);
    if (body === undefined || body === null || body.data === null) continue;
    const comparison = compareRead(
      program.getTypeChecker(),
      contract,
      request.read,
      body.data,
      relativeTo(VIRTUAL_ROOT),
      READS_EITHER_SHAPE,
    );
    matched += comparison.matched;
    if (comparison.drift.length > 0) {
      drift[comparison.label] = comparison.drift.map((entry) => `${entry.field}: ${entry.problem}`);
    }
  }
  return { requests: sweep.requests, drift, matched };
}

const THING = {
  ThingResponse: {
    type: 'object',
    properties: {
      thingId: text,
      name: text,
      owner: ref('OwnerResponse'),
      tags: { type: 'array', items: ref('TagResponse') },
    },
  },
  OwnerResponse: { type: 'object', properties: { ownerId: text } },
  TagResponse: { type: 'object', properties: { key: text } },
  ThingPage: {
    type: 'object',
    properties: { items: { type: 'array', items: ref('ThingResponse') }, nextCursor: text },
  },
} satisfies Record<string, Schema>;

describe('the instrument', () => {
  it('reports a field the route does not send', () => {
    const outcome = examine(
      `
      import { apiClient, type Envelope } from '../transport';
      interface Thing { thingId: string; name: string; legacyName?: string }
      export async function fetchThing(id: string): Promise<Thing> {
        const response = await apiClient.get<Envelope<Thing>>(\`/things/\${id}\`);
        return response.data.data;
      }`,
      contractOf(THING, { 'get /api/v1/things/{}': ref('ThingResponse') }),
    );

    expect(outcome.drift).toEqual({ 'Thing <- ThingResponse': ['legacyName: not sent'] });
    expect(outcome.matched).toBe(2);
  });

  it('follows objects and lists inside the body', () => {
    const outcome = examine(
      `
      import { apiClient, type Envelope } from '../transport';
      interface Thing {
        thingId: string;
        owner: { ownerId: string; avatarUrl: string };
        tags: { key: string; label: string }[];
      }
      export async function fetchThing(id: string): Promise<Thing> {
        const response = await apiClient.get<Envelope<Thing>>(\`/things/\${id}\`);
        return response.data.data;
      }`,
      contractOf(THING, { 'get /api/v1/things/{}': ref('ThingResponse') }),
    );

    expect(outcome.drift).toEqual({
      'Thing <- ThingResponse': ['owner.avatarUrl: not sent', 'tags[].label: not sent'],
    });
  });

  it('reports a page read as a bare list', () => {
    // The `.flatMap is not a function` class.
    const outcome = examine(
      `
      import { apiClient, type Envelope } from '../transport';
      interface Thing { thingId: string }
      export async function listThings(): Promise<Thing[]> {
        const response = await apiClient.get<Envelope<Thing[]>>('/things');
        return response.data.data;
      }`,
      contractOf(THING, { 'get /api/v1/things': ref('ThingPage') }),
    );

    expect(outcome.drift).toEqual({
      'Thing[] <- ThingPage': ['(body): read as a list; the contract sends an object'],
    });
  });

  it('compares a row read through readPage with one row of the page', () => {
    // The reader is what touches the body, so it outranks the call's own type
    // argument — which here is wrong, and would report the wrong thing.
    const outcome = examine(
      `
      import { apiClient, readPage, type Envelope } from '../transport';
      interface Row { thingId: string; extra: number }
      export async function listThings() {
        const response = await apiClient.get<Envelope<Row[]>>('/things');
        return readPage<Row>(response.data).items;
      }`,
      contractOf(THING, { 'get /api/v1/things': ref('ThingPage') }),
    );

    expect(outcome.drift).toEqual({ 'Row <- ThingResponse': ['extra: not sent'] });
  });

  it('binds a generic helper at the line that calls it', () => {
    // The route and the type are both unknown inside the helper. The path comes
    // from the argument, the type from the checker's resolution of the call,
    // including a type argument it inferred rather than one written down.
    const outcome = examine(
      `
      import { apiClient, type Envelope } from '../transport';
      const ROOT = '/things';
      interface Thing { thingId: string; colour: string }
      async function read<T>(path: string): Promise<T> {
        const response = await apiClient.get<Envelope<T>>(\`\${ROOT}\${path}\`);
        return response.data.data;
      }
      export function fetchThing(id: string): Promise<Thing> {
        return read<Thing>(\`/\${encodeURIComponent(id)}\`);
      }
      export async function fetchInferred(id: string) {
        const thing: Thing = await read(\`/\${id}\`);
        return thing;
      }`,
      contractOf(THING, { 'get /api/v1/things/{}': ref('ThingResponse') }),
    );

    expect(outcome.requests.map((request) => request.operation)).toEqual([
      'get /api/v1/things/{}',
      'get /api/v1/things/{}',
    ]);
    // Both typed — the second only through inference from `const thing: Thing`.
    expect(outcome.requests.map((request) => request.read.kind)).toEqual(['data', 'data']);
    expect(outcome.drift).toEqual({ 'Thing <- ThingResponse': ['colour: not sent'] });
    expect(outcome.matched).toBe(2);
  });

  it('resolves a root imported from another file', () => {
    const outcome = examine(
      `
      import { apiClient, type Envelope } from '../transport';
      import { ROOT } from './roots';
      interface Thing { thingId: string }
      export async function fetchThing(id: string): Promise<Thing> {
        const response = await apiClient.get<Envelope<Thing>>(\`\${ROOT}/\${id}\`);
        return response.data.data;
      }`,
      contractOf(THING, { 'get /api/v1/things/{}': ref('ThingResponse') }),
      { [`${VIRTUAL_ROOT}/src/lib/api/roots.ts`]: `export const ROOT = '/things';` },
    );

    expect(outcome.requests.map((request) => request.operation)).toEqual(['get /api/v1/things/{}']);
    expect(outcome.drift).toEqual({});
    expect(outcome.matched).toBe(1);
  });

  it('reports a value read where the route sends an object', () => {
    const outcome = examine(
      `
      import { apiClient, type Envelope } from '../transport';
      interface Thing { thingId: string; tags: string[] }
      export async function fetchThing(id: string): Promise<Thing> {
        const response = await apiClient.get<Envelope<Thing>>(\`/things/\${id}\`);
        return response.data.data;
      }`,
      contractOf(THING, { 'get /api/v1/things/{}': ref('ThingResponse') }),
    );

    expect(outcome.drift).toEqual({
      'Thing <- ThingResponse': ['tags[]: read as string; the contract sends an object'],
    });
  });

  it('reads nothing from a request whose body is discarded', () => {
    const outcome = examine(
      `
      import { apiClient } from '../transport';
      export async function touchThing(id: string): Promise<void> {
        await apiClient.post(\`/things/\${id}/touch\`, {});
      }`,
      contractOf(THING, {}),
    );

    expect(outcome.requests.map((request) => request.read.kind)).toEqual(['nothing']);
  });

  it('counts a body read as unknown as opaque, not as agreement', () => {
    // An `unknown` body names no field, so comparing it compares nothing and
    // reports nothing. A reader typed `unknown` was already opaque; the call's
    // own `Envelope<unknown>` was not, and the map's guide layer read its body
    // that way on 23 November 2026 while the suite passed: two requests compared
    // with a page, zero fields matched, zero drift.
    const outcome = examine(
      `
      import { apiClient, readPage, type Envelope } from '../transport';
      export async function throughTheCall(): Promise<unknown> {
        const response = await apiClient.get<Envelope<unknown>>('/things/one');
        return response.data.data;
      }
      export async function throughAReader(): Promise<unknown[]> {
        const response = await apiClient.get('/things/two');
        return readPage<unknown>(response.data).items;
      }`,
      contractOf(THING, {
        'get /api/v1/things/one': ref('ThingResponse'),
        'get /api/v1/things/two': ref('ThingResponse'),
      }),
    );

    // The reason when opaque and the kind otherwise: a compiler type in a
    // failure diff is unreadable, and circular enough to crash a JSON reporter.
    const reads = outcome.requests.map(({ read }) => (read.kind === 'opaque' ? read : { kind: read.kind }));
    expect(reads).toEqual([
      { kind: 'opaque', reason: 'a body read as unknown' },
      { kind: 'opaque', reason: 'a reader with no type' },
    ]);
  });

  it('keeps both readings of a segment typed as a union of literals', () => {
    // `/things/${kind}` is two routes when the contract maps `/things/a` and
    // `/things/b`, and one route with a parameter when it maps `/things/{kind}`.
    const outcome = examine(
      `
      import { apiClient, type Envelope } from '../transport';
      interface Thing { thingId: string }
      export async function act(kind: 'a' | 'b'): Promise<Thing> {
        const response = await apiClient.post<Envelope<Thing>>(\`/things/\${kind}\`);
        return response.data.data;
      }`,
      contractOf(THING, { 'post /api/v1/things/a': ref('ThingResponse'), 'post /api/v1/things/b': ref('ThingResponse') }),
    );

    expect(outcome.requests[0].alternatives).toEqual(['post /api/v1/things/a', 'post /api/v1/things/b']);
    expect(outcome.matched).toBe(1);
  });

  it('compares a reader of two shapes with both', () => {
    const outcome = examine(
      `
      import { apiClient, type Envelope } from '../transport';
      interface EventWire { eventId: string; startsAt?: string; schedule?: { startsAt: string } }
      export async function fetchEvent(id: string): Promise<EventWire> {
        const response = await apiClient.get<Envelope<EventWire>>(\`/events/\${id}\`);
        return response.data.data;
      }`,
      contractOf(
        {
          EventResponse: { type: 'object', properties: { eventId: text, schedule: ref('Schedule') } },
          EventSummaryResponse: { type: 'object', properties: { eventId: text, startsAt: text } },
          Schedule: { type: 'object', properties: { startsAt: text } },
        },
        { 'get /api/v1/events/{}': ref('EventResponse') },
      ),
    );

    // eventId, startsAt (the summary's), schedule (the detail's), schedule.startsAt.
    expect(outcome.drift).toEqual({});
    expect(outcome.matched).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The client, against the contract
// ─────────────────────────────────────────────────────────────────────────────

/** The same population as `backend-openapi-contract-drift`'s sweep. */
function isSwept(fileName: string): boolean {
  const normalised = fileName.split('\\').join('/');
  const prefix = `${CLIENT_ROOT.split('\\').join('/')}/src/`;
  if (!normalised.startsWith(prefix)) return false;
  if (normalised.includes('/__tests__/') || normalised.includes('/mocks/')) return false;
  return !normalised.slice(normalised.lastIndexOf('/') + 1).includes('gap');
}

interface Reading {
  readonly transportCalls: number;
  readonly requests: readonly RequestRead[];
  readonly unresolved: readonly string[];
  /** Operation key → sites, for requests that reach no published operation. */
  readonly unreached: ReadonlyMap<string, readonly string[]>;
  /** Reason → count, for reads the checker could not type. */
  readonly opaque: ReadonlyMap<string, number>;
  /** Label → field → problem, with the sites that read it. */
  readonly drift: ReadonlyMap<string, { readonly fields: Map<string, string>; readonly sites: Set<string> }>;
  /** `operation` → client fields matched, for the canaries. */
  readonly matchedAt: ReadonlyMap<string, number>;
  readonly compared: number;
  readonly matched: number;
}

let reading: Reading | null = null;

function readClient(): Reading {
  if (reading !== null) return reading;
  if (CONTRACT_FILE === null) throw new Error('no contract');

  const configFile = ts.readConfigFile(join(CLIENT_ROOT, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, CLIENT_ROOT);
  const program = ts.createProgram({
    rootNames: parsed.fileNames.filter(isSwept),
    options: { ...parsed.options, noEmit: true },
  });
  const checker = program.getTypeChecker();
  const contract = readPublishedContract(CONTRACT_FILE);
  const sweep = sweepResponseReads(program, (file) => isSwept(file.fileName), CLIENT_ROOT);
  const relative = relativeTo(CLIENT_ROOT);

  const unreached = new Map<string, string[]>();
  const opaque = new Map<string, number>();
  const drift = new Map<string, { fields: Map<string, string>; sites: Set<string> }>();
  const matchedAt = new Map<string, number>();
  let compared = 0;
  let matched = 0;

  for (const request of sweep.requests) {
    const reached = reachedOperation(contract.operations, request);
    if (reached === null) {
      unreached.set(request.operation, [...(unreached.get(request.operation) ?? []), request.site]);
      continue;
    }

    if (request.read.kind === 'nothing') continue;
    if (request.read.kind === 'opaque') {
      opaque.set(request.read.reason, (opaque.get(request.read.reason) ?? 0) + 1);
      continue;
    }

    const body = contract.operations.get(reached);
    if (body === undefined || body === null || body.data === null) continue;

    const comparison = compareRead(checker, contract, request.read, body.data, relative, READS_EITHER_SHAPE);
    compared += 1;
    matched += comparison.matched;
    matchedAt.set(reached, Math.max(matchedAt.get(reached) ?? 0, comparison.matched));

    if (comparison.drift.length === 0) continue;
    const entry = drift.get(comparison.label) ?? { fields: new Map<string, string>(), sites: new Set<string>() };
    for (const { field, problem } of comparison.drift) entry.fields.set(field, problem);
    entry.sites.add(`${request.method.toUpperCase()} ${request.clientPath} at ${request.site}`);
    drift.set(comparison.label, entry);
  }

  reading = {
    transportCalls: sweep.transportCalls,
    requests: sweep.requests,
    unresolved: sweep.unresolved,
    unreached,
    opaque,
    drift,
    matchedAt,
    compared,
    matched,
  };
  return reading;
}

const describeAgainstContract = CONTRACT_FILE === null ? describe.skip : describe;

describe('the contract this compares against', () => {
  it('is present, or this file has told you why it is not', () => {
    if (CONTRACT_FILE === null) {
      // Loud, following the siblings: a cross-repo check that passes quietly
      // when it cannot see the other side describes work that never happened.
      console.warn(
        'backend-response-field-drift: no diaspora-backend checkout, so no request was compared. ' +
          'Set DIASPORA_BACKEND_PATH to run it.',
      );
    }
    expect(true).toBe(true);
  });
});

describeAgainstContract('the client this sweeps', () => {
  beforeAll(() => {
    readClient();
  }, 180_000);

  it('sees enough of the client to be worth trusting', () => {
    // Every ambiguity above resolves towards silence, and silence is
    // indistinguishable from agreement unless something asserts that the sweep
    // still sees the application.
    const client = readClient();
    expect(client.transportCalls).toBeGreaterThanOrEqual(250);
    expect(client.requests.length).toBeGreaterThanOrEqual(600);
    expect(client.compared).toBeGreaterThanOrEqual(500);
    expect(client.matched).toBeGreaterThanOrEqual(12_000);
  });

  it('compares the reads it is known to be able to compare', () => {
    // A parse that finds nothing looks exactly like agreement. These three are
    // a direct typed read, a read through a generic helper bound at its call
    // site, and the widest body the client reads; each matched every field it
    // declares when this landed. A lost resolution strategy drops one to zero.
    const client = readClient();
    expect(client.matchedAt.get('get /api/v1/jobs/{}') ?? 0).toBeGreaterThanOrEqual(100);
    expect(client.matchedAt.get('get /api/v1/guides/{}') ?? 0).toBeGreaterThanOrEqual(80);
    expect(client.matchedAt.get('get /api/v1/intelligence/countries/{}') ?? 0).toBeGreaterThanOrEqual(140);
  });

  it('has not gained a read it cannot type', () => {
    // A read this cannot type is a read nobody checks. The count can only
    // fall: lower it when it does, and type the read instead of raising it.
    const client = readClient();
    const total = Array.from(client.opaque.values()).reduce((sum, count) => sum + count, 0);
    expect({ total, byReason: Object.fromEntries(client.opaque) }).toEqual({
      total: OPAQUE_READS,
      byReason: expect.any(Object),
    });
  });

  it('has not gained a path it cannot resolve', () => {
    const client = readClient();
    expect({ count: client.unresolved.length, sites: client.unresolved }).toEqual({
      count: UNRESOLVED_PATHS,
      sites: expect.any(Array),
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The debt this landed with
//
// Both ledgers below are exact and fail in both directions, following
// `backend-openapi-contract-drift`'s KNOWN_UNPUBLISHED: a new entry fails until
// it is written down with a reason, and a fixed one fails until it is deleted.
// A threshold would let one appear for every one that is fixed.
//
// `row` names the ledger row in diaspora-backend's PrelaunchFindings.csv that
// owns the work. An entry without one is a decision, and says why.
// ─────────────────────────────────────────────────────────────────────────────

/** Reads the checker could not type when this landed. See 'has not gained a read it cannot type'. */
const OPAQUE_READS = 65;

/** Request paths that could not be resolved when this landed. */
const UNRESOLVED_PATHS = 20;

interface KnownUnreached {
  readonly row: string;
  readonly why: string;
}


interface KnownDrift {
  /** Every field the route does not send, exactly. */
  readonly fields: readonly string[];
  /** The ledger row that owns it, or `null` for a decision. */
  readonly row: string | null;
  readonly why: string;
}

/** Requests that reach no published operation, keyed `method path`. */
const KNOWN_UNREACHED: Readonly<Record<string, KnownUnreached>> = {
  'post /api/v1/community/moderation/decisions': {
    row: 'RMD-009',
    why: 'Removed from the backend on 7 Nov 2026 in favour of Trust moderation cases. `submitModerationDecision` is reachable only through the `useModerationDecision` in `hooks/community-social`, which no screen imports: the moderation screen uses the one in `hooks/communities`.',
  },
  'post /api/v1/guides/{}/hide': {
    row: 'RMD-009',
    why: 'The Guides module maps no hide route. `hideGuide` has no caller.',
  },
  'post /api/v1/guides/{}/unhide': {
    row: 'RMD-009',
    why: 'The Guides module maps no unhide route. `unhideGuide` has no caller.',
  },
};

// Shared reasons, so an entry says which kind it is at a glance.
const NO_TYPED_READ =
  'Nothing in `src` reads these fields through this type (checker-verified when this landed). A promise the next reader will be held to, rather than a defect today.';
const NO_CALLER_CHUNKED =
  'The chunked-upload functions have no caller: the app uploads through `/media/uploads/direct`.';

/** Client types that declare fields their routes do not send, keyed `Client <- Contract`. */
const KNOWN_RESPONSE_DRIFT: Readonly<Record<string, KnownDrift>> = {
  // ── RMD-008 — a wrapped list read as a bare one, outside the map.
  'CalendarEvent[] <- CommunityCalendarResponse': {
    fields: ['(body)'],
    row: 'RMD-008',
    why: "`fetchCalendar` hands the calendar object back as `CalendarEvent[]`; `events.tsx` spreads it into an array, which throws inside the promise's own `catch`, so the calendar tab has never shown a platform entry.",
  },
  'PlatformLocation[] <- LocationSearchResponse': {
    fields: ['(body)'],
    row: 'RMD-008',
    why: '`searchPlatformLocations` hands `{ term, results }` back as a list; both callers `.filter` or `.map` it and throw inside their own `try`, so every platform place search answers with an error.',
  },
  // ── Decisions: a name read only behind the one the route sends.
  'an inline type in src/lib/api/community-life-api.ts <- EventSeriesResponse': {
    fields: ['id'],
    row: null,
    why: '`createEventSeries` reads `seriesId ?? id`: `id` is read only behind the name the route sends.',
  },
  'CreatedMarketplaceListing <- ListingResponse': {
    fields: ['id'],
    row: null,
    why: '`listingIdOf` reads `listingId ?? id` and throws if neither arrives: `id` is read only behind the name the route sends.',
  },
  'EventWire <- EventResponse': {
    fields: ['id'],
    row: null,
    why: '`event-wire` reads `id` only behind `eventId`, for mock and cached events — the allowance `screen-response-field-drift` makes for the same adapter.',
  },
  'EventWire <- EventSummaryResponse': {
    fields: ['id'],
    row: null,
    why: '`event-wire` reads `id` only behind `eventId`, for mock and cached events — the allowance `screen-response-field-drift` makes for the same adapter.',
  },
  // ── RMD-009 — declared, not sent, and not yet shown to matter or not.
  'an inline type in src/lib/automation/certified-client.ts <- AutomationStatusChangedResponse': {
    fields: ['automation.actions[].channel'],
    row: 'RMD-009',
    why: "`channel` is read by automation simulation and validation, which also handle drafts built on the device; whether either sees this route's body is not established.",
  },
  'AnalyticsWire <- CommunityProgramme.OrganizationAnalyticsResponse': {
    fields: ['memberGrowth[].amount', 'memberGrowth[].donationCount', 'memberGrowth[].periodStart'],
    row: 'RMD-009',
    why: "`memberGrowth` points arrive as `{ date, value }` and are declared with the giving series' `{ periodStart, amount, donationCount }`, while `DonationTimeSeriesWire` declares the reverse. The two point shapes look swapped; not traced to a screen.",
  },
  'AutomationDefinition <- AutomationDefinitionResponse': {
    fields: ['actions[].channel'],
    row: 'RMD-009',
    why: "`channel` is read by automation simulation and validation, which also handle drafts built on the device; whether either sees this route's body is not established.",
  },
  'BookmarkCollectionResponse[] <- BookmarkCollectionResponse[]': {
    fields: ['[].glyph', '[].itemCount', '[].items', '[].name', '[].updatedAt'],
    row: 'RMD-009',
    why: NO_TYPED_READ,
  },
  'CommentResponse <- CommentResponse': {
    fields: ['postId', 'reactions.counts', 'reactions.myReactionKey', 'reviewStatus'],
    row: 'RMD-009',
    why: "`reactions.counts` and `myReactionKey` are read through `readReactionSummary`, which accepts the server's shape too (`reaction-bar-server-shape.test.tsx`). `postId` and `reviewStatus` are not traced.",
  },
  'CommentThreadResponse <- CommentThreadResponse': {
    fields: ['comments[].postId', 'comments[].reactions.counts', 'comments[].reactions.myReactionKey', 'comments[].reviewStatus'],
    row: 'RMD-009',
    why: "`reactions.counts` and `myReactionKey` are read through `readReactionSummary`, which accepts the server's shape too (`reaction-bar-server-shape.test.tsx`). `postId` and `reviewStatus` are not traced.",
  },
  'CommunityOrganization <- OrganizationResponse': {
    fields: ['category', 'contact.facebook', 'contact.instagram', 'contact.twitter', 'contact.whatsapp', 'contact.youtube', 'coverImage', 'followersCount', 'gallery', 'id', 'isFollowing', 'leaders[].avatarUrl', 'location.addressLine', 'location.areaName', 'location.distanceKm', 'location.landmark', 'logo', 'openingHours', 'rating', 'reputationLevel'],
    row: 'RMD-009',
    why: 'Read by the Community Life screens. Whether those reads see this body or the mapped organisation is not established; the profile screen itself is clean (`screen-response-field-drift`).',
  },
  'CommunityOrganization <- OrganizationSummaryResponse': {
    fields: ['category', 'contact', 'coverImage', 'createdAt', 'description', 'followersCount', 'gallery', 'id', 'isFollowing', 'leaders', 'location.addressLine', 'location.areaName', 'location.distanceKm', 'location.landmark', 'logo', 'mission', 'openingHours', 'rating', 'reputationLevel', 'services'],
    row: 'RMD-009',
    why: 'The organisations browse reads rows as the full organisation type; the summary row sends none of these 20. Read by the Community Life screens; not traced.',
  },
  'CommunityPostResponse <- CommunityPostResponse': {
    fields: ['areaId', 'areaName', 'attachments[].url', 'audienceAreaId', 'audienceCountryCode', 'authorId', 'cityName', 'countryCode', 'isBookmarked', 'isPublished', 'latitude', 'longitude', 'organizationId', 'poll.isClosed', 'poll.selectedOptionIds', 'reactions.counts', 'reactions.myReactionKey', 'reviewStatus', 'updatedAt', 'versionNumber', 'visibilityRuleId'],
    row: 'RMD-009',
    why: "`reactions.counts` and `myReactionKey` are read through `readReactionSummary`, which accepts the server's shape too (`reaction-bar-server-shape.test.tsx`). `cityName`, `areaName`, `authorId`, `organizationId`, `isBookmarked` and the poll's `isClosed` and `selectedOptionIds` are read by the post card, the update screen and the poll block; whether those reads see this body or a mapped post is not established.",
  },
  'CommunityUpdate <- CommunityPostResponse': {
    fields: ['authorId', 'imageUrls'],
    row: 'RMD-009',
    why: NO_TYPED_READ,
  },
  'ContentEngagementResponse <- ContentEngagementResponse': {
    fields: ['reactions.counts', 'reactions.myReactionKey'],
    row: 'RMD-009',
    why: "`reactions.counts` and `myReactionKey` are read through `readReactionSummary`, which accepts the server's shape too (`reaction-bar-server-shape.test.tsx`).",
  },
  'Conversation <- ConversationResponse': {
    fields: ['lastMessage.delivery.failedAt', 'lastMessage.delivery.queuedAt', 'lastMessage.delivery.retryCount', 'lastMessage.isOptimistic', 'participants[].trust.countryVerifications'],
    row: 'RMD-009',
    why: "`isOptimistic` and `delivery` are the device's own send state, kept on the wire type. `participants[].trust.countryVerifications` is never sent, so `TrustBanner`'s country row never renders.",
  },
  'ConversationRequest <- ConversationRequestResponse': {
    fields: ['fromUser.trust.countryVerifications'],
    row: 'RMD-009',
    why: "`fromUser.trust.countryVerifications` is never sent, so `TrustBanner`'s country row never renders for a request.",
  },
  'CreatorChallenge <- CreatorChallengeResponse': {
    fields: ['reward.amount'],
    row: 'RMD-009',
    why: '`ProgrammeCards` reads `reward.amount`; the reward is sent without it. Not traced to what the card shows instead.',
  },
  'CreatorChallenge[] <- CreatorChallengeResponse[]': {
    fields: ['[].reward.amount'],
    row: 'RMD-009',
    why: '`ProgrammeCards` reads `reward.amount`; the reward is sent without it. Not traced to what the card shows instead.',
  },
  'CreatorContentPerformancePageWire <- CreatorContentPerformancePageResponse': {
    fields: ['items[].metrics[].amount'],
    row: 'RMD-009',
    why: NO_TYPED_READ,
  },
  'CreatorLeaderboard <- CreatorLeaderboardResponse': {
    fields: ['entries[].rankDelta'],
    row: 'RMD-009',
    why: '`leaderboard.tsx` reads `rankDelta` for its movement arrows; the route never sends it.',
  },
  'CreatorMilestone <- CreatorMilestoneResponse': {
    fields: ['reward.amount'],
    row: 'RMD-009',
    why: '`ProgrammeCards` reads `reward.amount`; the reward is sent without it. Not traced to what the card shows instead.',
  },
  'CreatorMilestone[] <- CreatorMilestoneResponse[]': {
    fields: ['[].reward.amount'],
    row: 'RMD-009',
    why: '`ProgrammeCards` reads `reward.amount`; the reward is sent without it. Not traced to what the card shows instead.',
  },
  'CreatorReferralProgramme <- CreatorReferralProgrammeResponse': {
    fields: ['totalEarned'],
    row: 'RMD-009',
    why: NO_TYPED_READ,
  },
  'CreatorSummaryWire <- CreatorAnalyticsSummaryResponse': {
    fields: ['metrics[].amount'],
    row: 'RMD-009',
    why: NO_TYPED_READ,
  },
  'DonationTimeSeriesWire <- DonationTimeSeriesResponse': {
    fields: ['points[].date', 'points[].value'],
    row: 'RMD-009',
    why: "Declared as `{ date, value }`, the organisation growth series' shape; see the `AnalyticsWire` entry. No typed read.",
  },
  'EventRow <- EventSummaryResponse': {
    fields: ['attendeeCount', 'cityName', 'id', 'updatedAt'],
    row: 'RMD-009',
    why: 'The creator workspace reads its rows tolerantly — `listingId ?? id`, `?? 0` — so nothing throws, but the fields named here are never sent and their figures always read as the fallback.',
  },
  'FeedResponse <- FeedResponse': {
    fields: ['generatedAt', 'items[].affectedRadiusMetres', 'items[].areaId', 'items[].areaName', 'items[].attachments', 'items[].audienceAreaId', 'items[].audienceCountryCode', 'items[].author', 'items[].authorId', 'items[].body', 'items[].bookmarkCount', 'items[].canCancel', 'items[].canEdit', 'items[].canWithdraw', 'items[].category', 'items[].cityName', 'items[].closedAt', 'items[].commentCount', 'items[].countryCode', 'items[].createdAt', 'items[].description', 'items[].editedAt', 'items[].expiresAt', 'items[].isBookmarked', 'items[].isEdited', 'items[].isPinned', 'items[].isPublished', 'items[].latitude', 'items[].location', 'items[].longitude', 'items[].organizationId', 'items[].poll', 'items[].postId', 'items[].publishedAt', 'items[].reactions', 'items[].reportCount', 'items[].reviewStatus', 'items[].shareCount', 'items[].status', 'items[].title', 'items[].updateId', 'items[].updatedAt', 'items[].urgency', 'items[].versionNumber', 'items[].visibility', 'items[].visibilityRuleId', 'ranking'],
    row: 'RMD-009',
    why: "The raw feed page is typed with the mapped post type and `fetchFeed` maps every row through `toFeedPost`; the 47 names are the mapped shape, not the wire's `FeedItemResponse`. Whether anything reads a row before it is mapped is not established.",
  },
  'FollowResponse <- FollowResponse': {
    fields: ['followedAt', 'isFollowing', 'muted', 'targetId'],
    row: 'RMD-009',
    why: NO_TYPED_READ,
  },
  'GuideRow <- GuideCardResponse': {
    fields: ['summary'],
    row: 'RMD-009',
    why: 'The creator workspace reads its rows tolerantly — `listingId ?? id`, `?? 0` — so nothing throws, but the fields named here are never sent and their figures always read as the fallback.',
  },
  'HashtagSuggestionResponse[] <- HashtagResponse[]': {
    fields: ['[].postCount', '[].tag'],
    row: 'RMD-009',
    why: NO_TYPED_READ,
  },
  'HousingRow <- HousingListingCardResponse': {
    fields: ['coverMediaId', 'listingId', 'location.neighbourhood', 'rent', 'saveCount', 'viewCount'],
    row: 'RMD-009',
    why: 'The creator workspace reads its rows tolerantly — `listingId ?? id`, `?? 0` — so nothing throws, but the fields named here are never sent and their figures always read as the fallback.',
  },
  'IntegrationConnection <- IntegrationConnectionResponse': {
    fields: ['gapId', 'lastError.retryAfterSeconds'],
    row: 'RMD-009',
    why: '`gapId` is read by `integrations/status`; `lastError.retryAfterSeconds` is never read. Neither is sent.',
  },
  'IntegrationConnection[] <- IntegrationConnectionResponse[]': {
    fields: ['[].gapId', '[].lastError.retryAfterSeconds'],
    row: 'RMD-009',
    why: '`gapId` is read by `integrations/status`; `lastError.retryAfterSeconds` is never read. Neither is sent.',
  },
  'JobOpportunity <- JobCardResponse': {
    fields: ['benefits', 'benefitsFlags', 'category', 'description', 'employer', 'employmentType', 'experienceRequired', 'expiresAt', 'languages', 'location', 'requirements', 'responsibilities', 'salary.amount', 'salary.currency', 'salary.frequency', 'salary.maxAmount', 'urgency', 'viewCount'],
    row: 'RMD-009',
    why: 'The jobs browse reads card rows as the full `JobOpportunity`; the card sends none of these 18. The map read them that way too until RMD-007 gave it the card; the readers left are not traced.',
  },
  'ListingWire <- ListingResponse': {
    fields: ['id', 'price.currencyCode', 'seller.id', 'seller.name'],
    row: 'RMD-009',
    why: '`id` is read only behind `listingId`. `price.currencyCode`, `seller.id` and `seller.name` are declared for older shapes and nothing reads them.',
  },
  'MarketplaceListingCardResponse <- ListingCardResponse': {
    fields: ['description'],
    row: 'RMD-009',
    why: 'Read as `description ?? summary`: the card never sends `description`, so the fallback always wins and the order says the opposite of what happens.',
  },
  'MediaAsset <- UploadSessionResponse': {
    fields: ['altText', 'caption', 'createdAt', 'mediaId', 'metadata', 'reference', 'requiresSignedAccess', 'scanStatus', 'thumbnailUrl', 'url', 'variants', 'visibility'],
    row: 'RMD-009',
    why: "`completeUpload` has no caller — the app uploads through `/media/uploads/direct` — and the route answers the upload session, not the asset. `MediaAsset` is read elsewhere as the direct upload's result, which is not this route's body.",
  },
  'MediaUploadSession <- UploadSessionResponse': {
    fields: ['mediaId', 'receivedBytes', 'state', 'totalBytes'],
    row: 'RMD-009',
    why: NO_CALLER_CHUNKED,
  },
  'MediaUploadSession[] <- UploadSessionResponse[]': {
    fields: ['[].mediaId', '[].receivedBytes', '[].state', '[].totalBytes'],
    row: 'RMD-009',
    why: NO_CALLER_CHUNKED,
  },
  'ModerationDecisionResponse[] <- Community.ModerationDecisionResponse[]': {
    fields: ['[].action', '[].decisionId', '[].reportId'],
    row: 'RMD-009',
    why: NO_TYPED_READ,
  },
  'ModerationQueueItemResponse[] <- Community.ModerationQueueItemResponse[]': {
    fields: ['[].firstReportedAt', '[].lastReportedAt', '[].reasons', '[].reporterName'],
    row: 'RMD-009',
    why: '`moderation/queue.tsx` reads `firstReportedAt`, `lastReportedAt` and `reasons`; the queue item sends none of them. Not traced to what the screen shows.',
  },
  'MyHousingListing <- HousingListingCardResponse': {
    fields: ['location.areaName', 'price.displayText'],
    row: 'RMD-009',
    why: NO_TYPED_READ,
  },
  'MyMarketplaceListing <- ListingCardResponse': {
    fields: ['location.areaName', 'price.displayText'],
    row: 'RMD-009',
    why: NO_TYPED_READ,
  },
  'MyRsvpPage <- RsvpPageResponse': {
    fields: ['events[].location.addressLine', 'events[].location.areaName', 'events[].location.distanceKm', 'events[].location.landmark'],
    row: 'RMD-009',
    why: "The RSVP page's event locations are read as the full location type; the summary sends none of these four. Read by the Community Life screens; not traced.",
  },
  'Partial<ConversationMediaGallery> <- ConversationMediaResponse': {
    fields: ['documents[].uploadProgress', 'images[].uploadProgress', 'voice[].uploadProgress', 'voice[].waveformData'],
    row: 'RMD-009',
    why: "`uploadProgress` is the device's own upload state, kept on the wire type. `waveformData` is never sent; `MessageBubble` falls back to random bars.",
  },
  'PlatformLocation <- LocationReferenceResponse': {
    fields: ['precision'],
    row: 'RMD-009',
    why: '`precision` is declared on the reverse-geocode result and not sent. The reads the index finds are of other `precision` fields; not traced further.',
  },
  'PollResponse <- Community.PollResponse': {
    fields: ['isClosed', 'selectedOptionIds'],
    row: 'RMD-009',
    why: '`PollBlock` reads `isClosed` and `selectedOptionIds`, which the route never sends — it sends `status` and `hasVoted`. Whether the vote response reaches `PollBlock` unmapped is not traced.',
  },
  'ProviderRow <- ProviderSummaryResponse': {
    fields: ['createdAt', 'description'],
    row: 'RMD-009',
    why: 'The creator workspace reads its rows tolerantly — `listingId ?? id`, `?? 0` — so nothing throws, but the fields named here are never sent and their figures always read as the fallback.',
  },
  'PublicCreator <- PublicCreatorResponse': {
    fields: ['badges[].progress', 'badges[].tier'],
    row: 'RMD-009',
    why: '`config/badges` reads `progress` and `tier` off a badge the route sends without them.',
  },
  'ReactionResponse <- ReactionResponse': {
    fields: ['myReactionKey', 'summary.counts', 'summary.myReactionKey'],
    row: 'RMD-009',
    why: "`reactions.counts` and `myReactionKey` are read through `readReactionSummary`, which accepts the server's shape too (`reaction-bar-server-shape.test.tsx`). The top-level `myReactionKey` has no typed read.",
  },
  'ShareResponse <- ShareResponse': {
    fields: ['message', 'recipientId'],
    row: 'RMD-009',
    why: NO_TYPED_READ,
  },
  'SponsoredContentItem[] <- SponsoredContentItemResponse[]': {
    fields: ['[].performance[].amount', '[].performance[].changePercentage'],
    row: 'RMD-009',
    why: 'The sponsored performance metrics declare `amount` and `changePercentage`; read by the creator primitives and the analytics adapters, not traced.',
  },
  'TrendingHashtagResponse[] <- HashtagResponse[]': {
    fields: ['[].countryCode', '[].postCount', '[].rank', '[].tag'],
    row: 'RMD-009',
    why: NO_TYPED_READ,
  },
  'WireDirectoryPage <- CreatorDirectoryResponse': {
    fields: ['creators[].badges[].progress', 'creators[].badges[].tier'],
    row: 'RMD-009',
    why: '`config/badges` reads `progress` and `tier` off a badge the route sends without them.',
  },
  'WireLesson <- CreatorLessonResponse': {
    fields: ['quiz.questions[].explanation'],
    row: 'RMD-009',
    why: 'The lesson quiz declares `explanation`, which the route does not send; read once, not traced.',
  },
  'WireLesson[] <- CreatorLessonResponse[]': {
    fields: ['[].quiz.questions[].explanation'],
    row: 'RMD-009',
    why: 'The lesson quiz declares `explanation`, which the route does not send; read once, not traced.',
  },
  'WireModerationDecision <- Trust.ModerationQueueItemResponse': {
    fields: ['actionId', 'actionType', 'moderatorId', 'newStatus', 'previousStatus', 'reason'],
    row: 'RMD-009',
    why: NO_TYPED_READ,
  },
  'WireReferralPage <- CreatorReferralPageResponse': {
    fields: ['referrals[].rewardAmount'],
    row: 'RMD-009',
    why: NO_TYPED_READ,
  },
};

function ledgerEntry(label: string, fields: readonly string[]): string {
  return (
    `  '${label}': {\n` +
    `    fields: [${fields.map((field) => `'${field}'`).join(', ')}],\n` +
    `    row: 'RMD-…',\n` +
    `    why: '…',\n` +
    '  },'
  );
}

describeAgainstContract('requests the client makes', () => {
  beforeAll(() => {
    readClient();
  }, 180_000);

  it('reach a route the backend publishes', () => {
    const client = readClient();
    const unexpected = Array.from(client.unreached.entries())
      .filter(([operation]) => !(operation in KNOWN_UNREACHED))
      .map(([operation, sites]) => `  ${operation}\n      from ${sites.join(', ')}`);

    expect(
      unexpected.length === 0
        ? ''
        : `${unexpected.length} request(s) reach no operation in contracts/Diaspora.Api.json.\n` +
            'Either the route was removed or renamed, or the client never had it right.\n\n' +
            unexpected.join('\n'),
    ).toBe('');
  });

  it('have not kept a KNOWN_UNREACHED line that is no longer true', () => {
    const client = readClient();
    const stale = Object.keys(KNOWN_UNREACHED).filter((operation) => !client.unreached.has(operation));
    expect(stale).toEqual([]);
  });
});

describeAgainstContract('response fields the client reads', () => {
  beforeAll(() => {
    readClient();
  }, 180_000);

  it('declare nothing the route does not send, beyond the known drift', () => {
    const client = readClient();
    const report: string[] = [];

    for (const [label, entry] of client.drift) {
      const known = new Set(KNOWN_RESPONSE_DRIFT[label]?.fields ?? []);
      const fresh = Array.from(entry.fields.entries()).filter(([field]) => !known.has(field));
      if (fresh.length === 0) continue;
      report.push(
        `${label}\n` +
          fresh.map(([field, problem]) => `    ${field} — ${problem}`).join('\n') +
          `\n    read by ${Array.from(entry.sites).sort().join('\n            ')}\n` +
          `  If this is known and owned, the ledger entry is:\n${ledgerEntry(label, Array.from(entry.fields.keys()).sort())}`,
      );
    }

    expect(
      report.length === 0
        ? ''
        : `${report.length} client type(s) declare fields their route does not send.\n` +
            'The type checker will let any screen read these, and every screen will get undefined.\n' +
            'Fix the type to the contract, or record it in KNOWN_RESPONSE_DRIFT with the row that owns it.\n\n' +
            report.join('\n\n'),
    ).toBe('');
  });

  it('has not kept a KNOWN_RESPONSE_DRIFT field that is no longer true', () => {
    const client = readClient();
    const stale: string[] = [];
    for (const [label, known] of Object.entries(KNOWN_RESPONSE_DRIFT)) {
      const current = client.drift.get(label)?.fields;
      const gone = known.fields.filter((field) => current === undefined || !current.has(field));
      if (gone.length > 0) stale.push(`${label}: ${gone.join(', ')}`);
    }
    expect(stale).toEqual([]);
  });

  it('owns every known drift with a row or a reason', () => {
    for (const [label, known] of Object.entries(KNOWN_RESPONSE_DRIFT)) {
      expect({ label, owned: known.row !== null || known.why.length > 40 }).toEqual({ label, owned: true });
      if (known.row !== null) expect({ label, row: known.row }).toEqual({ label, row: expect.stringMatching(/^RMD-\d{3}$/) });
    }
    for (const [operation, known] of Object.entries(KNOWN_UNREACHED)) {
      expect({ operation, row: known.row }).toEqual({ operation, row: expect.stringMatching(/^RMD-\d{3}$/) });
    }
  });
});
