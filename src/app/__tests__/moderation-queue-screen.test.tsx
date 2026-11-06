/**
 * The platform moderation queue asks why before it acts, 6 Nov 2026.
 *
 * Remove, Hide and Dismiss each sent a decision on one tap, with no
 * confirmation and no reason: `POST /community/moderation/decisions` takes both
 * the report and the reason as optional, so nothing stopped a moderator taking
 * down a member's content without saying why.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import type { ModerationQueueItemResponse } from '@/types/community-social';

const mockDecide = jest.fn();

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
  useModerationDecision: () => ({ decide: mockDecide, isPending: false, error: null }),
}));

jest.mock('@/providers/notification-provider', () => ({
  useNotification: () => ({ showAlert: jest.fn(), showToast: jest.fn() }),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockDecide.mockResolvedValue({ decisionId: 'decision-1' });
});

it('sends nothing on a tap, and nothing without a reason', () => {
  renderQueue();

  fireEvent.press(screen.getByRole('button', { name: 'Remove this content' }));
  expect(mockDecide).not.toHaveBeenCalled();
  expect(screen.getByText('Remove this content?')).toBeTruthy();

  const confirm = screen.getByRole('button', { name: 'Confirm: Remove' });
  expect(confirm.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

  fireEvent.changeText(screen.getByLabelText('Reason for this decision'), 'spam');
  fireEvent.press(screen.getByRole('button', { name: 'Confirm: Remove' }));
  expect(mockDecide).not.toHaveBeenCalled();
});

it('sends the decision with the moderator’s reason once there is one', async () => {
  renderQueue();

  fireEvent.press(screen.getByRole('button', { name: 'Hide this content' }));
  fireEvent.changeText(
    screen.getByLabelText('Reason for this decision'),
    '  Sells visa appointments for cash; three members reported it.  '
  );
  fireEvent.press(screen.getByRole('button', { name: 'Confirm: Hide' }));

  await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(1));
  expect(mockDecide).toHaveBeenCalledWith({
    contentType: 'post',
    contentId: ITEM.contentId,
    action: 'hide',
    reason: 'Sells visa appointments for cash; three members reported it.',
  });
});

it('lets the moderator back out without deciding anything', () => {
  renderQueue();

  fireEvent.press(screen.getByRole('button', { name: 'Dismiss reports this content' }));
  fireEvent.press(screen.getByRole('button', { name: 'Cancel this decision' }));

  expect(mockDecide).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Remove this content' })).toBeTruthy();
});
