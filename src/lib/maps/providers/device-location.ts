// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — device location & permission providers
// (Frontend Phase 8, §5, §6)
//
// Two implementations of the same pair of interfaces:
//
//   `expo-location`, loaded through an optional require, so the moment the
//   package is added to `package.json` this file starts using it with no other
//   change anywhere. See MAP-PROVIDER-GAP-002.
//
//   A development adapter that simulates every state §5 enumerates, so all of
//   them are reviewable without a device, a rebuild or a way to revoke a
//   permission on a simulator.
//
// ── The optional require, and why it is written that way ─────────────────────
//
//     let mod; try { mod = require('expo-location'); } catch { mod = null; }
//
// Not a dynamic `import()`, which would make every caller async for a decision
// that must be synchronous at module scope. Not a bare `require` either, which
// Metro resolves at build time and fails the bundle on when the package is
// absent. The `try` is what makes an uninstalled optional native dependency a
// runtime `null` rather than a build error, and it is the only reason this
// phase can ship a complete permission machine before the package exists.
//
// ── What the development adapter does and does not do ────────────────────────
//
// It returns a **fixed** coordinate — the platform's existing default location
// — rather than a random walk. Reviewing "does the recentre button work" needs
// a position that stays put; a simulated drift makes every screenshot different
// and every test flaky. Navigation gets its movement from an explicit
// `advanceSimulatedPosition()` the navigation screen calls, so motion is a
// deliberate act rather than ambient noise.
//
// It never claims `granted` without `requestPermission()` having been called.
// A development adapter that silently granted would hide the one bug this
// machine exists to prevent: a screen that reads a position it never asked for.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  DeviceLocation,
  GeoCoordinate,
  LocationPermissionState,
  MapErrorKind,
} from '@/types/maps';
import { areMapsGapsEnabled } from '@/config/maps-gaps';
import { MAP_PROVIDER_GAPS } from '@/config/map-provider-gaps';
import {
  fail,
  ok,
  type DeviceLocationProvider,
  type LocationPermissionProvider,
  type ProviderResult,
  type WatchOptions,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Optional native module
// ─────────────────────────────────────────────────────────────────────────────

type ExpoLocationModule = {
  getForegroundPermissionsAsync: () => Promise<{
    status: string;
    canAskAgain: boolean;
    granted: boolean;
    // iOS 14+ / Android 12+ report whether the grant was precise.
    android?: { accuracy?: string };
    ios?: { scope?: string };
  }>;
  requestForegroundPermissionsAsync: () => Promise<{
    status: string;
    canAskAgain: boolean;
    granted: boolean;
    android?: { accuracy?: string };
    ios?: { scope?: string };
  }>;
  hasServicesEnabledAsync: () => Promise<boolean>;
  getCurrentPositionAsync: (options: { accuracy?: number }) => Promise<{
    coords: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      speed?: number | null;
      heading?: number | null;
    };
    timestamp: number;
  }>;
  watchPositionAsync: (
    options: { accuracy?: number; distanceInterval?: number },
    callback: (position: {
      coords: {
        latitude: number;
        longitude: number;
        accuracy?: number | null;
        speed?: number | null;
        heading?: number | null;
      };
      timestamp: number;
    }) => void
  ) => Promise<{ remove: () => void }>;
  Accuracy: { Balanced: number; High: number; BestForNavigation: number };
};

function loadExpoLocation(): ExpoLocationModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    return require('expo-location') as ExpoLocationModule;
  } catch {
    return null;
  }
}

const expoLocation = loadExpoLocation();

/** Whether a real device-location provider is available in this build. */
export function hasNativeLocation(): boolean {
  return expoLocation !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// expo-location adapter
// ─────────────────────────────────────────────────────────────────────────────

function toPermissionState(
  response: {
    status: string;
    canAskAgain: boolean;
    granted: boolean;
    android?: { accuracy?: string };
    ios?: { scope?: string };
  },
  servicesEnabled: boolean
): LocationPermissionState {
  const checkedAt = new Date().toISOString();

  // Services off outranks permission. A member who granted permission and then
  // turned off location services needs the settings prompt, not a retry that
  // will fail identically — §5 separates these two for exactly this reason.
  if (!servicesEnabled) {
    return { status: 'servicesDisabled', accuracy: 'unknown', canOpenSettings: true, checkedAt };
  }

  if (response.granted || response.status === 'granted') {
    const coarse =
      response.android?.accuracy === 'coarse' || response.ios?.scope === 'reduced';
    return {
      status: coarse ? 'grantedApproximate' : 'granted',
      accuracy: coarse ? 'approximate' : 'precise',
      canOpenSettings: true,
      checkedAt,
    };
  }

  if (response.status === 'denied') {
    // `canAskAgain: false` is the permanent denial. Offering "Try again" here
    // would present a button that cannot succeed, which teaches members that
    // this app's buttons are decorative.
    return {
      status: response.canAskAgain ? 'denied' : 'deniedPermanently',
      accuracy: 'unknown',
      canOpenSettings: true,
      checkedAt,
    };
  }

  return { status: 'notRequested', accuracy: 'unknown', canOpenSettings: true, checkedAt };
}

class ExpoLocationPermissionProvider implements LocationPermissionProvider {
  descriptor = { id: 'expo-location', label: 'Device location', isSimulated: false };

  async check(): Promise<LocationPermissionState> {
    if (!expoLocation) return unavailableState();
    try {
      const [response, services] = await Promise.all([
        expoLocation.getForegroundPermissionsAsync(),
        expoLocation.hasServicesEnabledAsync(),
      ]);
      return toPermissionState(response, services);
    } catch {
      return unavailableState();
    }
  }

  async request(): Promise<LocationPermissionState> {
    if (!expoLocation) return unavailableState();
    try {
      const response = await expoLocation.requestForegroundPermissionsAsync();
      const services = await expoLocation.hasServicesEnabledAsync();
      return toPermissionState(response, services);
    } catch {
      return unavailableState();
    }
  }

  async areServicesEnabled(): Promise<boolean> {
    if (!expoLocation) return false;
    try {
      return await expoLocation.hasServicesEnabledAsync();
    } catch {
      return false;
    }
  }

  async openSettings(): Promise<boolean> {
    try {
      // `expo-linking` is already a dependency and `openSettings` is the
      // documented way in. Required lazily so this file has no import-time
      // dependency on a module a test environment may stub differently.
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const Linking = require('expo-linking');
      if (typeof Linking.openSettings === 'function') {
        await Linking.openSettings();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

class ExpoDeviceLocationProvider implements DeviceLocationProvider {
  descriptor = { id: 'expo-location', label: 'Device GPS', isSimulated: false };

  async getCurrentPosition(options?: {
    highAccuracy?: boolean;
  }): Promise<ProviderResult<DeviceLocation>> {
    if (!expoLocation) {
      return fail('location-unavailable', 'No device location module is installed.', false);
    }
    try {
      const position = await expoLocation.getCurrentPositionAsync({
        accuracy: options?.highAccuracy
          ? expoLocation.Accuracy.BestForNavigation
          : expoLocation.Accuracy.Balanced,
      });
      return ok(toDeviceLocation(position, 'backend'));
    } catch (error) {
      return fail('location-unavailable', describeError(error), true);
    }
  }

  watchPosition(
    onLocation: (location: DeviceLocation) => void,
    onError: (error: MapErrorKind) => void,
    options?: WatchOptions
  ): () => void {
    if (!expoLocation) {
      onError('location-unavailable');
      return () => {};
    }

    // The subscription may arrive after the caller has already unsubscribed —
    // a screen that unmounts during the await. `cancelled` is what stops a
    // watch running for the lifetime of the process with nobody listening,
    // which is precisely the battery drain §6 warns about.
    let cancelled = false;
    let subscription: { remove: () => void } | null = null;

    expoLocation
      .watchPositionAsync(
        {
          accuracy: options?.highAccuracy
            ? expoLocation.Accuracy.BestForNavigation
            : expoLocation.Accuracy.Balanced,
          distanceInterval: options?.distanceFilterMetres ?? 10,
        },
        (position) => {
          if (!cancelled) onLocation(toDeviceLocation(position, 'backend'));
        }
      )
      .then((sub) => {
        if (cancelled) sub.remove();
        else subscription = sub;
      })
      .catch(() => onError('location-unavailable'));

    return () => {
      cancelled = true;
      subscription?.remove();
      subscription = null;
    };
  }
}

function toDeviceLocation(
  position: {
    coords: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      speed?: number | null;
      heading?: number | null;
    };
    timestamp: number;
  },
  source: 'backend' | 'simulated'
): DeviceLocation {
  return {
    coordinate: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      precision: 'exact',
    },
    accuracyMetres: position.coords.accuracy ?? undefined,
    speed: position.coords.speed ?? undefined,
    heading: position.coords.heading ?? undefined,
    timestamp: position.timestamp,
    source,
  };
}

function unavailableState(): LocationPermissionState {
  return {
    status: 'unavailable',
    accuracy: 'unknown',
    canOpenSettings: false,
    checkedAt: new Date().toISOString(),
  };
}

function describeError(error: unknown): string {
  // Deliberately does not include the raw platform message. Those occasionally
  // carry a coordinate or a provider identifier, and §59 does not exempt an
  // error path from the rule about logging location.
  return error instanceof Error ? error.name : 'Location request failed.';
}

// ─────────────────────────────────────────────────────────────────────────────
// Development adapter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which §5 state the development adapter should report.
 *
 * Exposed as a module-level switch so the diagnostics screen and the tests can
 * walk every branch. There is no UI in the shipped app that changes it, and it
 * has no effect at all when the real provider is active.
 */
export type SimulatedPermissionOutcome =
  | 'grant-precise'
  | 'grant-approximate'
  | 'deny'
  | 'deny-permanently'
  | 'services-disabled'
  | 'unavailable';

let simulatedOutcome: SimulatedPermissionOutcome = 'grant-precise';
let simulatedRequested = false;
/**
 * Where the development adapter pretends the handset is.
 *
 * Was seeded from `DEFAULT_LOCATION` — Peckham, London — which is gone: the
 * store no longer ships a default place. A null island fix is obviously
 * synthetic, which is the right property for a simulated position; the
 * navigation screen and the tests both set a real one before they read it.
 */
const SIMULATED_ORIGIN: GeoCoordinate = { latitude: 0, longitude: 0, precision: 'exact' };

let simulatedPosition: GeoCoordinate = { ...SIMULATED_ORIGIN };

export function setSimulatedPermissionOutcome(outcome: SimulatedPermissionOutcome): void {
  simulatedOutcome = outcome;
  simulatedRequested = false;
}

/**
 * Moves the simulated device.
 *
 * Called by the navigation screen so a route can be walked deterministically,
 * and by tests. Deliberately not a timer: ambient drift would make every
 * screenshot and every assertion different, and the point of a fixed position
 * is that "did the recentre button work" has an answer.
 */
export function advanceSimulatedPosition(coordinate: GeoCoordinate): void {
  simulatedPosition = { ...coordinate, precision: 'exact' };
}

export function resetSimulatedLocation(): void {
  simulatedOutcome = 'grant-precise';
  simulatedRequested = false;
  simulatedPosition = { ...SIMULATED_ORIGIN };
}

function simulatedState(): LocationPermissionState {
  const checkedAt = new Date().toISOString();

  // Before a request, everything reports `notRequested` — except the two
  // environment conditions, which are true whether or not anybody asked.
  if (!simulatedRequested) {
    if (simulatedOutcome === 'services-disabled') {
      return { status: 'servicesDisabled', accuracy: 'unknown', canOpenSettings: true, checkedAt };
    }
    if (simulatedOutcome === 'unavailable') return unavailableState();
    return { status: 'notRequested', accuracy: 'unknown', canOpenSettings: true, checkedAt };
  }

  switch (simulatedOutcome) {
    case 'grant-precise':
      return { status: 'granted', accuracy: 'precise', canOpenSettings: true, checkedAt };
    case 'grant-approximate':
      return {
        status: 'grantedApproximate',
        accuracy: 'approximate',
        canOpenSettings: true,
        checkedAt,
      };
    case 'deny':
      return { status: 'denied', accuracy: 'unknown', canOpenSettings: true, checkedAt };
    case 'deny-permanently':
      return { status: 'deniedPermanently', accuracy: 'unknown', canOpenSettings: true, checkedAt };
    case 'services-disabled':
      return { status: 'servicesDisabled', accuracy: 'unknown', canOpenSettings: true, checkedAt };
    case 'unavailable':
      return unavailableState();
  }
}

class SimulatedPermissionProvider implements LocationPermissionProvider {
  descriptor = {
    id: 'adapter-permission',
    label: 'Simulated location permission',
    isSimulated: true,
    gapKey: MAP_PROVIDER_GAPS.deviceLocation.key,
  };

  async check(): Promise<LocationPermissionState> {
    return simulatedState();
  }

  async request(): Promise<LocationPermissionState> {
    simulatedRequested = true;
    return simulatedState();
  }

  async areServicesEnabled(): Promise<boolean> {
    return simulatedOutcome !== 'services-disabled';
  }

  async openSettings(): Promise<boolean> {
    // Honest: there is no settings page to open for a simulated permission, and
    // returning true would make the UI claim it did something it did not.
    return false;
  }
}

class SimulatedDeviceLocationProvider implements DeviceLocationProvider {
  descriptor = {
    id: 'adapter-location',
    label: 'Simulated device location',
    isSimulated: true,
    gapKey: MAP_PROVIDER_GAPS.deviceLocation.key,
  };

  async getCurrentPosition(): Promise<ProviderResult<DeviceLocation>> {
    const state = simulatedState();

    // The adapter enforces the permission contract rather than assuming it.
    // A caller that reads a position without a grant is a real bug, and it is
    // one that only shows up on a device unless the simulation refuses too.
    if (state.status !== 'granted' && state.status !== 'grantedApproximate') {
      return fail('location-permission-denied', 'Location permission has not been granted.', false);
    }

    return ok({
      coordinate:
        state.status === 'grantedApproximate'
          ? { ...simulatedPosition, precision: 'approximate' }
          : simulatedPosition,
      // An approximate grant really does report a much larger radius, and the
      // accuracy chip is one of the few places a member can see the difference.
      accuracyMetres: state.status === 'grantedApproximate' ? 1500 : 12,
      timestamp: Date.now(),
      source: 'simulated',
    });
  }

  watchPosition(
    onLocation: (location: DeviceLocation) => void,
    onError: (error: MapErrorKind) => void
  ): () => void {
    let active = true;

    void this.getCurrentPosition().then((result) => {
      if (!active) return;
      if (result.ok) onLocation(result.value);
      else onError(result.error);
    });

    // No interval. `advanceSimulatedPosition` is the only source of movement,
    // and the navigation screen polls it on its own schedule — a timer here
    // would keep firing after the screen it was started for had gone.
    return () => {
      active = false;
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────────────────────

const expoPermission = new ExpoLocationPermissionProvider();
const expoDevice = new ExpoDeviceLocationProvider();
const simulatedPermission = new SimulatedPermissionProvider();
const simulatedDevice = new SimulatedDeviceLocationProvider();

/**
 * The permission provider for this build.
 *
 * The real module always wins when present, including in development — the
 * whole point of the optional require is that installing the package is the
 * only step. The simulated provider is reachable only when the real one is
 * absent *and* the build is allowed to simulate; a production build with no
 * `expo-location` reports `unavailable`, which is the truth, and every location
 * affordance hides itself accordingly.
 */
export function resolveLocationPermissionProvider(): LocationPermissionProvider {
  if (expoLocation) return expoPermission;
  if (areMapsGapsEnabled()) return simulatedPermission;
  return new UnavailablePermissionProvider();
}

export function resolveDeviceLocationProvider(): DeviceLocationProvider {
  if (expoLocation) return expoDevice;
  if (areMapsGapsEnabled()) return simulatedDevice;
  return new UnavailableDeviceLocationProvider();
}

class UnavailablePermissionProvider implements LocationPermissionProvider {
  descriptor = {
    id: 'unavailable',
    label: 'Location unavailable',
    isSimulated: false,
    gapKey: MAP_PROVIDER_GAPS.deviceLocation.key,
  };

  async check(): Promise<LocationPermissionState> {
    return unavailableState();
  }
  async request(): Promise<LocationPermissionState> {
    return unavailableState();
  }
  async areServicesEnabled(): Promise<boolean> {
    return false;
  }
  async openSettings(): Promise<boolean> {
    return false;
  }
}

class UnavailableDeviceLocationProvider implements DeviceLocationProvider {
  descriptor = {
    id: 'unavailable',
    label: 'Location unavailable',
    isSimulated: false,
    gapKey: MAP_PROVIDER_GAPS.deviceLocation.key,
  };

  async getCurrentPosition(): Promise<ProviderResult<DeviceLocation>> {
    return fail('location-unavailable', 'This build has no location capability.', false);
  }

  watchPosition(
    _onLocation: (location: DeviceLocation) => void,
    onError: (error: MapErrorKind) => void
  ): () => void {
    onError('location-unavailable');
    return () => {};
  }
}
