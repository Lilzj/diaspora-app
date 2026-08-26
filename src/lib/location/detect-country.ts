// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Which country is this device actually in?
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// `store/location.ts` used to answer that question with a `setTimeout(800)` that
// resolved to a literal: Peckham, London. Its default was Rose Hill, Mauritius.
// Both are real places and neither had anything to do with the member.
//
// `choose-country.tsx` compares a member's stated country of residence against
// that value and sends a mismatch to `eligibility-error`, under a heading that
// reads *"Diaspora requires matching physical GPS telemetry with your declared
// residence."* It was comparing against a constant. Only a member who selected
// Mauritius — or the United Kingdom, once detection had run — could pass, and
// they passed from anywhere on earth.
//
// ── Why the reverse geocode happens on the device ────────────────────────────
//
// The platform serves `GET /location/reverse-geocode`, and it is the better
// source: it is free, it cannot be down, it discloses nothing, and it answers
// country-level even where the catalogue has no areas.
//
// It is also behind `RequireAuthorization(LocationPolicies.Search)`, and this
// runs during **registration**, before any token exists. So for this one
// question the device answers it: `expo-location`'s `reverseGeocodeAsync` is
// on-device on both platforms and needs nothing but the permission we already
// asked for.
//
// That is a strict improvement on what was there. `choose-country.tsx` sent
// every prospective member's IP address to `ipapi.co` — an unvetted third
// party, no agreement, no rate limit — which the backend's own
// `CatalogGeocodingProvider` calls out by name. Nothing leaves the device here.
//
// ── Why the answer is an ISO code ────────────────────────────────────────────
//
// `reverseGeocodeAsync` returns both `country` (a display name, localised to the
// device) and `isoCountryCode`. The old check compared display names, so a
// device set to French would have reported "Royaume-Uni" against a stated
// "United Kingdom" and failed a member who was standing in London.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  DeviceLocationProvider,
  LocationPermissionProvider,
} from '@/lib/maps/providers/types';

/**
 * The providers, resolved at call time rather than imported at module scope.
 *
 * ── Why this is a require and not an import ─────────────────────────────────
 *
 * `store/location.ts` imports this module, this module needs
 * `maps/providers/device-location.ts`, and that module reads `DEFAULT_LOCATION`
 * back out of the store to seed its simulated position. A static import closes
 * that ring, and the store is the one that loses: `DEFAULT_LOCATION` is still
 * undefined when `device-location` reads it, and the failure lands as
 * `Cannot read properties of undefined (reading 'latitude')` three files from
 * anything a reader would suspect.
 *
 * Deferring to call time breaks the ring without moving anybody's constants.
 * The `import type` above is erased at compile time and creates no cycle.
 */
function providers(): {
  permission: LocationPermissionProvider;
  device: DeviceLocationProvider;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const module = require('@/lib/maps/providers/device-location') as {
    resolveLocationPermissionProvider: () => LocationPermissionProvider;
    resolveDeviceLocationProvider: () => DeviceLocationProvider;
  };

  return {
    permission: module.resolveLocationPermissionProvider(),
    device: module.resolveDeviceLocationProvider(),
  };
}

/**
 * What the device was able to say.
 *
 * ── Three states, not two ───────────────────────────────────────────────────
 *
 * "Somewhere else" and "I could not tell" are different answers, and collapsing
 * them is what would turn a declined permission into an accusation. Only
 * `detected` is evidence about where somebody is; the other two are evidence
 * about the device.
 */
export type CountryDetection =
  | {
      status: 'detected';
      /** ISO 3166-1 alpha-2, upper-cased. The only field a check should compare. */
      countryCode: string;
      /** The device's own localisation of the country. For display, never for comparison. */
      countryName?: string;
      cityName?: string;
      region?: string;
      latitude: number;
      longitude: number;
    }
  | { status: 'permission-denied' }
  | { status: 'unavailable'; reason: string };

/**
 * `expo-location`, if this build has it.
 *
 * Required lazily and tolerantly for the same reason
 * `maps/providers/device-location.ts` does it: the module is absent under Jest
 * and on web, and a module-scope import would take the whole store down with it.
 */
type ReverseGeocoder = {
  reverseGeocodeAsync: (coordinate: { latitude: number; longitude: number }) => Promise<
    Array<{
      country?: string | null;
      isoCountryCode?: string | null;
      city?: string | null;
      region?: string | null;
    }>
  >;
};

function loadReverseGeocoder(): ReverseGeocoder | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const expoLocation = require('expo-location') as Partial<ReverseGeocoder>;

    // Present as a module and missing the function is a real combination: the
    // API is Android and iOS only, so a web bundle resolves the module and not
    // the method.
    return typeof expoLocation?.reverseGeocodeAsync === 'function'
      ? (expoLocation as ReverseGeocoder)
      : null;
  } catch {
    return null;
  }
}

/**
 * A country forced by the developer spoof controls.
 *
 * ── Why this lives here and not in the location store ────────────────────────
 *
 * `eligibility-error.tsx` has a "Force GPS Coordinates (Testing Only)" panel,
 * correctly behind a `__DEV__` guard. It used to write to
 * `store/location.ts`, which was fine while that store *was* the detection.
 * Now that detection asks the device, a spoof written to the store would be
 * read by nobody — the panel would appear to work and change nothing.
 *
 * So the override belongs next to the thing it overrides. One source answers
 * "where is this device", and the test affordance goes through the same door.
 */
let simulatedCountryCode: string | null = null;

/** True only in a development build. Release bundles strip the branch entirely. */
function isDevelopmentBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

/**
 * Forces the detected country, or clears the force with `null`.
 *
 * **Ignored outside a development build.** Deliberately stricter than the
 * repository's usual `areSimulatedFeaturesEnabled()` gate, which also opens on
 * `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1` — that flag produces a distributable APK,
 * and a control that defeats a residency check has no business in a binary
 * somebody can be handed.
 */
export function setSimulatedCountry(countryCode: string | null): void {
  if (!isDevelopmentBuild()) return;

  simulatedCountryCode = countryCode ? countryCode.trim().toUpperCase() : null;
}

/** What the spoof is currently forcing, if anything. */
export function getSimulatedCountry(): string | null {
  return isDevelopmentBuild() ? simulatedCountryCode : null;
}

/**
 * Asks the device where it is, and turns that into a country.
 *
 * ── `prompt` is not a convenience flag ──────────────────────────────────────
 *
 * `LocationPermissionProvider.request` carries the rule in its own doc comment:
 * *"Only ever called from an explicit member action."* Mounting a screen is not
 * one. A permission dialogue that appears because a member navigated somewhere
 * is the pattern that teaches people to press Deny without reading.
 *
 * So the default reads the existing grant and never asks. Pass `prompt: true`
 * only from something the member pressed — the retry button on
 * `eligibility-error` is the one place that qualifies.
 */
export async function detectCountry(
  options: { prompt?: boolean } = {}
): Promise<CountryDetection> {
  const forced = getSimulatedCountry();

  if (forced) {
    // Coordinates are zeroed rather than invented. Nothing downstream reads them
    // for a country check, and a plausible-looking pair would be a lie that
    // survives into whatever reads it next.
    return { status: 'detected', countryCode: forced, latitude: 0, longitude: 0 };
  }

  const { permission: permissions, device } = providers();

  let granted: boolean;

  try {
    const state = options.prompt ? await permissions.request() : await permissions.check();

    // ── Approximate counts ──────────────────────────────────────────────────
    //
    // Android 12+ lets a member grant coarse location, which is accurate to
    // something between one and three kilometres. For a *country* that is not a
    // degraded answer, it is an entirely sufficient one — and treating it as a
    // refusal would block registration for everybody who took the option the
    // system offers first.
    granted = state.status === 'granted' || state.status === 'grantedApproximate';

    if (!granted) {
      // ── Services off is not a refusal ───────────────────────────────────
      //
      // `servicesDisabled` means location is switched off for the whole
      // device, and `unavailable` means the platform has no location at all.
      // Neither is a member declining this app, and calling them
      // `permission-denied` would put the wrong reason in front of anybody who
      // later renders one.
      //
      // Both still mean "cannot say", so neither refuses the member either.
      return state.status === 'servicesDisabled' || state.status === 'unavailable'
        ? {
            status: 'unavailable',
            reason:
              state.status === 'servicesDisabled'
                ? 'Location services are switched off for this device.'
                : 'This device has no location services.',
          }
        : { status: 'permission-denied' };
    }
  } catch {
    return { status: 'unavailable', reason: 'The permission prompt could not be shown.' };
  }

  const fix = await device.getCurrentPosition();

  if (!fix.ok) {
    return {
      status: 'unavailable',
      reason: fix.detail ?? 'The device could not get a position.',
    };
  }

  const { latitude, longitude } = fix.value.coordinate;
  const geocoder = loadReverseGeocoder();

  if (!geocoder) {
    // A coordinate with no way to name its country. Deliberately not an error
    // about the member: the fix succeeded, and this build simply cannot turn it
    // into a country.
    return {
      status: 'unavailable',
      reason: 'This build cannot look up the country for a position.',
    };
  }

  try {
    const [address] = await geocoder.reverseGeocodeAsync({ latitude, longitude });
    const iso = address?.isoCountryCode?.trim();

    if (!iso) {
      // The lookup answered without a country. Some regions return an address
      // with a street and no ISO code, and guessing one from the display name
      // would be worse than admitting it.
      return { status: 'unavailable', reason: 'The position did not resolve to a country.' };
    }

    return {
      status: 'detected',
      countryCode: iso.toUpperCase(),
      countryName: address?.country ?? undefined,
      cityName: address?.city ?? undefined,
      region: address?.region ?? undefined,
      latitude,
      longitude,
    };
  } catch {
    return { status: 'unavailable', reason: 'The country lookup failed.' };
  }
}
