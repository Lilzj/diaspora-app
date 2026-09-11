/**
 * The inbox shows what the platform sent — 11 Sep 2026.
 *
 * It used to show five hardcoded fixtures from a Zustand store, while the typed
 * client for the thirteen `/notifications` routes sat unused. So no notification
 * the platform had ever sent a member could be seen in the app — including the
 * "Tell me" that is the whole product of an automation.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import type { NotificationResponse } from '@/types/notification';

const mockInbox = jest.fn();
const mockMarkRead = jest.fn();
const mockMarkAllRead = jest.fn();
const mockDelete = jest.fn();
const mockRecordClick = jest.fn();
const mockFollowRoute = jest.fn((_route: string) => true);

jest.mock('@/hooks/notifications', () => ({
  useNotificationInbox: () => mockInbox(),
  useMarkNotificationRead: () => ({ mutate: mockMarkRead, isPending: false }),
  useMarkAllNotificationsRead: () => ({ mutate: mockMarkAllRead, isPending: false }),
  useDeleteNotification: () => ({ mutate: mockDelete, isPending: false }),
  useRecordNotificationClick: () => ({ mutate: mockRecordClick, isPending: false }),
}));

jest.mock('@/lib/notification-routes', () => ({
  ...jest.requireActual('@/lib/notification-routes'),
  followNotificationRoute: (route: string) => mockFollowRoute(route),
}));

jest.mock('@/hooks/usePullToRefresh', () => ({ useRefreshControl: () => undefined }));
jest.mock('@/components/layout/bottom-inset', () => ({ useBottomInset: () => 0 }));
jest.mock('@/providers/notification-provider', () => ({
  useNotification: () => ({ showAlert: jest.fn(), showToast: jest.fn() }),
}));

// eslint-disable-next-line import/first
import NotificationsScreen from '../notifications';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function notification(overrides: Partial<NotificationResponse> = {}): NotificationResponse {
  return {
    id: 'n1',
    title: 'Your community reached 10 members',
    body: 'Diaspora QA Walkthrough reached 10 members.',
    category: 'Community',
    categoryKey: 'community',
    isRead: false,
    createdAt: '2026-09-11T15:30:00.000Z',
    targetRoute: '/community/diaspora-qa-walkthrough',
    priority: 'Normal',
    status: 'Delivered',
    isArchived: false,
    isPinned: false,
    isStarred: false,
    sourceModule: 'Automation',
    actions: [],
    ...overrides,
  };
}

function inbox(overrides: Record<string, unknown> = {}) {
  mockInbox.mockReturnValue({
    notifications: [notification()],
    unreadCount: 1,
    isLoading: false,
    isError: false,
    hasMore: false,
    isFetchingMore: false,
    loadMore: jest.fn(),
    refetch: jest.fn(),
    ...overrides,
  });
}

function renderScreen() {
  // The screen invalidates caches when a notification means something moved.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <NotificationsScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockMarkRead.mockReset();
  mockMarkAllRead.mockReset();
  mockDelete.mockReset();
  mockRecordClick.mockReset();
  mockFollowRoute.mockClear();
});

describe('the inbox', () => {
  it('renders what the platform sent', () => {
    inbox();
    renderScreen();

    expect(screen.getByText('Your community reached 10 members')).toBeTruthy();
    // The fixtures that used to be here.
    expect(screen.queryByText(/Toyota Corolla/)).toBeNull();
  });

  it('marks one read and follows it where the platform pointed', () => {
    inbox();
    renderScreen();

    fireEvent.press(screen.getByText('Your community reached 10 members'));

    expect(mockMarkRead).toHaveBeenCalledWith('n1');
    expect(mockRecordClick).toHaveBeenCalledWith({ id: 'n1' });
    expect(mockFollowRoute).toHaveBeenCalledWith('/community/diaspora-qa-walkthrough');
  });

  it('does not mark an already-read one read again', () => {
    inbox({ notifications: [notification({ isRead: true })] });
    renderScreen();

    fireEvent.press(screen.getByText('Your community reached 10 members'));

    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('offers "mark all as read" only while something is unread', () => {
    inbox({ notifications: [notification({ isRead: true })] });
    renderScreen();

    expect(screen.queryByLabelText('Mark all notifications as read')).toBeNull();
  });

  it('says the inbox could not be read, rather than "all caught up"', () => {
    // An empty state over a failed request is a lie the member acts on.
    inbox({ notifications: [], isError: true });
    renderScreen();

    expect(screen.getByText('Your notifications could not be loaded')).toBeTruthy();
    expect(screen.queryByText('No notifications')).toBeNull();
  });

  it('shows the empty state when the platform really has nothing', () => {
    inbox({ notifications: [] });
    renderScreen();

    expect(screen.getByText('No notifications')).toBeTruthy();
  });
});

describe('no second notification system', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string; existsSync(p: string): boolean };
  const path = require('path') as { join(...s: string[]): string };

  it('the fixture store is gone', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'src', 'store', 'notifications.ts'))).toBe(false);
  });

  it('the screen reads the platform', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'notifications.tsx'),
      'utf8'
    );

    expect(source).toMatch(/useNotificationInbox/);
    expect(source).not.toMatch(/useNotificationStore/);
  });
});
