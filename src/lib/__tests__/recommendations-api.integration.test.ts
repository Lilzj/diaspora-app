// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the recommendations feed against the real contract
// (Remediation Wave D-1)
//
// Runs the real `lib/recommendations-api.ts` against the real
// `mocks/handlers/recommendations.ts`, which was written from the module's
// contracts rather than from what this client expects. Nothing is
// re-implemented here: a test against a re-implementation of the thing under
// test proves nothing.
//
// Every case below pins a detail that would break a client **silently** — no
// exception, no red screen, just a wrong number, a missing rail or an
// impression counted twice. Those are the ones worth a test.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import {
  resetRecommendationMocks,
  setupRecommendationMocks,
} from '@/mocks/handlers/recommendations';
import {
  allItems,
  describeRecommendationLocation,
  feedErrorMessage,
  fetchHomeFeed,
  findSection,
  isAcceptableTargetType,
  isKnownTargetType,
  isMediaId,
  isSignedOutError,
  recommendationKeys,
  recordAccept,
  recordBookmark,
  recordClick,
  recordDismiss,
  recordView,
  routeForRecommendation,
  toFeedbackRequest,
  HOME_FEED_SURFACE,
} from '@/lib/recommendations-api';
import type { Recommendation } from '@/types/recommendations';

let mock: MockAdapter;

beforeAll(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  setupRecommendationMocks(mock);
  // Anything this client sends that the handler does not answer is a defect in
  // the client, not a passthrough.
  mock.onAny().reply(404);
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  // A cold recommender and an empty de-duplication window at the start of each
  // case. The handler's state is deliberately durable within a session, which is
  // what makes the dismissal and cold-start cases below meaningful.
  resetRecommendationMocks();
});

/** The first item the feed offers, whichever section it lands in. */
async function firstItem(): Promise<Recommendation> {
  const feed = await fetchHomeFeed('GB');
  const item = allItems(feed)[0];
  expect(item).toBeDefined();
  return item;
}

describe('the feed request', () => {
  it('carries the country and nothing else — there is no pagination on /feed', async () => {
    await fetchHomeFeed('gb');

    const request = mock.history.get[mock.history.get.length - 1];

    expect(request.url).toContain('/recommendations/feed');
    // Upper-cased on the way out, so `gb` and `GB` are one cache entry rather
    // than two requests for one answer.
    expect(request.params).toEqual({ country: 'GB' });

    // The whole point: no cursor, no page, no limit, no pageSize. A client that
    // grew one would be building a paging control for a route with none.
    const sent = JSON.stringify(request.params ?? {}) + (request.url ?? '');
    for (const forbidden of ['cursor', 'page', 'limit', 'offset', 'take', 'skip']) {
      expect(sent.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('omits the country entirely when the client does not know one', async () => {
    await fetchHomeFeed(null);

    const request = mock.history.get[mock.history.get.length - 1];
    expect(request.params).toBeUndefined();
  });

  it('keys the cache by country, so two countries are two entries', () => {
    expect(recommendationKeys.feed('GB')).not.toEqual(recommendationKeys.feed('MU'));
    expect(recommendationKeys.feed(null)).toEqual(['recommendations', 'feed', 'all']);
  });
});

describe('the feed shape', () => {
  it('returns sections in the order the server sent them', async () => {
    const feed = await fetchHomeFeed('GB');

    expect(feed.sections.length).toBeGreaterThan(0);
    // `for-you` is first on the wire and must stay first here — a client that
    // sorted, grouped or re-ordered would be overriding the recommender.
    expect(feed.sections[0].key).toBe('for-you');
    expect(feed.sections.map((section) => section.key)).toEqual(
      expect.arrayContaining(['for-you', 'trending-guides', 'jobs-for-you'])
    );
  });

  it('never sends a section with no items — an under-filled one is absent', async () => {
    const feed = await fetchHomeFeed('GB');

    for (const section of feed.sections) {
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it('drops `continue-learning` on a cold start rather than sending it empty', async () => {
    const cold = await fetchHomeFeed('GB');

    expect(cold.isColdStart).toBe(true);
    expect(cold.isPersonalized).toBe(false);
    // `undefined`, not `{ items: [] }`. This is the property that punishes a
    // screen indexing `sections` by position.
    expect(findSection(cold, 'continue-learning')).toBeUndefined();

    // Any feedback at all warms the recommender.
    const item = allItems(cold)[0];
    await recordAccept({ targetType: item.targetType, targetId: item.targetId, position: 0 });

    const warm = await fetchHomeFeed('GB');
    expect(warm.isColdStart).toBe(false);
    expect(warm.isPersonalized).toBe(true);
    expect(findSection(warm, 'continue-learning')).toBeDefined();
  });

  it('gives the mixed section a null targetType and per-item types', async () => {
    const feed = await fetchHomeFeed('GB');
    const forYou = findSection(feed, 'for-you');

    expect(forYou).toBeDefined();
    // Null, so a screen cannot route the whole rail by the section's type.
    expect(forYou!.targetType).toBeNull();

    const types = new Set(forYou!.items.map((item) => item.targetType));
    expect(types.size).toBeGreaterThan(1);
  });

  it('gives a single-type section a matching targetType on every item', async () => {
    const feed = await fetchHomeFeed('GB');
    const guides = findSection(feed, 'trending-guides');

    expect(guides!.targetType).toBe('Guide');
    expect(guides!.items.every((item) => item.targetType === 'Guide')).toBe(true);
  });

  it('reports profileCompleteness as an integer percentage, not a fraction', async () => {
    const feed = await fetchHomeFeed('GB');

    expect(Number.isInteger(feed.profileCompleteness)).toBe(true);
    expect(feed.profileCompleteness).toBeGreaterThanOrEqual(0);
    expect(feed.profileCompleteness).toBeLessThanOrEqual(100);
  });

  it('sets isProjection true on every item, so nothing may branch on it', async () => {
    const feed = await fetchHomeFeed('GB');

    // Declared `= true` on the response record and never assigned by any mapper.
    // A client that read it as "this is a stub, fetch the real one" would fetch
    // every item on the screen.
    expect(allItems(feed).every((item) => item.isProjection === true)).toBe(true);
  });

  it('numbers positions from zero within each section, not across the feed', async () => {
    const feed = await fetchHomeFeed('GB');

    for (const section of feed.sections) {
      expect(section.items.map((item) => item.position)).toEqual(
        section.items.map((_, index) => index)
      );
    }
  });

  it('sends a null seeAllRoute for a section with nowhere to go', async () => {
    // Warm the recommender so `continue-learning` is present at all.
    const cold = await fetchHomeFeed('GB');
    const seed = allItems(cold)[0];
    await recordAccept({ targetType: seed.targetType, targetId: seed.targetId, position: 0 });

    const feed = await fetchHomeFeed('GB');
    const learning = findSection(feed, 'continue-learning');

    expect(learning).toBeDefined();
    // Null is a real answer. A screen that fabricated a destination would send a
    // member to a list that does not contain what they were promised.
    expect(learning!.seeAllRoute).toBeNull();

    expect(findSection(feed, 'housing-near-you')!.seeAllRoute).toBe('/housing');
  });

  it('carries a reason whose confidence is a string, not a number', async () => {
    const item = await firstItem();

    expect(typeof item.reason.text).toBe('string');
    expect(item.reason.text.length).toBeGreaterThan(0);
    expect(typeof item.reason.resourceKey).toBe('string');
    // A percentage bar drawn from this would be drawn from "low".
    expect(typeof item.reason.confidence).toBe('string');
    expect(Number.isNaN(Number(item.reason.confidence))).toBe(true);
    expect(Array.isArray(item.reason.signalKinds)).toBe(true);
  });
});

describe('mediaReference is a string, not a Guid', () => {
  it('recognises a non-GUID reference and refuses to treat it as a mediaId', async () => {
    const feed = await fetchHomeFeed('GB');
    const withMedia = allItems(feed).find((item) => item.mediaReference !== null);

    expect(withMedia).toBeDefined();
    // This contract declares a free-form `string?` where every other module
    // holds a `Guid?`. Handing this to `fetchMediaAsset` — which binds
    // `{mediaId:guid}` — is a 404 in production and a thrown request in
    // development.
    expect(isMediaId(withMedia!.mediaReference)).toBe(false);
  });

  it('accepts a genuine GUID', () => {
    expect(isMediaId('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isMediaId(null)).toBe(false);
    expect(isMediaId('')).toBe(false);
    expect(isMediaId('guides/banking/cover')).toBe(false);
  });
});

describe('targetType is PascalCase and separator-sensitive', () => {
  it('emits PascalCase names this client knows', async () => {
    const feed = await fetchHomeFeed('GB');

    for (const item of allItems(feed)) {
      expect(isKnownTargetType(item.targetType)).toBe(true);
    }
  });

  it('accepts any casing but refuses underscores and hyphens', () => {
    expect(isAcceptableTargetType('HousingListing')).toBe(true);
    expect(isAcceptableTargetType('housinglisting')).toBe(true);
    expect(isAcceptableTargetType('HOUSINGLISTING')).toBe(true);

    // The two spellings that read naturally to anyone used to the rest of this
    // codebase, and the two the server refuses.
    expect(isAcceptableTargetType('housing_listing')).toBe(false);
    expect(isAcceptableTargetType('housing-listing')).toBe(false);
    expect(isAcceptableTargetType('Housing_Listing')).toBe(false);
  });

  it('is a 400 on the wire, not a silently ignored field', async () => {
    await expect(
      apiClient.post('/recommendations/dismiss', {
        kind: 'dismiss',
        targetType: 'housing_listing',
        targetId: '00000000-0000-4000-a000-000000000000',
        surface: HOME_FEED_SURFACE,
        setId: null,
        position: 0,
        occurredAt: null,
      })
    ).rejects.toMatchObject({ response: { status: 400 } });
  });

  it('binds the case-insensitive spelling the server does accept', async () => {
    const item = await firstItem();

    const response = await apiClient.post('/recommendations/dismiss', {
      kind: 'dismiss',
      targetType: item.targetType.toLowerCase(),
      targetId: item.targetId,
      surface: HOME_FEED_SURFACE,
      setId: null,
      position: 0,
      occurredAt: null,
    });

    expect(response.status).toBe(200);
  });
});

describe('the feedback body', () => {
  it('sends `kind` even though the route decides it — validation requires it', async () => {
    const item = await firstItem();

    await recordDismiss({ targetType: item.targetType, targetId: item.targetId, position: 3 });

    const request = mock.history.post[mock.history.post.length - 1];
    const sent = JSON.parse(String(request.data));

    expect(request.url).toBe('/recommendations/dismiss');
    // Required by `RecordFeedbackRequest`'s validator and then ignored by all
    // five handlers. Omitting it is a 400 for a rule with no effect.
    expect(sent.kind).toBe('dismiss');
    expect(sent.surface).toBe('HomeFeed');
    expect(sent.position).toBe(3);
    expect(sent.setId).toBeNull();
    expect(sent.occurredAt).toBeNull();
  });

  it('is a 400 without `kind`', async () => {
    const item = await firstItem();

    await expect(
      apiClient.post('/recommendations/view', {
        targetType: item.targetType,
        targetId: item.targetId,
        surface: HOME_FEED_SURFACE,
      })
    ).rejects.toMatchObject({ response: { status: 400 } });
  });

  it('is a 400 without `surface`', async () => {
    const item = await firstItem();

    await expect(
      apiClient.post('/recommendations/view', {
        kind: 'view',
        targetType: item.targetType,
        targetId: item.targetId,
      })
    ).rejects.toMatchObject({ response: { status: 400 } });
  });

  it('is a 400 when targetId is not a GUID', async () => {
    await expect(
      apiClient.post('/recommendations/view', {
        kind: 'view',
        targetType: 'Guide',
        // The identifier shape used throughout this codebase's fixtures, and one
        // that never reaches a handler on the real server.
        targetId: 'guide-1',
        surface: HOME_FEED_SURFACE,
      })
    ).rejects.toMatchObject({ response: { status: 400 } });
  });

  it('is a 400 on a negative position, and the client sends null instead', async () => {
    const item = await firstItem();

    await expect(
      apiClient.post('/recommendations/view', {
        kind: 'view',
        targetType: item.targetType,
        targetId: item.targetId,
        surface: HOME_FEED_SURFACE,
        position: -1,
      })
    ).rejects.toMatchObject({ response: { status: 400 } });

    // Null rather than clamped to zero: zero is a *different item's* position
    // and would attach the feedback to the wrong row.
    const built = toFeedbackRequest('view', {
      targetType: 'Guide',
      targetId: item.targetId,
      position: -1,
    });
    expect(built.position).toBeNull();

    expect(toFeedbackRequest('view', { targetType: 'Guide', targetId: item.targetId }).position)
      .toBeNull();
    expect(
      toFeedbackRequest('view', { targetType: 'Guide', targetId: item.targetId, position: 2.7 })
        .position
    ).toBe(2);
  });
});

describe('view and click are de-duplicated in a five-minute window', () => {
  it('answers 200 with wasRecorded false on the repeat, not an error status', async () => {
    const item = await firstItem();
    const input = { targetType: item.targetType, targetId: item.targetId, position: 0 };

    const first = await recordView(input);
    expect(first.wasRecorded).toBe(true);
    expect(first.feedbackId).not.toBe('00000000-0000-0000-0000-000000000000');

    const second = await recordView(input);

    // The status code is 200 both times. A client counting impressions by
    // "the call did not throw" counts this one, and the platform did not.
    const response = mock.history.post[mock.history.post.length - 1];
    expect(response).toBeDefined();
    expect(second.wasRecorded).toBe(false);
    expect(second.feedbackId).toBe('00000000-0000-0000-0000-000000000000');
    expect(second.suppressedUntil).toBeNull();
  });

  it('applies the same window to /click', async () => {
    const item = await firstItem();
    const input = { targetType: item.targetType, targetId: item.targetId, position: 0 };

    expect((await recordClick(input)).wasRecorded).toBe(true);
    expect((await recordClick(input)).wasRecorded).toBe(false);
  });

  it('records again once the window has passed', async () => {
    const item = await firstItem();
    const input = { targetType: item.targetType, targetId: item.targetId, position: 0 };

    expect((await recordView(input)).wasRecorded).toBe(true);

    const realNow = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(realNow + 5 * 60 * 1000 + 1);
    try {
      expect((await recordView(input)).wasRecorded).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });

  it('de-duplicates per item, not per surface', async () => {
    const feed = await fetchHomeFeed('GB');
    const [one, two] = allItems(feed);

    expect((await recordView({ targetType: one.targetType, targetId: one.targetId })).wasRecorded)
      .toBe(true);
    // A different item inside the same window is a different impression.
    expect((await recordView({ targetType: two.targetType, targetId: two.targetId })).wasRecorded)
      .toBe(true);
  });

  it('does not de-duplicate dismiss, accept or bookmark', async () => {
    const feed = await fetchHomeFeed('GB');
    const items = allItems(feed);

    const accept = { targetType: items[0].targetType, targetId: items[0].targetId };
    expect((await recordAccept(accept)).wasRecorded).toBe(true);
    expect((await recordAccept(accept)).wasRecorded).toBe(true);

    const bookmark = { targetType: items[1].targetType, targetId: items[1].targetId };
    expect((await recordBookmark(bookmark)).wasRecorded).toBe(true);
    expect((await recordBookmark(bookmark)).wasRecorded).toBe(true);

    const dismiss = { targetType: items[2].targetType, targetId: items[2].targetId };
    expect((await recordDismiss(dismiss)).wasRecorded).toBe(true);
    expect((await recordDismiss(dismiss)).wasRecorded).toBe(true);
  });
});

describe('a dismissal suppresses for ninety days', () => {
  it('reports the moment the suppression lapses', async () => {
    const item = await firstItem();

    const result = await recordDismiss({
      targetType: item.targetType,
      targetId: item.targetId,
      position: item.position,
    });

    expect(result.wasRecorded).toBe(true);
    expect(result.suppressedUntil).not.toBeNull();

    const days = (Date.parse(result.suppressedUntil!) - Date.now()) / (24 * 60 * 60 * 1000);
    expect(Math.round(days)).toBe(90);
  });

  it('removes the item from the next feed', async () => {
    const item = await firstItem();

    await recordDismiss({ targetType: item.targetType, targetId: item.targetId });

    const after = await fetchHomeFeed('GB');
    expect(allItems(after).some((candidate) => candidate.targetId === item.targetId)).toBe(false);
  });

  it('drops a section that falls under its minimum, rather than emptying it', async () => {
    const feed = await fetchHomeFeed('GB');
    const housing = findSection(feed, 'housing-near-you');
    expect(housing).toBeDefined();

    // Take it under the minimum by one.
    await recordDismiss({
      targetType: housing!.items[0].targetType,
      targetId: housing!.items[0].targetId,
    });

    const after = await fetchHomeFeed('GB');
    // Absent, not present-and-short. This is the property a screen that indexes
    // `sections` by position cannot survive.
    expect(findSection(after, 'housing-near-you')).toBeUndefined();
    expect(after.sections.every((section) => section.key !== 'housing-near-you')).toBe(true);
  });

  it('re-numbers position after a suppression so feedback names the right row', async () => {
    const feed = await fetchHomeFeed('GB');
    const jobs = findSection(feed, 'jobs-for-you');
    expect(jobs!.items.length).toBeGreaterThan(2);

    await recordDismiss({ targetType: jobs!.items[0].targetType, targetId: jobs!.items[0].targetId });

    const after = await fetchHomeFeed('GB');
    const remaining = findSection(after, 'jobs-for-you');

    expect(remaining!.items[0].targetId).toBe(jobs!.items[1].targetId);
    expect(remaining!.items[0].position).toBe(0);
  });
});

describe('signing out is not a transport failure', () => {
  it('names a 401 as "sign in" and gives the member the action', async () => {
    const unauthorized = { response: { status: 401 } };

    // No route in this module calls `.RequireAuthorization()`. The check lives
    // in a MediatR behaviour that throws, so the platform writes a bare 401 with
    // no `WWW-Authenticate` challenge — which a generic handler reads as a
    // server fault.
    expect(isSignedOutError(unauthorized)).toBe(true);
    expect(feedErrorMessage(unauthorized)).toContain('Sign in');

    expect(isSignedOutError({ response: { status: 500 } })).toBe(false);
    expect(isSignedOutError(new Error('network'))).toBe(false);
  });

  it('prefers the platform problem detail for anything else', () => {
    expect(feedErrorMessage({ response: { status: 400, data: { detail: 'That is not a country.' } } }))
      .toBe('That is not a country.');
    expect(feedErrorMessage(new Error('boom'))).toBe('We could not load your feed just now.');
  });
});

describe('where a recommendation goes', () => {
  const base: Omit<Recommendation, 'targetType' | 'targetId'> = {
    title: 'x',
    summary: null,
    slug: null,
    mediaReference: null,
    categoryKey: null,
    location: {},
    isVerified: false,
    isFeatured: false,
    publishedAt: null,
    position: 0,
    score: 1,
    strategy: 's',
    reason: { code: 'c', resourceKey: 'r', text: 't', confidence: 'low', signalKinds: [] },
    contributions: [],
    isProjection: true,
  };

  const ID = '00000000-0000-4000-a000-000000000001';

  it('routes every type this client has a screen for', () => {
    expect(routeForRecommendation({ ...base, targetType: 'Job', targetId: ID })).toBe(`/job/${ID}`);
    expect(routeForRecommendation({ ...base, targetType: 'HousingListing', targetId: ID })).toBe(
      `/housing/${ID}`
    );
    expect(routeForRecommendation({ ...base, targetType: 'MarketplaceListing', targetId: ID })).toBe(
      `/marketplace/${ID}`
    );
    expect(routeForRecommendation({ ...base, targetType: 'Guide', targetId: ID })).toBe(
      `/guide/${ID}`
    );
    expect(routeForRecommendation({ ...base, targetType: 'Provider', targetId: ID })).toBe(
      `/provider/${ID}`
    );
    expect(routeForRecommendation({ ...base, targetType: 'Event', targetId: ID })).toBe(
      `/community-life/event/${ID}`
    );
    expect(routeForRecommendation({ ...base, targetType: 'Organization', targetId: ID })).toBe(
      `/community-life/org/${ID}`
    );
    expect(routeForRecommendation({ ...base, targetType: 'Neighborhood', targetId: ID })).toBe(
      `/neighborhood/${ID}`
    );
  });

  it('returns null for the types this application has no screen for', () => {
    // `continue-learning` is a shipped section, so `LearningPath` is a live gap
    // rather than a hypothetical one.
    expect(routeForRecommendation({ ...base, targetType: 'LearningPath', targetId: ID })).toBeNull();
    expect(routeForRecommendation({ ...base, targetType: 'Announcement', targetId: ID })).toBeNull();
    // `/country/[code]` takes an ISO code; `targetId` is a GUID.
    expect(routeForRecommendation({ ...base, targetType: 'Country', targetId: ID })).toBeNull();
  });

  it('routes a community only when the item carries a slug', () => {
    expect(routeForRecommendation({ ...base, targetType: 'Community', targetId: ID })).toBeNull();
    expect(
      routeForRecommendation({ ...base, targetType: 'Community', targetId: ID, slug: 'lagos' })
    ).toBe('/community/lagos');
  });
});

describe('the place line', () => {
  const item = (location: Recommendation['location']): Recommendation => ({
    targetType: 'Guide',
    targetId: '00000000-0000-4000-a000-000000000002',
    title: 'x',
    summary: null,
    slug: null,
    mediaReference: null,
    categoryKey: null,
    location,
    isVerified: false,
    isFeatured: false,
    publishedAt: null,
    position: 0,
    score: 1,
    strategy: 's',
    reason: { code: 'c', resourceKey: 'r', text: 't', confidence: 'low', signalKinds: [] },
    contributions: [],
    isProjection: true,
  });

  it('is blank when the server knew nothing, rather than "undefined, undefined"', () => {
    expect(describeRecommendationLocation(item({}))).toBe('');
    expect(
      describeRecommendationLocation(
        item({ countryCode: null, cityName: null, regionName: null, neighborhoodName: null })
      )
    ).toBe('');
  });

  it('reads most specific first and does not repeat a name', () => {
    expect(describeRecommendationLocation(item({ cityName: 'London', countryCode: 'GB' }))).toBe(
      'London, GB'
    );
    expect(
      describeRecommendationLocation(
        item({ neighborhoodName: 'Peckham', cityName: 'London', countryCode: 'GB' })
      )
    ).toBe('Peckham, London');
    expect(describeRecommendationLocation(item({ cityName: 'London', regionName: 'London' }))).toBe(
      'London'
    );
    expect(describeRecommendationLocation(item({ countryCode: 'GB' }))).toBe('GB');
  });
});
