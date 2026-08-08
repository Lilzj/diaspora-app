// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — error vocabulary and instrumentation
// (Frontend Phase 8, §44, §51, §54, §59)
//
// Two modules that are cheap to cover completely and expensive to get wrong.
//
// `errors.ts` is §44's exhaustive switch. Its value is that every failure mode
// has a specific sentence and a specific recovery action — so the test walks
// every member of the union rather than sampling a few.
//
// `analytics.ts` is where a coordinate would leak if one ever did. The banding
// functions exist so a distance and a duration never travel as raw numbers,
// because in combination and over enough events those reconstruct a route, and
// a route is a location history.
// ─────────────────────────────────────────────────────────────────────────────

import { classifyError, mapErrorCopy, toMapError } from '@/lib/maps/errors';
import {
  distanceBand,
  durationBand,
  geoProperties,
  trackMapsEvent,
  trackPermissionOutcome,
  trackProviderError,
  trackRoutePlanned,
  zoomBand,
} from '@/lib/maps/analytics';
import { drainCreatorEvents, resetCreatorEvents } from '@/lib/creator-analytics';
import type { MapErrorKind } from '@/types/maps';

const ALL_ERRORS: MapErrorKind[] = [
  'provider-unavailable',
  'tiles-unavailable',
  'geocoding-failed',
  'routing-failed',
  'transit-unavailable',
  'no-route',
  'location-unavailable',
  'location-permission-denied',
  'location-services-disabled',
  'network-unavailable',
  'offline',
  'rate-limited',
  'quota-exceeded',
  'invalid-coordinates',
  'no-results',
  'too-many-results',
  'not-found',
  'unauthorized',
  'forbidden',
  'stale-data',
  'unknown',
];

describe('every failure mode has copy a member can act on — §44', () => {
  it.each(ALL_ERRORS)('%s has a title, a body and an action', (kind) => {
    const copy = mapErrorCopy(kind);

    expect(copy.title.length).toBeGreaterThan(3);
    expect(copy.body.length).toBeGreaterThan(20);
    expect(['retry', 'open-settings', 'enable-location', 'widen-search', 'none']).toContain(
      copy.action
    );
    // An action other than "none" needs a label, or the button has no text.
    if (copy.action !== 'none') expect(copy.actionLabel).toBeTruthy();
  });

  it('never names a vendor or a status code', () => {
    for (const kind of ALL_ERRORS) {
      const copy = mapErrorCopy(kind);
      const text = `${copy.title} ${copy.body}`;

      expect(text).not.toMatch(/google|mapbox|apple maps|openstreetmap|osm/i);
      expect(text).not.toMatch(/\b(4\d{2}|5\d{2})\b/);
      expect(text).not.toMatch(/[A-Z_]{6,}/); // no SCREAMING_ENUM leaking through
    }
  });

  it('offers a retry only where a retry could plausibly work', () => {
    // The distinction that stops a button being decorative.
    for (const kind of ['no-route', 'location-permission-denied', 'quota-exceeded', 'forbidden'] as const) {
      expect(mapErrorCopy(kind).retryable).toBe(false);
    }
    for (const kind of ['network-unavailable', 'routing-failed', 'geocoding-failed', 'offline'] as const) {
      expect(mapErrorCopy(kind).retryable).toBe(true);
    }
  });

  it('sends permanent permission problems to settings, not to a retry', () => {
    expect(mapErrorCopy('location-permission-denied').action).toBe('open-settings');
    expect(mapErrorCopy('location-services-disabled').action).toBe('open-settings');
    // A recoverable sensor failure gets the retry instead.
    expect(mapErrorCopy('location-unavailable').action).toBe('retry');
  });

  it('offers to widen the search when there is simply nothing here', () => {
    expect(mapErrorCopy('no-results').action).toBe('widen-search');
  });

  it('writes gives every distinct kind distinct copy', () => {
    const bodies = ALL_ERRORS.map((kind) => mapErrorCopy(kind).body);
    expect(new Set(bodies).size).toBe(ALL_ERRORS.length);
  });

  it('builds a MapError with the copy already resolved', () => {
    const error = toMapError('rate-limited', 'someGap');
    expect(error.kind).toBe('rate-limited');
    expect(error.message).toBe(mapErrorCopy('rate-limited').body);
    expect(error.retryable).toBe(true);
    expect(error.gapKey).toBe('someGap');
  });
});

describe('classifying a thrown value', () => {
  it('maps HTTP statuses onto the domain vocabulary', () => {
    expect(classifyError({ response: { status: 401 } })).toBe('unauthorized');
    expect(classifyError({ response: { status: 403 } })).toBe('forbidden');
    expect(classifyError({ response: { status: 404 } })).toBe('not-found');
    expect(classifyError({ response: { status: 429 } })).toBe('rate-limited');
    expect(classifyError({ response: { status: 503 } })).toBe('provider-unavailable');
  });

  it('treats no response at all as a network failure', () => {
    // A 500 is a server the device could reach, which is a different problem
    // with a different message — the same distinction `apiClient` draws.
    expect(classifyError({ code: 'ECONNABORTED' })).toBe('network-unavailable');
    expect(classifyError({ message: 'Network Error' })).toBe('network-unavailable');
    expect(classifyError({ response: { status: 500 } })).toBe('provider-unavailable');
  });

  it('is conservative about anything it does not recognise', () => {
    // A wrong classification produces confidently wrong copy and an action that
    // cannot work, which is worse than a generic message.
    expect(classifyError(null)).toBe('unknown');
    expect(classifyError('boom')).toBe('unknown');
    expect(classifyError(new Error('something'))).toBe('unknown');
    expect(classifyError({ response: { status: 418 } })).toBe('unknown');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ANALYTICS — §51, §59
// ═════════════════════════════════════════════════════════════════════════════

describe('banding — the reason a route cannot be reconstructed from events', () => {
  it('bands distance into ranges rather than emitting metres', () => {
    expect(distanceBand(200)).toBe('under-500m');
    expect(distanceBand(1500)).toBe('500m-2km');
    expect(distanceBand(3000)).toBe('2-5km');
    expect(distanceBand(9000)).toBe('5-15km');
    expect(distanceBand(30_000)).toBe('15-50km');
    expect(distanceBand(120_000)).toBe('over-50km');
  });

  it('bands duration into ranges rather than emitting seconds', () => {
    expect(durationBand(120)).toBe('under-5min');
    expect(durationBand(600)).toBe('5-15min');
    expect(durationBand(1200)).toBe('15-30min');
    expect(durationBand(2400)).toBe('30-60min');
    expect(durationBand(7200)).toBe('over-60min');
  });

  it('bands zoom coarsely, so a cell and a zoom together do not narrow a position', () => {
    expect(zoomBand(5)).toBe('country');
    expect(zoomBand(10)).toBe('region');
    expect(zoomBand(13)).toBe('city');
    expect(zoomBand(17)).toBe('street');
  });

  it('returns "unknown" rather than a number for missing or invalid input', () => {
    for (const band of [distanceBand, durationBand, zoomBand]) {
      expect(band(null)).toBe('unknown');
      expect(band(undefined)).toBe('unknown');
      expect(band(NaN)).toBe('unknown');
      expect(band(Infinity)).toBe('unknown');
    }
  });
});

describe('geographic properties on an event', () => {
  it('emits a cell and a country, never a coordinate', () => {
    const props = geoProperties({ latitude: 51.474212, longitude: -0.069134 }, 'GB');

    expect(props.geoCell).toBe('gb:51.5,-0.1');
    expect(props.countryCode).toBe('GB');
    expect(Object.keys(props).sort()).toEqual(['countryCode', 'geoCell']);
  });

  it('still reports the country when there is no coordinate', () => {
    const props = geoProperties(null, 'MU');
    expect(props.countryCode).toBe('MU');
    expect(props.geoCell).toBeUndefined();
  });
});

describe('emitted events survive the allow-list intact', () => {
  beforeEach(() => resetCreatorEvents());
  afterEach(() => resetCreatorEvents());

  it('records a map event with its permitted properties', () => {
    trackMapsEvent('maps.opened', { surface: 'discovery', displayMode: 'map' });

    const events = drainCreatorEvents();
    const opened = events.find((e) => e.event === 'maps.opened');

    expect(opened).toBeTruthy();
    expect(opened!.properties?.surface).toBe('discovery');
    expect(opened!.properties?.displayMode).toBe('map');
  });

  it('drops a coordinate a call site tried to attach — §51', () => {
    // The allow-list is applied at emit, so a well-meaning addition is dropped
    // rather than reviewed later.
    trackMapsEvent('maps.marker.selected', {
      markerCategory: 'housing',
      latitude: 51.4742,
      longitude: -0.0691,
      address: '14 Rye Lane',
    } as never);

    const event = drainCreatorEvents().find((e) => e.event === 'maps.marker.selected');

    expect(event!.properties?.markerCategory).toBe('housing');
    expect(event!.properties?.latitude).toBeUndefined();
    expect(event!.properties?.longitude).toBeUndefined();
    expect(event!.properties?.address).toBeUndefined();
  });

  it('bands a planned route rather than recording its dimensions', () => {
    trackRoutePlanned({
      travelMode: 'walking',
      distanceMetres: 3200,
      durationSeconds: 2300,
      isRouted: false,
      alternativeCount: 3,
      waypointCount: 0,
    });

    const event = drainCreatorEvents().find((e) => e.event === 'maps.route.planned');

    expect(event!.properties?.distanceBand).toBe('2-5km');
    expect(event!.properties?.durationBand).toBe('30-60min');
    expect(event!.properties?.isRouted).toBe(false);
    // No raw figures anywhere on the payload.
    expect(event!.properties?.distanceMetres).toBeUndefined();
    expect(event!.properties?.durationSeconds).toBeUndefined();
  });

  it('records a provider failure with its gap key', () => {
    trackProviderError({
      errorKind: 'provider-unavailable',
      providerId: 'adapter-routing',
      gapKey: 'routing',
    });

    const event = drainCreatorEvents().find((e) => e.event === 'maps.provider.error');
    expect(event!.properties?.errorKind).toBe('provider-unavailable');
    expect(event!.properties?.providerId).toBe('adapter-routing');
    expect(event!.properties?.gapKey).toBe('routing');
  });

  it('routes a permission outcome to the right event name', () => {
    trackPermissionOutcome('granted', 'precise');
    trackPermissionOutcome('deniedPermanently', 'unknown');

    const events = drainCreatorEvents().map((e) => e.event);
    expect(events).toContain('maps.location_permission.granted');
    expect(events).toContain('maps.location_permission.denied');
  });

  it('treats an approximate grant as a grant, not a denial', () => {
    trackPermissionOutcome('grantedApproximate', 'approximate');
    const events = drainCreatorEvents().map((e) => e.event);
    expect(events).toContain('maps.location_permission.granted');
  });
});
