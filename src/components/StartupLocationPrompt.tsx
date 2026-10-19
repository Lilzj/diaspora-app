import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocationStore } from '@/store/location';
import { useNotification } from '@/providers/notification-provider';

const STORAGE_KEY = 'diaspora_location_permission';

// ── The next first-launch question waits for this one (16 Oct 2026) ────────
//
// The app has one alert slot. The notification question used to fire on its
// own timer and could replace this one on screen, leaving one of them
// unanswered. It now waits until location is settled: answered, or not needed.
let settle: () => void = () => undefined;
const settled = new Promise<void>((resolve) => {
  settle = resolve;
});

/** Whether Android would still show its location dialog (not refused for good). */
async function mayAskAgain(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { resolveLocationPermissionProvider } = require('@/lib/maps/providers/device-location') as {
      resolveLocationPermissionProvider: () => { check: () => Promise<{ status: string }> };
    };
    return (await resolveLocationPermissionProvider().check()).status === 'denied';
  } catch {
    return false;
  }
}

/** Resolves once the location question has been answered or skipped. */
export function whenLocationPromptSettled(): Promise<void> {
  return settled;
}

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
    let askedOnceBefore = false;

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
      // What Android answered, not what was tapped here.
      await syncPermissionStatus();
      const granted = useLocationStore.getState().permissionStatus === 'granted';
      // Android reports a dialog closed without an answer exactly like a first
      // "Don't allow": denied, may ask again. It lets an app ask twice, so this
      // asks once more on the next launch and stops after a second refusal
      // (19 Oct 2026; a dismissed dialog was being treated as a final no).
      const answer = granted
        ? 'granted'
        : !askedOnceBefore && (await mayAskAgain())
          ? 'retry'
          : 'denied';
      await AsyncStorage.setItem(STORAGE_KEY, answer).catch(() => undefined);
      settle();
    };

    const deny = async () => {
      setPermissionStatus('denied');
      await AsyncStorage.setItem(STORAGE_KEY, 'denied').catch(() => undefined);
      settle();
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
        settle();
        return;
      }

      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'granted') {
          // Granted once, removed in Settings since: ask again, once.
          await AsyncStorage.removeItem(STORAGE_KEY);
        } else if (saved === 'retry') {
          // Not answered last time: this is the second and last ask.
          askedOnceBefore = true;
        } else if (saved === 'denied') {
          setPermissionStatus('denied');
          settle();
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
    const timer = setTimeout(() => void run().catch(() => settle()), 500);
    return () => clearTimeout(timer);
  }, [showAlert, setPermissionStatus, detectLocation, syncPermissionStatus]);

  return null;
}
