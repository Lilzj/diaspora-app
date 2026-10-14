import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocationStore } from '@/store/location';
import { useNotification } from '@/providers/notification-provider';

const STORAGE_KEY = 'diaspora_location_permission';

/**
 * Asks for location once, on first run, using the application's own alert.
 *
 * This used to live directly in `RootLayout`, which renders `<AppProvider>` —
 * so it sat *outside* the `NotificationProvider` that provider mounts, and
 * `useNotification` throws when there is nothing above it. That left it as the
 * one place in the app that had to raise Android's system dialog instead of the
 * designed modal (F-035).
 *
 * Moving it into the provider tree removes that exception: the prompt is now
 * the same modal as every other alert in the product.
 *
 * Renders nothing. It exists to own an effect that needs provider context.
 */
export function StartupLocationPrompt() {
  const { showAlert } = useNotification();
  const setPermissionStatus = useLocationStore((s) => s.setPermissionStatus);
  const detectLocation = useLocationStore((s) => s.detectLocation);
  const syncPermissionStatus = useLocationStore((s) => s.syncPermissionStatus);

  // The prompt is a first-run decision, not a per-mount one. Without this guard
  // a remount would ask again after the member had already answered.
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;

    const grant = async () => {
      try {

        // Not `setPermissionStatus('granted')` first. Tapping Allow on *this*
        // prompt is consent to be asked; the OS has not been asked yet, and it
        // may still be refused. `detectLocation` reports what actually happened
        // and sets the status from that.
        // `prompt`: this is the member tapping Allow, so Android is asked now.
        await detectLocation({ prompt: true });
      } catch (err) {
        console.error('Startup location detection failed', err);
      }
      // What Android answered, not what was tapped here: Allow followed by a
      // refusal in the system dialog is a refusal, and is not asked again.
      await syncPermissionStatus();
      const granted = useLocationStore.getState().permissionStatus === 'granted';
      await AsyncStorage.setItem(STORAGE_KEY, granted ? 'granted' : 'denied').catch(() => undefined);
    };

    const deny = async () => {
      setPermissionStatus('denied');
      await AsyncStorage.setItem(STORAGE_KEY, 'denied');
    };

    const run = async () => {
      // ── The device's answer first (14 Oct 2026) ─────────────────────────────
      //
      // This used to go by what the member tapped on this prompt, stored in the
      // app's data. That data survives app updates, and it is not the
      // permission: a member who granted location in Android was still asked,
      // and one who removed it in Settings was never asked again. Now: granted
      // on the device means no prompt, ever. Removed in Settings after being
      // granted means one more prompt.
      await syncPermissionStatus();
      if (useLocationStore.getState().permissionStatus === 'granted') {
        await AsyncStorage.setItem(STORAGE_KEY, 'granted').catch(() => undefined);
        await detectLocation().catch(() => undefined);
        return;
      }

      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'granted') {
          // Granted once, removed in Settings since: ask again, once.
          await AsyncStorage.removeItem(STORAGE_KEY);
        } else if (saved === 'denied') {
          setPermissionStatus('denied');
          return;
        }
      } catch (err) {
        console.error('Failed to read location permission from AsyncStorage', err);
      }

      // `window.confirm` on web: the designed modal is a React Native view, and
      // the web build still needs a blocking prompt here.
      if (Platform.OS === 'web') {
        const accept = window.confirm(
          'Allow Diaspora to access your location?\n\nWe use your location to show nearby providers, jobs, housing, and community events.'
        );
        if (accept) await grant();
        else await deny();
        return;
      }

      showAlert({
        type: 'question',
        title: 'Allow Diaspora to access your location?',
        message:
          'We use your location to show nearby providers, jobs, housing, and community events.',
        // ── Short enough to fit the button ────────────────────────────────
        //
        // These were "Don't Allow" and "Allow While Using App". Two buttons
        // side by side get roughly half the dialog each, and twenty-one
        // characters uppercased does not fit in half a phone width — the label
        // wrapped to two lines inside its own button, which is what the report
        // called text not aligned in its card.
        //
        // The long form was borrowed from Android's own permission dialog,
        // where it is the full width of the sheet. This is an in-app question
        // asked *before* that one, and it only has to be unambiguous.
        buttons: [
          { text: 'Not now', style: 'cancel', onPress: () => void deny() },
          { text: 'Allow', onPress: () => void grant() },
        ],
      });
    };

    // A short delay so the first screen has drawn before the prompt covers it.
    const timer = setTimeout(() => void run(), 500);
    return () => clearTimeout(timer);
  }, [showAlert, setPermissionStatus, detectLocation, syncPermissionStatus]);

  return null;
}
