// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics cache isolation (Frontend Phase 15, §53 · §77)
//
// §53 and §77 say this is mandatory and name the requirement precisely: prove
// that analytics from Community A cannot appear under Community B, Creator A
// under Creator B, Provider A under Provider B, Employer A under Employer B, and
// Listing A under Listing B.
//
// So this file proves it, at the two levels where it could fail:
//
//   **The key level.** Every subject produces a different key, and every
//   dimension that changes the answer changes the key — range, comparison,
//   granularity, metric selection, breakdowns, filters and community scope.
//
//   **The cache level.** A real `QueryClient` is populated under one subject and
//   interrogated under another. Not "the keys look different" but "the second
//   subject reads undefined", which is the property a member actually depends on.
//
// It also proves the three adjacent things that would defeat the isolation if
// they were wrong:
//
//   * **Order does not fork a key.** `['GB','NG']` and `['NG','GB']` are one
//     entry. Without normalisation the cache silently doubles every time a filter
//     chip is toggled off and on, and two identical requests go out under two
//     keys.
//   * **The preset is not in the key.** `last30d` resolved yesterday and a custom
//     range covering the same thirty days are the same question. Keying on the
//     preset would make them two entries — and, worse, would serve a `last30d`
//     entry cached before midnight for the wrong window after it.
//   * **A cleared filter is the same key as a never-set filter.** Otherwise
//     "clear" produces a cache miss and a spinner for data already held.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryClient } from '@tanstack/react-query';
import { analyticsKeys, filtersToken, subjectToken } from '@/lib/analytics/query-keys';
import { resolveRange } from '@/lib/analytics/time-range';
import type {
  AnalyticsFilter,
  AnalyticsQuery,
  AnalyticsSubject,
  AnalyticsTimeRange,
} from '@/types/analytics';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const RANGE: AnalyticsTimeRange = {
  preset: 'last30d',
  from: '2026-07-10',
  to: '2026-08-08',
  timezone: 'Europe/London',
  isDeviceTimezone: false,
};

const OTHER_RANGE: AnalyticsTimeRange = { ...RANGE, from: '2026-06-10', to: '2026-07-09' };

function query(subject: AnalyticsSubject, overrides: Partial<AnalyticsQuery> = {}): AnalyticsQuery {
  return { subject, range: RANGE, ...overrides };
}

function key(value: readonly unknown[]): string {
  return JSON.stringify(value);
}

/** §53's five pairs, verbatim. */
const PAIRS: { label: string; a: AnalyticsSubject; b: AnalyticsSubject }[] = [
  {
    label: 'Community A vs Community B',
    a: { type: 'community', id: 'dev-community-nigerian' },
    b: { type: 'community', id: 'dev-community-ghanaian' },
  },
  {
    label: 'Creator A vs Creator B',
    a: { type: 'creator', id: 'creator-a' },
    b: { type: 'creator', id: 'creator-b' },
  },
  {
    label: 'Provider A vs Provider B',
    a: { type: 'provider', id: 'provider-a' },
    b: { type: 'provider', id: 'provider-b' },
  },
  {
    label: 'Employer A vs Employer B',
    a: { type: 'employer', id: 'employer-a' },
    b: { type: 'employer', id: 'employer-b' },
  },
  {
    label: 'Listing A vs Listing B',
    a: { type: 'listing', id: 'listing-a' },
    b: { type: 'listing', id: 'listing-b' },
  },
];

describe('§53 · analytics cache isolation between entities', () => {
  describe.each(PAIRS)('$label', ({ a, b }) => {
    it('produces different dataset keys', () => {
      expect(key(analyticsKeys.dataset(query(a)))).not.toBe(key(analyticsKeys.dataset(query(b))));
    });

    it('produces different access keys', () => {
      expect(key(analyticsKeys.access(a))).not.toBe(key(analyticsKeys.access(b)));
    });

    it('produces different funnel keys for the same funnel', () => {
      expect(key(analyticsKeys.funnel('marketplace', a, RANGE))).not.toBe(
        key(analyticsKeys.funnel('marketplace', b, RANGE))
      );
    });

    it('produces different retention keys', () => {
      expect(key(analyticsKeys.retention(a, RANGE, 'week', 8))).not.toBe(
        key(analyticsKeys.retention(b, RANGE, 'week', 8))
      );
    });

    it('produces different leaderboard keys', () => {
      expect(key(analyticsKeys.leaderboard('top', a, RANGE, 'content.views'))).not.toBe(
        key(analyticsKeys.leaderboard('top', b, RANGE, 'content.views'))
      );
    });

    // The property a member actually depends on: not "the keys differ" but
    // "asking about B does not return A's figures".
    it('cannot serve A’s cached dataset under B', () => {
      const client = new QueryClient();
      const sentinel = { subject: a, marker: 'A-ONLY' };

      client.setQueryData(analyticsKeys.dataset(query(a)), sentinel);

      expect(client.getQueryData(analyticsKeys.dataset(query(a)))).toBe(sentinel);
      expect(client.getQueryData(analyticsKeys.dataset(query(b)))).toBeUndefined();
    });

    it('cannot serve A’s cached capability set under B', () => {
      const client = new QueryClient();
      client.setQueryData(analyticsKeys.access(a), { canViewAdministrative: true });

      expect(client.getQueryData(analyticsKeys.access(b))).toBeUndefined();
    });
  });
});

describe('§52 · every dimension that changes the answer changes the key', () => {
  const subject: AnalyticsSubject = { type: 'community', id: 'dev-community-nigerian' };
  const base = key(analyticsKeys.dataset(query(subject)));

  it('the date window', () => {
    expect(key(analyticsKeys.dataset(query(subject, { range: OTHER_RANGE })))).not.toBe(base);
  });

  it('the timezone', () => {
    const elsewhere = key(
      analyticsKeys.dataset(query(subject, { range: { ...RANGE, timezone: 'Pacific/Auckland' } }))
    );
    expect(elsewhere).not.toBe(base);
  });

  it('the comparison basis', () => {
    expect(key(analyticsKeys.dataset(query(subject, { comparison: 'previousYear' })))).not.toBe(base);
  });

  it('the granularity', () => {
    expect(key(analyticsKeys.dataset(query(subject, { granularity: 'week' })))).not.toBe(base);
  });

  it('the metric selection', () => {
    expect(key(analyticsKeys.dataset(query(subject, { metrics: ['content.views'] })))).not.toBe(base);
  });

  it('the breakdown selection', () => {
    expect(key(analyticsKeys.dataset(query(subject, { breakdowns: ['country'] })))).not.toBe(base);
  });

  it('whether a series was asked for', () => {
    expect(key(analyticsKeys.dataset(query(subject, { includeSeries: true })))).not.toBe(base);
  });

  it('the applied filters', () => {
    const filters: AnalyticsFilter[] = [{ dimension: 'country', values: ['GB'] }];
    expect(key(analyticsKeys.dataset(query(subject, { filters })))).not.toBe(base);
  });

  // §65: community and country are separate dimensions, and the scope token is
  // what keeps a community-scoped dataset from being served unscoped.
  it('the resolved community scope token', () => {
    expect(
      key(analyticsKeys.dataset(query(subject, { communityScopeToken: 'dev-ng|dev-gh' })))
    ).not.toBe(base);
  });
});

describe('§52 · equivalent questions share one cache entry', () => {
  const subject: AnalyticsSubject = { type: 'platform', id: null };

  it('normalises filter value order', () => {
    const forward = analyticsKeys.dataset(
      query(subject, { filters: [{ dimension: 'country', values: ['GB', 'NG'] }] })
    );
    const backward = analyticsKeys.dataset(
      query(subject, { filters: [{ dimension: 'country', values: ['NG', 'GB'] }] })
    );

    expect(key(forward)).toBe(key(backward));
  });

  it('normalises filter dimension order', () => {
    const forward = analyticsKeys.dataset(
      query(subject, {
        filters: [
          { dimension: 'country', values: ['GB'] },
          { dimension: 'category', values: ['jobs'] },
        ],
      })
    );
    const backward = analyticsKeys.dataset(
      query(subject, {
        filters: [
          { dimension: 'category', values: ['jobs'] },
          { dimension: 'country', values: ['GB'] },
        ],
      })
    );

    expect(key(forward)).toBe(key(backward));
  });

  it('normalises metric selection order', () => {
    const forward = analyticsKeys.dataset(
      query(subject, { metrics: ['content.views', 'content.reach'] })
    );
    const backward = analyticsKeys.dataset(
      query(subject, { metrics: ['content.reach', 'content.views'] })
    );

    expect(key(forward)).toBe(key(backward));
  });

  // The subtle one. See the header.
  it('treats the same resolved window as one entry regardless of how it was asked for', () => {
    const asPreset = analyticsKeys.dataset(query(subject, { range: RANGE }));
    const asCustom = analyticsKeys.dataset(
      query(subject, { range: { ...RANGE, preset: 'custom' } })
    );

    expect(key(asPreset)).toBe(key(asCustom));
  });

  it('treats a cleared filter as no filter', () => {
    const cleared = analyticsKeys.dataset(
      query(subject, { filters: [{ dimension: 'country', values: [] }] })
    );
    const never = analyticsKeys.dataset(query(subject));

    expect(key(cleared)).toBe(key(never));
  });

  it('filtersToken reduces an all-empty filter set to "none"', () => {
    expect(filtersToken([{ dimension: 'country', values: [] }])).toBe('none');
    expect(filtersToken([])).toBe('none');
    expect(filtersToken(undefined)).toBe('none');
  });
});

describe('§53 · subject identity', () => {
  it('a subject with no id is "self" rather than undefined', () => {
    // `undefined` in a key position would collide with a genuinely missing id and
    // would be invisible in a cache dump.
    expect(subjectToken({ type: 'creator', id: null })).toBe('creator:self');
    expect(subjectToken({ type: 'creator' })).toBe('creator:self');
  });

  it('the same id under two subject types does not collide', () => {
    // A provider and an employer can plausibly share an owner id.
    const provider: AnalyticsSubject = { type: 'provider', id: 'shared-id' };
    const employer: AnalyticsSubject = { type: 'employer', id: 'shared-id' };

    expect(key(analyticsKeys.dataset(query(provider)))).not.toBe(
      key(analyticsKeys.dataset(query(employer)))
    );
  });

  it('the display label does not affect the key', () => {
    // A label arriving late from a profile fetch must not invalidate the dataset.
    const withoutLabel: AnalyticsSubject = { type: 'community', id: 'dev-ng' };
    const withLabel: AnalyticsSubject = { type: 'community', id: 'dev-ng', label: 'Nigerian' };

    expect(key(analyticsKeys.dataset(query(withoutLabel)))).toBe(
      key(analyticsKeys.dataset(query(withLabel)))
    );
  });
});

describe('§52 · prefix invalidation targets exactly one subject type', () => {
  it('invalidating community datasets leaves creator datasets alone', async () => {
    const client = new QueryClient();

    const community = query({ type: 'community', id: 'dev-ng' });
    const creator = query({ type: 'creator', id: null });

    client.setQueryData(analyticsKeys.dataset(community), { marker: 'community' });
    client.setQueryData(analyticsKeys.dataset(creator), { marker: 'creator' });

    await client.invalidateQueries({
      queryKey: analyticsKeys.datasetsForSubjectType('community'),
    });

    const communityState = client.getQueryState(analyticsKeys.dataset(community));
    const creatorState = client.getQueryState(analyticsKeys.dataset(creator));

    expect(communityState?.isInvalidated).toBe(true);
    expect(creatorState?.isInvalidated).toBe(false);
  });

  it('invalidating one community leaves another community alone', async () => {
    const client = new QueryClient();

    const nigerian: AnalyticsSubject = { type: 'community', id: 'dev-ng' };
    const ghanaian: AnalyticsSubject = { type: 'community', id: 'dev-gh' };

    client.setQueryData(analyticsKeys.dataset(query(nigerian)), { marker: 'ng' });
    client.setQueryData(analyticsKeys.dataset(query(ghanaian)), { marker: 'gh' });

    await client.invalidateQueries({ queryKey: analyticsKeys.datasetsForSubject(nigerian) });

    expect(client.getQueryState(analyticsKeys.dataset(query(nigerian)))?.isInvalidated).toBe(true);
    expect(client.getQueryState(analyticsKeys.dataset(query(ghanaian)))?.isInvalidated).toBe(false);
  });

  it('analytics invalidation does not touch other domains', async () => {
    // §61's rule, inherited: never `queryClient.clear()`. A community switch must
    // not take the member's wallet and inbox with it.
    const client = new QueryClient();

    client.setQueryData(['financial', 'wallets'], { marker: 'wallet' });
    client.setQueryData(['analytics', 'dataset', 'community', 'dev-ng'], { marker: 'analytics' });

    await client.invalidateQueries({ queryKey: ['analytics', 'dataset'] });

    expect(client.getQueryState(['financial', 'wallets'])?.isInvalidated).toBe(false);
  });
});

describe('§54 · a range resolved in two timezones is two cache entries', () => {
  it('the same preset in two zones does not share a key', () => {
    const london = resolveRange('today', {
      reportingTimezone: 'Europe/London',
      now: new Date('2026-08-08T23:30:00Z'),
    });
    const auckland = resolveRange('today', {
      reportingTimezone: 'Pacific/Auckland',
      now: new Date('2026-08-08T23:30:00Z'),
    });

    // At 23:30 UTC these are genuinely different days, which is the entire point
    // of §58 and the reason the timezone is in the key rather than beside it.
    const subject: AnalyticsSubject = { type: 'platform', id: null };
    expect(key(analyticsKeys.dataset(query(subject, { range: london })))).not.toBe(
      key(analyticsKeys.dataset(query(subject, { range: auckland })))
    );
  });
});
