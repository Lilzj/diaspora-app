/**
 * The platform moderation queue in the app shows what is waiting and decides nothing (7 Nov 2026).
 *
 * On 6 Nov it sent a decision on one tap with no reason; stage 1 put a confirmation and a required
 * reason in front of it. Since stage 5, staff decide reported content only on its Trust case in the
 * staff console, where a reason code and a note are required, a removal needs a second member of
 * staff, and the owner is told. Community's decision route this screen posted to is gone.
 *
 * The row is the server's record (RMD-009). It was cast from the client's own shape until then —
 * `reasons`, `firstReportedAt`, `lastReportedAt`, none of them sent — and the screen mapped the
 * absent `reasons`, so it threw on the first row a server returned. A row carries its reports.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import type { ModerationQueueItemResponse, ReportResponse } from '@/types/community-social';

const POST_ID = '01a0a162-7d03-7a7f-a613-9fe144d60600';
const LOADED_AT = Date.now();

function hoursAgo(hours: number): string {
  return new Date(LOADED_AT - hours * 60 * 60 * 1000).toISOString();
}

function report(reportId: string, reasonCode: string, createdAt: string): ReportResponse {
  return {
    reportId,
    reporterId: '33333333-0000-4000-8000-000000000033',
    reporterName: null,
    contentType: 'post',
    contentId: POST_ID,
    reasonCode,
    description: null,
    evidenceUrl: null,
    status: 'open',
    resolvedBy: null,
    resolutionNote: null,
    createdAt,
    resolvedAt: null,
  };
}

const mockItem: ModerationQueueItemResponse = {
  contentType: 'post',
  contentId: POST_ID,
  title: 'Cheap visas, message me',
  authorId: '44444444-0000-4000-8000-000000000044',
  authorName: null,
  authorLevel: null,
  aiReview: null,
  reportCount: 3,
  reports: [
    report('r-1', 'spam', hoursAgo(3)),
    report('r-2', 'harassment', hoursAgo(1)),
    report('r-3', 'spam', hoursAgo(2)),
  ],
  status: 'open',
  // The first report, which is what the server sends here.
  createdAt: hoursAgo(3),
};

jest.mock('@/hooks/community-social', () => ({
  useModerationQueue: () => ({
    items: [mockItem],
    isLoading: false,
    error: null,
    isEmpty: false,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/components/layout/bottom-inset', () => ({ useBottomInset: () => 0 }));

// eslint-disable-next-line import/first
import ModerationQueueScreen from '../moderation/queue';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderQueue() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ModerationQueueScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

it('shows what is waiting, with its reports', () => {
  renderQueue();

  expect(screen.getByText('Cheap visas, message me')).toBeTruthy();
  expect(screen.getByText('3 reports')).toBeTruthy();
});

it('reads the reasons from the reports, each once', () => {
  renderQueue();

  expect(screen.getAllByText('Spam')).toHaveLength(1);
  expect(screen.getByText('Harassment')).toBeTruthy();
});

it('reads the first report from the row and the last from its reports', () => {
  renderQueue();

  // The last report is the latest, not the last in the list.
  expect(screen.getByText(/First reported 3h ago · last 1h ago/)).toBeTruthy();
});

it('offers no decision, and says where decisions are made', () => {
  renderQueue();

  expect(screen.queryByLabelText('Remove this content')).toBeNull();
  expect(screen.queryByLabelText('Hide this content')).toBeNull();
  expect(screen.queryByLabelText('Dismiss reports this content')).toBeNull();
  expect(screen.getByText(/Decide this in the staff console, on its case/)).toBeTruthy();
});
