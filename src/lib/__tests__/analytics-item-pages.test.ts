// ─────────────────────────────────────────────────────────────────────────────
// A content row opens its item's analytics page — 14 Sep 2026
//
// `/analytics/content/[type]/[id]` worked when opened by link and nothing in the
// app opened it. `itemAnalyticsRoute` is now the one place a row becomes a route;
// these pin the mapping, and that every route it can produce is one the page
// serves and the certified per-item arm answers — a route to a page that renders
// "nothing to report on here" would be a fix that moved the dead end.
// ─────────────────────────────────────────────────────────────────────────────

import { isCertifiedContentSubject } from '@/lib/analytics-api';
import { ITEM_PAGE_SEGMENT_VALUES, itemAnalyticsRoute } from '@/lib/analytics/item-pages';

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

const ID = '01a05769-bbbb-7448-bb77-45d7c85b339d';

describe('itemAnalyticsRoute', () => {
  it.each([
    ['Guide', 'guide'],
    ['Update', 'update'],
    ['Event', 'event'],
    ['Job', 'job'],
    // The row says "Marketplace"; the page and the platform call it a listing.
    ['Marketplace', 'listing'],
    ['Housing', 'housing'],
  ])('sends a %s row to /analytics/content/%s/{id}', (contentType, segment) => {
    expect(itemAnalyticsRoute(contentType, ID)).toBe(`/analytics/content/${segment}/${ID}`);
  });

  it.each(['Provider', 'Organization', 'Unknown', '', 'constructor', 'toString', 'guide'])(
    'has no page for %p',
    (contentType) => {
      // `constructor` and `toString` are why the table is a Map: on a plain object
      // both are truthy and would have produced a route. The lower-case `guide`
      // is a route segment, not the row vocabulary, and is not accepted as one.
      expect(itemAnalyticsRoute(contentType, ID)).toBeNull();
    }
  );

  it('needs an id', () => {
    expect(itemAnalyticsRoute('Guide', '')).toBeNull();
    expect(itemAnalyticsRoute('Guide', '   ')).toBeNull();
  });

  it('encodes the id rather than letting it add path segments', () => {
    expect(itemAnalyticsRoute('Guide', 'a/b')).toBe('/analytics/content/guide/a%2Fb');
  });
});

describe('every route it can produce is a page that answers', () => {
  const page = fs
    .readFileSync(path.join(process.cwd(), 'src', 'app', 'analytics', 'content', '[type]', '[id].tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  const served = /const CONTENT_TYPES: AnalyticsSubjectType\[\] = \[([\s\S]*?)\];/.exec(page)?.[1] ?? '';

  it('reads the page’s own list of types', () => {
    expect(served).not.toBe('');
  });

  it.each([...ITEM_PAGE_SEGMENT_VALUES])('the page serves %s', (segment) => {
    expect(served).toMatch(new RegExp(`'${segment}'`));
  });

  it.each([...ITEM_PAGE_SEGMENT_VALUES])('the certified per-item route answers for %s', (segment) => {
    expect(isCertifiedContentSubject({ type: segment, id: ID })).toBe(true);
  });
});

describe('the creator dashboard uses it', () => {
  const screen = fs
    .readFileSync(path.join(process.cwd(), 'src', 'app', 'creator', 'analytics.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('builds each row’s route with itemAnalyticsRoute', () => {
    expect(screen).toMatch(/route=\{itemAnalyticsRoute\(/);
  });

  it('navigates when a row is opened, rather than only recording that it was', () => {
    const openContent = /const openContent = useCallback\(([\s\S]*?)\}, \[\]\);/.exec(screen)?.[1] ?? '';

    expect(openContent).toMatch(/trackCreatorEvent\(/);
    expect(openContent).toMatch(/router\.push\(route/);
  });
});
