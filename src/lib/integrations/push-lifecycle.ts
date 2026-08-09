// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — push token lifecycle (Frontend Phase 16, §14 · §16 · §44 · §49)
//
// The lifecycle §14 describes, wired to B13's **real** device registry. No new
// backend contract is invented here: `PUT /notifications/devices` is idempotent
// on the token and `DELETE /notifications/devices/{id}` removes it, both
// already wrapped in `lib/notifications-api.ts`. This file supplies the device
// half that was missing.
//
// ── §44 is the rule this file exists to enforce ──────────────────────────────
//
// "Login → register token. Logout → unregister. User B login → register B's
// token. Ensure notifications cannot be routed incorrectly between accounts."
//
// The failure it prevents is the worst one available to this integration: a
// token registered for member A, left active when B signs in on the same phone,
// routes A's private messages to B's lock screen. It is silent, it is invisible
// in testing with one account, and it is a data breach.
//
// Three things make it not happen, and all three are needed:
//
//   1. **Deactivation happens before the session is cleared.** `DELETE
//      /notifications/devices/{id}` is an authenticated call, so it must run
//      while A's token is still in the store. A sign-out that clears state
//      first cannot deactivate anything.
//
//   2. **The registration remembers whose it is.** `registeredForUserId` is
//      compared on every registration; a token already registered for a
//      different member is deactivated and re-registered rather than reused.
//
//   3. **Deactivation never blocks signing out.** If the network is down, the
//      local state is cleared regardless and the stale device is left for the
//      backend's own suppression to catch. A sign-out that hangs because a
//      notification endpoint is unreachable is worse than a stale device row —
//      the member on a shared phone needs to be able to leave.
//
// ── The synthetic token, and why it is refused ───────────────────────────────
//
// `adapterPushProvider` mints `simulated-push-token:development` so the
// lifecycle can be driven without a device. That token is **never** sent to
// B13: it is a real, certified contract, and registering an undeliverable
// address against it would put a broken endpoint in a production database and
// make a member's notifications silently stop. `register()` checks the
// transport, not the build flag — a check that cannot be bypassed by enabling
// gap preview.
// ─────────────────────────────────────────────────────────────────────────────

import {
  fetchNotificationDevices,
  registerNotificationDevice,
  removeNotificationDevice,
} from '@/lib/notifications-api';
import type { NotificationDevice } from '@/types/notification-preferences';
import type { IntegrationMode, PushRegistration } from '@/types/integrations';
import { integrationError, isIntegrationError, toIntegrationError } from './errors';
import { resolvePushProvider } from './registry';
import { currentPlatform } from './providers/push';
import { trackPushToken, trackPermission } from './events';
import type { PushProvider, PushTokenResult } from './providers/types';

// ═════════════════════════════════════════════════════════════════════════════
// FINGERPRINTING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A short, non-reversible digest of a push token.
 *
 * This is the only representation of a token that is ever held in application
 * state — `PushRegistration` has no field for the token itself (§38). It
 * answers the one question the lifecycle needs, "is this the same token I
 * registered last time", and answers nothing else.
 *
 * It is **not a cryptographic hash** and does not claim to be. It is a
 * non-invertible-in-practice checksum over a value that is not itself a secret
 * — a push token is a routing address, not a credential — and the reason to
 * digest it at all is to keep the raw string out of state, logs and crash
 * reports rather than to resist an attacker who has the digest. Using
 * `expo-crypto` here would add a native dependency for a checksum, and
 * pretending a 32-bit value is a security control would be worse than saying
 * plainly what it is.
 */
export function fingerprintToken(token: string): string {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ═════════════════════════════════════════════════════════════════════════════
// STATE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The device identifier B13 deduplicates on.
 *
 * Generated once per process and held in memory only. Deliberately **not**
 * persisted and deliberately not derived from any hardware identifier: a stable
 * cross-install device id is a tracking identifier, and B13's registry is
 * already idempotent on the token, which is the property that actually prevents
 * duplicate endpoints. This exists so the device list can mark "this device"
 * within a session (FRONTEND-PHASE16-GAP-016 asks the server to answer it
 * properly).
 */
let sessionDeviceIdentifier: string | null = null;

function deviceIdentifier(): string {
  if (!sessionDeviceIdentifier) {
    sessionDeviceIdentifier = `session-${Math.random().toString(36).slice(2, 10)}`;
  }
  return sessionDeviceIdentifier;
}

let registration: PushRegistration = emptyRegistration();

function emptyRegistration(): PushRegistration {
  return {
    deviceId: null,
    provider: 'push.expo',
    platform: currentPlatform(),
    tokenFingerprint: null,
    registeredAt: null,
    registeredForUserId: null,
    permission: 'notRequested',
    mode: 'NOT_CONFIGURED',
  };
}

/** The current registration. A copy, so a caller cannot mutate the module's state. */
export function getPushRegistration(): PushRegistration {
  return { ...registration };
}

/** Test seam. */
export function __resetPushRegistration(): void {
  registration = emptyRegistration();
  sessionDeviceIdentifier = null;
}

// ═════════════════════════════════════════════════════════════════════════════
// PERMISSION — §14
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Reads the permission without asking for it.
 *
 * Separate from `requestPushPermission` so a screen can render the current
 * state without triggering a prompt. A component that asked on mount would
 * consume the member's one chance to say yes before they had read why —
 * §37's "do not bury meaningful consent" applies to an OS prompt as much as to
 * a Continue button.
 */
export async function readPushPermission(): Promise<PushRegistration> {
  const provider = resolvePushProvider();
  try {
    const permission = await provider.getPermission();
    registration = {
      ...registration,
      provider: provider.descriptor.id,
      permission: permission.state,
      mode: provider.descriptor.mode,
    };
  } catch {
    registration = { ...registration, permission: 'unavailable', mode: provider.descriptor.mode };
  }
  return getPushRegistration();
}

/** Asks. Call only after the explanation has been shown. */
export async function requestPushPermission(): Promise<PushRegistration> {
  const provider = resolvePushProvider();

  try {
    const permission = await provider.requestPermission();

    trackPermission({
      provider: provider.descriptor.id,
      permissionKey: 'notifications',
      granted: permission.state === 'granted',
      permissionState: permission.state,
    });

    registration = {
      ...registration,
      provider: provider.descriptor.id,
      permission: permission.state,
      mode: provider.descriptor.mode,
    };

    if (permission.state === 'granted') {
      // Android channels must exist before the first notification arrives or it
      // is dropped silently — no error, no delivery. Configuring them at the
      // moment permission is granted is the last point at which that is
      // guaranteed to have happened before anything can be sent.
      await provider.configureChannels().catch(() => {});
    }
  } catch {
    registration = { ...registration, permission: 'unavailable', mode: provider.descriptor.mode };
  }

  return getPushRegistration();
}

export async function openPushSettings(): Promise<void> {
  await resolvePushProvider().openSettings();
}

// ═════════════════════════════════════════════════════════════════════════════
// REGISTRATION — §44
// ═════════════════════════════════════════════════════════════════════════════

/** Whether this token may be sent to B13's real registry. See the file header. */
function isDeliverable(token: PushTokenResult): boolean {
  return token.transport !== 'simulated';
}

export interface RegisterResult {
  registration: PushRegistration;
  /** Null when nothing was sent — a simulated token, or no permission. */
  device: NotificationDevice | null;
  /** Why nothing was sent, when nothing was. */
  skippedReason: string | null;
}

/**
 * Registers this device for `userId`.
 *
 * Idempotent in both directions. B13 deduplicates on the token, and this
 * deduplicates on the fingerprint — so a caller that runs it on every app
 * foreground makes at most one network call per genuine token change.
 *
 * The `registeredForUserId` comparison is §44's second control: a token already
 * registered for a *different* member is deactivated before being re-registered
 * rather than reused, so the backend never holds one endpoint attributed to two
 * people.
 */
export async function registerPushToken(userId: string): Promise<RegisterResult> {
  const provider = resolvePushProvider();

  let token: PushTokenResult;
  try {
    token = await provider.getToken();
  } catch (cause) {
    const error = isIntegrationError(cause) ? cause : toIntegrationError(cause);
    registration = {
      ...registration,
      provider: provider.descriptor.id,
      mode: provider.descriptor.mode,
      permission: error.kind === 'PermissionDenied' ? 'denied' : registration.permission,
    };
    return {
      registration: getPushRegistration(),
      device: null,
      skippedReason: error.message,
    };
  }

  const fingerprint = fingerprintToken(token.value);

  // Already registered, same token, same member. Nothing to do.
  if (
    registration.tokenFingerprint === fingerprint &&
    registration.registeredForUserId === userId &&
    registration.deviceId
  ) {
    return { registration: getPushRegistration(), device: null, skippedReason: null };
  }

  // Registered for somebody else. §44: deactivate before re-registering, so the
  // backend never holds one endpoint attributed to two members.
  if (registration.registeredForUserId && registration.registeredForUserId !== userId) {
    await deactivatePushToken().catch(() => {});
  }

  if (!isDeliverable(token)) {
    // The refusal that keeps a synthetic address out of a real registry. Checked
    // on the transport rather than on the build flag, so enabling gap preview
    // cannot route around it.
    registration = {
      ...registration,
      provider: provider.descriptor.id,
      mode: provider.descriptor.mode,
      permission: 'granted',
      tokenFingerprint: fingerprint,
      registeredForUserId: userId,
      registeredAt: new Date().toISOString(),
      deviceId: null,
    };
    return {
      registration: getPushRegistration(),
      device: null,
      skippedReason:
        'This is a development build. A simulated token was created and deliberately not sent to the notification service.',
    };
  }

  try {
    const device = await registerNotificationDevice({
      token: token.value,
      platform: currentPlatform(),
      deviceIdentifier: deviceIdentifier(),
      friendlyName: undefined,
      appVersion: undefined,
    });

    registration = {
      deviceId: device.id,
      provider: provider.descriptor.id,
      platform: currentPlatform(),
      tokenFingerprint: fingerprint,
      registeredAt: device.registeredAt ?? new Date().toISOString(),
      registeredForUserId: userId,
      permission: 'granted',
      mode: 'BACKEND_CONNECTED',
    };

    trackPushToken({
      provider: provider.descriptor.id,
      mode: 'BACKEND_CONNECTED',
      outcome: 'registered',
    });

    return { registration: getPushRegistration(), device, skippedReason: null };
  } catch (cause) {
    throw toIntegrationError(cause, {
      provider: provider.descriptor.id,
      capability: 'push.deviceRegistry',
      mutating: true,
    });
  }
}

/**
 * Subscribes to token rotation and re-registers.
 *
 * The OS can rotate a token at any time. A client that reads it only at startup
 * silently stops receiving notifications until the next cold start, which is
 * the kind of bug that is reported as "notifications randomly stop working".
 *
 * Returns an unsubscribe function. The listener captures `userId` so a rotation
 * that arrives after a sign-out cannot re-register the old member's device —
 * the registration check inside `registerPushToken` catches it, and the capture
 * makes the intent explicit.
 */
export function watchPushTokenRefresh(userId: string): () => void {
  const provider = resolvePushProvider();

  return provider.onTokenRefresh((token) => {
    if (!isDeliverable(token)) return;
    if (registration.registeredForUserId !== userId) return;

    void registerNotificationDevice({
      token: token.value,
      platform: currentPlatform(),
      deviceIdentifier: deviceIdentifier(),
    })
      .then((device) => {
        registration = {
          ...registration,
          deviceId: device.id,
          tokenFingerprint: fingerprintToken(token.value),
          registeredAt: device.registeredAt ?? new Date().toISOString(),
        };
        trackPushToken({
          provider: provider.descriptor.id,
          mode: 'BACKEND_CONNECTED',
          outcome: 'refreshed',
        });
      })
      // A failed refresh is not worth surfacing: the member did nothing and can
      // do nothing. The next foreground registration retries it.
      .catch(() => {});
  });
}

/**
 * Deactivates this device.
 *
 * **Must be called before the session token is cleared** — see the file header.
 * Never throws: a sign-out that fails because a notification endpoint is
 * unreachable is worse than a stale device row, particularly on a shared phone
 * where the member needs to be able to leave.
 */
export async function deactivatePushToken(): Promise<void> {
  const deviceId = registration.deviceId;
  const provider = registration.provider;

  // Cleared first, so a failure below still leaves local state correct. The
  // local record claiming a registration that may or may not exist server-side
  // is the worse of the two inconsistencies.
  registration = emptyRegistration();

  if (!deviceId) return;

  try {
    await removeNotificationDevice(deviceId);
    trackPushToken({ provider, mode: 'BACKEND_CONNECTED', outcome: 'deactivated' });
  } catch {
    // Swallowed deliberately. The backend's own suppression handling will
    // retire an endpoint that stops accepting deliveries.
  }
}

/**
 * Every device registered to the current member — §45.
 *
 * Reads B13's real route. `isCurrentDevice` is a best-effort match on the
 * identifier this session generated, and is marked as such because the server
 * cannot yet answer it (FRONTEND-PHASE16-GAP-016). A false negative shows a
 * member their own phone as "another device", which is confusing but harmless;
 * a false positive would let them remove the wrong one, so the match is exact
 * rather than fuzzy.
 */
export async function listPushDevices(): Promise<
  { device: NotificationDevice; isCurrentDevice: boolean }[]
> {
  const devices = await fetchNotificationDevices();
  const identifier = sessionDeviceIdentifier;

  return devices.map((device) => ({
    device,
    isCurrentDevice:
      device.id === registration.deviceId ||
      (identifier != null && device.deviceIdentifier === identifier),
  }));
}

/** Removes another device. Used by §45's multi-device management. */
export async function removePushDevice(deviceId: string): Promise<void> {
  if (deviceId === registration.deviceId) {
    // Removing the current device through the "other devices" list would leave
    // the member wondering why their own notifications stopped. The connection
    // centre's own disconnect is the route for that, and it says what it does.
    throw integrationError('InvalidRequest', {
      provider: registration.provider,
      message: 'This is the device you are using.',
      hint: 'Turn notifications off for this device instead.',
    });
  }

  try {
    await removeNotificationDevice(deviceId);
  } catch (cause) {
    throw toIntegrationError(cause, {
      provider: registration.provider,
      capability: 'push.deviceRegistry',
      mutating: true,
    });
  }
}

/** The provider, for a screen that needs to attach notification listeners. */
export function pushProvider(): PushProvider {
  return resolvePushProvider();
}

/** The mode, for the surfaces that must render a simulation marker (§69). */
export function pushMode(): IntegrationMode {
  return resolvePushProvider().descriptor.mode;
}
