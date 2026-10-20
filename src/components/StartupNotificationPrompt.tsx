import { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { readPushPermission, registerPushToken, requestPushPermission } from '@/lib/integrations/push-lifecycle';
import { useAuthStore } from '@/store/auth';
import { useNotification } from '@/providers/notification-provider';
import { whenLocationPromptSettled } from './StartupLocationPrompt';

/**
 * What the member last decided here: `granted`, or `declined` ("Not now").
 * Before 16 Oct 2026 the key held `yes` for any answer; that reads as declined.
 */
const STORAGE_KEY = 'diaspora_notification_prompt_answered';

const MESSAGE =
  'Diaspora tells you when someone messages you, when your verification is decided, and when something you follow changes.';

/**
 * Asks at first launch whether Diaspora may send notifications, right after the
 * location question, the same way.
 *
 * - Allowed on the device: never asked.
 * - Never answered: asked once. If Android has blocked the app's notifications
 *   (it can, before the app ever asks), the question offers the phone's
 *   settings instead, since only there can it be turned back on.
 * - Allowed once and removed in the phone's settings since: asked once more.
 * - "Not now": not asked again; Settings, Notifications stays the way back.
 *
 * Changed 16 Oct 2026. It was asked only after sign-in and only while Android
 * still said "not asked", so a phone that had blocked the app was never asked at
 * all: a tester found notifications on in the app and Blocked in Android, and no
 * push reached them. Push registration follows sign-in on its own
 * (`_layout.tsx`), so the permission can be settled before there is an account.
 *
 * Renders nothing. Mounted inside the notification provider.
 */
export function StartupNotificationPrompt() {
  const { showAlert } = useNotification();
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current || Platform.OS === 'web') return undefined;
    asked.current = true;
    let cancelled = false;

    void (async () => {
      // One alert at a time: location first.
      await whenLocationPromptSettled();
      // Let the location alert close before this one opens.
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (cancelled) return;

      let saved: string | null = null;
      let permission: string;
      try {
        saved = await AsyncStorage.getItem(STORAGE_KEY);
        permission = (await readPushPermission()).permission;
      } catch {
        return;
      }

      const remember = (answer: 'granted' | 'declined') =>
        AsyncStorage.setItem(STORAGE_KEY, answer).catch(() => undefined);

      if (permission === 'granted') {
        await remember('granted');
        return;
      }
      if (permission === 'unavailable') return;
      // Answered "Not now" before (`yes` is the old key's answer): not again.
      if (saved === 'declined' || saved === 'yes') return;

      // Blocked by Android: asking again shows nothing, so offer the settings.
      if (permission === 'blocked') {
        showAlert({
          type: 'question',
          title: 'Notifications are turned off',
          message: `${MESSAGE} Your phone has blocked them for Diaspora; you can allow them in its settings.`,
          buttons: [
            { text: 'Not now', style: 'cancel', onPress: () => void remember('declined') },
            {
              text: 'Settings',
              onPress: () => {
                void remember('declined');
                void Linking.openSettings().catch(() => undefined);
              },
            },
          ],
        });
        return;
      }

      showAlert({
        type: 'question',
        title: 'Turn on notifications?',
        message: MESSAGE,
        buttons: [
          { text: 'Not now', style: 'cancel', onPress: () => void remember('declined') },
          {
            text: 'Turn on',
            onPress: () =>
              void (async () => {
                const answer = await requestPushPermission();
                const granted = answer.permission === 'granted';
                await remember(granted ? 'granted' : 'declined');
                // Signed in already: register now rather than on the next return.
                const memberId = useAuthStore.getState().user?.userId;
                if (granted && memberId && useAuthStore.getState().isAuthenticated) {
                  await registerPushToken(memberId).catch(() => undefined);
                }
              })(),
          },
        ],
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [showAlert]);

  return null;
}
