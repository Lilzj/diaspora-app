/**
 * What the map makes of an alert's area, precision and lifecycle — 16 Sep 2026.
 *
 * Two readers turn a post into a map alert: `nearbyAlert` for the viewport and
 * `toCommunityAlert` for one alert opened by id. Both must say the same thing
 * about the same post, or a withdrawn alert disappears from the map and then
 * reopens as active from its own page.
 */
import { nearbyAlert, type NearbyItemWire } from '../maps/nearby';
import { alertMarker, toCommunityAlert } from '../maps/markers';
import type { CommunityUpdate } from '@/types/update';

const NOW = new Date('2026-09-16T12:00:00Z');

function nearbyItem(payload: Record<string, string>): NearbyItemWire {
  return {
    id: 'a1',
    title: 'Burst water main',
    category: 'traffic',
    latitude: 51.4742,
    longitude: -0.0691,
    distanceKm: 0.2,
    cityName: 'London',
    areaName: 'Peckham',
    payload: {
      urgency: 'urgent',
      status: 'published',
      body: 'Flooding by the station',
      publishedAt: '2026-09-16T11:00:00Z',
      expiresAt: '2026-09-16T18:00:00Z',
      ...payload,
    },
  } as NearbyItemWire;
}

function update(overrides: Partial<CommunityUpdate>): CommunityUpdate {
  return {
    updateId: 'a1',
    authorId: 'u1',
    title: 'Burst water main',
    description: 'Flooding by the station',
    category: 'Traffic',
    urgency: 'urgent',
    location: {
      latitude: 51.4742,
      longitude: -0.0691,
      areaName: 'Peckham',
      cityName: 'London',
      countryCode: 'GB',
      pointIsExact: true,
    },
    publishedAt: '2026-09-16T11:00:00Z',
    expiresAt: '2099-09-16T18:00:00Z',
    isExpired: false,
    imageUrls: [],
    confirmationCount: 0,
    verifiedResidentConfirmationCount: 0,
    requiredConfirmations: 3,
    requiredVerifiedConfirmations: 1,
    reportCount: 0,
    commentCount: 0,
    verificationStatus: 'Unverified',
    status: 'published',
    createdAt: '2026-09-16T11:00:00Z',
    ...overrides,
  } as CommunityUpdate;
}

describe('an alert from the viewport', () => {
  it('draws the area its author stated, centred on the pin', () => {
    const alert = nearbyAlert(nearbyItem({ affectedRadiusMetres: '800', locationPrecision: 'exact' }), NOW)!;

    expect(alert.area).toEqual({ center: { latitude: 51.4742, longitude: -0.0691 }, radiusMetres: 800 });
    expect(alert.locationPrecision).toBe('exact');
  });

  it('draws no area when none was stated, rather than inventing one', () => {
    expect(nearbyAlert(nearbyItem({}), NOW)!.area).toBeUndefined();
  });

  it('marks an alert placed at a town centre as approximate', () => {
    expect(nearbyAlert(nearbyItem({ locationPrecision: 'area' }), NOW)!.locationPrecision).toBe('area');
  });

  it('carries the amendment time so the card can say it changed', () => {
    expect(nearbyAlert(nearbyItem({ editedAt: '2026-09-16T11:30:00Z' }), NOW)!.updatedAt).toBe(
      '2026-09-16T11:30:00Z'
    );
  });
});

describe('an alert opened by id', () => {
  it('says withdrawn and cancelled, and neither is drawn on a map', () => {
    const withdrawn = toCommunityAlert(update({ status: 'withdrawn', closedAt: '2026-09-16T11:45:00Z' }));
    const cancelled = toCommunityAlert(update({ status: 'cancelled' }));

    expect(withdrawn.status).toBe('Withdrawn');
    expect(withdrawn.closedAt).toBe('2026-09-16T11:45:00Z');
    expect(cancelled.status).toBe('Cancelled');
    expect(alertMarker(withdrawn)).toBeNull();
    expect(alertMarker(cancelled)).toBeNull();
  });

  it('agrees with the viewport about the area and the precision', () => {
    const alert = toCommunityAlert(
      update({ affectedRadiusMetres: 800, location: { ...update({}).location, pointIsExact: false } })
    );

    expect(alert.area?.radiusMetres).toBe(800);
    expect(alert.locationPrecision).toBe('area');
  });
});
