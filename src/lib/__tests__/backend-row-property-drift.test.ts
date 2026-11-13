// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — backend row-property drift (Remediation Wave N)
//
// ── The defect this exists to end ────────────────────────────────────────────
//
// `lib/platform-envelope.ts`'s `toPage` identifies a page by
// `Array.isArray(payload.items)`. A backend response type that names its rows
// anything else falls into `toPage`'s fourth branch and comes back as
// `{ items: [], hasMore: false }` — **an empty list, with no error on the device
// and nothing in the logs.**
//
// That has now happened twice, in two unrelated modules, and both times it was
// found by somebody happening to read a C# response type:
//
//   `CommentThreadResponse`        names its rows `comments`
//                                  — every comment thread in the application
//                                    would have rendered "no comments yet".
//   `OfficialNoticeSearchResponse` names its rows `results`
//                                  — `GET /intelligence/search`.
//
// A third was subtler. `FeedResponse` *does* have `items`, so the rows arrived,
// but it spells its count `totalAvailable`, so the total silently came back
// null — which `Page` documents as "the server declined to count", and which a
// screen renders as no result count at all.
//
// Reading a response type is not a detection strategy. This file is one.
//
// ── Why a source sweep rather than only a runtime check ──────────────────────
//
// `platform-envelope.ts` also warns at runtime, in development, when it is handed
// an object with exactly one array property and no `items`. That warning fires
// at exactly the right moment — but only if something *exercises the route*, and
// only with a fixture shaped like the real response. Neither is guaranteed for a
// contract nobody has consumed yet, and a contract nobody has consumed yet is
// precisely where the next occurrence will be.
//
// This check needs no call site, no fixture and no screen. It reads the
// backend's own contract source and answers the question directly: *which
// response types name their rows something other than `items`, and has anybody
// decided what this client does about each one?*
//
// It also catches the `FeedResponse` class of defect, which the runtime warning
// structurally cannot — a payload with `items` never reaches the branch that
// warns.
//
// ── Why the ledger is written out rather than counted ────────────────────────
//
// Same reasoning as `backend-gap-register-drift.test.ts`: a threshold ("no more
// than twelve bespoke envelopes") lets one appear for every one that is adapted
// and reports the same green tick throughout. The ledger below is an equality,
// so it fails in **both** directions — a new bespoke envelope in the backend is
// not in the ledger and fails; a backend type renamed to `Items` is in the
// ledger and no longer found, and also fails until the line is deleted.
//
// ── What this does NOT catch ─────────────────────────────────────────────────
//
// Stated plainly, because a guard whose blind spots are unknown is worse than
// one whose blind spots are written down:
//
//   1. **Only `Contracts/V1/Responses/`.** Internal ports — `GuideSearchOutcome`,
//      `MarketplaceSearchOutcome`, `CommentThread`, `FeedPage`, the repository
//      page records — all name their rows `Hits`/`Roots`/`Items` inconsistently
//      and are deliberately out of scope: they are mapped to wire types before
//      they reach a client, and including them would bury the twelve that matter
//      in fifty that cannot. If one of them is ever returned directly, this file
//      will not notice.
//   2. **Only `record` declarations.** A response expressed as a `class`, or
//      built as an anonymous object in an endpoint, is invisible here.
//   3. **Only types with a pagination sibling.** A bare `{ results: [...] }` with
//      no cursor, total or `hasMore` is not reported, because the alternative is
//      reporting every detail DTO that happens to carry a list. The runtime
//      warning is the net for that case, and it is a weaker net.
//   4. **It does not check routes.** It never establishes which URL returns which
//      type, so it cannot tell you that a specific `readPage` call site is
//      pointed at a bespoke shape. What it guarantees is that the *contract* has
//      been triaged, not that every call is correct.
//   5. **It does not run without the backend.** See the skip below. A cross-repo
//      check that silently succeeds when it cannot see the other repo is worse
//      than no check.
//   6. **Nested arrays inside a mirrored type are not traced.** A client type that
//      mirrors an outer response correctly can still hand an inner object to
//      `readPage`.
// ─────────────────────────────────────────────────────────────────────────────

// Node's globals are declared locally rather than by adding `"node"` to the
// project's `types` — that change is global and surfaces pre-existing errors in
// other suites. Same technique as `backend-gap-register-drift.test.ts`, which is
// also where the `require` decision is explained: Jest's ambient typing already
// provides it and shadowing it breaks every other `require` in the file.
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
const CLIENT_ROOT = join(__dirname, '..', '..');

// ─────────────────────────────────────────────────────────────────────────────
// Reading the backend's response contracts
//
// A shallow, deliberately unclever parse of two C# record forms. It recognises
// what this codebase actually writes and refuses anything else, and every
// refusal lands in `unparseable` so the guard test can fail if that number ever
// grows. The alternative — guessing at a form it does not recognise — produces
// a confident wrong answer, which is the failure mode of the thing being
// guarded against.
// ─────────────────────────────────────────────────────────────────────────────

/** Collection types the backend uses for a row array. */
const COLLECTION_TYPE = /^(IReadOnlyList|IReadOnlyCollection|IList|List|IEnumerable|ICollection)\s*</;

/**
 * Property names that mean "this object is describing a page of something".
 *
 * Presence of one of these is what promotes "a DTO with a list on it" to "a page
 * whose rows are not called items". Without this filter the sweep reports every
 * detail response in the platform and nobody reads the output.
 */
const PAGINATION_SIBLINGS = new Set([
  'nextcursor',
  'hasmore',
  'hasnextpage',
  'haspreviouspage',
  'totalcount',
  'totalmatches',
  'totalavailable',
  'totalpages',
  'pagesize',
  'page',
  'totalhits',
]);

/** Count spellings that are **not** `CursorPagedResult`/`PagedResult`'s own. */
const NON_STANDARD_COUNTS = new Set(['totalmatches', 'totalavailable', 'totalhits', 'total']);

interface BackendResponseType {
  name: string;
  /** Repo-relative path, for the failure message. */
  file: string;
  /** Every array-valued property, in declaration order. */
  rowProperties: string[];
  /** The non-standard count spelling, when the type has `items` but not `totalCount`. */
  nonStandardCount: string | null;
}

interface BackendScan {
  /** No `items`, at least one array, at least one pagination sibling. */
  bespoke: BackendResponseType[];
  /** Has `items`, but spells its count something other than `totalCount`. */
  nonStandardCount: BackendResponseType[];
  filesScanned: number;
  /** Declarations whose body could not be located. Should stay empty. */
  unparseable: string[];
}

function stripComments(source: string): string {
  return source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Index of the delimiter that closes the one at `start`, or -1. */
function matchDelimiter(source: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === open) depth += 1;
    else if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * Splits a positional parameter list on commas that are not inside `<>`.
 *
 * `IReadOnlyList<KeyValuePair<string, int>> Rows` is one parameter with two
 * commas in it, and a naive `split(',')` turns it into three.
 */
function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const character of text) {
    if (character === '<' || character === '(' || character === '[') depth += 1;
    else if (character === '>' || character === ')' || character === ']') depth -= 1;

    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }

  if (current.trim() !== '') parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

interface Member {
  name: string;
  type: string;
}

function parsePositional(text: string): Member[] {
  return splitTopLevelCommas(text)
    .map((parameter) => {
      const tokens = parameter.split('=')[0].trim().split(/\s+/);
      return { name: tokens[tokens.length - 1], type: tokens.slice(0, -1).join(' ') };
    })
    .filter((member) => member.name !== '' && member.type !== '');
}

/** `public required IReadOnlyList<X> Rows { get; init; }` and its variants. */
const PROPERTY = /\bpublic\s+(?:required\s+)?([A-Za-z0-9_.]+(?:\s*<[^;{]*?>)?\??(?:\[\])?)\s+([A-Za-z0-9_]+)\s*\{\s*get\s*;/g;

function parsePropertyBody(text: string): Member[] {
  const members: Member[] = [];
  PROPERTY.lastIndex = 0;
  let match = PROPERTY.exec(text);
  while (match !== null) {
    members.push({ type: match[1].trim(), name: match[2] });
    match = PROPERTY.exec(text);
  }
  return members;
}

/**
 * `public sealed record Name(` or `public sealed record Name {`.
 *
 * Both forms are in use — Community writes property bodies, Creator writes
 * positional parameters — and a parse that handled only one of them would report
 * a clean sweep over half the platform.
 */
const RECORD_DECLARATION =
  /\b(?:public|internal)\s+(?:sealed\s+|abstract\s+|partial\s+)*record\s+(?:class\s+|struct\s+)?([A-Za-z0-9_]+)\s*(?:<[^>(){]*>)?\s*([({])/g;

function collectContractFiles(directory: string, found: string[]): void {
  let entries: DirectoryEntry[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) {
      // Build output. `obj/` in particular holds a generated OpenAPI snapshot
      // and copies of source that would be counted twice.
      if (entry.name === 'obj' || entry.name === 'bin') continue;
      collectContractFiles(child, found);
    } else if (entry.name.endsWith('.cs')) {
      found.push(child);
    }
  }
}

function scanBackend(sourceRoot: string): BackendScan {
  const allFiles: string[] = [];
  collectContractFiles(sourceRoot, allFiles);

  // Blind spot 1, made explicit in one line: wire contracts only.
  const files = allFiles.filter((file) =>
    file.replace(/\\/g, '/').includes('/Contracts/V1/Responses/')
  );

  const bespoke: BackendResponseType[] = [];
  const nonStandardCount: BackendResponseType[] = [];
  const unparseable: string[] = [];

  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    const repoRelative = relative(sourceRoot, file).replace(/\\/g, '/');

    RECORD_DECLARATION.lastIndex = 0;
    let declaration = RECORD_DECLARATION.exec(source);

    while (declaration !== null) {
      const typeName = declaration[1];
      const openIndex = RECORD_DECLARATION.lastIndex - 1;
      let members: Member[] = [];

      if (declaration[2] === '(') {
        const close = matchDelimiter(source, openIndex, '(', ')');
        if (close < 0) {
          unparseable.push(`${typeName} (${repoRelative})`);
          declaration = RECORD_DECLARATION.exec(source);
          continue;
        }
        members = parsePositional(source.slice(openIndex + 1, close));

        // A positional record may still carry a body with extra properties.
        const trailer = source.slice(close + 1, close + 200);
        const bodyOffset = trailer.indexOf('{');
        const terminator = trailer.indexOf(';');
        if (bodyOffset >= 0 && (terminator < 0 || bodyOffset < terminator)) {
          const bodyStart = close + 1 + bodyOffset;
          const bodyEnd = matchDelimiter(source, bodyStart, '{', '}');
          if (bodyEnd > 0) {
            members = members.concat(parsePropertyBody(source.slice(bodyStart, bodyEnd)));
          }
        }
      } else {
        const close = matchDelimiter(source, openIndex, '{', '}');
        if (close < 0) {
          unparseable.push(`${typeName} (${repoRelative})`);
          declaration = RECORD_DECLARATION.exec(source);
          continue;
        }
        members = parsePropertyBody(source.slice(openIndex, close));
      }

      declaration = RECORD_DECLARATION.exec(source);
      if (members.length === 0) continue;

      const lowerNames = members.map((member) => member.name.toLowerCase());
      const rowProperties = members
        .filter((member) => COLLECTION_TYPE.test(member.type) || /\[\]$/.test(member.type))
        .map((member) => member.name);

      if (rowProperties.length === 0) continue;

      if (lowerNames.includes('items')) {
        const spelling = lowerNames.find((name) => NON_STANDARD_COUNTS.has(name));
        if (spelling !== undefined) {
          nonStandardCount.push({
            name: typeName,
            file: repoRelative,
            rowProperties,
            nonStandardCount: spelling,
          });
        }
        continue;
      }

      if (lowerNames.some((name) => PAGINATION_SIBLINGS.has(name))) {
        bespoke.push({ name: typeName, file: repoRelative, rowProperties, nonStandardCount: null });
      }
    }
  }

  return { bespoke, nonStandardCount, filesScanned: files.length, unparseable };
}

// ─────────────────────────────────────────────────────────────────────────────
// The ledger
//
// One line per backend response type that does not follow `CursorPagedResult`.
// `rows` is the property the *backend* uses. `disposition` is what this client
// has decided to do about it, and it is the whole point of the file:
//
//   `adapter:<fn>` — a named function in `src/lib/` maps this shape to a `Page`.
//                    The function must exist; the test checks.
//   `raw`          — the client consumes the bespoke shape as itself and never
//                    hands it to `readPage`. Legitimate, and the reason must be
//                    stated on the line.
//   `unconsumed`   — no client type mirrors this contract. Nothing is wrong yet,
//                    and the test asserts it stays that way: the moment somebody
//                    mirrors it, this goes red and forces the decision *before*
//                    a screen is built on it.
//
// ── Blind spot 3: an envelope with rows and no pagination at all ─────────────
//
// The sweep only records a bespoke envelope when the record *also* carries a
// pagination sibling — a cursor, a `hasMore` or a total. That is what keeps it
// from reporting every response with a list on it, and it is the right default,
// but it means a whole class of envelope is invisible here.
//
// Remediation Wave C-03 walked into two of them. `CreatorPointRulesResponse`
// carries `Rules` plus a catalogue version and an expiry policy;
// `CreatorRewardCatalogueResponse` carries `Rewards` plus a version and the
// caller's balance. Neither has a cursor or a count, so neither appears in the
// scan and neither may be added to the ledger below — the equality assertion
// requires the ledger to be exactly what the scan found. Both had been declared
// in `config/creator-gaps.ts` as bare arrays, and a client reading `data` as an
// array would have got `undefined.map` on the Academy's earning screen.
//
// Recorded here rather than worked around, because the failure they produce is
// *louder* than the one this file is about — a thrown TypeError rather than a
// silent empty list — and widening the scan to catch them would pull in every
// response record with a collection on it, which is the noise the sibling
// requirement exists to remove. Whoever needs this caught mechanically should
// add a third bucket rather than loosen the second.
//
// **Why an adapter and not a wider `toPage`.** Adding `comments`, `results`,
// `entries`, `messages`, `creators`, `referrals` and `rows` to the platform-wide
// normaliser would fix all seven at once. It would also make `toPage` a function
// that silently accepts seven property names from a route that meant something
// else by them — a `ProcessingJobResponse` has `tasks`, an
// `AutomationCatalogResponse` has `triggers`, and the day one of those reaches a
// list screen the normaliser would hand back a plausible page of the wrong
// thing. Five local adapters are more code and less blast radius.
//
// (This read "Twelve" until Wave M-5. The ledger below is the count: five
// `adapter:*` dispositions, six `unconsumed`, three raw. A number in a comment
// that no assertion reads drifts the moment the thing it counts changes, and
// this one drifted downward -- it was describing the cost of an approach that
// turned out cheaper than argued for.)
// ─────────────────────────────────────────────────────────────────────────────

interface LedgerEntry {
  rows: string;
  disposition: string;
  why: string;
}

const BESPOKE_LEDGER: Record<string, LedgerEntry> = {
  // ── Adapted: the client mirrors these and maps them by hand ───────────────
  CommentThreadResponse: {
    rows: 'Comments',
    disposition: 'adapter:toCommentPage',
    why:
      'One of the two defects this file exists for. Every comment thread in the ' +
      'application rendered "no comments yet". `lib/community-social-api.ts`.',
  },
  OfficialNoticeSearchResponse: {
    rows: 'Results',
    disposition: 'adapter:toNoticeSearchPage',
    why:
      'The other. `GET /intelligence/search`. `lib/country-intelligence-api.ts`.',
  },

  // ── Raw: mirrored, but never handed to the normaliser ─────────────────────
  LedgerPageResponse: {
    rows: 'Entries',
    disposition: 'raw',
    why:
      'Mirrored as `LedgerPage` in `types/financial.ts` and returned unchanged by ' +
      '`fetchLedger`. It is the only cursor-paginated financial surface and its ' +
      '`nextCursor` is a **number** (`afterSequence`), not the string `Page` ' +
      'declares — so it could not become a `Page` without losing the cursor. ' +
      'Correct as it stands; recorded here so the next reader does not "fix" it.',
  },
  ReactionSummaryResponse: {
    rows: 'Reactions, ViewerReactions',
    disposition: 'raw',
    why:
      'Not a page. Two parallel arrays plus a `totalCount` of reactions, mirrored ' +
      'in `types/community-social.ts` and read as itself. It is in this ledger ' +
      'only because the sweep cannot tell a summary with a count from a page ' +
      'with one, and leaving it out would mean the sweep had to be tuned rather ' +
      'than the ledger read.',
  },

  // ── Unconsumed: no client type mirrors these ───────────────────────────────
  //
  // The two creator entries that used to live here — `CreatorDirectoryResponse`
  // and `CreatorReferralPageResponse` — moved up to the adapted section in
  // Remediation Wave C-03, which is the transition this disposition exists to
  // force: the ratchet fires the moment somebody mirrors the contract, and the
  // adapter gets written before a screen is built on it rather than after a
  // member reports an empty list.
  AnalyticsLeaderboardResponse: {
    rows: 'Rows',
    disposition: 'unconsumed',
    why:
      'Nested inside `AnalyticsDatasetResponse.leaderboards`, so it is reached ' +
      'through the dataset rather than from a route of its own. No client mirror.',
  },
  ConversationDetailResponse: {
    rows: 'Messages',
    disposition: 'unconsumed',
    why:
      'GET /conversations/{id}. No client mirror — the conversations surface has ' +
      'no consumer of this contract yet. Whoever writes one needs an adapter.',
  },
  CreatorDirectoryResponse: {
    rows: 'Creators',
    disposition: 'adapter:toCreatorDirectoryPage',
    why:
      'GET /creators — the creator directory search. Consumed as of Remediation ' +
      'Wave C-03: this line used to read "no client mirror; the creator surfaces ' +
      'in this app run against the gap adapter, not this route", and they no ' +
      'longer do. `lib/creator/certified-client.ts`.',
  },
  CreatorFacetsResponse: {
    rows: 'Countries, Categories, Expertise, Languages',
    disposition: 'unconsumed',
    why:
      'Four parallel facet arrays and a `totalCount`; not a page at all. Nested ' +
      'in `CreatorDirectoryResponse.facets`. No client mirror.',
  },
  CreatorReferralPageResponse: {
    rows: 'Referrals',
    disposition: 'adapter:toReferralHistoryPage',
    why:
      'GET /referrals/me/history. Consumed as of Remediation Wave C-03, where ' +
      'the referral surface stopped reading the creator gap adapter. Worse than ' +
      'most if it had been missed: an empty referral history reads as "nobody ' +
      'used my code", which a member would believe. `lib/creator/certified-client.ts`.',
  },
  KnowledgeSearchResponse: {
    rows: 'Results',
    disposition: 'unconsumed',
    why:
      'GET /knowledge/search — the same hand-rolled shape as ' +
      '`OfficialNoticeSearchResponse`, from the same module, and the one most ' +
      'likely to become the third occurrence. No client mirror yet.',
  },
  LessonQuizResultResponse: {
    rows: 'Outcomes',
    disposition: 'unconsumed',
    why: 'Academy quiz outcomes with a `totalCount` of questions. Not a page. No client mirror.',
  },
  NotificationDigestResponse: {
    rows: 'Entries',
    disposition: 'unconsumed',
    why:
      'POST /notifications/digests. No client mirror — B13 wires the inbox and ' +
      'preferences, and the digest surface has never had a consumer.',
  },
};

/**
 * Types that **do** have `items` but spell the count something else.
 *
 * A separate ledger because the failure is different in kind: the rows arrive,
 * so nothing looks broken, and only the total is silently lost. `readPage` is
 * safe to use on all of these as long as the count is taken from the right
 * field — which is what these adapters do.
 */
const COUNT_LEDGER: Record<string, LedgerEntry> = {
  FeedResponse: {
    rows: 'Items',
    disposition: 'adapter:toFeedPage',
    why:
      'Spells its count `totalAvailable`. `readPage` returns the rows and a null ' +
      'total, which `Page` documents as "the server declined to count" — almost ' +
      'right, and quiet about the part that is not.',
  },
  ListingSearchResultResponse: {
    rows: 'Items',
    disposition: 'raw:toPage',
    why:
      'Spells its count `totalMatches`, which `toPage` reads directly — the one ' +
      'alias the platform-wide normaliser carries, added in Wave D-2 after it was ' +
      'declared in `CursorShape` and then never consulted, so every marketplace ' +
      'search reported no total. Pinned by `platform-envelope.test.ts`.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Reading the client side
// ─────────────────────────────────────────────────────────────────────────────

function collectTypeScript(directory: string, found: string[]): void {
  let entries: DirectoryEntry[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) collectTypeScript(child, found);
    else if (entry.name.endsWith('.ts')) found.push(child);
  }
}

function readAll(directory: string): string {
  const files: string[] = [];
  collectTypeScript(directory, files);
  return files.map((file) => readFileSync(file, 'utf8')).join('\n');
}

let cachedTypes: string | null = null;
let cachedLib: string | null = null;

/**
 * Every declaration in `src/types/`.
 *
 * A *declaration*, not a mention: `types/jobs-hiring.ts` names
 * `CommentThreadResponse` in a comment explaining that its own page shape is the
 * well-behaved kind, and a substring search would read that as a second mirror.
 */
function clientDeclaresType(name: string): boolean {
  if (cachedTypes === null) cachedTypes = readAll(join(CLIENT_ROOT, 'types'));
  return new RegExp(`\\b(?:interface|type)\\s+${name}\\b`).test(cachedTypes);
}

/** Whether `src/lib/` exports a function of this name. */
function clientExportsFunction(name: string): boolean {
  if (cachedLib === null) cachedLib = readAll(join(CLIENT_ROOT, 'lib'));
  return new RegExp(`export\\s+function\\s+${name}\\b`).test(cachedLib);
}

// ─────────────────────────────────────────────────────────────────────────────
// The check
// ─────────────────────────────────────────────────────────────────────────────

const describeAgainstBackend = BACKEND_SOURCE_ROOT === null ? describe.skip : describe;

/**
 * Scanned once, and only when there is something to scan.
 *
 * `describe.skip` skips the *tests*, not the callback — Jest still runs the body
 * to collect them — so scanning at describe scope would call `readdirSync(null)`
 * on a machine without the backend and turn the intended skip into "Test suite
 * failed to run". The empty scan below is never compared against anything.
 */
let cachedScan: BackendScan | null = null;
function backendScan(): BackendScan {
  if (BACKEND_SOURCE_ROOT === null) {
    return { bespoke: [], nonStandardCount: [], filesScanned: 0, unparseable: [] };
  }
  if (cachedScan === null) cachedScan = scanBackend(BACKEND_SOURCE_ROOT);
  return cachedScan;
}

describe('the backend checkout this sweep reads', () => {
  it('is present, or this file has told you why it is not', () => {
    if (BACKEND_SOURCE_ROOT === null) {
      // Not an assertion. A cross-repo check that cannot see the other repo has
      // not passed and has not failed — it has not run, and the log is the only
      // place that can say so.
      const configured = process.env.DIASPORA_BACKEND_PATH;
      console.warn(
        [
          'SKIPPED: backend row-property drift was not checked — no diaspora-backend checkout.',
          configured !== undefined && configured !== ''
            ? `DIASPORA_BACKEND_PATH is set to "${configured}", and there is no src/ under it.`
            : 'DIASPORA_BACKEND_PATH is unset and the sibling ../diaspora-backend has no src/.',
          'A response type whose rows are not named `items` renders as an empty list',
          'with no error, and this run did not look for one.',
        ].join(' ')
      );
    }
    expect(BACKEND_SOURCE_ROOT === null || BACKEND_SOURCE_ROOT.length > 0).toBe(true);
  });
});

describeAgainstBackend('parsing the backend response contracts', () => {
  const scan = backendScan();

  it('reads enough of them to be worth trusting', () => {
    // A floor, not an equality. What this catches is the parse quietly breaking
    // — a move of the contracts directory, or a switch to a declaration form
    // this file does not recognise — at which point every ledger assertion below
    // "passes" because the scan found nothing.
    expect(scan.filesScanned).toBeGreaterThanOrEqual(300);
  });

  it('locates the body of every record it recognises', () => {
    // Each entry is a declaration whose parameter list or body could not be
    // found, which means a real contract is missing from the sweep. Empty today;
    // if it stops being empty, extend the parse rather than raising a number.
    expect(scan.unparseable).toEqual([]);
  });

  it('finds the two defects that were found by hand, which is how we know it works', () => {
    // The parser's own regression test. Both of these were discovered by a person
    // reading C# — if a future edit to the parse stops finding them, the parse is
    // broken regardless of what the ledger comparison says.
    const found = scan.bespoke.map((type) => type.name);
    expect(found).toContain('CommentThreadResponse');
    expect(found).toContain('OfficialNoticeSearchResponse');
    expect(scan.nonStandardCount.map((type) => type.name)).toContain('FeedResponse');
  });
});

describeAgainstBackend('response types whose rows are not named `items`', () => {
  const scan = backendScan();

  it('are exactly the ones this client has triaged', () => {
    // Both directions. A new bespoke envelope in the backend is not in the ledger
    // and fails here with its file and row property, which is enough to write the
    // adapter without repeating this investigation. A backend type renamed to
    // `Items` is in the ledger and no longer found, and also fails, until the
    // line is deleted.
    const found = scan.bespoke
      .map((type) => `${type.name} [${type.rowProperties.join(', ')}] ${type.file}`)
      .sort();

    const expected = scan.bespoke
      .filter((type) => BESPOKE_LEDGER[type.name] !== undefined)
      .map((type) => `${type.name} [${type.rowProperties.join(', ')}] ${type.file}`)
      .sort();

    expect(found).toEqual(expected);
    expect(Object.keys(BESPOKE_LEDGER).sort()).toEqual(
      scan.bespoke.map((type) => type.name).sort()
    );
  });

  it('agree with the ledger about which property holds the rows', () => {
    // The row property is the one fact an adapter is written against. A backend
    // rename from `results` to `matches` would otherwise pass every check above
    // while the adapter kept reading a field that no longer arrives.
    for (const type of scan.bespoke) {
      const entry = BESPOKE_LEDGER[type.name];
      if (entry === undefined) continue;
      expect(`${type.name}: ${type.rowProperties.join(', ')}`).toBe(
        `${type.name}: ${entry.rows}`
      );
    }
  });

  it('name an adapter that exists, wherever the ledger claims one', () => {
    for (const [typeName, entry] of Object.entries(BESPOKE_LEDGER)) {
      if (!entry.disposition.startsWith('adapter:')) continue;
      const adapter = entry.disposition.slice('adapter:'.length);
      expect(`${typeName} → ${adapter} exported: ${clientExportsFunction(adapter)}`).toBe(
        `${typeName} → ${adapter} exported: true`
      );
    }
  });

  it('are still unconsumed wherever the ledger says so', () => {
    // **The ratchet that actually prevents the next occurrence.** Mirroring a
    // bespoke contract into `src/types/` is the moment before a screen is built
    // on it, and it is the last moment at which the decision is cheap. If this
    // fails, do not delete the line — change `unconsumed` to `adapter:<fn>` and
    // write the adapter, or to `raw` with the reason it is never paged.
    for (const [typeName, entry] of Object.entries(BESPOKE_LEDGER)) {
      if (entry.disposition !== 'unconsumed') continue;
      expect(`${typeName} mirrored in src/types: ${clientDeclaresType(typeName)}`).toBe(
        `${typeName} mirrored in src/types: false`
      );
    }
  });
});

describeAgainstBackend('response types with `items` but a non-standard count', () => {
  const scan = backendScan();

  it('are exactly the ones this client has triaged', () => {
    // The `FeedResponse` class of defect: rows arrive, so nothing looks broken,
    // and only the total is lost. The runtime warning in `platform-envelope.ts`
    // structurally cannot see this — a payload with `items` never reaches the
    // branch that warns — so this ledger is the only thing watching for it.
    const found = scan.nonStandardCount
      .map((type) => `${type.name} counts by ${type.nonStandardCount} · ${type.file}`)
      .sort();

    const expected = scan.nonStandardCount
      .filter((type) => COUNT_LEDGER[type.name] !== undefined)
      .map((type) => `${type.name} counts by ${type.nonStandardCount} · ${type.file}`)
      .sort();

    expect(found).toEqual(expected);
    expect(Object.keys(COUNT_LEDGER).sort()).toEqual(
      scan.nonStandardCount.map((type) => type.name).sort()
    );
  });

  it('name an adapter that exists, wherever the ledger claims one', () => {
    for (const [typeName, entry] of Object.entries(COUNT_LEDGER)) {
      if (!entry.disposition.startsWith('adapter:')) continue;
      const adapter = entry.disposition.slice('adapter:'.length);
      expect(`${typeName} → ${adapter} exported: ${clientExportsFunction(adapter)}`).toBe(
        `${typeName} → ${adapter} exported: true`
      );
    }
  });
});

describe('every ledger line says what to do about the type', () => {
  // Runs with or without the backend, because it is a statement about this
  // repository. A ledger entry with no disposition is a line somebody added to
  // make a red test green without deciding anything, which is the one outcome
  // that would make this whole file worse than nothing.
  const VALID = /^(adapter:[A-Za-z0-9_]+|raw(?::[A-Za-z0-9_]+)?|unconsumed)$/;

  it('uses a recognised disposition and states a reason', () => {
    for (const [typeName, entry] of [
      ...Object.entries(BESPOKE_LEDGER),
      ...Object.entries(COUNT_LEDGER),
    ]) {
      expect(`${typeName}: ${VALID.test(entry.disposition)}`).toBe(`${typeName}: true`);
      expect(entry.why.length).toBeGreaterThan(40);
      expect(entry.rows.length).toBeGreaterThan(0);
    }
  });
});
