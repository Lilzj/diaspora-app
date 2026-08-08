// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — provider registry (Frontend Phase 8, §4, §45)
//
// The single place that decides which implementation answers. Every consumer
// asks the registry; nothing imports a concrete provider directly, which is
// what makes §4's "each provider should be replaceable" a structural property
// rather than a convention.
//
// ── The selection rule, and why it is in this order ──────────────────────────
//
// For every capability:
//
//   1. A **real** provider, if one is available and configured.
//   2. A **development adapter**, if the build is allowed to simulate.
//   3. An **unavailable** provider that fails cleanly in the domain's own error
//      vocabulary.
//
// Step 3 is the one that is easy to leave out and is the reason a production
// build behaves. Without it, a production build with no routing provider would
// have to be handled by every call site checking a flag before calling — and
// the first call site that forgot would throw inside a render. With it, the
// answer is `provider-unavailable`, the screen renders its "not available yet"
// state, and §44's "fall back gracefully, do not crash" holds by construction.
//
// ── Why these are functions and not constants ────────────────────────────────
//
// Resolution reads environment configuration and the simulation switch, both of
// which a test needs to vary. Module constants would capture the first answer
// and every subsequent test would inherit it. Resolution is a handful of
// property reads; there is nothing here worth caching, and `getProviderStatus`
// deliberately re-resolves so the diagnostics screen shows the live answer.
// ─────────────────────────────────────────────────────────────────────────────

import { getMapProviderConfig } from '@/config/map-config';
import { areMapsGapsEnabled } from '@/config/maps-gaps';
import { adapterRoutingProvider, unavailableRoutingProvider } from './adapter-routing';
import { canvasMapProvider } from './canvas-map';
import {
  resolveDeviceLocationProvider,
  resolveLocationPermissionProvider,
  hasNativeLocation,
} from './device-location';
import { nativeMapProvider } from './native-map';
import { platformGeocodingProvider, platformPlacesProvider } from './platform-geocoding';
import type {
  DeviceLocationProvider,
  GeocodingProvider,
  LocationPermissionProvider,
  MapSurfaceProvider,
  MapTileProvider,
  PlacesProvider,
  RoutingProvider,
} from './types';

/**
 * The map surface.
 *
 * The canvas renderer is the fallback and is a complete implementation, so
 * "unconfigured" produces a working map rather than a grey rectangle. The
 * native surface is selected only when the module resolved *and* a key is
 * present — see `getMapProviderConfig`, which requires both for the reason
 * given there.
 */
export function resolveMapSurfaceProvider(): MapSurfaceProvider {
  const config = getMapProviderConfig();
  if (config.isNativeConfigured && nativeMapProvider) return nativeMapProvider;
  return canvasMapProvider;
}

export { resolveLocationPermissionProvider, resolveDeviceLocationProvider };

/**
 * Geocoding.
 *
 * Always the platform provider, in every build including production, because
 * `/location/search` and `/location/reverse-geocode` are certified routes.
 * There is no adapter arm and no unavailable arm here — this is one of the
 * capabilities Phase 8 found already built.
 */
export function resolveGeocodingProvider(): GeocodingProvider {
  return platformGeocodingProvider;
}

export function resolvePlacesProvider(): PlacesProvider {
  return platformPlacesProvider;
}

/**
 * Routing.
 *
 * No real provider exists (MAP-PROVIDER-GAP-003), so this is the adapter in a
 * development or internal-test build and the refusing provider in production.
 * The refusing provider is what makes the route-planning screen render "route
 * estimates are not available in this build" instead of hanging on a promise
 * nobody will resolve.
 */
export function resolveRoutingProvider(): RoutingProvider {
  return areMapsGapsEnabled() ? adapterRoutingProvider : unavailableRoutingProvider;
}

/**
 * Tile configuration.
 *
 * Returns null for the canvas renderer, which has no tiles and therefore no
 * attribution obligation. A non-null value means the map chrome **must**
 * render `attribution` — several tile licences require it and shipping without
 * it is a breach rather than an oversight.
 */
export function resolveTileProvider(): MapTileProvider | null {
  const config = getMapProviderConfig();
  if (!config.isNativeConfigured) return null;

  return {
    descriptor: { id: 'configured-tiles', label: 'Map tiles', isSimulated: false },
    styleUrl: config.styleUrl || undefined,
    attribution: nativeMapProvider?.attribution ?? '',
    maxZoom: 20,
    // Conservative: several licences forbid offline storage and the safe
    // default is to assume this one does. Flipped only once the chosen
    // provider's terms have been read — see MAP-PROVIDER-GAP-007.
    supportsOffline: false,
  };
}

/**
 * A snapshot for the diagnostics surface and the readiness report.
 *
 * Contains no key, no key prefix and no URL that could carry one. This is
 * designed to be safe to screenshot into a bug report.
 */
export interface ProviderStatus {
  surface: { id: string; label: string; rendersRealGeography: boolean; gapKey?: string };
  location: { id: string; label: string; isSimulated: boolean; isNative: boolean };
  routing: { id: string; label: string; isSimulated: boolean; supportedModes: string[] };
  geocoding: { id: string; label: string; isSimulated: boolean };
  tiles: { configured: boolean; attribution: string };
  environment: string;
}

export function getProviderStatus(): ProviderStatus {
  const surface = resolveMapSurfaceProvider();
  const location = resolveDeviceLocationProvider();
  const routing = resolveRoutingProvider();
  const geocoding = resolveGeocodingProvider();
  const tiles = resolveTileProvider();
  const config = getMapProviderConfig();

  return {
    surface: {
      id: surface.descriptor.id,
      label: surface.descriptor.label,
      rendersRealGeography: surface.rendersRealGeography,
      gapKey: surface.descriptor.gapKey,
    },
    location: {
      id: location.descriptor.id,
      label: location.descriptor.label,
      isSimulated: location.descriptor.isSimulated,
      isNative: hasNativeLocation(),
    },
    routing: {
      id: routing.descriptor.id,
      label: routing.descriptor.label,
      isSimulated: routing.descriptor.isSimulated,
      supportedModes: routing.supportedModes,
    },
    geocoding: {
      id: geocoding.descriptor.id,
      label: geocoding.descriptor.label,
      isSimulated: geocoding.descriptor.isSimulated,
    },
    tiles: { configured: tiles !== null, attribution: tiles?.attribution ?? '' },
    environment: config.environment,
  };
}
