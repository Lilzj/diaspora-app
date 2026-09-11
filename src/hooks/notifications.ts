// ─────────────────────────────────────────────────────────────────────────────
// The inbox, from the platform — 11 Sep 2026
//
// **The notification screen has always shown fixtures.** `src/store/notifications.ts`
// seeded a Zustand store with "Marcus S. sent a message regarding: Toyota Corolla
// 2018 Hybrid" and four more, and the screen rendered that. Meanwhile
// `lib/notifications-api.ts` — a complete, typed client for the thirteen
// `/notifications` routes B13 serves — had no consumer anywhere in the app.
//
// So nothing the platform has ever sent a member has been visible in the app:
// not a membership decision, not a community notice, and not the "Tell me" an
// automation performs, which is the whole product of the automation feature.
// Found while trying to watch an automation deliver, on the device.
//
// These hooks wrap those routes. There is no second notification system here —
// §26 — and no local store: what the member sees is what the platform holds.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import {
  deleteNotification,
  fetchInbox,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
  recordNotificationClick,
  type InboxParams,
} from '@/lib/notifications-api';
import { useAuthStore } from '@/store/auth';
import type { NotificationResponse } from '@/types/notification';

/** Everything the inbox holds is stale the moment anything is read or removed. */
export function invalidateNotifications(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
}

/**
 * The member's notifications, newest first, a page at a time.
 *
 * `unreadCount` rides along on every page (`NotificationPage`), so the badge and
 * the list cannot disagree — the platform sends them together precisely so a
 * launch is one round trip.
 */
export function useNotificationInbox(params: InboxParams = {}) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useInfiniteQuery({
    queryKey: notificationKeys.inbox(params),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchInbox({ limit: 25, ...params, cursor: pageParam }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: isAuthenticated,
    // Short: an inbox a member opens twice in a minute should not show them a
    // notification they already read on the first visit.
    staleTime: 30_000,
    retry: 1,
  });

  const notifications = useMemo<NotificationResponse[]>(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  );

  return {
    notifications,
    unreadCount: query.data?.pages[0]?.unreadCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasMore: query.hasNextPage,
    isFetchingMore: query.isFetchingNextPage,
    isRefreshing: query.isRefetching,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    refetch: query.refetch,
  };
}

/**
 * The badge count on its own, for screens that show a dot without a list.
 *
 * Separate from the inbox query so a tab bar does not pull a page of
 * notifications it will not render.
 */
export function useUnreadNotificationCount() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => fetchUnreadCount(),
    enabled: isAuthenticated,
    staleTime: 30_000,
    retry: 1,
  });

  return {
    total: query.data?.total ?? 0,
    hasNew: query.data?.hasNew ?? false,
    isLoading: query.isLoading,
  };
}

/** Marks one read. The platform decides what "read" means per channel; this is the inbox. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => invalidateNotifications(queryClient),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => invalidateNotifications(queryClient),
  });
}

/**
 * Removes one from the inbox for good.
 *
 * The screen offers this per row. There is no "delete all" route, and doing it
 * one request per row behind a single button is a lot of deletion to hang on one
 * tap, so the screen no longer offers one.
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => invalidateNotifications(queryClient),
  });
}

/**
 * Tells the platform the member followed one somewhere.
 *
 * Alongside the navigation, never instead of it: the platform records the click
 * and the client owns the routing. A failure here must not stop the member
 * arriving, so the caller fires it and does not wait.
 */
export function useRecordNotificationClick() {
  return useMutation({
    mutationFn: (input: { id: string; actionKey?: string }) =>
      recordNotificationClick(input.id, input.actionKey),
  });
}
