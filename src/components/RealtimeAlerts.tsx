import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { getRealtimeClient } from '@/lib/realtime';
import { followNotificationRoute } from '@/lib/notification-routes';
import { notificationKeys } from '@/lib/notifications-api';
import { pushProvider } from '@/lib/integrations/push-lifecycle';
import { setForegroundPresentation } from '@/lib/integrations/providers/push';
import { sameUser } from '@/lib/conversation-identity';
import { useAuthStore } from '@/store/auth';
import { useConversationStore } from '@/store/conversation';
import { useNotification } from '@/providers/notification-provider';

/** A notification about a message names its sender; give it a moment to arrive. */
const MESSAGE_FALLBACK_DELAY_MS = 2500;

/** The push tap already followed, so a cold start does not follow it again. */
const LAST_TAP_KEY = 'diaspora_last_notification_tap';

/**
 * Tells a member, on whatever screen they are on, that something arrived.
 *
 * Added 16 Oct 2026. A member messaged about a job saw nothing while they used
 * the app: no banner, and no count on the Messages tab until they opened it.
 * The server already sent everything needed over the member's own socket (the
 * notification, the inbox count, the conversation unread total); the app only
 * listened while the Messages tab was open, and dropped three of those frames
 * even then.
 *
 * While signed in this keeps the app's one realtime connection open and:
 * - shows each new notification as a tappable toast, unless the member is
 *   already looking at what it points to;
 * - for a message whose notification was collapsed (the server sends at most
 *   one per conversation every few minutes), still says a message arrived;
 * - keeps the Messages badge and the Home bell on the server's own counts;
 * - opens the right screen when a push notification is tapped.
 *
 * Renders nothing. Mounted inside the notification provider.
 */
export function RealtimeAlerts() {
  const { showToast } = useNotification();
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => (state.isAuthenticated ? state.user?.userId ?? null : null));
  const pathname = usePathname();

  // Read inside socket handlers, which outlive any one render.
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (!userId) return undefined;

    const client = getRealtimeClient(userId);
    const conversations = useConversationStore.getState();
    const isViewing = (route: string | null | undefined) =>
      !!route && pathRef.current?.toLowerCase() === route.toLowerCase();

    // A message is announced once: by its notification when one comes, else here.
    const announced = new Set<string>();
    const pending = new Map<string, ReturnType<typeof setTimeout>>();

    const offNotification = client.onNotification((notification) => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      const route = notification.targetRoute;
      if (route) {
        announced.add(route.toLowerCase());
        const timer = pending.get(route.toLowerCase());
        if (timer) {
          clearTimeout(timer);
          pending.delete(route.toLowerCase());
        }
      }
      if (isViewing(route)) return;
      showToast({
        type: 'info',
        title: notification.title,
        message: notification.body || undefined,
        duration: 5000,
        onPress: route ? () => void followNotificationRoute(route) : undefined,
      });
    });

    const offMessage = client.onMessage((message) => {
      if (sameUser(message.senderId, userId)) return;
      const route = `/conversation/${message.conversationId}`;
      const key = route.toLowerCase();
      if (isViewing(route) || pending.has(key)) return;
      pending.set(
        key,
        setTimeout(() => {
          pending.delete(key);
          if (announced.has(key)) {
            // Its notification already said so; the next one may not.
            announced.delete(key);
            return;
          }
          if (isViewing(route)) return;
          showToast({
            type: 'info',
            title: 'New message',
            message: message.text?.trim() || undefined,
            duration: 5000,
            onPress: () => void followNotificationRoute(route),
          });
        }, MESSAGE_FALLBACK_DELAY_MS)
      );
    });

    const offUnread = client.onConversationUnread(({ total }) => conversations.setUnreadTotal(total));
    const offInbox = client.onInboxCount(() =>
      void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() })
    );

    // A reconnect may have missed frames: ask for the counts again.
    let wasConnected = false;
    const offState = client.onConnectionStateChange((state) => {
      if (state === 'connected' && !wasConnected) {
        void useConversationStore.getState().refreshUnreadTotal();
        void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
      }
      wasConnected = state === 'connected';
    });

    void useConversationStore.getState().refreshUnreadTotal();
    client.connect().catch(() => {
      // No socket: the push and the counts fetched on return still work.
    });

    // Coming back to the app re-counts; frames sent while away were not seen.
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void useConversationStore.getState().refreshUnreadTotal();
        client.connect().catch(() => undefined);
      }
    });

    // While the socket is up it announces in-app; a push banner would say it twice.
    setForegroundPresentation(() => client.getConnectionState() !== 'connected');

    // The last tap is replayed on every cold start (so a tap that launched the
    // app is not lost); following it twice would reopen an old screen each launch.
    const offTap = pushProvider().onNotificationTapped((payload) => {
      if (!payload.targetRoute) return;
      const tapKey = payload.notificationId ?? `${payload.targetRoute}|${payload.title ?? ''}`;
      void (async () => {
        try {
          if ((await AsyncStorage.getItem(LAST_TAP_KEY)) === tapKey) return;
          await AsyncStorage.setItem(LAST_TAP_KEY, tapKey);
        } catch {
          // Storage unavailable: following twice beats not following.
        }
        followNotificationRoute(payload.targetRoute);
      })();
    });

    return () => {
      offNotification();
      offMessage();
      offUnread();
      offInbox();
      offState();
      offTap();
      appState.remove();
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, [userId, queryClient, showToast]);

  return null;
}
