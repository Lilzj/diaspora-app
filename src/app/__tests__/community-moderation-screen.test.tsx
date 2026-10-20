/**
 * A community's own moderation queue, against what the real route serves —
 * 20 Oct 2026.
 *
 * The queue used to read a simulated route that knew five statuses and four
 * decisions. The real one (`GET /communities/{idOrSlug}/reports`) has no stored
 * "under review" state and refuses "warn", so a tab that could only ever be
 * empty and a button that always failed are gone; only an Open report can be
 * decided, and the queue pages by the server's cursor.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ThemeProvider } from '@/design-system';
import type { CommunityReport } from '@/types/community-directory';

const mockReports = jest.fn();
const mockDecide = jest.fn();
const mockMutate = jest.fn();

jest.mock('@/hooks/communities', () => ({
  useCommunity: () => ({ data: { id: 'c1', slug: 'nigerians', name: 'Nigerians in Leeds', origin: {}, identity: {} } }),
  useCommunityCapabilities: () => ({
    isLoading: false,
    data: { communityId: 'c1', roles: ['Moderator'], canViewModerationQueue: true, canReviewReports: true },
  }),
  useCommunityReports: (...args: unknown[]) => mockReports(...args),
  useModerationDecision: () => mockDecide(),
}));

// eslint-disable-next-line import/first
import CommunityModerationScreen from '../community/[slug]/moderation';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function report(id: string, status: CommunityReport['status']): CommunityReport {
  return {
    id,
    communityId: 'c1',
    status,
    reason: 'Spam',
    contentType: 'post',
    contentId: `content-${id}`,
    contentExcerpt: 'Buy now',
    reporterCount: 2,
    createdAt: '2026-10-19T10:00:00Z',
  };
}

function given(reports: CommunityReport[], extra: Record<string, unknown> = {}) {
  const loadMore = jest.fn();
  mockReports.mockReturnValue({
    data: reports,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    hasMore: false,
    loadMore,
    isLoadingMore: false,
    isSimulated: false,
    unavailable: null,
    ...extra,
  });
  mockDecide.mockReturnValue({ mutate: mockMutate, isPending: false, error: null });
  return { loadMore };
}

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <CommunityModerationScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ slug: 'nigerians' });
});

describe('the community moderation queue', () => {
  it('offers the four statuses the server stores, and no "under review" tab', () => {
    given([]);
    renderScreen();

    for (const tab of ['Open', 'Escalated', 'Actioned', 'Dismissed']) {
      expect(screen.getByRole('tab', { name: `Show ${tab} reports` })).toBeTruthy();
    }
    expect(screen.queryByText('Under review')).toBeNull();
    expect(mockReports).toHaveBeenCalledWith('c1', 'Open');
  });

  it('offers dismiss, remove and escalate on an Open report — never warn', () => {
    given([report('r1', 'Open')]);
    renderScreen();

    expect(screen.getByRole('button', { name: 'Dismiss this report' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove this report' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Escalate this report' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Warn this report' })).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Escalate this report' }));
    expect(mockMutate).toHaveBeenCalledWith(
      { reportId: 'r1', decision: 'escalate' },
      expect.anything()
    );
  });

  it('offers no decision on an escalated report — it is the platform’s now', () => {
    given([report('r2', 'Escalated')]);
    renderScreen();

    expect(screen.queryByRole('button', { name: 'Dismiss this report' })).toBeNull();
  });

  it('pages by the server’s cursor', () => {
    const { loadMore } = given([report('r1', 'Open')], { hasMore: true });
    renderScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Show more reports' }));
    expect(loadMore).toHaveBeenCalled();
  });

  it('does not call an unanswered decision a refusal', () => {
    given([report('r1', 'Open')]);
    mockDecide.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: { isIndeterminate: true, message: 'timeout' },
    });
    renderScreen();

    expect(screen.getByText(/It may have been applied/)).toBeTruthy();
  });

  it('shows an unanswered queue as an error, never as an empty one', () => {
    given([], { isError: true, unavailable: 'error' });
    renderScreen();

    expect(screen.getByTestId('community-unavailable-error')).toBeTruthy();
    expect(screen.queryByTestId('community-unavailable-empty')).toBeNull();
  });
});
