// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — maps bridge (Frontend Phase 16, §10 · §12)
//
// **This file adds no map implementation.** It is a read-only bridge onto the
// provider abstraction Phase 8 already built, so the connection centre can show
// map status beside the other integrations.
//
// ── Why there is nothing else here ───────────────────────────────────────────
//
// The audit found §10's requirement already satisfied, in full, by work that
// exists:
//
//   `lib/maps/providers/registry.ts`  the same real → adapter → unavailable
//                                     selection rule this phase's registry uses
//   `lib/maps/providers/types.ts`     a provider-neutral surface, geocoding,
//                                     places, routing and location contract
//                                     with no vendor type in it
//   `lib/maps/providers/canvas-map`   a complete fallback renderer
//   `lib/maps/providers/native-map`   the react-native-maps adapter
//   `lib/maps/providers/platform-geocoding`
//                                     geocoding over the **certified**
//                                     `/location/search` and
//                                     `/location/reverse-geocode`
//   `config/map-provider-gaps.ts`     its own provider gap register
//
// §12 says "do not build isolated map implementations per feature". A phase
// whose brief includes "map provider abstraction" is the most likely place in
// the codebase for that instruction to be violated — the pull to build a
// `MapProvider` here, beside the `CalendarProvider` and the `PushProvider`, for
// symmetry, is real. It would produce two registries with two selection rules
// over one set of implementations.
//
// So the honest work for this phase was to read what exists, confirm it meets
// §10, and expose its status. That is what this file does, and its shortness is
// the deliverable rather than an omission.
//
// One genuine gap was found and it is not an abstraction gap: Phase 8's
// geocoding provider is **backend-connected in production** while its routing
// provider is not (MAP-PROVIDER-GAP-003). The connection centre must therefore
// show maps as `PARTIALLY_CONNECTED` rather than as one state, which is what
// `mapConnection()` below computes.
// ─────────────────────────────────────────────────────────────────────────────

import { getProviderStatus } from '@/lib/maps/providers/registry';
import { getMapFeatureFlags } from '@/config/map-config';
import { MAP_PROVIDER_GAPS } from '@/config/map-provider-gaps';
import type {
  IntegrationCapability,
  IntegrationConnection,
  IntegrationMode,
  IntegrationStatus,
} from '@/types/integrations';

/**
 * Phase 8's status, expressed as an `IntegrationConnection`.
 *
 * The translation is where the interesting judgement is. Maps have no account,
 * no OAuth grant and no disconnect — they are a platform capability rather than
 * something a member connects — so most of the connection shape is empty, and
 * `status` has to be derived from *which capabilities actually work* rather
 * than from a connection record.
 *
 * The rule applied:
 *
 *   every capability real            → CONNECTED
 *   some real, some simulated/absent → PARTIALLY_CONNECTED
 *   nothing real                     → DEVELOPMENT or UNAVAILABLE
 *
 * `PARTIALLY_CONNECTED` is the honest answer in production today and is the
 * reason §31's union has that member: a member searching an address gets a real
 * result from a certified route, and a member planning a route gets a labelled
 * estimate. One status for both would misdescribe one of them.
 */
export function mapConnection(now: string): IntegrationConnection {
  const status = getProviderStatus();
  const flags = getMapFeatureFlags();

  const grantedCapabilities: IntegrationCapability[] = ['maps.render'];

  // Geocoding and places run over `/location/search` and
  // `/location/reverse-geocode`, which are certified. Real in every build.
  if (!status.geocoding.isSimulated) {
    grantedCapabilities.push('maps.geocode', 'maps.reverseGeocode', 'maps.places');
  }
  if (flags.routePlanningEnabled) {
    grantedCapabilities.push('maps.directions', 'maps.travelTime');
  }
  if (flags.transitEnabled) {
    grantedCapabilities.push('maps.transit');
  }

  // Any simulated component means the whole integration cannot claim
  // REAL_PROVIDER. The surface is real (the canvas renderer is a complete
  // implementation, not a simulation) but the routing estimates are not.
  const hasSimulatedComponent = status.routing.isSimulated || status.location.isSimulated;

  const mode: IntegrationMode = hasSimulatedComponent
    ? 'DEVELOPMENT_PROVIDER'
    : status.surface.rendersRealGeography
      ? 'REAL_PROVIDER'
      : // The canvas renderer with certified geocoding: the data is the
        // platform's own and the drawing is schematic. `BACKEND_CONNECTED` is
        // the accurate description — real answers, drawn without a tile vendor.
        'BACKEND_CONNECTED';

  const connectionStatus: IntegrationStatus = hasSimulatedComponent
    ? 'PARTIALLY_CONNECTED'
    : 'CONNECTED';

  return {
    provider: 'maps.platform',
    domain: 'maps',
    status: connectionStatus,
    mode,
    // No account. Maps are not something a member signs into, and inventing an
    // account here would make the connection centre offer a disconnect that
    // would do nothing.
    account: null,
    grantedCapabilities,
    scopes: [],
    expiresAt: null,
    lastSyncedAt: null,
    lastError: null,
    gapId: hasSimulatedComponent ? MAP_PROVIDER_GAPS.tileMap.id : null,
    observedAt: now,
  };
}

/**
 * A short, credential-free description of the map configuration.
 *
 * Delegates to Phase 8's own `getProviderStatus`, which already promises to
 * carry no key, no key prefix and no URL that could contain one. Repeating that
 * promise here rather than assembling a new string keeps one guarantee rather
 * than two.
 */
export function describeMapProviders(): { label: string; detail: string }[] {
  const status = getProviderStatus();

  return [
    {
      label: 'Map surface',
      detail: status.surface.rendersRealGeography
        ? `${status.surface.label} · real geography`
        : `${status.surface.label} · schematic, no tile provider configured`,
    },
    {
      label: 'Search and addresses',
      detail: status.geocoding.isSimulated
        ? `${status.geocoding.label} · simulated`
        : `${status.geocoding.label} · connected to the platform`,
    },
    {
      label: 'Routes and travel time',
      detail: status.routing.isSimulated
        ? `${status.routing.label} · estimated, no routing provider configured`
        : `${status.routing.label} · ${status.routing.supportedModes.join(', ')}`,
    },
    {
      label: 'Location',
      detail: status.location.isNative
        ? `${status.location.label} · device location`
        : `${status.location.label} · no device location module`,
    },
  ];
}
