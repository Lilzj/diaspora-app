// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — push providers (Frontend Phase 16, §14 · §15 · §16 · §68)
//
// Three implementations of `PushProvider`:
//
//   `devicePushProvider`      — `expo-notifications`, whichever transport the
//                               build was compiled for. Not active today; the
//                               package is absent (INTEGRATION-PROVIDER-GAP-002).
//   `adapterPushProvider`     — a deterministic simulation, so the whole
//                               lifecycle is exercisable and testable without a
//                               device. Its token is synthetic and is refused by
//                               the registration path.
//   `unavailablePushProvider` — the production answer with no native module.
//
// ── §15 is the reason this file has an interface at all ──────────────────────
//
// "The frontend must not tightly couple product screens to Firebase or any
// specific provider." No screen in this application imports anything from this
// file. They call `usePushNotifications()`, which calls the lifecycle, which
// calls the registry. Swapping Expo's push service for FCM is an
// `EXPO_PUBLIC_PUSH_PROVIDER` change and a native rebuild — not a code change
// above this layer.
//
// ── The synthetic token, and why it is refused rather than sent ──────────────
//
// A push token cannot be simulated into existence: a token is a real routing
// address issued by a real service, and inventing one produces a string that
// looks like a token and routes nowhere. The adapter produces
// `simulated-push-token:<fingerprint>` so the *lifecycle* — permission, mint,
// register, refresh, deactivate — can be driven end to end in tests and in a
// development build.
//
// `push-lifecycle.ts` refuses to send a token whose transport is `simulated` to
// B13's real device registry. That refusal is the load-bearing part: B13 is a
// **real, certified** contract, and registering a fake address against it would
// put an undeliverable endpoint in a production database and make a member's
// notifications silently stop.
// ─────────────────────────────────────────────────────────────────────────────

import { Platform } from 'react-native';
import { getIntegrationConfig } from '@/config/integration-config';
import { INTEGRATION_PROVIDER_GAPS } from '@/config/integration-provider-gaps';
import { integrationError } from '../errors';
import type {
  PermissionSnapshot,
  PushPayload,
  PushProvider,
  PushTokenResult,
} from './types';
import type { IntegrationCapability, IntegrationProviderId } from '@/types/integrations';

// ─────────────────────────────────────────────────────────────────────────────
// Optional native module
// ─────────────────────────────────────────────────────────────────────────────

interface NotificationsModule {
  getPermissionsAsync(): Promise<NativeNotificationPermission>;
  requestPermissionsAsync(options?: Record<string, unknown>): Promise<NativeNotificationPermission>;
  getExpoPushTokenAsync(options?: { projectId?: string }): Promise<{ data: string }>;
  getDevicePushTokenAsync(): Promise<{ data: string; type: string }>;
  addPushTokenListener(listener: (token: { data: string; type: string }) => void): { remove(): void };
  addNotificationReceivedListener(listener: (event: unknown) => void): { remove(): void };
  addNotificationResponseReceivedListener(listener: (event: unknown) => void): { remove(): void };
  getLastNotificationResponseAsync?(): Promise<unknown>;
  setNotificationChannelAsync(id: string, channel: Record<string, unknown>): Promise<unknown>;
  setBadgeCountAsync(count: number): Promise<boolean>;
  AndroidImportance?: Record<string, number>;
}

interface NativeNotificationPermission {
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
  ios?: { status?: number };
}

function loadNotificationsModule(): NotificationsModule | null {
  try {
    // Same pattern and reasoning as `native-map.tsx` and `device-calendar.ts`.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('expo-notifications');
    return mod?.getPermissionsAsync ? (mod as NotificationsModule) : null;
  } catch {
    return null;
  }
}

const notificationsModule = loadNotificationsModule();

export function hasPushModule(): boolean {
  return notificationsModule !== null;
}

/**
 * Whether this is real hardware.
 *
 * `expo-device` is loaded the same optional way as the notifications module —
 * both arrived together in Wave H, and a build compiled without either should
 * degrade to the unavailable provider rather than fail to start.
 *
 * **Defaults to `true` when the module is absent.** Failing open is right here:
 * the alternative is a build with the notifications module but not the device
 * module refusing to mint a token on a genuine phone, which trades a clear
 * simulator message for a broken capability on real hardware.
 */
export function isPhysicalDevice(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const device = require('expo-device') as { isDevice?: boolean };
    return typeof device?.isDevice === 'boolean' ? device.isDevice : true;
  } catch {
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared translation
// ─────────────────────────────────────────────────────────────────────────────

function toPermissionSnapshot(native: NativeNotificationPermission): PermissionSnapshot {
  if (native.status === 'granted') {
    return { state: 'granted', requiresSettings: false, canAskAgain: false };
  }
  if (native.status === 'undetermined') {
    return { state: 'notRequested', requiresSettings: false, canAskAgain: true };
  }
  return {
    state: native.canAskAgain ? 'denied' : 'blocked',
    requiresSettings: !native.canAskAgain,
    canAskAgain: native.canAskAgain,
  };
}

function currentPlatform(): 'Android' | 'IOS' | 'Web' | 'Unknown' {
  if (Platform.OS === 'android') return 'Android';
  if (Platform.OS === 'ios') return 'IOS';
  if (Platform.OS === 'web') return 'Web';
  return 'Unknown';
}

export { currentPlatform };

/**
 * B13's payload, extracted from whatever shape the provider delivered.
 *
 * Written defensively because the three transports nest the data differently —
 * Expo puts it at `request.content.data`, FCM at `data`, and a tapped
 * notification wraps the whole thing in a `notification` — and a client that
 * assumed one shape would silently stop routing when the transport changed,
 * which is exactly the coupling §15 forbids.
 *
 * Only the fields routing needs are extracted. The rest of the provider payload
 * is discarded rather than carried into application state — a notification body
 * that reaches a log is a message content leak (§55).
 */
export function extractPayload(event: unknown): PushPayload {
  const root = event as Record<string, unknown> | null;
  const notification = (root?.notification ?? root) as Record<string, unknown> | undefined;
  const request = notification?.request as Record<string, unknown> | undefined;
  const content = (request?.content ?? notification?.content) as Record<string, unknown> | undefined;
  const data = (content?.data ?? notification?.data ?? root?.data ?? {}) as Record<string, unknown>;

  const str = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null;

  return {
    notificationId: str(data.notificationId) ?? str(data.id),
    notificationType: str(data.notificationType) ?? str(data.type),
    targetRoute: str(data.targetRoute) ?? str(data.route),
    subjectId: str(data.subjectId) ?? str(data.entityId),
    categoryKey: str(data.categoryKey) ?? str(data.category),
    title: str(content?.title),
    body: str(content?.body),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The device provider
// ─────────────────────────────────────────────────────────────────────────────

const PUSH_CAPABILITIES: readonly IntegrationCapability[] = [
  'push.permission',
  'push.token',
  'push.deviceRegistry',
  'push.deepLink',
] as const;

function providerIdForTransport(): IntegrationProviderId {
  const { pushProvider } = getIntegrationConfig();
  if (pushProvider === 'fcm') return 'push.fcm';
  if (pushProvider === 'apns') return 'push.apns';
  return 'push.expo';
}

function requireModule(): NotificationsModule {
  if (!notificationsModule) {
    throw integrationError('UnsupportedCapability', {
      provider: providerIdForTransport(),
      message: 'This version of the app cannot receive notifications.',
      hint: INTEGRATION_PROVIDER_GAPS.pushToken.id,
    });
  }
  return notificationsModule;
}

export const devicePushProvider: PushProvider = {
  get descriptor() {
    // A getter rather than a constant: the transport is read from configuration
    // and a test needs to vary it. Same reasoning as the map registry's
    // functions-not-constants decision.
    return {
      id: providerIdForTransport(),
      label: 'Push notifications',
      mode: 'REAL_PROVIDER' as const,
    };
  },
  capabilities: PUSH_CAPABILITIES,

  async getPermission(): Promise<PermissionSnapshot> {
    return toPermissionSnapshot(await requireModule().getPermissionsAsync());
  },

  async requestPermission(): Promise<PermissionSnapshot> {
    // No provisional authorization is requested. iOS offers it — notifications
    // delivered quietly without asking — and it is the wrong default for this
    // application: a member who never sees a prompt cannot make a decision, and
    // §37 is about meaningful consent rather than about avoiding a prompt.
    return toPermissionSnapshot(
      await requireModule().requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      })
    );
  },

  async openSettings(): Promise<void> {
    const { Linking } = require('react-native') as typeof import('react-native');
    await Linking.openSettings();
  },

  async getToken(): Promise<PushTokenResult> {
    const module = requireModule();
    const config = getIntegrationConfig();

    // Remediation Wave H. A simulator or emulator has no push routing address,
    // and `getExpoPushTokenAsync` throws there rather than returning something
    // unusable. Detecting it first is why `expo-device` is a dependency of this
    // capability rather than an incidental one — the register named it for
    // exactly this reason.
    //
    // Checked *before* the permission prompt deliberately: a simulator will
    // happily show the notification dialog and grant it, so asking first means
    // the member is prompted for a permission that cannot produce a token.
    if (!isPhysicalDevice()) {
      throw integrationError('ProviderUnavailable', {
        provider: providerIdForTransport(),
        capability: 'push.token',
        message: 'Notifications need a real device.',
        hint: 'Simulators and emulators cannot receive push notifications.',
      });
    }

    const permission = await this.getPermission();
    if (permission.state !== 'granted') {
      // Minting a token without permission produces one that will never deliver.
      // Failing here means the caller shows the permission state rather than
      // registering an address that silently drops everything.
      throw integrationError('PermissionDenied', {
        provider: providerIdForTransport(),
        capability: 'push.token',
        message: 'Notifications are turned off.',
        hint: permission.requiresSettings
          ? 'Turn them on in your device settings.'
          : 'Allow notifications to receive updates.',
        needsMemberAction: true,
      });
    }

    try {
      if (config.pushProvider === 'expo') {
        const token = await module.getExpoPushTokenAsync({
          projectId: config.pushExpoProjectId || undefined,
        });
        return { value: token.data, transport: 'expo' };
      }

      const token = await module.getDevicePushTokenAsync();
      return { value: token.data, transport: config.pushProvider === 'apns' ? 'apns' : 'fcm' };
    } catch (cause) {
      // The native message is not passed through: on Expo's transport it can
      // contain the project id, and a provider string in an error is a provider
      // string in a crash report (§56).
      throw integrationError('ProviderUnavailable', {
        provider: providerIdForTransport(),
        capability: 'push.token',
        message: 'Could not set up notifications on this device.',
        hint: 'This is usually temporary. Notifications will be set up next time you open the app.',
      });
    }
  },

  onTokenRefresh(listener: (token: PushTokenResult) => void): () => void {
    const module = notificationsModule;
    if (!module) return () => {};

    const transport = getIntegrationConfig().pushProvider;
    const subscription = module.addPushTokenListener((token) => {
      listener({
        value: token.data,
        transport: transport === 'expo' ? 'expo' : transport === 'apns' ? 'apns' : 'fcm',
      });
    });

    return () => subscription.remove();
  },

  onNotificationReceived(listener: (payload: PushPayload) => void): () => void {
    const module = notificationsModule;
    if (!module) return () => {};
    const subscription = module.addNotificationReceivedListener((event) =>
      listener(extractPayload(event))
    );
    return () => subscription.remove();
  },

  onNotificationTapped(listener: (payload: PushPayload) => void): () => void {
    const module = notificationsModule;
    if (!module) return () => {};

    const subscription = module.addNotificationResponseReceivedListener((event) =>
      listener(extractPayload(event))
    );

    // §40's "do not assume the app is still alive when the callback arrives",
    // applied to notifications. A tap that launched the app from cold delivers
    // no event to a listener registered afterwards — the response is waiting in
    // `getLastNotificationResponseAsync`. Without this, tapping a notification
    // on a killed app opens the home screen and the tap is lost, which is the
    // most common way notification routing appears to work in testing and fails
    // in production.
    void module.getLastNotificationResponseAsync?.().then((last) => {
      if (last) listener(extractPayload(last));
    });

    return () => subscription.remove();
  },

  async configureChannels(): Promise<void> {
    if (Platform.OS !== 'android') return;
    const module = requireModule();

    // Android 8+ drops a notification with no channel silently — no error, no
    // delivery. The channels mirror B13's own category priorities so a member's
    // OS-level control matches the in-app one rather than cutting across it.
    // Read by *name* from the module's own enum, never by literal. The numbers
    // below are only reached if the native module somehow lacks the export, and
    // they are SDK 57's actual values — `UNKNOWN=0, UNSPECIFIED=1, NONE=2,
    // MIN=3, LOW=4, DEFAULT=5, HIGH=6, MAX=7`.
    //
    // They were previously `{ DEFAULT: 3, HIGH: 4, LOW: 2 }`, which are SDK 57's
    // `MIN`, `LOW` and `NONE`. A channel created at those importances shows no
    // heads-up banner and, for `NONE`, nothing at all — the exact silent
    // failure the comment above warns about, arriving through the fallback meant
    // to prevent it.
    //
    // Worth recording where the wrong numbers came from: the rendered SDK 57
    // documentation page tabulates this enum as `NONE=0 … MAX=5`. The shipped
    // type definitions disagree with it. The enum members are authoritative,
    // which is why they are read by name.
    const importance = module.AndroidImportance ?? { DEFAULT: 5, HIGH: 6, LOW: 4 };

    await module.setNotificationChannelAsync('default', {
      name: 'General',
      importance: importance.DEFAULT,
    });
    await module.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: importance.HIGH,
    });
    await module.setNotificationChannelAsync('billing', {
      name: 'Payments and wallet',
      importance: importance.HIGH,
    });
    await module.setNotificationChannelAsync('community', {
      name: 'Communities and events',
      importance: importance.DEFAULT,
    });
    await module.setNotificationChannelAsync('digest', {
      name: 'Digests',
      importance: importance.LOW,
    });
  },

  async setBadgeCount(count: number): Promise<void> {
    const module = notificationsModule;
    if (!module) return;
    // Best-effort. A failed badge update is not worth surfacing to anybody.
    try {
      await module.setBadgeCountAsync(Math.max(0, count));
    } catch {
      /* ignored */
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// The development adapter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic simulated state.
 *
 * Module-level rather than per-call so that a permission granted in one screen
 * is still granted in the next — a simulation that forgot would be a worse
 * model of the real thing than one that remembers, and §68 asks for realistic
 * states. `__resetAdapterPushState` exists for tests, which need the opposite.
 */
let adapterPermission: PermissionSnapshot = {
  state: 'notRequested',
  requiresSettings: false,
  canAskAgain: true,
};

const tokenListeners = new Set<(token: PushTokenResult) => void>();
const receivedListeners = new Set<(payload: PushPayload) => void>();
const tappedListeners = new Set<(payload: PushPayload) => void>();

/** Test seam. Not exported through the barrel; imported directly by tests only. */
export function __resetAdapterPushState(): void {
  adapterPermission = { state: 'notRequested', requiresSettings: false, canAskAgain: true };
  tokenListeners.clear();
  receivedListeners.clear();
  tappedListeners.clear();
}

/** Test seam: drive a denial without a device. §68 asks for reachable failure states. */
export function __setAdapterPushPermission(state: PermissionSnapshot): void {
  adapterPermission = state;
}

/** Test seam: deliver a notification, so routing can be asserted end to end. */
export function __deliverAdapterNotification(payload: PushPayload, tapped: boolean): void {
  const listeners = tapped ? tappedListeners : receivedListeners;
  for (const listener of listeners) listener(payload);
}

export const adapterPushProvider: PushProvider = {
  descriptor: {
    id: 'push.expo',
    label: 'Push notifications',
    mode: 'DEVELOPMENT_PROVIDER',
    gapId: INTEGRATION_PROVIDER_GAPS.pushToken.id,
  },
  capabilities: PUSH_CAPABILITIES,

  async getPermission(): Promise<PermissionSnapshot> {
    return adapterPermission;
  },

  async requestPermission(): Promise<PermissionSnapshot> {
    // A simulation that always grants is a simulation nobody ever tests the
    // denial path against. This grants, because that is the common path and a
    // developer needs it to work — and `__setAdapterPushPermission` makes every
    // other state reachable, which is what §68 asks for.
    if (adapterPermission.state === 'blocked' || adapterPermission.state === 'restricted') {
      return adapterPermission;
    }
    adapterPermission = { state: 'granted', requiresSettings: false, canAskAgain: false };
    return adapterPermission;
  },

  async openSettings(): Promise<void> {
    /* No settings app to open in a simulation. */
  },

  async getToken(): Promise<PushTokenResult> {
    if (adapterPermission.state !== 'granted') {
      throw integrationError('PermissionDenied', {
        provider: 'push.expo',
        capability: 'push.token',
        message: 'Notifications are turned off.',
        needsMemberAction: true,
      });
    }

    // Deterministic and visibly synthetic. The `simulated` transport is what
    // `push-lifecycle.ts` refuses to send to B13's real registry — see the
    // header. A value that looked like a real Expo token would defeat that.
    return { value: 'simulated-push-token:development', transport: 'simulated' };
  },

  onTokenRefresh(listener): () => void {
    tokenListeners.add(listener);
    return () => tokenListeners.delete(listener);
  },
  onNotificationReceived(listener): () => void {
    receivedListeners.add(listener);
    return () => receivedListeners.delete(listener);
  },
  onNotificationTapped(listener): () => void {
    tappedListeners.add(listener);
    return () => tappedListeners.delete(listener);
  },

  async configureChannels(): Promise<void> {
    /* No channels in a simulation. */
  },
  async setBadgeCount(): Promise<void> {
    /* No badge in a simulation. */
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// The production answer with no native module
// ─────────────────────────────────────────────────────────────────────────────

export const unavailablePushProvider: PushProvider = {
  descriptor: {
    id: 'push.expo',
    label: 'Push notifications',
    mode: 'NOT_CONFIGURED',
    gapId: INTEGRATION_PROVIDER_GAPS.pushToken.id,
  },
  capabilities: [],

  async getPermission(): Promise<PermissionSnapshot> {
    // `unavailable` rather than `denied`. The member has not refused anything —
    // the build cannot do it — and blaming them for a missing native module is
    // both wrong and unfixable from their side.
    return { state: 'unavailable', requiresSettings: false, canAskAgain: false };
  },
  async requestPermission(): Promise<PermissionSnapshot> {
    return { state: 'unavailable', requiresSettings: false, canAskAgain: false };
  },
  async openSettings(): Promise<void> {
    /* Nothing to open. */
  },
  async getToken(): Promise<PushTokenResult> {
    throw integrationError('UnsupportedCapability', {
      provider: 'push.expo',
      capability: 'push.token',
      message: 'This version of the app cannot receive push notifications.',
      hint: `In-app notifications still work. (${INTEGRATION_PROVIDER_GAPS.pushToken.id})`,
    });
  },
  onTokenRefresh(): () => void {
    return () => {};
  },
  onNotificationReceived(): () => void {
    return () => {};
  },
  onNotificationTapped(): () => void {
    return () => {};
  },
  async configureChannels(): Promise<void> {
    /* Nothing to configure. */
  },
  async setBadgeCount(): Promise<void> {
    /* Nothing to set. */
  },
};
