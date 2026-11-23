// ─────────────────────────────────────────────────────────────────────────────
// The published contract, read as a description of response bodies (RMD-005)
//
// `contracts/Diaspora.Api.json` names a schema for 1,076 of its 1,093 2xx
// responses (RMD-003), and since RMD-006 each schema name stands for exactly one
// backend type. Before RMD-006 a name could stand for two or three, and a
// comparison against the document would have reported a correct client as
// wrong: the document said `POST /trust/verifications` took one field when the
// route binds nine.
//
// This module is the one place in this directory that walks those schemas. Two
// suites use it: `backend-response-field-drift` compares every request the
// client makes, and `screen-response-field-drift` compares four registered
// screens.
//
// Only what the backend's generator actually emits is understood: `$ref`, a
// `oneOf`/`anyOf` whose only other arm is `{ "type": "null" }`, a `type` array
// that includes `"null"`, and `allOf`. A schema this cannot read has no
// properties, which can only make a comparison quieter, never louder.
// ─────────────────────────────────────────────────────────────────────────────

const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export const HTTP_METHODS: readonly HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

export function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value);
}

/** The subset of a JSON Schema this module reads. */
export interface Schema {
  readonly $ref?: string;
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly items?: Schema;
  readonly oneOf?: readonly Schema[];
  readonly anyOf?: readonly Schema[];
  readonly allOf?: readonly Schema[];
  readonly additionalProperties?: Schema | boolean;
}

interface PublishedMediaType {
  readonly schema?: Schema;
}

interface PublishedOperation {
  readonly responses?: Readonly<
    Record<string, { readonly content?: Readonly<Record<string, PublishedMediaType>> }>
  >;
}

interface PublishedDocument {
  readonly paths?: Readonly<Record<string, Readonly<Record<string, PublishedOperation>>>>;
  readonly components?: { readonly schemas?: Readonly<Record<string, Schema>> };
}

/** The success body an operation documents. */
export interface SuccessBody {
  readonly status: string;
  /**
   * The platform envelope's `data`, or `null` when the body is not the
   * envelope (a webhook acknowledgement, a byte stream) or names no schema.
   */
  readonly data: Schema | null;
}

export interface PublishedContract {
  readonly schemas: Readonly<Record<string, Schema>>;
  /**
   * `${method} ${normalised path}` → the first documented 2xx body, or `null`
   * for an operation whose success response names no schema.
   */
  readonly operations: ReadonlyMap<string, SuccessBody | null>;
}

/**
 * Route parameters, casing, a query string and a trailing slash are noise.
 *
 * The same normalisation as `backend-openapi-contract-drift.test.ts`, which is
 * what decides that the client's `/events/${id}` is the contract's
 * `/events/{eventId}`. Kept identical on purpose: a route one suite matches and
 * the other does not would be a disagreement between two checks of one fact.
 */
export function normaliseRoutePath(path: string): string {
  const withoutQuery = path.split('?')[0];
  const collapsed = withoutQuery
    .replace(/\{[^}]*\}/g, '{}')
    .replace(/\/{2,}/g, '/')
    .toLowerCase();
  return collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
}

export function operationKey(method: HttpMethod, path: string): string {
  return `${method} ${normaliseRoutePath(path)}`;
}

function successBody(document: PublishedDocument, operation: PublishedOperation): SuccessBody | null {
  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    if (!status.startsWith('2')) continue;
    const schema = response.content?.['application/json']?.schema;
    if (schema === undefined) return { status, data: null };

    const envelope = resolveIn(document.components?.schemas ?? {}, schema);
    const data = envelope === null ? undefined : propertiesIn(document.components?.schemas ?? {}, envelope)?.data;
    return { status, data: data ?? null };
  }
  return null;
}

export function readPublishedContract(file: string): PublishedContract {
  const document = JSON.parse(readFileSync(file, 'utf8')) as PublishedDocument;
  const operations = new Map<string, SuccessBody | null>();

  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(item)) {
      if (!isHttpMethod(method)) continue;
      operations.set(operationKey(method, path), successBody(document, operation));
    }
  }

  return { schemas: document.components?.schemas ?? {}, operations };
}

/** The component a `$ref` names. */
export function referencedName(schema: Schema | undefined): string | null {
  if (schema?.$ref === undefined) return null;
  return schema.$ref.slice(schema.$ref.lastIndexOf('/') + 1);
}

function resolveIn(schemas: Readonly<Record<string, Schema>>, schema: Schema | undefined): Schema | null {
  let current: Schema | undefined = schema;

  // The generator never nests more than a few of these; the bound only stops a
  // self-referencing document from hanging the suite.
  for (let step = 0; current !== undefined && step < 32; step += 1) {
    const name = referencedName(current);
    if (name !== null) {
      current = schemas[name];
      continue;
    }

    const arms = current.oneOf ?? current.anyOf;
    if (arms !== undefined) {
      const real = arms.filter((arm) => arm.type !== 'null');
      if (real.length !== 1) return current;
      current = real[0];
      continue;
    }

    if (Array.isArray(current.type)) {
      const real = (current.type as readonly string[]).filter((type) => type !== 'null');
      return real.length === 1 ? { ...current, type: real[0] } : current;
    }

    return current;
  }

  return current ?? null;
}

function propertiesIn(
  schemas: Readonly<Record<string, Schema>>,
  schema: Schema,
): Readonly<Record<string, Schema>> | null {
  if (schema.allOf !== undefined) {
    const merged: Record<string, Schema> = {};
    for (const part of schema.allOf) {
      const resolved = resolveIn(schemas, part);
      if (resolved !== null) Object.assign(merged, propertiesIn(schemas, resolved) ?? {});
    }
    return merged;
  }
  return schema.properties ?? null;
}

/** Follows `$ref`s and drops a nullable arm. `null` for a reference to nothing. */
export function resolveSchema(contract: PublishedContract, schema: Schema | undefined): Schema | null {
  return resolveIn(contract.schemas, schema);
}

/**
 * The properties an object schema declares, merged across `allOf`.
 *
 * `null` for a schema with no named properties — a list, a primitive, or a
 * dictionary (`additionalProperties` only), none of which has names to compare.
 */
export function schemaProperties(
  contract: PublishedContract,
  schema: Schema,
): Readonly<Record<string, Schema>> | null {
  return propertiesIn(contract.schemas, schema);
}

export type SchemaKind = 'object' | 'list' | 'value' | 'unknown';

/** What a (resolved) schema sends, at the granularity a field comparison needs. */
export function schemaKind(contract: PublishedContract, schema: Schema): SchemaKind {
  const type = typeof schema.type === 'string' ? schema.type : undefined;
  if (type === 'array') return 'list';
  if (type === 'object' || schemaProperties(contract, schema) !== null) return 'object';
  if (type !== undefined) return 'value';
  return 'unknown';
}

/**
 * A schema's name as a reader would recognise it: the component it references,
 * `Name[]` for a list of one, or a description of an inline shape.
 */
export function schemaLabel(contract: PublishedContract, schema: Schema | undefined): string {
  if (schema === undefined) return 'nothing';
  const named = referencedName(schema);
  if (named !== null) return named;

  const arms = schema.oneOf ?? schema.anyOf;
  if (arms !== undefined) {
    const real = arms.filter((arm) => arm.type !== 'null');
    if (real.length === 1) return schemaLabel(contract, real[0]);
  }

  const resolved = resolveSchema(contract, schema);
  if (resolved === null) return 'nothing';
  const kind = schemaKind(contract, resolved);
  if (kind === 'list') return `${schemaLabel(contract, resolved.items)}[]`;
  if (kind === 'value') return String(resolved.type);
  return kind === 'object' ? 'an inline object' : 'an untyped value';
}

/** A named component, resolved. Throws for a name the document does not carry. */
export function schemaNamed(contract: PublishedContract, name: string): Schema {
  const schema = contract.schemas[name];
  if (schema === undefined) {
    throw new Error(`The published contract has no component named "${name}".`);
  }
  return resolveSchema(contract, schema) ?? schema;
}
