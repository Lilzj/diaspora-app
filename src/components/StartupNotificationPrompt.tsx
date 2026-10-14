import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { readPushPermission, registerPushToken, requestPushPermission } from '@/lib/integrations/push-lifecycle';
import { useAuthStore } from '@/store/auth';
import { useNotification } from '@/providers/notification-provider';

const STORAGE_KEY = 'diaspora_notification_prompt_answered';

/**
 * Asks once, after sign-in, whether Diaspora may send notifications.
 *
 * Added 14 Oct 2026. Nothing asked: the permission was requested only from
 * Settings, Integrations, Push, so on Android 13 and later a fresh install sat
 * at "Notifications: Blocked" and no push (a verification decision, a message)
 * could reach anybody. Push registration on sign-in (`_layout.tsx`) never asks
 * either, by design: it registers only once permission exists.
 *
 * Asked after sign-in rather than at first launch: a notification is about the
 * member's account, and a stranger on the welcome screen has none yet. Asked
 * once; Settings stays the place to change it.
 *
 * Renders nothing. Mounted inside the notification provider.
 */
export function StartupNotificationPrompt() {
  const { showAlert } = useNotification();
  const memberId = useAuthStore((state) => (state.isAuthenticated ? state.user?.userId ?? null : null));
  const asked = useRef(false);

  useEffect(() => {
    if (!memberId || asked.current) return undefined;
    asked.current = true;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          if ((await AsyncStorage.getItem(STORAGE_KEY)) === 'yes') return;
          if ((await readPushPermission()).permission !== 'notRequested') return;
        } catch {
          return;
        }

        const answered = () => AsyncStorage.setItem(STORAGE_KEY, 'yes').catch(() => undefined);

        showAlert({
          type: 'question',
          title: 'Turn on notifications?',
          message:
            'Diaspora tells you when your verification is decided, when someone messages you, and when something you follow changes.',
          buttons: [
            { text: 'Not now', style: 'cancel', onPress: () => void answered() },
            {
              text: 'Turn on',
              onPress: () =>
                void (async () => {
                  await answered();
                  const permission = await requestPushPermission();
                  if (permission.permission === 'granted') {
                    await registerPushToken(memberId).catch(() => undefined);
                  }
                })(),
            },
          ],
        });
      })();
    }, 1500);

    return () => clearTimeout(timer);
  }, [memberId, showAlert]);

  return null;
}
