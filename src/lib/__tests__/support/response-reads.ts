// ─────────────────────────────────────────────────────────────────────────────
// What the client reads a response body as, and how that compares with what
// the published contract says the route sends (RMD-005)
//
// This is the instrument `backend-response-field-drift.test.ts` runs. It lives
// here, apart from the suite's assertions and its ledger, so its own tests can
// drive it with a five-line program and a three-schema contract. That is how
// the suite proves it can fail.
//
// ── Why the type checker, and not a pattern ──────────────────────────────────
//
// Every other cross-repository suite in this directory reads source with
// regular expressions, and each of them documents what that costs. This one
// cannot: the question is not "which names appear in this file" but "what type
// does this request's body end up as", and the answer is routinely in another
// file, behind `Partial<>`, an `extends`, or a generic helper whose type
// argument is only known at the line that calls it. Those are things a compiler
// already knows, so this asks one.
//
// It costs about six seconds and half a gigabyte to build the program once.
//
// ── What a request is read as ────────────────────────────────────────────────
//
// Every request goes through `apiClient` or `authTransport`. At each such call
// the body is read in one of these ways, tried in this order:
//
//   1. **Through a reader.** `readPage<T>(response.data)`, `toList<T>(…)`,
//      `unwrapEnvelope<T>(…)`, or a module's own `unwrap<T>(…)`. The reader is
//      what touches the body, so its type argument is what the client reads,
//      whatever the transport call was typed as. `readList` in
//      community-life-api types its call `CommunityEnvelope<T[]>` and then,
//      correctly, reads a page: the reader is the truth there, not the
//      annotation.
//   2. **Through the transport's type argument.** `apiClient.get<Envelope<T>>`
//      and then `response.data.data`: the client reads `T`.
//   3. **Through a cast.** `(response.data?.data ?? {}) as Partial<T>`.
//   4. **Not at all.** `await apiClient.post(path, body)` reads nothing, and
//      there is nothing to compare.
//
// Anything else is *opaque*: the body is read, but as nothing this can name.
// The suite counts those and keeps the count from rising.
//
// A request made inside a helper — `read<T>(path)` wrapping `apiClient.get` —
// has no route or type until the helper is called, so it is bound at every call
// site: the path from the argument, the type from the checker's resolution of
// that call's type arguments, which includes inferred ones.
//
// ── What a comparison reports ────────────────────────────────────────────────
//
// For each property of the type the client reads, the schema must declare a
// property of the same name, recursively through objects and lists. A client
// type may declare *fewer* fields than the route sends — reading less is fine.
// What it may not do is declare a field the route never sends, because the type
// checker then lets every screen read it, and every screen gets `undefined`.
//
// A list read where the route sends an object, or the reverse, is reported at
// the level it happens: that is the `.flatMap is not a function` class, which a
// field comparison would otherwise walk straight past.
// ─────────────────────────────────────────────────────────────────────────────

import * as ts from 'typescript';
import {
  isHttpMethod,
  operationKey,
  resolveSchema,
  schemaKind,
  schemaLabel,
  schemaProperties,
  type HttpMethod,
  type PublishedContract,
  type Schema,
} from './published-contract';

/** The two axios instances. `backend-openapi-contract-drift` proves there are no others. */
export const TRANSPORT_INSTANCES: readonly string[] = ['apiClient', 'authTransport'];

/**
 * Functions that take a response body and return what is inside it.
 *
 * `data` — the envelope's `data`, as the reader's type argument.
 * `row`  — one row of the list `data` carries, a bare array or a page's `items`.
 *
 * Recognised by name. Four modules declare their own `unwrap<T>`, and every one
 * of them returns `payload.data`.
 */
export const BODY_READERS: Readonly<Record<string, 'data' | 'row'>> = {
  unwrapEnvelope: 'data',
  unwrap: 'data',
  readPage: 'row',
  toList: 'row',
};

/** `apiClient`'s base URL ends `/v1`; the server prepends `/api` before routing. */
const SERVER_PREFIX = '/api/v1';

export type Read =
  | {
      readonly kind: 'data' | 'row';
      readonly type: ts.Type;
      /** The client reads a list of `type` rather than `type` itself. */
      readonly list: boolean;
    }
  | { readonly kind: 'nothing' }
  | { readonly kind: 'opaque'; readonly reason: string };

export interface RequestRead {
  readonly method: HttpMethod;
  /** The path as the client writes it, values collapsed: `/community-life/events/{}`. */
  readonly clientPath: string;
  /** The contract's key for this request: method and normalised server path. */
  readonly operation: string;
  /**
   * The keys this request reaches if a segment typed as a union of literals is
   * a route name rather than a value. `${kind}` with `kind: 'click' | 'dismiss'`
   * is two routes; `${contentType}` with `'post' | 'comment'` is one route with a
   * parameter. Which it is depends on the contract, so both readings are kept.
   */
  readonly alternatives: readonly string[];
  /** `file:line` of the request — or, through a helper, of the line calling it. */
  readonly site: string;
  readonly read: Read;
}

export interface ResponseSweep {
  readonly transportCalls: number;
  readonly requests: readonly RequestRead[];
  /** Sites whose path could not be resolved to a route. */
  readonly unresolved: readonly string[];
}

type PathPart =
  | { readonly text: string }
  | { readonly value: true }
  | { readonly choices: readonly string[] }
  | { readonly parameter: number };

/** Literal-union segments multiply; past this many readings, only the parameter reading is kept. */
const MAX_ALTERNATIVES = 32;

interface GenericRead {
  /** Position of the helper's type parameter. */
  readonly index: number;
  /** The helper reads a list of its type parameter. */
  readonly list: boolean;
}

interface Template {
  readonly fn: ts.SignatureDeclaration | null;
  readonly method: HttpMethod;
  readonly path: readonly PathPart[];
  readonly read: Read;
  readonly generic: GenericRead | null;
  readonly site: string;
}

interface Context {
  readonly checker: ts.TypeChecker;
  readonly relative: (fileName: string) => string;
}

/** A helper wrapping a helper wrapping the transport is the deepest the client goes. */
const MAX_HELPER_DEPTH = 4;

function forwardSlashes(path: string): string {
  return path.split('\\').join('/');
}

export function relativeTo(root: string): (fileName: string) => string {
  const prefix = forwardSlashes(root).replace(/\/+$/, '') + '/';
  return (fileName) => {
    const normalised = forwardSlashes(fileName);
    return normalised.startsWith(prefix) ? normalised.slice(prefix.length) : normalised;
  };
}

function siteOf(context: Context, node: ts.Node): string {
  const file = node.getSourceFile();
  const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
  return `${context.relative(file.fileName)}:${line + 1}`;
}

function visit(node: ts.Node, each: (node: ts.Node) => void): void {
  each(node);
  ts.forEachChild(node, (child) => visit(child, each));
}

/** A function's body, where it has one; the declaration itself otherwise. */
function bodyOf(fn: ts.SignatureDeclaration): ts.Node {
  if (
    ts.isFunctionDeclaration(fn) ||
    ts.isFunctionExpression(fn) ||
    ts.isArrowFunction(fn) ||
    ts.isMethodDeclaration(fn) ||
    ts.isConstructorDeclaration(fn) ||
    ts.isGetAccessorDeclaration(fn) ||
    ts.isSetAccessorDeclaration(fn)
  ) {
    return fn.body ?? fn;
  }
  return fn;
}

function enclosingFunction(node: ts.Node): ts.SignatureDeclaration | null {
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined && !ts.isFunctionLike(current)) current = current.parent;
  return current ?? null;
}

function symbolOf(checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined {
  const target = ts.isPropertyAccessExpression(node) ? node.name : node;
  const symbol = checker.getSymbolAtLocation(target);
  if (symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    return checker.getAliasedSymbol(symbol);
  }
  return symbol;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isText(part: PathPart): part is { readonly text: string } {
  return 'text' in part;
}

function hasParameter(path: readonly PathPart[]): boolean {
  return path.some((part) => 'parameter' in part);
}

function renderPath(path: readonly PathPart[]): string {
  return path.map((part) => (isText(part) ? part.text : '{}')).join('');
}

/** Every reading of a path whose literal-union segments are route names. */
function expandChoices(path: readonly PathPart[]): string[] {
  let readings = [''];
  for (const part of path) {
    if ('choices' in part) {
      readings = readings.flatMap((prefix) => part.choices.map((choice) => prefix + choice));
      if (readings.length > MAX_ALTERNATIVES) return [];
    } else {
      readings = readings.map((prefix) => prefix + (isText(part) ? part.text : '{}'));
    }
  }
  return readings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The route a path expression names, or `null` when it cannot be known.
 *
 * Literals and templates resolve; a constant resolves through its declaration,
 * across files; a parameter of the enclosing function becomes a slot to bind at
 * that function's call sites.
 */
function evaluatePath(
  context: Context,
  expression: ts.Expression,
  fn: ts.SignatureDeclaration | null,
  depth: number,
): PathPart[] | null {
  if (depth > 12) return null;
  const node = unwrapExpression(expression);

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [{ text: node.text }];
  }

  if (ts.isTemplateExpression(node)) {
    const parts: PathPart[] = [{ text: node.head.text }];
    let before = node.head.text;
    let inQuery = before.includes('?');
    for (const span of node.templateSpans) {
      const after = span.literal.text;
      const inner = inQuery ? [] : substitution(context, span.expression, fn, depth, before, after);
      if (inner === null) return null;
      parts.push(...inner, { text: after });
      before = after;
      inQuery = inQuery || after.includes('?');
    }
    return parts;
  }

  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = evaluatePath(context, node.left, fn, depth + 1);
    const right = left === null ? null : evaluatePath(context, node.right, fn, depth + 1);
    return left !== null && right !== null ? [...left, ...right] : null;
  }

  const type = context.checker.getTypeAtLocation(node);
  if (type.isStringLiteral()) return [{ text: type.value }];

  if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
    const declaration = symbolOf(context.checker, node)?.valueDeclaration;
    if (declaration !== undefined && ts.isParameter(declaration) && fn !== null && declaration.parent === fn) {
      return [{ parameter: fn.parameters.indexOf(declaration) }];
    }
    if (
      declaration !== undefined &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) !== 0
    ) {
      return evaluatePath(context, declaration.initializer, enclosingFunction(declaration), depth + 1);
    }
  }

  return null;
}

/**
 * One `${…}` inside a path template.
 *
 * A constant splices its text in. Anything else that fills a whole segment —
 * `/events/${eventId}` — is a value, and a value is what a route parameter is.
 * Anything else that does *not* fill a whole segment must resolve, or the path
 * is unknowable: `${ROOT}${path}` is a root and a helper's parameter, and is
 * bound later; `/events${suffix}` is not a route anybody can name.
 */
function substitution(
  context: Context,
  expression: ts.Expression,
  fn: ts.SignatureDeclaration | null,
  depth: number,
  before: string,
  after: string,
): PathPart[] | null {
  const resolved = evaluatePath(context, expression, fn, depth + 1);
  if (resolved !== null && resolved.every(isText)) return resolved;

  const wholeSegment =
    before.endsWith('/') && (after === '' || after.startsWith('/') || after.startsWith('?'));
  if (wholeSegment) {
    const type = context.checker.getTypeAtLocation(unwrapExpression(expression));
    if (type.isUnion() && type.types.every((member) => member.isStringLiteral())) {
      return [{ choices: type.types.map((member) => member.value) }];
    }
    return [{ value: true }];
  }

  return resolved;
}

// ─────────────────────────────────────────────────────────────────────────────
// What the body is read as
// ─────────────────────────────────────────────────────────────────────────────

const NOT_A_TYPE = ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never;

function declaredRead(context: Context, call: ts.CallExpression): Read {
  const argument = call.typeArguments?.[0];
  if (argument === undefined) return { kind: 'opaque', reason: 'an untyped call' };

  const body = context.checker.getTypeFromTypeNode(argument);
  if ((body.flags & NOT_A_TYPE) !== 0) return { kind: 'opaque', reason: 'a call typed as unknown' };

  const data = context.checker.getPropertyOfType(body, 'data');
  if (data === undefined) return { kind: 'opaque', reason: 'a call typed without an envelope' };

  return { kind: 'data', type: context.checker.getTypeOfSymbolAtLocation(data, call), list: false };
}

/**
 * How the variable a request's result is held in has its body read.
 *
 *   `authority` — through a recognised reader or a cast: this *is* the read.
 *   `direct`    — `response.data.data`: the call's type argument decides.
 *   `other`     — handed to something else, or read in a way this cannot name.
 *   `unused`    — never read through `.data` at all.
 *
 * `null` when the result is not held in a variable at all.
 */
type Consumption =
  | { readonly authority: Read }
  | { readonly direct: true }
  | { readonly other: Read }
  | { readonly unused: true }
  | null;
function consumption(context: Context, call: ts.CallExpression, fn: ts.SignatureDeclaration | null): Consumption {
  let holder: ts.Node = call.parent;
  while (ts.isAwaitExpression(holder) || ts.isParenthesizedExpression(holder)) holder = holder.parent;
  if (!ts.isVariableDeclaration(holder) || !ts.isIdentifier(holder.name) || fn === null) return null;

  const name = holder.name.text;
  const scope = bodyOf(fn);
  let found: Consumption = null;

  visit(scope, (node) => {
    if (found !== null) return;
    if (!ts.isPropertyAccessExpression(node) || node.name.text !== 'data') return;
    if (!ts.isIdentifier(node.expression) || node.expression.text !== name) return;

    let use: ts.Node = node.parent;
    while (ts.isParenthesizedExpression(use) || ts.isNonNullExpression(use)) use = use.parent;

    if (ts.isCallExpression(use)) {
      const callee = unwrapExpression(use.expression);
      const reader = ts.isIdentifier(callee) ? BODY_READERS[callee.text] : undefined;
      if (reader === undefined) {
        const named = ts.isIdentifier(callee) ? callee.text : 'an expression';
        found = { other: { kind: 'opaque', reason: `the body handed to ${named}` } };
        return;
      }
      const signature = context.checker.getResolvedSignature(use);
      const type =
        signature === undefined ? undefined : context.checker.getTypeArgumentsForResolvedSignature(signature)?.[0];
      found =
        type === undefined || (type.flags & NOT_A_TYPE) !== 0
          ? { other: { kind: 'opaque', reason: 'a reader with no type' } }
          : { authority: { kind: reader, type, list: false } };
      return;
    }

    if (ts.isAsExpression(use)) {
      const cast = context.checker.getTypeFromTypeNode(use.type);
      const data = context.checker.getPropertyOfType(cast, 'data');
      found =
        data === undefined
          ? { other: { kind: 'opaque', reason: 'the envelope cast to a type without data' } }
          : { authority: { kind: 'data', type: context.checker.getTypeOfSymbolAtLocation(data, use), list: false } };
      return;
    }

    if (ts.isPropertyAccessExpression(use) && use.name.text === 'data') {
      let outer: ts.Node = use.parent;
      while (ts.isParenthesizedExpression(outer) || ts.isBinaryExpression(outer) || ts.isNonNullExpression(outer)) {
        outer = outer.parent;
      }
      found = ts.isAsExpression(outer)
        ? { authority: { kind: 'data', type: context.checker.getTypeFromTypeNode(outer.type), list: false } }
        : { direct: true };
      return;
    }

    found = { other: { kind: 'opaque', reason: 'the envelope read without a type' } };
  });

  return found ?? { unused: true };
}

function readAt(context: Context, call: ts.CallExpression, fn: ts.SignatureDeclaration | null): Read {
  const consumed = consumption(context, call, fn);
  if (consumed !== null && 'authority' in consumed) return consumed.authority;
  if (consumed !== null && 'unused' in consumed) return { kind: 'nothing' };

  const typed = call.typeArguments !== undefined && call.typeArguments.length > 0;
  if (typed) return declaredRead(context, call);
  if (consumed !== null && 'other' in consumed) return consumed.other;
  if (consumed !== null) return { kind: 'opaque', reason: 'the body read without a type' };

  let holder: ts.Node = call.parent;
  while (ts.isAwaitExpression(holder) || ts.isParenthesizedExpression(holder)) holder = holder.parent;
  if (ts.isExpressionStatement(holder)) return { kind: 'nothing' };
  return { kind: 'opaque', reason: 'an untyped result passed on' };
}

function typeParameterIndex(type: ts.Type, fn: ts.SignatureDeclaration): number {
  if ((type.flags & ts.TypeFlags.TypeParameter) === 0) return -1;
  const declaration = type.getSymbol()?.declarations?.[0];
  if (declaration === undefined || !ts.isTypeParameterDeclaration(declaration)) return -1;
  return fn.typeParameters?.indexOf(declaration) ?? -1;
}

/** Whether a read is of the enclosing helper's own type parameter, bare or as a list. */
function genericIn(checker: ts.TypeChecker, read: Read, fn: ts.SignatureDeclaration | null): GenericRead | null {
  if (fn === null || (read.kind !== 'data' && read.kind !== 'row')) return null;

  const direct = typeParameterIndex(read.type, fn);
  if (direct >= 0) return { index: direct, list: read.list };

  if (checker.isArrayType(read.type)) {
    const element = checker.getTypeArguments(read.type as ts.TypeReference)[0];
    const nested = element === undefined ? -1 : typeParameterIndex(element, fn);
    if (nested >= 0) return { index: nested, list: true };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The sweep
// ─────────────────────────────────────────────────────────────────────────────

function transportMethod(node: ts.Node): HttpMethod | null {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
  const target = node.expression.expression;
  if (!ts.isIdentifier(target) || !TRANSPORT_INSTANCES.includes(target.text)) return null;
  const method = node.expression.name.text;
  return isHttpMethod(method) ? method : null;
}

function indexCallSites(
  checker: ts.TypeChecker,
  files: readonly ts.SourceFile[],
): Map<ts.Node, ts.CallExpression[]> {
  const index = new Map<ts.Node, ts.CallExpression[]>();
  for (const file of files) {
    visit(file, (node) => {
      if (!ts.isCallExpression(node)) return;
      const declaration = symbolOf(checker, unwrapExpression(node.expression))?.valueDeclaration;
      if (declaration === undefined) return;

      let target: ts.Node | undefined;
      if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) {
        target = declaration;
      } else if (
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer !== undefined &&
        (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
      ) {
        target = declaration.initializer;
      }
      if (target === undefined) return;

      const calls = index.get(target) ?? [];
      calls.push(node);
      index.set(target, calls);
    });
  }
  return index;
}

function concrete(template: Template): RequestRead {
  const clientPath = renderPath(template.path);
  const chosen = template.path.some((part) => 'choices' in part) ? expandChoices(template.path) : [];
  return {
    method: template.method,
    clientPath,
    operation: operationKey(template.method, `${SERVER_PREFIX}${clientPath}`),
    alternatives: chosen.map((reading) => operationKey(template.method, `${SERVER_PREFIX}${reading}`)),
    site: template.site,
    read: template.read,
  };
}

/**
 * The published operation a request reaches, or `null`.
 *
 * The parameter reading first; then the literal readings, which must all be
 * published for the request to count as reaching them — a union where one
 * member names a route the server does not map is a request that can 404.
 */
export function reachedOperation(
  operations: ReadonlyMap<string, unknown>,
  request: RequestRead,
): string | null {
  if (operations.has(request.operation)) return request.operation;
  if (request.alternatives.length === 0) return null;
  return request.alternatives.every((key) => operations.has(key)) ? request.alternatives[0] : null;
}

function bind(
  context: Context,
  template: Template,
  callSites: Map<ts.Node, ts.CallExpression[]>,
  requests: RequestRead[],
  unresolved: string[],
  depth: number,
): void {
  if (template.fn === null) return;

  for (const call of callSites.get(template.fn) ?? []) {
    // A helper that sends more than one verb is told which by a literal.
    const verb = call.arguments.map(unwrapExpression).find(
      (argument): argument is ts.StringLiteral => ts.isStringLiteral(argument) && isHttpMethod(argument.text),
    );
    if (verb !== undefined && verb.text !== template.method) continue;

    const caller = enclosingFunction(call);
    const site = siteOf(context, call);

    const path: PathPart[] = [];
    let resolved = true;
    for (const part of template.path) {
      if (!('parameter' in part)) {
        path.push(part);
        continue;
      }
      const argument = call.arguments[part.parameter];
      const bound = argument === undefined ? null : evaluatePath(context, argument, caller, 0);
      if (bound === null) {
        resolved = false;
        break;
      }
      path.push(...bound);
    }
    if (!resolved) {
      unresolved.push(site);
      continue;
    }

    let read = template.read;
    if (template.generic !== null && (read.kind === 'data' || read.kind === 'row')) {
      const signature = context.checker.getResolvedSignature(call);
      const bound =
        signature === undefined
          ? undefined
          : context.checker.getTypeArgumentsForResolvedSignature(signature)?.[template.generic.index];
      read =
        bound === undefined || (bound.flags & NOT_A_TYPE) !== 0
          ? { kind: 'opaque', reason: 'a helper whose type argument resolves to nothing' }
          : { kind: read.kind, type: bound, list: template.generic.list };
    }

    const next: Template = {
      fn: caller,
      method: template.method,
      path,
      read,
      generic: genericIn(context.checker, read, caller),
      site,
    };

    if (!hasParameter(path) && next.generic === null) {
      requests.push(concrete(next));
    } else if (depth < MAX_HELPER_DEPTH) {
      bind(context, next, callSites, requests, unresolved, depth + 1);
    }
  }
}

/**
 * Every request the swept files make, with the route it reaches and what its
 * body is read as.
 */
export function sweepResponseReads(
  program: ts.Program,
  include: (file: ts.SourceFile) => boolean,
  root: string,
): ResponseSweep {
  const context: Context = { checker: program.getTypeChecker(), relative: relativeTo(root) };
  const files = program.getSourceFiles().filter((file) => !file.isDeclarationFile && include(file));

  const requests: RequestRead[] = [];
  const unresolved: string[] = [];
  const templates: Template[] = [];
  let transportCalls = 0;

  for (const file of files) {
    visit(file, (node) => {
      const method = transportMethod(node);
      if (method === null || !ts.isCallExpression(node)) return;
      transportCalls += 1;

      const fn = enclosingFunction(node);
      const site = siteOf(context, node);
      const first = node.arguments[0];
      const path = first === undefined ? null : evaluatePath(context, first, fn, 0);
      if (path === null) {
        unresolved.push(site);
        return;
      }

      const read = readAt(context, node, fn);
      const template: Template = { fn, method, path, read, generic: genericIn(context.checker, read, fn), site };
      if (hasParameter(path) || template.generic !== null) templates.push(template);
      else requests.push(concrete(template));
    });
  }

  const callSites = indexCallSites(context.checker, files);
  for (const template of templates) bind(context, template, callSites, requests, unresolved, 0);

  return { transportCalls, requests, unresolved };
}

// ─────────────────────────────────────────────────────────────────────────────
// The comparison
// ─────────────────────────────────────────────────────────────────────────────

export interface Drift {
  /** `items[].location.areaName`; `(body)` for the read as a whole. */
  readonly field: string;
  readonly problem: string;
}

export interface Comparison {
  /** `ClientType <- ContractSchema`: what was compared with what. */
  readonly label: string;
  readonly drift: readonly Drift[];
  /** Client properties found on the schema. A comparison of nothing is not agreement. */
  readonly matched: number;
}

const VALUE_FLAGS =
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.EnumLike |
  ts.TypeFlags.ESSymbolLike;

function isValueType(type: ts.Type): boolean {
  if (type.isUnion()) return type.types.every(isValueType);
  return (type.flags & VALUE_FLAGS) !== 0;
}

function describeSchema(contract: PublishedContract, schema: Schema): string {
  const kind = schemaKind(contract, schema);
  if (kind === 'list') return 'a list';
  if (kind === 'object') return 'an object';
  return `a ${String(schema.type)}`;
}

/** A client type as a reader would name it. Anonymous types are named by file. */
export function typeLabel(checker: ts.TypeChecker, type: ts.Type, relative: (fileName: string) => string): string {
  const t = checker.getNonNullableType(type);
  if (checker.isArrayType(t)) {
    const element = checker.getTypeArguments(t as ts.TypeReference)[0];
    return `${element === undefined ? 'unknown' : typeLabel(checker, element, relative)}[]`;
  }

  const name = t.aliasSymbol?.name ?? t.getSymbol()?.name;
  if (name !== undefined && !name.startsWith('__')) {
    return checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation);
  }

  const declaration = t.getSymbol()?.declarations?.[0];
  return declaration === undefined
    ? checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation)
    : `an inline type in ${relative(declaration.getSourceFile().fileName)}`;
}

interface Walk {
  readonly checker: ts.TypeChecker;
  readonly contract: PublishedContract;
  readonly drift: Drift[];
  readonly seen: Set<string>;
  readonly schemaIds: Map<Schema, number>;
  matched: number;
}

function schemaId(walk: Walk, schema: Schema): number {
  const known = walk.schemaIds.get(schema);
  if (known !== undefined) return known;
  walk.schemaIds.set(schema, walk.schemaIds.size);
  return walk.schemaIds.size - 1;
}

function typeId(type: ts.Type): string {
  // `id` is not in the public typings but is on every type the checker makes,
  // and it is the only identity that survives two lookups of one type.
  const id = (type as unknown as { id?: number }).id;
  return id === undefined ? String(type.flags) : String(id);
}

function compareType(walk: Walk, clientType: ts.Type, schema: Schema | undefined, field: string, depth: number): void {
  if (depth > 16) return;
  const resolved = resolveSchema(walk.contract, schema);
  if (resolved === null) return;

  const type = walk.checker.getNonNullableType(clientType);
  if ((type.flags & NOT_A_TYPE) !== 0) return;

  // A recursive type — a comment's replies are comments — is compared once,
  // where it is first reached.
  const key = `${typeId(type)}|${schemaId(walk, resolved)}`;
  if (walk.seen.has(key)) return;
  walk.seen.add(key);

  const kind = schemaKind(walk.contract, resolved);
  const here = field === '' ? '(body)' : field;

  if (walk.checker.isArrayType(type)) {
    if (kind === 'list') {
      const element = walk.checker.getTypeArguments(type as ts.TypeReference)[0];
      if (element !== undefined) compareType(walk, element, resolved.items, `${field}[]`, depth + 1);
    } else if (kind !== 'unknown') {
      walk.drift.push({ field: here, problem: `read as a list; the contract sends ${describeSchema(walk.contract, resolved)}` });
    }
    return;
  }

  if (isValueType(type)) {
    if (kind === 'object' || kind === 'list') {
      walk.drift.push({
        field: here,
        problem: `read as ${walk.checker.typeToString(type)}; the contract sends ${describeSchema(walk.contract, resolved)}`,
      });
    }
    return;
  }

  // Read only after narrowing, which this cannot follow: under-report.
  if (type.isUnion()) return;

  const properties = walk.checker
    .getPropertiesOfType(type)
    .filter((property) => walk.checker.getTypeOfSymbol(property).getCallSignatures().length === 0);
  if (properties.length === 0) return;

  if (kind === 'list' || kind === 'value') {
    walk.drift.push({ field: here, problem: `read as an object; the contract sends ${describeSchema(walk.contract, resolved)}` });
    return;
  }

  const sent = schemaProperties(walk.contract, resolved);
  if (sent === null) return;

  for (const property of properties) {
    const name = property.getName();
    const path = field === '' ? name : `${field}.${name}`;
    const target = sent[name];
    if (target === undefined) {
      walk.drift.push({ field: path, problem: 'not sent' });
      continue;
    }
    walk.matched += 1;
    compareType(walk, walk.checker.getTypeOfSymbol(property), target, path, depth + 1);
  }
}

/**
 * The schema a read is compared with: the body's `data`, or — for a row read —
 * one row of the list it carries.
 */
function comparedSchema(
  contract: PublishedContract,
  read: { readonly kind: 'data' | 'row' },
  data: Schema,
): Schema | 'not a list' {
  if (read.kind === 'data') return data;
  const resolved = resolveSchema(contract, data);
  if (resolved === null) return 'not a list';
  if (schemaKind(contract, resolved) === 'list' && resolved.items !== undefined) return resolved.items;
  const items = schemaProperties(contract, resolved)?.items;
  const list = items === undefined ? null : resolveSchema(contract, items);
  return list?.items ?? 'not a list';
}

/**
 * Compares one read with the body its route documents.
 *
 * `alsoAccepts` names client types that are deliberately written to read more
 * than one shape — the events adapter reads a detail and a summary through one
 * type — keyed by the type's label, with the other components whose properties
 * also count as sent. It applies to the type read, not to types nested in it.
 */
export function compareRead(
  checker: ts.TypeChecker,
  contract: PublishedContract,
  read: { readonly kind: 'data' | 'row'; readonly type: ts.Type; readonly list: boolean },
  data: Schema,
  relative: (fileName: string) => string,
  alsoAccepts: ReadonlyMap<string, readonly string[]> = new Map(),
): Comparison {
  const rootLabel = typeLabel(checker, read.type, relative);
  const clientLabel = `${rootLabel}${read.list ? '[]' : ''}`;
  const documented = comparedSchema(contract, read, data);

  if (documented === 'not a list') {
    return {
      label: `${clientLabel} <- ${schemaLabel(contract, data)}`,
      drift: [{ field: '(rows)', problem: 'read as rows; the contract sends neither a list nor items' }],
      matched: 0,
    };
  }

  const others = alsoAccepts.get(rootLabel) ?? [];
  const schema: Schema =
    others.length === 0
      ? documented
      : { allOf: [documented, ...others.map((name) => ({ $ref: `#/components/schemas/${name}` }))] };

  const walk: Walk = { checker, contract, drift: [], seen: new Set(), schemaIds: new Map(), matched: 0 };
  const label = `${clientLabel} <- ${schemaLabel(contract, documented)}`;

  if (read.list) {
    const resolved = resolveSchema(contract, schema);
    if (resolved === null) return { label, drift: [], matched: 0 };
    if (schemaKind(contract, resolved) !== 'list') {
      return {
        label,
        drift: [{ field: '(body)', problem: `read as a list; the contract sends ${describeSchema(contract, resolved)}` }],
        matched: 0,
      };
    }
    compareType(walk, read.type, resolved.items, '[]', 0);
  } else {
    compareType(walk, read.type, schema, '', 0);
  }

  return { label, drift: walk.drift, matched: walk.matched };
}
