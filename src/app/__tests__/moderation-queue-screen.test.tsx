/**
 * The platform moderation queue in the app shows what is waiting and decides nothing (7 Nov 2026).
 *
 * On 6 Nov it sent a decision on one tap with no reason; stage 1 put a confirmation and a required
 * reason in front of it. Since stage 5, staff decide reported content only on its Trust case in the
 * staff console, where a reason code and a note are required, a removal needs a second member of
 * staff, and the owner is told. Community's decision route this screen posted to is gone.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import type { ModerationQueueItemResponse } from '@/types/community-social';

const ITEM: ModerationQueueItemResponse = {
  contentType: 'post',
  contentId: '01a0a162-7d03-7a7f-a613-9fe144d60600',
  title: 'Cheap visas, message me',
  reportCount: 3,
  reasons: ['spam'],
  firstReportedAt: '2026-11-06T08:00:00.000Z',
  lastReportedAt: '2026-11-06T09:00:00.000Z',
  status: 'Open',
  reporterName: null,
  authorName: null,
  authorLevel: null,
} as ModerationQueueItemResponse;

jest.mock('@/hooks/community-social', () => ({
  useModerationQueue: () => ({
    items: [ITEM],
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

it('offers no decision, and says where decisions are made', () => {
  renderQueue();

  expect(screen.queryByLabelText('Remove this content')).toBeNull();
  expect(screen.queryByLabelText('Hide this content')).toBeNull();
  expect(screen.queryByLabelText('Dismiss reports this content')).toBeNull();
  expect(screen.getByText(/Decide this in the staff console, on its case/)).toBeTruthy();
});
