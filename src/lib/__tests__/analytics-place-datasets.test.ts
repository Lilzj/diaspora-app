// ─────────────────────────────────────────────────────────────────────────────
// Country, organisation and neighbourhood analytics read real routes — 20 Oct 2026
//
// All three dashboards read only the development adapter, so outside a
// simulation build they drew nothing, and `/analytics/access` refused all three
// whatever their routes would answer. Each has a served route:
//
//   country        GET /intelligence/countries/{cc}/analytics
//   organisation   GET /communities/organizations/{id}/analytics (+ /members)
//   neighbourhood  GET /geo/area + GET /community-life/area/activity
//
// What these pin: the paths and parameters sent; each figure lands on the
// catalogue key whose definition describes it; percentages become ratios;
// anything not computed — or refused — is named in `unavailableMetrics` and
// never filled in; access comes from what each route itself requires.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import {
  fetchPlaceAnalytics,
  fetchPlaceAnalyticsAccess,
  isCertifiedPlaceSubject,
  neighborhoodSubjectId,
  parseNeighborhoodSubjectId,
  programmePeriodFor,
} from '@/lib/analytics-api';
import type { AnalyticsMetricKey, AnalyticsTimeRange } from '@/types/analytics';

const RANGE_30D: AnalyticsTimeRange = {
  preset: 'last30d',
  from: '2026-09-21',
  to: '2026-10-20',
  timezone: 'Europe/London',
  isDeviceTimezone: false,
};

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
});

afterEach(() => {
  mock.restore();
});

const valueOf = (dataset: { metrics: { key: AnalyticsMetricKey; value: { value: number } }[] }, key: AnalyticsMetricKey) =>
  dataset.metrics.find((metric) => metric.key === key)?.value.value;

describe('which subjects the place arm answers', () => {
  it('is country, organisation and neighbourhood, each with an id', () => {
    expect(isCertifiedPlaceSubject({ type: 'country', id: 'GB' })).toBe(true);
    expect(isCertifiedPlaceSubject({ type: 'organization', id: 'org-1' })).toBe(true);
    expect(isCertifiedPlaceSubject({ type: 'neighborhood', id: '51.5,-0.1,GB' })).toBe(true);
    expect(isCertifiedPlaceSubject({ type: 'country', id: null })).toBe(false);
    expect(isCertifiedPlaceSubject({ type: 'community', id: 'c-1' })).toBe(false);
  });
});

describe('the country dataset', () => {
  it('maps the intelligence counters onto the keys that define them, as ratios', async () => {
    mock.onGet('/intelligence/countries/GB/analytics').reply(200, {
      data: {
        countryCode: 'GB',
        noticeViews: 420,
        clickThroughs: 60,
        readCompletions: 210,
        dashboardViews: 900,
        embassyViews: 10,
        emergencyViews: 4,
        visaViews: 30,
        holidayViews: 12,
        guideCrossNavigations: 7,
        searches: 150,
        unansweredSearches: 15,
        recommendationsAccepted: 3,
        notificationsFollowed: 22,
        clickThroughRate: 14.29,
        readCompletionRate: 50,
        lastActivityAt: '2026-10-19T08:00:00Z',
        mostViewed: [],
      },
    });

    const dataset = await fetchPlaceAnalytics({ type: 'country', id: 'gb' }, RANGE_30D);

    expect(mock.history.get[0].url).toBe('/intelligence/countries/GB/analytics');
    expect(valueOf(dataset, 'content.views')).toBe(420);
    // 50 (a percentage on the wire) is 0.5 in the model.
    expect(valueOf(dataset, 'content.completionRate')).toBe(0.5);
    expect(valueOf(dataset, 'search.volume')).toBe(150);
    expect(valueOf(dataset, 'notification.opened')).toBe(22);
    // Counted by no route: named, not invented.
    expect(dataset.unavailableMetrics).toEqual(
      expect.arrayContaining(['audience.users.total', 'growth.members.net'])
    );
    expect(dataset.metrics.every((metric) => metric.value.source === 'backend')).toBe(true);
    // All-time counters: the dataset says the range does not narrow them.
    expect(dataset.metrics[0].freshness.limitations?.join(' ')).toMatch(/All-time/);
    expect(dataset.gapKey).toBeNull();
  });

  it('names the usage figures as unavailable to a member the route refuses', async () => {
    mock.onGet('/intelligence/countries/GB/analytics').reply(403, {
      title: 'Forbidden',
      status: 403,
    });

    const dataset = await fetchPlaceAnalytics({ type: 'country', id: 'GB' }, RANGE_30D);

    expect(dataset.metrics).toEqual([]);
    expect(dataset.unavailableMetrics).toEqual(
      expect.arrayContaining(['content.views', 'search.volume', 'notification.opened'])
    );
    // Not a zero anywhere.
    expect(valueOf(dataset, 'content.views')).toBeUndefined();
  });
});

describe('the organisation dataset', () => {
  const ORG = '22222222-2222-4222-8222-222222222222';

  it('reads both programme routes for the window nearest the range', async () => {
    mock.onGet(`/communities/organizations/${ORG}/analytics`).reply(200, {
      data: {
        organizationId: ORG,
        period: '30d',
        memberGrowth: [
          { date: '2026-10-18', value: 2 },
          { date: '2026-10-19', value: 3 },
        ],
        volunteerHours: [{ date: '2026-10-19', value: 7.5 }],
        pollParticipation: [{ date: '2026-10-19', value: 11 }],
        computedAt: '2026-10-20T09:00:00Z',
      },
    });
    mock.onGet(`/communities/organizations/${ORG}/analytics/members`).reply(200, {
      data: {
        organizationId: ORG,
        period: '30d',
        totalMembers: 60,
        activeMembers: 48,
        pendingApplications: 2,
        lapsedMembers: 10,
        byStatus: {},
        joins: [],
        computedAt: '2026-10-20T09:00:00Z',
      },
    });

    const dataset = await fetchPlaceAnalytics({ type: 'organization', id: ORG }, RANGE_30D);

    for (const request of mock.history.get) {
      expect(request.params).toEqual({ period: '30d' });
    }
    // Active members, the server's own count.
    expect(valueOf(dataset, 'reach.members')).toBe(48);
    // Joins are joins: a sum of the days, not net growth.
    expect(valueOf(dataset, 'organization.memberJoins')).toBe(5);
    expect(valueOf(dataset, 'growth.members.net')).toBeUndefined();
    expect(valueOf(dataset, 'organization.volunteerHours')).toBe(7.5);
    expect(valueOf(dataset, 'organization.pollResponses')).toBe(11);
    expect(dataset.series.map((series) => series.key)).toEqual([
      'organization.memberJoins',
      'organization.volunteerHours',
      'organization.pollResponses',
    ]);
    // Attendance is B12's and giving B15's: named, not drawn as a flat zero.
    expect(dataset.unavailableMetrics).toEqual(
      expect.arrayContaining(['event.attendance', 'wallet.donations'])
    );
  });

  it('fails as a failure when neither route answers, rather than as an empty dashboard', async () => {
    mock.onGet(new RegExp(`/communities/organizations/${ORG}/analytics`)).reply(403, {
      title: 'Forbidden',
      status: 403,
    });

    await expect(
      fetchPlaceAnalytics({ type: 'organization', id: ORG }, RANGE_30D)
    ).rejects.toBeTruthy();
  });

  it('answers a range the routes do not compute with the nearest window, and says so', () => {
    expect(programmePeriodFor({ ...RANGE_30D, preset: 'last7d' })).toEqual({ period: '7d', days: 7, exact: true });
    expect(programmePeriodFor({ ...RANGE_30D, preset: 'allTime' }).period).toBe('all');
    expect(
      programmePeriodFor({ ...RANGE_30D, preset: 'thisYear', from: '2026-01-01', to: '2026-10-20' })
    ).toEqual({ period: '12m', days: 365, exact: false });
  });
});

describe('the neighbourhood dataset', () => {
  const POINT_ID = neighborhoodSubjectId({ latitude: 51.47, longitude: -0.07, countryCode: 'gb', radiusKm: 2 });

  it('carries its point in the subject id, and an old catalogue id carries none', () => {
    expect(POINT_ID).toBe('51.47000,-0.07000,GB,2');
    expect(parseNeighborhoodSubjectId(POINT_ID)).toEqual({
      latitude: 51.47,
      longitude: -0.07,
      countryCode: 'GB',
      radiusKm: 2,
    });
    expect(parseNeighborhoodSubjectId('nbh-peckham')).toBeNull();
  });

  it('composes the area counts and the area activity', async () => {
    mock.onGet('/geo/area').reply(200, {
      data: {
        latitude: 51.47,
        longitude: -0.07,
        radiusKm: 2,
        countryCode: 'GB',
        countryName: 'United Kingdom',
        name: null,
        displayName: 'Within 2 km',
        resourceCounts: { housing: 14, marketplace: 9, jobs: 3 },
        lowerBoundResourceTypes: [],
        unavailableResourceTypes: ['updates'],
        overall: null,
        unavailableDimensions: [],
        costOfLiving: {
          isAvailable: false,
          unavailableReason: 'InsufficientSample',
          sampleSize: 0,
          countrySampleSize: 0,
          overallIndex: null,
          baselineName: null,
          currency: null,
          categories: [],
          freshness: { computedAt: '2026-10-20T09:00:00Z', sourceName: 'Diaspora' },
        },
        safety: { isAvailable: false, score: null, band: null, unavailableReason: 'NoDataSource', counts: [], limitations: [] },
        freshness: { computedAt: '2026-10-20T09:00:00Z', sourceName: 'Diaspora' },
      },
    });
    mock.onGet('/community-life/area/activity').reply(200, {
      data: {
        latitude: 51.47,
        longitude: -0.07,
        radiusKm: 2,
        name: null,
        displayName: 'Within 2 km of you',
        windowDays: 30,
        eventCount: 6,
        upcomingEventCount: 4,
        organizationCount: 5,
        totalRsvps: 31,
        totalAttendances: 0,
        isLowerBound: false,
      },
    });

    const dataset = await fetchPlaceAnalytics({ type: 'neighborhood', id: POINT_ID }, RANGE_30D);

    const area = mock.history.get.find((request) => request.url === '/geo/area')!;
    expect(area.params).toMatchObject({ latitude: 51.47, longitude: -0.07, countryCode: 'GB', radiusKm: 2 });
    const activity = mock.history.get.find((request) => request.url === '/community-life/area/activity')!;
    expect(activity.params).toMatchObject({ latitude: 51.47, longitude: -0.07, radiusKm: 2, windowDays: 30 });

    expect(valueOf(dataset, 'inventory.housing')).toBe(14);
    expect(valueOf(dataset, 'inventory.listings')).toBe(9);
    expect(valueOf(dataset, 'inventory.jobs')).toBe(3);
    expect(valueOf(dataset, 'inventory.events')).toBe(4);
    expect(valueOf(dataset, 'inventory.organizations')).toBe(5);
    expect(valueOf(dataset, 'event.rsvps')).toBe(31);
    // A count the server could not make is unknown, never zero; and nobody
    // checked anyone in, so attendance is absent rather than nought.
    expect(valueOf(dataset, 'inventory.updates')).toBeUndefined();
    expect(valueOf(dataset, 'event.attendance')).toBeUndefined();
    expect(dataset.unavailableMetrics).toEqual(
      expect.arrayContaining(['inventory.updates', 'event.attendance', 'reach.members'])
    );
  });

  it('shows nothing for a catalogue id, and asks no route about it', async () => {
    const dataset = await fetchPlaceAnalytics({ type: 'neighborhood', id: 'nbh-peckham' }, RANGE_30D);

    expect(mock.history.get).toHaveLength(0);
    expect(dataset.metrics).toEqual([]);
    expect(dataset.status).toBe('UNAVAILABLE');
  });
});

describe('access to a place dashboard', () => {
  const ACCESS_ALL_FALSE = {
    data: {
      subject: { type: 'organization', id: 'org-1' },
      canView: false,
      canViewFinancial: false,
      canViewAdministrative: false,
      canCompare: false,
      canExport: false,
      canBuildReports: false,
      supportedRanges: ['last7d', 'last30d'],
      supportedComparisons: ['previousPeriod'],
      restrictedMetrics: ['content_views'],
      reportingTimezone: 'Europe/London',
    },
  };

  it('is the organisation’s own analytics capability, not /analytics/access’s blanket no', async () => {
    mock.onGet('/analytics/access').reply(200, ACCESS_ALL_FALSE);
    mock.onGet('/communities/organizations/org-1/capabilities').reply(200, {
      data: {
        organizationId: 'org-1',
        role: 'Admin',
        canManageMembers: true,
        canApproveMembers: true,
        canManageTiers: true,
        canManageEvents: true,
        canManageCampaigns: true,
        canManageVolunteers: true,
        canManagePolls: true,
        canPublishAnnouncements: true,
        canViewAnalytics: true,
        canViewFinancials: false,
      },
    });

    const access = await fetchPlaceAnalyticsAccess({ type: 'organization', id: 'org-1' });

    expect(access.canView).toBe(true);
    // The platform's restriction list is for its own subjects; it is not applied here.
    expect(access.restrictedMetrics).toEqual([]);
    expect(access.reportingTimezone).toBe('Europe/London');
    expect(access.supportedRanges).toEqual(['last7d', 'last30d']);
    // No place route computes a baseline, an export or a report.
    expect(access.canCompare).toBe(false);
    expect(access.canExport).toBe(false);
    expect(access.supportedComparisons).toEqual([]);
  });

  it('refuses an organisation member who does not hold the capability', async () => {
    mock.onGet('/analytics/access').reply(200, ACCESS_ALL_FALSE);
    mock.onGet('/communities/organizations/org-1/capabilities').reply(200, {
      data: {
        organizationId: 'org-1',
        role: 'Member',
        canManageMembers: false,
        canApproveMembers: false,
        canManageTiers: false,
        canManageEvents: false,
        canManageCampaigns: false,
        canManageVolunteers: false,
        canManagePolls: false,
        canPublishAnnouncements: false,
        canViewAnalytics: false,
        canViewFinancials: false,
      },
    });

    const access = await fetchPlaceAnalyticsAccess({ type: 'organization', id: 'org-1' });
    expect(access.canView).toBe(false);
  });

  it('lets anyone signed in see a country or a neighbourhood, whose counts are public', async () => {
    mock.onGet('/analytics/access').reply(500);

    const country = await fetchPlaceAnalyticsAccess({ type: 'country', id: 'GB' });
    expect(country.canView).toBe(true);
    // The timezone could not be read, so none is claimed.
    expect(country.reportingTimezone).toBeNull();

    const area = await fetchPlaceAnalyticsAccess({ type: 'neighborhood', id: '51.5,-0.1,GB' });
    expect(area.canView).toBe(true);
  });
});
