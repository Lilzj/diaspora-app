// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — hand-off to the device's navigation app
// (Frontend Phase 8, §18, MAP-PROVIDER-GAP-006)
//
// §18: "do not claim to provide turn-by-turn navigation if the provider
// integration does not actually support it."
//
// It does not. So the honest capability this build ships is a hand-off: open
// the member's own maps app, already loaded with the destination and the travel
// mode. That is not a placeholder — it is what most members expect from a
// "Directions" button, it costs nothing, it requires no provider, and it works
// today.
//
// ── Why the URL scheme is per-platform ───────────────────────────────────────
//
// There is no portable one. `geo:` is Android-only. `maps://` is iOS-only. Web
// gets an HTTPS URL. Passing the wrong one produces a silent no-op — the button
// appears to do nothing, which is the worst possible outcome for a control
// whose entire purpose is "this one definitely works".
//
// ── What is not sent ─────────────────────────────────────────────────────────
//
// The origin. Every scheme below accepts one, and none is supplied: the maps
// app already knows where the device is, and putting a precise origin in a URL
// hands the member's current position to a third-party app that did not need to
// be told (§59). The destination is a place the member chose to go to and is
// unavoidable.
// ─────────────────────────────────────────────────────────────────────────────

import { Linking, Platform } from 'react-native';
import type { GeoCoordinate, TravelMode } from '@/types/maps';
import { isValidCoordinate } from './geo';

/** Apple Maps' `dirflg`, Google's `travelmode`. Different vocabularies. */
function appleMode(travelMode: TravelMode): string {
  switch (travelMode) {
    case 'walking':
      return 'w';
    case 'transit':
      return 'r';
    case 'driving':
    case 'cycling':
    default:
      // Apple Maps has no cycling directions in most regions and silently
      // ignores an unknown flag, so cycling falls back to driving rather than
      // opening with no route at all.
      return 'd';
  }
}

function googleMode(travelMode: TravelMode): string {
  switch (travelMode) {
    case 'walking':
      return 'walking';
    case 'transit':
      return 'transit';
    case 'cycling':
      return 'bicycling';
    case 'driving':
    default:
      return 'driving';
  }
}

/**
 * Opens the platform's navigation app at a destination.
 *
 * Returns false rather than throwing when nothing can handle the URL, so a
 * caller can fall back to showing the coordinates. §44: degrade, do not crash.
 */
export async function openExternalDirections(
  destination: GeoCoordinate,
  label: string,
  travelMode: TravelMode = 'walking'
): Promise<boolean> {
  if (!isValidCoordinate(destination)) return false;

  const lat = destination.latitude.toFixed(6);
  const lon = destination.longitude.toFixed(6);
  const encodedLabel = encodeURIComponent(label);

  const url =
    Platform.OS === 'ios'
      ? `maps://?daddr=${lat},${lon}&dirflg=${appleMode(travelMode)}&q=${encodedLabel}`
      : Platform.OS === 'android'
        ? // The `q=` label is what makes the pin say "Peckham Library" rather
          // than a pair of numbers, and `geo:0,0?q=` is the documented form for
          // a labelled destination.
          `geo:0,0?q=${lat},${lon}(${encodedLabel})`
        : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=${googleMode(
            travelMode
          )}`;

  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return await openWebFallback(lat, lon, travelMode);

    await Linking.openURL(url);
    return true;
  } catch {
    return await openWebFallback(lat, lon, travelMode);
  }
}

/**
 * The last resort: an HTTPS maps URL, which any device with a browser can open.
 *
 * Worth having because the native-scheme path fails on a device with no maps
 * app installed, and "nothing happened" is a worse answer than "it opened in
 * your browser".
 */
async function openWebFallback(
  lat: string,
  lon: string,
  travelMode: TravelMode
): Promise<boolean> {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=${googleMode(
    travelMode
  )}`;

  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Opens a map at a place, without directions. For "show on map" affordances. */
export async function openExternalPlace(
  coordinate: GeoCoordinate,
  label: string
): Promise<boolean> {
  if (!isValidCoordinate(coordinate)) return false;

  const lat = coordinate.latitude.toFixed(6);
  const lon = coordinate.longitude.toFixed(6);
  const encodedLabel = encodeURIComponent(label);

  const url =
    Platform.OS === 'ios'
      ? `maps://?ll=${lat},${lon}&q=${encodedLabel}`
      : Platform.OS === 'android'
        ? `geo:${lat},${lon}?q=${lat},${lon}(${encodedLabel})`
        : `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
