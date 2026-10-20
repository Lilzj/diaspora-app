// ─────────────────────────────────────────────────────────────────────────────
// The Community Life hub, composed from real reads — 20 Oct 2026
//
// The hub's summary was one aggregate, `/hub/summary`, that no deployment
// served. Outside a simulation build every rail was hidden and every tile had
// no count. The summary is now composed on the device from the served lists
// (`lib/community-life-hub.ts`), and the "For you" rail reads
// `GET /recommendations/communities` and dismisses through
// `POST /recommendations/dismiss`.
//
// What these pin:
//   · a count comes from the list asked, and an unanswered list is null, not 0;
//   · a count without a server total is marked as a lower bound;
//   · "active" fundraisers are the ones the server says can take a donation;
//   · the area card carries only what the area route counts;
//   · a recommendation is a card only where a screen can open it, and its
//     dismissal body is the server's `RecordFeedbackRequest`.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import {
  composeCommunityLifeSummary,
  hasAnyHubRail,
  hubDismissInput,
  toHubRecommendations,
  HUB_RAIL_LIMITS,
  type CommunityLifeHubParts,
} from '@/lib/community-life-hub';
import {
  COMMUNITIES_SURFACE,
  fetchCommunityRecommendationPage,
  recordDismiss,
} from '@/lib/recommendations-api';
import type { AreaActivityWire } from '@/lib/community-life-api';
import type { MyProgrammeOrganization } from '@/lib/community-programme-api';
import type {
  CommunityPage,
  CommunityPoll,
  FundraisingCampaign,
  VolunteerOpportunity,
} from '@/types/community-advanced';
import type { Event } from '@/types/community-life';
import type { Recommendation } from '@/types/recommendations';

const nothing: CommunityLifeHubParts = {
  upcomingEvents: undefined,
  nearbyEvents: undefined,
  myMemberships: undefined,
  myOrganizations: undefined,
  campaigns: undefined,
  opportunities: undefined,
  polls: undefined,
  announcements: undefined,
  areaActivity: undefined,
  recommendations: undefined,
};

const event = (id: string) => ({ id, title: `Event ${id}` }) as unknown as Event;

function page<T>(items: T[], extra: Partial<CommunityPage<T>> = {}): CommunityPage<T> {
  return { items, hasMore: false, nextCursor: null, ...extra };
}

const campaign = (id: string, canDonate: boolean) =>
  ({ campaignId: id, canDonate, status: canDonate ? 'Active' : 'Paused' }) as unknown as FundraisingCampaign;

function recommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    targetType: 'Community',
    targetId: '11111111-1111-4111-8111-111111111111',
    title: 'Ghanaians in Leeds',
    summary: null,
    slug: 'ghanaians-in-leeds',
    mediaReference: null,
    categoryKey: null,
    location: { cityName: 'Leeds', countryCode: 'GB' },
    isVerified: false,
    isFeatured: false,
    publishedAt: null,
    position: 2,
    score: 0.8,
    strategy: 'location',
    reason: { code: 'near-you', resourceKey: 'r', text: 'Near where you live', confidence: 'High', signalKinds: [] },
    contributions: [],
    isProjection: true,
    ...overrides,
  } as Recommendation;
}

describe('the hub summary, composed', () => {
  it('says nothing about a list that has not answered — null, not zero', () => {
    const summary = composeCommunityLifeSummary(nothing);

    expect(summary.counts).toEqual({
      upcomingEvents: null,
      myMemberships: null,
      activeCampaigns: null,
      openOpportunities: null,
      openPolls: null,
      unreadAnnouncements: null,
    });
    expect(hasAnyHubRail(summary)).toBe(false);
  });

  it('counts from the list asked: the server total where it publishes one', () => {
    const summary = composeCommunityLifeSummary({
      ...nothing,
      upcomingEvents: { items: [event('a'), event('b')], totalCount: 41 },
      opportunities: page([{ opportunityId: 'o1' } as unknown as VolunteerOpportunity], { totalCount: 9 }),
      myMemberships: [],
    });

    expect(summary.counts.upcomingEvents).toBe(41);
    expect(summary.counts.openOpportunities).toBe(9);
    // Asked and empty is a real zero.
    expect(summary.counts.myMemberships).toBe(0);
    expect(summary.countIsLowerBound.openOpportunities).toBeUndefined();
  });

  it('marks a count as a lower bound when there are more pages and no total', () => {
    const polls = Array.from({ length: 20 }, (_, index) => ({ pollId: `p${index}` }) as unknown as CommunityPoll);
    const summary = composeCommunityLifeSummary({ ...nothing, polls: page(polls, { hasMore: true }) });

    expect(summary.counts.openPolls).toBe(20);
    expect(summary.countIsLowerBound.openPolls).toBe(true);
    // The rail is short whatever the count.
    expect(summary.openPolls).toHaveLength(HUB_RAIL_LIMITS.polls);
  });

  it('shows the fundraisers the server says can take a donation, and counts only those', () => {
    const summary = composeCommunityLifeSummary({
      ...nothing,
      // The server's total counts every campaign, so it is not the active count.
      campaigns: page([campaign('c1', true), campaign('c2', false), campaign('c3', true)], { totalCount: 3 }),
    });

    expect(summary.activeCampaigns.map((row) => row.campaignId)).toEqual(['c1', 'c3']);
    expect(summary.counts.activeCampaigns).toBe(2);
  });

  it('never claims to know which announcements are unread', () => {
    const summary = composeCommunityLifeSummary({ ...nothing, announcements: page([]) });
    expect(summary.counts.unreadAnnouncements).toBeNull();
  });

  it('carries the area route’s own counts, and nothing it does not count', () => {
    const wire: AreaActivityWire = {
      latitude: 51.5,
      longitude: -0.1,
      radiusKm: 2,
      name: null,
      displayName: 'Within 2 km of you',
      windowDays: 365,
      eventCount: 12,
      upcomingEventCount: 3,
      organizationCount: 5,
      totalRsvps: 40,
      totalAttendances: 18,
      isLowerBound: false,
    };
    const summary = composeCommunityLifeSummary({ ...nothing, areaActivity: wire });

    expect(summary.areaActivity).toEqual({
      displayName: 'Within 2 km of you',
      radiusKm: 2,
      windowDays: 365,
      upcomingEventCount: 3,
      organizationCount: 5,
      totalRsvps: 40,
      isLowerBound: false,
    });
    expect(summary.areaActivity).not.toHaveProperty('activeCampaignCount');
    expect(hasAnyHubRail(summary)).toBe(true);
  });

  it('lists the organisations the member helps run, with no invented logo', () => {
    const organization = {
      organizationId: 'org-1',
      name: 'Leeds Ghana Union',
      role: 'Admin',
      membershipId: 'm-1',
      isVerified: true,
    } as unknown as MyProgrammeOrganization;

    const summary = composeCommunityLifeSummary({ ...nothing, myOrganizations: [organization] });
    expect(summary.myOrganizations).toEqual([
      { organizationId: 'org-1', name: 'Leeds Ghana Union', logo: null, role: 'Admin' },
    ]);
  });
});

describe('the "For you" rail', () => {
  it('turns a recommended community into a card that opens it, with the server’s reason', () => {
    const [card] = toHubRecommendations({
      items: [recommendation()],
      setId: 'set-1',
      surface: COMMUNITIES_SURFACE,
      isColdStart: false,
      generatedAt: null,
    });

    expect(card.actionRoute).toBe('/community/ghanaians-in-leeds');
    expect(card.reason).toBe('Near where you live');
    expect(card.entityType).toBe('community');
    // A media reference is not a URL; nothing is drawn from it.
    expect(card.imageUrl).toBeNull();
    expect(card.feedback).toEqual({
      targetType: 'Community',
      targetId: '11111111-1111-4111-8111-111111111111',
      surface: 'Communities',
      setId: 'set-1',
      position: 2,
    });
  });

  it('leaves out a community no screen can open', () => {
    const cards = toHubRecommendations({
      items: [recommendation({ slug: null })],
      setId: null,
      surface: COMMUNITIES_SURFACE,
      isColdStart: true,
      generatedAt: null,
    });
    expect(cards).toEqual([]);
  });

  it('has no dismissal body for a card the platform did not produce', () => {
    expect(
      hubDismissInput({
        recommendationId: 'x',
        entityType: 'event',
        entityId: 'x',
        title: 'x',
        reason: 'x',
        actionRoute: '/x',
      })
    ).toBeNull();
  });
});

describe('the recommendation routes, on the wire', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient, { delayResponse: 0 });
  });

  afterEach(() => {
    mock.restore();
  });

  it('asks /recommendations/communities with `limit`, the parameter the route binds', async () => {
    mock.onGet('/recommendations/communities').reply(200, {
      data: {
        items: [recommendation()],
        setId: 'set-9',
        surface: 'Communities',
        isColdStart: false,
        candidateCount: 1,
        excludedCount: 0,
        strategies: [],
        generatedAt: '2026-10-20T10:00:00Z',
      },
    });

    const result = await fetchCommunityRecommendationPage({ country: 'gb', limit: 5 });

    const sent = mock.history.get[0];
    expect(sent.params).toEqual({ country: 'GB', limit: 5 });
    expect(result.setId).toBe('set-9');
    expect(result.items).toHaveLength(1);
  });

  it('dismisses through POST /recommendations/dismiss with the card’s feedback body', async () => {
    mock.onPost('/recommendations/dismiss').reply(200, {
      data: { wasRecorded: true, feedbackId: 'f-1', suppressedUntil: '2027-01-18T10:00:00Z' },
    });

    const [card] = toHubRecommendations({
      items: [recommendation()],
      setId: 'set-1',
      surface: COMMUNITIES_SURFACE,
      isColdStart: false,
      generatedAt: null,
    });

    await recordDismiss(hubDismissInput(card)!);

    const sent = JSON.parse(String(mock.history.post[0].data));
    expect(mock.history.post[0].url).toBe('/recommendations/dismiss');
    expect(sent).toEqual({
      kind: 'dismiss',
      targetType: 'Community',
      targetId: '11111111-1111-4111-8111-111111111111',
      surface: 'Communities',
      setId: 'set-1',
      position: 2,
      occurredAt: null,
    });
  });
});
