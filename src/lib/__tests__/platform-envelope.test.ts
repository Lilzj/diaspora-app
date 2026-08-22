// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Envelope and pagination normalisation (Remediation Wave B)
//
// The audit found three client modules that each believed something different
// about where a count lives, and none of the three was right. These tests pin
// the platform's actual shapes so a fourth belief cannot be added quietly.
// ─────────────────────────────────────────────────────────────────────────────

import {
  readPage,
  readTotalCount,
  resetBespokeEnvelopeWarnings,
  toList,
  toPage,
  unwrapEnvelope,
} from '../platform-envelope';

function envelope<T>(data: T) {
  return { data, meta: { requestId: 'r', correlationId: 'c', timestamp: 'now' } };
}

describe('the platform envelope', () => {
  it('extracts the payload', () => {
    expect(unwrapEnvelope(envelope({ id: 'x' }))).toEqual({ id: 'x' });
  });

  it('tolerates an already-unwrapped payload', () => {
    expect(unwrapEnvelope([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('does not look for a count in meta, because the platform never puts one there', () => {
    // `ApiMeta` is exactly { requestId, correlationId, timestamp }.
    // `analytics-api.ts` probed `meta.totalCount` and got undefined every time.
    const body = { data: { items: [1, 2], totalCount: 48 }, meta: { totalCount: 999 } };
    expect(readTotalCount(body)).toBe(48);
  });
});

describe('cursor pages', () => {
  const cursor = envelope({
    items: [{ id: 'a' }, { id: 'b' }],
    nextCursor: 'eyJ2IjoyfQ',
    hasMore: true,
    totalCount: 48,
  });

  it('normalises CursorPagedResult', () => {
    const page = readPage<{ id: string }>(cursor);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe('eyJ2IjoyfQ');
    expect(page.hasMore).toBe(true);
    expect(page.totalCount).toBe(48);
  });

  it('keeps an absent totalCount null rather than zero', () => {
    // `CursorPagedResult.TotalCount` is `int?` — counting is expensive and some
    // routes decline. Zero would render "0 results" over a full list.
    const page = readPage(envelope({ items: [{ id: 'a' }], nextCursor: null, hasMore: false }));
    expect(page.totalCount).toBeNull();
    expect(page.items).toHaveLength(1);
  });
});

describe('offset pages', () => {
  it('normalises PagedResult', () => {
    const page = readPage<{ id: string }>(
      envelope({
        items: [{ id: 'a' }],
        page: 2,
        pageSize: 20,
        totalCount: 41,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      })
    );

    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(20);
    expect(page.totalCount).toBe(41);
    // `PagedResult` has no `hasMore`; `hasNextPage` is the same fact.
    expect(page.hasMore).toBe(true);
  });
});

describe('bare lists', () => {
  it('treats an unpaged array as a complete page', () => {
    const page = readPage<number>(envelope([1, 2, 3]));
    expect(page.items).toEqual([1, 2, 3]);
    expect(page.hasMore).toBe(false);
  });

  it('does not promote array length to a declared total', () => {
    // The inventory counter asks for `limit: 1` because it wants a count, not
    // rows. Reading `length` there reports "1 job" on a platform with two
    // thousand — which is worse than reporting nothing, because it renders as a
    // real measurement.
    expect(readPage<number>(envelope([1])).totalCount).toBeNull();
    expect(readTotalCount(envelope([1, 2, 3]))).toBeNull();
  });

  it('toList is the shorthand every rendering call site wants', () => {
    expect(toList<number>(envelope([1, 2]))).toEqual([1, 2]);
    expect(toList<number>(envelope({ items: [1, 2], hasMore: false }))).toEqual([1, 2]);
  });
});

describe('shapes that are not lists at all', () => {
  it('yields an empty page rather than throwing', () => {
    // `GET /api/v1/marketplace` returns a dashboard — categories, featured,
    // recent, nearby. Screens that expected a list used to reach `.filter` on
    // that object and crash. An empty state is wrong but survivable; the real
    // fix is pointing the call at `POST /marketplace/search`.
    const dashboard = envelope({ categories: [], featured: [], recent: [], nearby: [] });
    const page = readPage(dashboard);

    expect(page.items).toEqual([]);
    expect(page.totalCount).toBeNull();
  });

  it('survives null and undefined bodies', () => {
    expect(toPage(null).items).toEqual([]);
    expect(toPage(undefined).items).toEqual([]);
    expect(toList(null)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The fourth spelling — found in Wave D-2, a wave later than the one that
// claimed to handle it.
//
// `CursorShape.totalMatches` was declared with a paragraph of documentation and
// never read, so every marketplace search reported no total. These pin the
// branch rather than the comment.
// ─────────────────────────────────────────────────────────────────────────────

describe('marketplace search’s totalMatches', () => {
  it('is read as the total', () => {
    // `ListingSearchResultResponse` is a hand-rolled cursor page and names its
    // count `totalMatches`. Reading only `totalCount` reports null here, which a
    // screen renders as no result count at all — indistinguishable from a route
    // that genuinely declines to count.
    const page = readPage<{ id: string }>({
      items: [{ id: 'a' }, { id: 'b' }],
      nextCursor: 'c2',
      hasMore: true,
      totalMatches: 87,
    });

    expect(page.totalCount).toBe(87);
    expect(page.items).toHaveLength(2);
  });

  it('still prefers totalCount when a route sends both', () => {
    // Nothing serves both today. If something ever does, `totalCount` is the
    // platform's own `CursorPagedResult` spelling and the hand-rolled one is the
    // exception — so the platform's wins.
    const page = readPage<{ id: string }>({
      items: [],
      totalCount: 5,
      totalMatches: 99,
    });

    expect(page.totalCount).toBe(5);
  });

  it('does not promote a non-numeric totalMatches', () => {
    // Same rule the rest of this module follows: a count that is not a number is
    // an absent count, never a coerced one.
    const page = readPage<{ id: string }>({ items: [], totalMatches: '12' });

    expect(page.totalCount).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The guard — Remediation Wave N
//
// Two modules were silently emptied because `toPage` could not distinguish "no
// rows" from "I did not find the rows", and neither could anyone reading its
// output. `CommentThreadResponse` names its rows `comments`;
// `OfficialNoticeSearchResponse` names them `results`. Both rendered an empty
// state with no error on the device and nothing in the logs, and both were found
// only because somebody happened to read the response type.
//
// The cross-repo half of the guard is `backend-row-property-drift.test.ts`,
// which sweeps the backend's contracts and requires each bespoke envelope to be
// triaged. These are the two halves that live in the client: a `Page` that says
// what it is, and a development warning that fires when the shape arrives.
// ─────────────────────────────────────────────────────────────────────────────

describe('a Page says which shape produced it', () => {
  // These deliberately hand `toPage` shapes it does not recognise, which is the
  // condition the development warning fires on. Silenced here rather than left
  // to print: the warning is asserted properly in the describe below, and a
  // stray line from a test that is *about* something else is the noise this
  // whole guard is trying not to become.
  let restore: () => void;

  beforeEach(() => {
    const original = console.warn;
    console.warn = () => undefined;
    restore = () => {
      console.warn = original;
    };
  });

  afterEach(() => {
    restore();
    resetBespokeEnvelopeWarnings();
  });

  it('distinguishes a page with no rows from a payload that is not a page', () => {
    // The distinction the whole guard rests on. Both of these have
    // `items: []`; only one of them is a defect.
    const legitimatelyEmpty = readPage(envelope({ items: [], hasMore: false }));
    const notAPage = readPage(envelope({ comments: [], hasMore: false }));

    expect(legitimatelyEmpty.items).toEqual([]);
    expect(notAPage.items).toEqual([]);

    expect(legitimatelyEmpty.shape).toBe('cursor');
    expect(notAPage.shape).toBe('unrecognised');
  });

  it('labels a bare array, a cursor page and an offset page', () => {
    expect(readPage(envelope([1, 2])).shape).toBe('array');
    expect(readPage(envelope({ items: [1], nextCursor: 'c', hasMore: true })).shape).toBe('cursor');
    // `PagedResult` is the only shape that carries a numeric page index;
    // `CursorPagedResult` has never had one.
    expect(readPage(envelope({ items: [1], page: 1, pageSize: 20 })).shape).toBe('offset');
  });

  it('labels the dashboard case unrecognised without changing what it returns', () => {
    // The fourth branch is deliberate tolerance and must survive: a dashboard
    // handed to a list screen renders an empty state rather than crashing.
    const dashboard = envelope({ categories: [], featured: [], recent: [], nearby: [] });
    const page = readPage(dashboard);

    expect(page.items).toEqual([]);
    expect(page.totalCount).toBeNull();
    expect(page.hasMore).toBe(false);
    expect(page.shape).toBe('unrecognised');
  });
});

describe('the development warning for a bespoke envelope', () => {
  let warnings: string[];
  let restore: () => void;

  beforeEach(() => {
    resetBespokeEnvelopeWarnings();
    warnings = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(String(args[0]));
    };
    restore = () => {
      console.warn = original;
    };
  });

  afterEach(() => {
    restore();
    resetBespokeEnvelopeWarnings();
  });

  it('fires on the two shapes that actually emptied a module', () => {
    // `CommentThreadResponse`.
    toPage({ contentType: 'guide', contentId: 'g1', comments: [], totalCount: 0, hasMore: false });
    // `OfficialNoticeSearchResponse`.
    toPage({ results: [], nextCursor: null, hasMore: false, totalCount: 0, engine: 'db' });

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('"comments"');
    expect(warnings[1]).toContain('"results"');
  });

  it('names the adapter route out, not a widening of toPage', () => {
    // The message is the whole intervention: whoever reads it is one decision
    // away from either writing an adapter or adding an alias to a platform-wide
    // normaliser, and only one of those is right.
    toPage({ entries: [], nextCursor: 4, hasMore: true });

    expect(warnings[0]).toContain('named adapter');
    expect(warnings[0]).toContain('Do NOT widen toPage');
  });

  it('stays silent on a dashboard, which is what the fourth branch is for', () => {
    // Several arrays is a composite, not a page wearing an unfamiliar name. This
    // is why the heuristic counts arrays rather than looking for any array — it
    // has to be quiet on exactly the payload the tolerant branch was written for.
    toPage({ categories: [], featured: [], recent: [], nearby: [] });

    expect(warnings).toEqual([]);
  });

  it('stays silent on a page that has items, and on a bare array', () => {
    toPage({ items: [], hasMore: false });
    toPage([1, 2, 3]);
    toPage(null);
    toPage(undefined);

    expect(warnings).toEqual([]);
  });

  it('warns once per shape, so a paging list cannot bury a real warning', () => {
    // An infinite list calls this once per page and a re-render calls it again.
    // Twelve hundred identical lines is noise, and noise is how a warning gets
    // scrolled past — the failure mode this guard exists to end.
    for (let index = 0; index < 5; index += 1) {
      toPage({ comments: [{ id: index }], hasMore: true, totalCount: 5 });
    }

    expect(warnings).toHaveLength(1);
  });

  it('is silent in a release build', () => {
    // Same rule as every other `__DEV__` gate in this codebase: a release bundle
    // says nothing. The cross-repo sweep is what covers production, because it
    // runs before the build rather than inside it.
    const globals = globalThis as { __DEV__?: boolean };
    const previous = globals.__DEV__;
    globals.__DEV__ = false;

    try {
      toPage({ comments: [], hasMore: false, totalCount: 0 });
      expect(warnings).toEqual([]);
    } finally {
      globals.__DEV__ = previous;
    }
  });
});
