/**
 * The creator dashboard, as a member meets it — 14 Sep 2026.
 *
 * Two defects found by tapping through the app rather than opening screens by
 * link, both on `/creator/analytics`:
 *
 *   1. **Unmeasured figures were drawn as "0".** The summary carries reach, the
 *      follower total, profile views and revenue and names them in
 *      `unavailableMetrics`; the screen drew a tile for every metric anyway, while
 *      reach's own definition says it "is not zero".
 *   2. **No row opened anything.** Every content row was a button whose press
 *      recorded a telemetry event and stopped, so no item's analytics page could
 *      be reached from inside the app.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ThemeProvider } from '@/design-system';
import type { CreatorContentPerformance, CreatorMetric } from '@/types/creator-economy';

const mockAnalytics = jest.fn();
const mockContent = jest.fn();
const mockTrack = jest.fn();

jest.mock('@/hooks/creator-economy', () => ({
  useCreatorAnalytics: () => mockAnalytics(),
  useContentPerformance: () => mockContent(),
  useCreatorAccess: () => ({ creatorStatus: 'Active', isLoading: false }),
}));

jest.mock('@/lib/creator-access', () => ({
  ...jest.requireActual('@/lib/creator-access'),
  checkCreatorAccess: () => null,
}));

jest.mock('@/lib/creator-analytics', () => ({
  ...jest.requireActual('@/lib/creator-analytics'),
  trackCreatorEvent: (...args: unknown[]) => mockTrack(...args),
}));

jest.mock('@/store/auth', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ isAuthenticated: true, user: { accountState: 'Active' } }),
}));

jest.mock('@/hooks/usePullToRefresh', () => ({ useRefreshControl: () => undefined }));
jest.mock('@/components/layout/bottom-inset', () => ({ useBottomInset: () => 0 }));

// eslint-disable-next-line import/first
import CreatorAnalyticsScreen from '../creator/analytics';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function metric(key: string, label: string, value: number, definition: string): CreatorMetric {
  return { key, label, value, format: 'count', higherIsBetter: true, definition };
}

/** What `GET /analytics/creators/me/summary` served Aisha on 14 Sep 2026, in the client's shape. */
const SUMMARY_METRICS: CreatorMetric[] = [
  metric('content_views', 'Views', 1, 'People who opened something you published.'),
  metric('reach', 'Reach', 0, 'This platform does not record impressions, so reach is not measured — it is not zero.'),
  metric('saves', 'Saves', 0, 'Times somebody saved one of your items to come back to.'),
  metric('content_published', 'Published', 4, 'Items you published in the period.'),
  metric('followers', 'Followers', 0, 'Not measured on this deployment.'),
  metric('profile_views', 'Profile views', 0, 'Not measured on this deployment.'),
  metric('revenue', 'Revenue', 0, 'Not measured on this deployment.'),
];

const UNMEASURED = ['reach', 'followers', 'profile_views', 'revenue'];

const LISTING = '01a05769-bbbb-7448-bb77-45d7c85b339d';
const JOB = '6c1f0d4e-2a7b-4f39-9e85-3b2d7c6a1e04';
const PROVIDER = 'c4e8a2d6-7b1f-4a93-8e05-2d9b6f3c1a57';

function row(contentId: string, contentType: string, title: string): CreatorContentPerformance {
  return {
    contentId,
    contentType,
    title,
    status: 'Available',
    publishedAt: '2026-08-31T10:00:00.000Z',
    metrics: [{ key: 'content_views', label: 'Views', value: 1, format: 'count' }],
    isSponsored: false,
  };
}

function givenDashboard(unavailableMetrics: string[] = UNMEASURED) {
  mockAnalytics.mockReturnValue({
    summary: {
      range: { period: '30d', from: null, to: null },
      metrics: SUMMARY_METRICS,
      series: [],
      generatedAt: '2026-09-14T10:00:00.000Z',
      freshnessNote: null,
    },
    unavailableMetrics,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    isSimulated: false,
    isEnabled: true,
  });

  mockContent.mockReturnValue({
    items: [
      row(LISTING, 'Marketplace', 'Hand-woven vacoas basket set, Port Louis'),
      row(JOB, 'Job', 'Care assistant, Curepipe'),
      row(PROVIDER, 'Provider', 'Harbour Plumbing'),
    ],
    isLoading: false,
    isError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
    isSimulated: false,
    isEnabled: true,
  });
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <CreatorAnalyticsScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  (router.push as jest.Mock).mockClear();
  mockTrack.mockClear();
});

describe('figures the platform does not measure', () => {
  it('are not drawn as tiles reading 0', () => {
    givenDashboard();
    renderScreen();

    // A tile's label starts "<Label>: <value>".
    expect(screen.queryByLabelText(/^Reach: 0/)).toBeNull();
    expect(screen.queryByLabelText(/^Followers: 0/)).toBeNull();
    expect(screen.queryByLabelText(/^Profile views: 0/)).toBeNull();
    expect(screen.queryByLabelText(/^Revenue: 0/)).toBeNull();
  });

  it('keep every figure that is measured, zeros included', () => {
    givenDashboard();
    renderScreen();

    expect(screen.getByLabelText(/^Views: 1/)).toBeTruthy();
    // A real zero is still a figure.
    expect(screen.getByLabelText(/^Saves: 0/)).toBeTruthy();
    expect(screen.getByLabelText(/^Published: 4/)).toBeTruthy();
  });

  it('are named, and each still opens the definition that says why', () => {
    givenDashboard();
    renderScreen();

    const reach = screen.getByLabelText('Reach: not measured yet. Double tap to see why.');
    expect(screen.getByLabelText('Revenue: not measured yet. Double tap to see why.')).toBeTruthy();

    fireEvent.press(reach);

    expect(screen.getByText(/reach is not measured — it is not zero/)).toBeTruthy();
  });

  it('draws every figure when the platform names none as unmeasured', () => {
    givenDashboard([]);
    renderScreen();

    expect(screen.getByLabelText(/^Reach: 0/)).toBeTruthy();
    expect(screen.queryByText(/Not measured yet, so not shown as a number/)).toBeNull();
  });
});

describe('the content list', () => {
  it('opens a listing’s own analytics page', () => {
    givenDashboard();
    renderScreen();

    fireEvent.press(screen.getByLabelText(/^Hand-woven vacoas basket set, Port Louis/));

    expect(router.push).toHaveBeenCalledWith(`/analytics/content/listing/${LISTING}`);
    expect(mockTrack).toHaveBeenCalledWith(
      'creator.analytics.content_viewed',
      expect.objectContaining({ contentId: LISTING, contentType: 'Marketplace' })
    );
  });

  it('opens a job’s own analytics page', () => {
    givenDashboard();
    renderScreen();

    fireEvent.press(screen.getByLabelText(/^Care assistant, Curepipe/));

    expect(router.push).toHaveBeenCalledWith(`/analytics/content/job/${JOB}`);
  });

  it('does not offer a provider profile, which has no page of its own, as a button', () => {
    givenDashboard();
    renderScreen();

    const provider = screen.getByLabelText(/^Harbour Plumbing/);
    expect(provider.props.accessibilityRole).not.toBe('button');

    fireEvent.press(provider);
    expect(router.push).not.toHaveBeenCalled();
  });
});
