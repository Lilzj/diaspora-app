// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Response envelope and pagination (Remediation Wave B)
//
// One place that knows where the platform puts a list and where it puts the
// count. Every API module used to guess, and they guessed differently.
//
// ── What the backend actually returns ────────────────────────────────────────
//
//   ApiResponse<T>   = { data: T, meta: { requestId, correlationId, timestamp } }
//                      — `Diaspora.Platform/Http/PlatformHttp.cs:33`
//
// `meta` carries **only** those three diagnostic fields. It has never carried a
// count. Where a route is paged, the page lands *inside* `data`:
//
//   CursorPagedResult<T> = { items, nextCursor, hasMore, totalCount? }
//   PagedResult<T>       = { items, page, pageSize, totalCount, totalPages,
//                            hasNextPage, hasPreviousPage }
//                      — `Diaspora.SharedKernel/Pagination/`
//
// ── What the client believed ─────────────────────────────────────────────────
//
// Three incompatible things, in three different files:
//
//   `analytics-api.ts:107`      probed `meta.totalCount`, then
//                               `pagination.totalCount`, then envelope
//                               `totalCount` — none of which exist. Every
//                               inventory metric on every analytics screen
//                               therefore resolved to null while rendering as
//                               a certified figure.
//   `community-life-api.ts:114` read envelope-level `totalCount`.
//   Most screens                assumed `response.data.data` was a bare array
//                               and called `.filter` / `.slice` on it directly.
//
// The last one is the dangerous assumption, because against a paged route
// `data` is an object and `.filter` is not a function — a crash rather than a
// wrong number.
//
// ── Why this is tolerant rather than strict ──────────────────────────────────
//
// It accepts a bare array, a cursor page, an offset page, or a single object,
// and reports which it found. That is not defensive programming for its own
// sake: this platform genuinely returns all four shapes from different routes,
// and a client that had to know which in advance is a client that breaks when a
// handler is changed from a list to a page. The shape is a *runtime* fact here,
// checked once, instead of an assumption spread across forty call sites.
// ─────────────────────────────────────────────────────────────────────────────

/** The platform-wide success envelope. */
export interface PlatformEnvelope<T> {
  data: T;
  meta?: {
    requestId?: string;
    correlationId?: string;
    timestamp?: string;
  };
}

/**
 * What `toPage` recognised the payload as.
 *
 * ── Why a `Page` now says where it came from ─────────────────────────────────
 *
 * Until Wave N a `Page` could not tell a caller the difference between
 *
 *     "the route answered, and there are no rows"          — legitimately empty
 *     "the route answered something I did not understand"  — a defect
 *
 * because both produced `{ items: [], hasMore: false }`. That ambiguity is not
 * theoretical: it silently emptied **two** modules. `CommentThreadResponse`
 * names its rows `comments` and `OfficialNoticeSearchResponse` names them
 * `results`; both fell into `toPage`'s fourth branch, and every comment thread
 * and every notice search in the application rendered its empty state with no
 * error on the device and nothing in the logs. Both were found by somebody
 * happening to read a response type, which is not a detection strategy.
 *
 * `shape` is the smallest change that makes the two distinguishable. It costs a
 * field, it breaks nothing, and it is what the dev-mode warning below and any
 * future screen-level "we could not read this" state are built on.
 *
 *   · `array`         — a bare `T[]`; an unpaged list route.
 *   · `cursor`        — `CursorPagedResult<T>` (or a hand-rolled equivalent).
 *   · `offset`        — `PagedResult<T>`; recognised by a numeric `page`/`pageSize`.
 *   · `adapted`       — built by a named adapter in an API module, not by
 *                       `toPage`. The route's rows live under a bespoke name and
 *                       somebody wrote the mapping deliberately. **This is the
 *                       value that says "a human has looked at this."**
 *   · `unrecognised`  — `toPage` did not find a list. The rows may be under a
 *                       name it does not know, or the payload may not be a list
 *                       at all. Empty items here are a fact about the *parse*,
 *                       not about the data.
 */
export type PageShape = 'array' | 'cursor' | 'offset' | 'adapted' | 'unrecognised';

/** A page of results, normalised across the platform's two pagination shapes. */
export interface Page<T> {
  items: T[];
  /** Cursor routes only. Null when there is no further page. */
  nextCursor: string | null;
  hasMore: boolean;
  /**
   * The total the **server declared**, or null.
   *
   * Nullable for two distinct reasons, and both matter:
   *
   *   * `CursorPagedResult.TotalCount` is `int?` on the server — counting is
   *     expensive and some routes decline — so absence is not zero. A client
   *     that treated it as zero would render "0 results" over a full list.
   *   * **A bare array declares no total.** Its length is the number of items
   *     that came back, which is the page size and not the population. The
   *     inventory counter asks for `limit: 1` precisely because it wants a count
   *     rather than rows; reading `length` there would report "1 job" on a
   *     platform with two thousand.
   *
   * So `items.length` is never promoted to a total here. A caller that wants
   * "how many did I receive" reads `items.length` itself, where the meaning is
   * unambiguous.
   */
  totalCount: number | null;
  /** Offset routes only. */
  page: number | null;
  pageSize: number | null;
  /**
   * Which of the recognised shapes produced this page. See `PageShape`.
   *
   * **Required, not optional, and that is the point.** Every hand-written
   * adapter is now forced to say `shape: 'adapted'` in order to compile, which
   * is a one-word declaration that a person read the response type and mapped it
   * on purpose. An optional field would have let the next adapter omit it and
   * been indistinguishable from the defect it exists to expose.
   */
  shape: PageShape;
}

interface CursorShape {
  items?: unknown;
  nextCursor?: unknown;
  hasMore?: unknown;
  totalCount?: unknown;
  /**
   * Marketplace search spells the same fact differently.
   *
   * `ListingSearchResultResponse` is a hand-rolled cursor page rather than a
   * `CursorPagedResult<T>`, and it names its total `totalMatches`. Providers'
   * `ProviderPageResponse` — also hand-rolled — names it `totalCount`. Four
   * spellings of "how many are there" now exist across the platform, which is
   * precisely the reason this normaliser is one function rather than a
   * convention each client is trusted to follow.
   */
  totalMatches?: unknown;
}

interface OffsetShape extends CursorShape {
  page?: unknown;
  pageSize?: unknown;
  totalPages?: unknown;
  hasNextPage?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Detecting a bespoke list envelope (Remediation Wave N)
//
// The second half of the guard. `shape` lets a caller *ask*; this makes the
// answer arrive unasked, at the moment the mistake happens, in development and
// in every test that exercises the route with a realistic fixture.
//
// ── The signature it looks for ───────────────────────────────────────────────
//
// A bespoke list envelope is an object with **exactly one array-valued
// property** and no `items`:
//
//     { comments: [...], nextCursor, hasMore, totalCount }   CommentThreadResponse
//     { results: [...],  totalCount, ... }                   OfficialNoticeSearchResponse
//
// The count of one is doing the work, and it is what separates this from a false
// alarm. `toPage`'s fourth branch exists for a *dashboard* returned where a list
// was expected — `GET /api/v1/marketplace` answers
// `{ categories, featured, recent, nearby }` — and a dashboard has several
// arrays, not one. So the heuristic is quiet on exactly the payload the fourth
// branch was written for, and loud on exactly the payload that broke two
// modules. That is not a coincidence; it is why this particular signature was
// chosen over "has any array property".
//
// ── Why a warning and not a throw ────────────────────────────────────────────
//
// The fourth branch is deliberate load-bearing tolerance: a screen handed the
// wrong shape renders an empty state instead of crashing, and the fix is to
// point the call at the right route rather than to catch an exception. Throwing
// here would delete that property to gain a signal, and the signal is available
// without paying for it.
//
// ── Why it is deduplicated ───────────────────────────────────────────────────
//
// An infinite list calls this once per page and a `FlatList` re-render can call
// it again. Twelve hundred identical lines is noise, and noise is how a real
// warning gets scrolled past — the failure mode this whole file is fighting.
// One line per distinct property signature, per process.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The single array-valued property of a record, or null.
 *
 * Null when there are none (not a list envelope) or several (a dashboard).
 */
function soleArrayProperty(payload: Record<string, unknown>): string | null {
  let found: string | null = null;

  for (const key of Object.keys(payload)) {
    if (!Array.isArray(payload[key])) continue;
    // A second array means this is a composite — a dashboard, a search result
    // with facets — and not a page wearing an unfamiliar name.
    if (found !== null) return null;
    found = key;
  }

  return found;
}

/** Property names that mean "this object is describing a page of something". */
const PAGINATION_SIBLINGS = new Set([
  'nextcursor',
  'cursor',
  'hasmore',
  'hasnextpage',
  'haspreviouspage',
  'totalcount',
  'totalmatches',
  'totalavailable',
  'totalpages',
  'pagesize',
]);

/** One line per distinct signature, per process. See the header. */
const reportedSignatures = new Set<string>();

/**
 * Warns, in development only, that a payload looks like a page whose rows are
 * under a name `toPage` does not know.
 *
 * Silent in a release build. Silent on a dashboard. Silent the second time it
 * sees the same shape.
 */
function warnOnBespokeEnvelope(payload: Record<string, unknown>): void {
  if (typeof __DEV__ === 'undefined' || __DEV__ !== true) return;

  const rowProperty = soleArrayProperty(payload);
  if (rowProperty === null) return;

  const keys = Object.keys(payload);
  const signature = keys.slice().sort().join(',');
  if (reportedSignatures.has(signature)) return;
  reportedSignatures.add(signature);

  // Stated separately because it is the difference between "almost certainly the
  // bug" and "possibly a detail object somebody passed to the wrong function".
  const paginated = keys.some((key) => PAGINATION_SIBLINGS.has(key.toLowerCase()));

  // eslint-disable-next-line no-console
  console.warn(
    `[platform-envelope] readPage/toPage found no "items" and returned an EMPTY page, ` +
      `but this payload has exactly one array property: "${rowProperty}"` +
      (paginated ? ', alongside pagination fields' : '') +
      `. Full shape: { ${keys.join(', ')} }. ` +
      'If those are the rows, this list is silently empty on every screen that reads it. ' +
      'Write a named adapter in the owning API module that returns a Page with ' +
      "shape: 'adapted' — as toCommentPage, toFeedPage and toNoticeSearchPage do — " +
      'and add the backend response type to the ledger in ' +
      'src/lib/__tests__/backend-row-property-drift.test.ts. ' +
      'Do NOT widen toPage: every alias added here is a shape it will thereafter ' +
      'silently accept from a route that meant something else.'
  );
}

/**
 * Resets the deduplication set.
 *
 * Exported for tests, which need each case to warn rather than to be suppressed
 * by a sibling case that happened to run first.
 */
export function resetBespokeEnvelopeWarnings(): void {
  reportedSignatures.clear();
}

/**
 * Extracts the payload from the platform envelope.
 *
 * Tolerates a response that is already unwrapped, because axios-mock-adapter
 * handlers and a couple of older client modules hand back the payload directly.
 */
export function unwrapEnvelope<T>(body: unknown): T | undefined {
  if (isRecord(body) && 'data' in body) {
    return (body as unknown as PlatformEnvelope<T>).data;
  }
  return body as T | undefined;
}

/**
 * Normalises whatever a list route returned into a `Page<T>`.
 *
 * The four accepted shapes, in the order they are recognised:
 *
 *   1. `T[]`                       — an unpaged list route
 *   2. `{ items, nextCursor, … }`  — `CursorPagedResult<T>`
 *   3. `{ items, page, pageSize }` — `PagedResult<T>`
 *   4. anything else               — an empty page, rather than a throw
 *
 * Case 4 matters more than it looks. A route that returns a *dashboard* where
 * the caller expected a list — `GET /api/v1/marketplace` is exactly that — used
 * to reach `.filter` on an object and crash the screen. An empty page renders
 * the empty state, which is wrong but survivable, and the call site is fixed by
 * pointing it at the right route rather than by catching an exception.
 */
export function toPage<T>(payload: unknown): Page<T> {
  if (Array.isArray(payload)) {
    return {
      items: payload as T[],
      nextCursor: null,
      hasMore: false,
      // Not `payload.length`. See the doc on `Page.totalCount`.
      totalCount: null,
      page: null,
      pageSize: null,
      shape: 'array',
    };
  }

  if (isRecord(payload) && Array.isArray((payload as CursorShape).items)) {
    const shape = payload as OffsetShape;
    const items = shape.items as T[];

    // `totalMatches` is read here, and until Wave D-2 it was not.
    //
    // The field was declared on `CursorShape` with a paragraph explaining that
    // marketplace search spells the total differently — and then never consulted,
    // so **every marketplace search reported no total at all.** A screen renders
    // that as no result count, which is indistinguishable from a route that
    // genuinely declines to count, and is exactly the failure this normaliser was
    // written to end.
    //
    // Worth stating plainly because the defect was in the fix: Wave B's own
    // record lists `totalMatches` among the four shapes this function handles. The
    // documentation was right about the platform and wrong about the code, and a
    // reader checking the comment rather than the branch would have agreed with it.
    //
    // `totalCount` is preferred when both are present. Nothing serves both today;
    // if something ever does, the `CursorPagedResult` spelling is the platform's
    // own and the hand-rolled one is the exception.
    const totalCount =
      typeof shape.totalCount === 'number'
        ? shape.totalCount
        : typeof shape.totalMatches === 'number'
          ? shape.totalMatches
          : null;
    const page = typeof shape.page === 'number' ? shape.page : null;
    const pageSize = typeof shape.pageSize === 'number' ? shape.pageSize : null;

    const hasMore =
      typeof shape.hasMore === 'boolean'
        ? shape.hasMore
        : typeof shape.hasNextPage === 'boolean'
          ? shape.hasNextPage
          : false;

    return {
      items,
      nextCursor: typeof shape.nextCursor === 'string' ? shape.nextCursor : null,
      hasMore,
      totalCount,
      page,
      pageSize,
      // `PagedResult` is the only shape that carries a numeric page index. A
      // `CursorPagedResult` has never had one, so the presence of either field
      // is the discriminant rather than a guess.
      shape: page !== null || pageSize !== null ? 'offset' : 'cursor',
    };
  }

  // The fourth branch. Unchanged in what it *returns* — a dashboard handed to a
  // list-consuming screen still yields an empty page rather than a throw, and
  // the test that pins that behaviour still passes. What is new is that the page
  // it returns now says `unrecognised`, and that a payload carrying the
  // signature of a bespoke envelope announces itself in development.
  if (isRecord(payload)) warnOnBespokeEnvelope(payload);

  return {
    items: [],
    nextCursor: null,
    hasMore: false,
    totalCount: null,
    page: null,
    pageSize: null,
    shape: 'unrecognised',
  };
}

/**
 * The list a route returned, whatever shape it used.
 *
 * The common case at a call site that only wants to render rows.
 */
export function toList<T>(body: unknown): T[] {
  return toPage<T>(unwrapEnvelope(body)).items;
}

/**
 * Envelope in, page out.
 *
 * `readPage(response.data)` is the one call a list-consuming client should make.
 */
export function readPage<T>(body: unknown): Page<T> {
  return toPage<T>(unwrapEnvelope(body));
}

/**
 * The total a route reported, or null.
 *
 * Replaces `analytics-api.ts`'s three-way probe of `meta.totalCount`,
 * `pagination.totalCount` and envelope `totalCount` — none of which this
 * platform has ever populated.
 */
export function readTotalCount(body: unknown): number | null {
  return toPage(unwrapEnvelope(body)).totalCount;
}
