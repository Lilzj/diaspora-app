// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the cross-domain nearby aggregate, as it is actually sent
//
// **The map's Alerts layer has never drawn anything.** `GET /location/nearby`
// answers `NearbyResponse`: a `groups` dictionary keyed by resource type —
// `housing`, `jobs`, `marketplace`, `events`, `providers`, `guides`, `updates` —
// beside an `unavailableResourceTypes` list. The client read `data.updates`,
// `data.housing` and so on from the top level, where nothing has ever been, so
// every group resolved to `undefined` and fell through to `[]`.
//
// It typechecked because the response was cast — `apiClient.get<Envelope<{
// housing?: HousingListing[] }>>` tells the compiler a shape rather than showing
// it one — which is the failure `types/update.ts` records for the same module's
// enums, and the one this file exists to end.
//
// ── The items are not the verticals' own objects ─────────────────────────────
//
// A group holds `NearbyItemResponse`: a title, a category, a distance, a
// coordinate, a place name and an opaque `payload` the owning vertical fills.
// It is deliberately *not* a `HousingListing` or a `CommunityUpdate` — Location
// has no notion of a rent or an expiry — so a client that wants the whole
// object reads the vertical's own route, and a client that wants a pin reads
// this.
//
// ── Unavailable is not empty ─────────────────────────────────────────────────
//
// `unavailableResourceTypes` names the verticals that were asked and did not
// answer. Drawing those as "nothing nearby" is the mistake the server added the
// field to prevent, so a caller here raises instead, and the map's own
// partial-failure handling leaves that category's count absent rather than nought.
// ─────────────────────────────────────────────────────────────────────────────

import { unwrapEnvelope } from '@/lib/platform-envelope';
import { toAlertKind, toAlertSeverity } from '@/types/maps';
import type { CommunityAlert } from '@/types/maps';
import { toUpdateCategory, toUrgencyLevel } from '@/types/update';

/** `NearbyItemResponse` — one nearby thing, as the vertical that owns it described it. */
export interface NearbyItemWire {
  id?: string | null;
  title?: string | null;
  category?: string | null;
  distanceKm?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  cityName?: string | null;
  areaName?: string | null;
  imageUrl?: string | null;
  priceText?: string | null;
  rating?: number | null;
  /** Whatever the owning vertical's own client needs. Opaque to Location. */
  payload?: Record<string, string> | null;
}

/** `NearbyResponse`, loosely. */
export interface NearbyWire {
  radiusKm?: number | null;
  scope?: string | null;
  groups?: Record<string, NearbyItemWire[]> | null;
  unavailableResourceTypes?: string[] | null;
}

/** The keys the verticals register. Each is `const string Key` on its provider. */
export const NEARBY_GROUPS = [
  'housing',
  'jobs',
  'marketplace',
  'events',
  'providers',
  'guides',
  'updates',
] as const;

export type NearbyGroupKey = (typeof NEARBY_GROUPS)[number];

export interface NearbyResult {
  groups: Record<NearbyGroupKey, NearbyItemWire[]>;
  /** Verticals that were asked and did not answer. Never rendered as zero. */
  unavailable: NearbyGroupKey[];
}

/** Everything near a point, read from the envelope the route actually sends. */
export function readNearby(body: unknown): NearbyResult {
  const payload = unwrapEnvelope<NearbyWire>(body);
  const groups = payload?.groups ?? {};

  const read = (key: NearbyGroupKey): NearbyItemWire[] => {
    const items = groups[key];
    return Array.isArray(items) ? items : [];
  };

  const unavailable = (payload?.unavailableResourceTypes ?? []).filter(
    (name): name is NearbyGroupKey => (NEARBY_GROUPS as readonly string[]).includes(name)
  );

  return {
    groups: {
      housing: read('housing'),
      jobs: read('jobs'),
      marketplace: read('marketplace'),
      events: read('events'),
      providers: read('providers'),
      guides: read('guides'),
      updates: read('updates'),
    },
    unavailable,
  };
}

/** Whether the platform said it could not ask a vertical. */
export function nearbyUnavailable(result: NearbyResult, group: NearbyGroupKey): boolean {
  return result.unavailable.includes(group);
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function count(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * One `updates` item as the alert a map draws.
 *
 * Null without a coordinate: a pin needs somewhere to be, and an alert whose
 * publisher gave no position is a feed entry rather than a map one.
 *
 * Everything beyond the title comes out of the payload the Community module
 * fills — its own words, when it was reported, when it stops being true — and
 * nothing is invented where that is silent. The status is read rather than
 * assumed: the platform's sweep moves a post to `expired`, and between the
 * expiry and the sweep the expiry date is what says so.
 */
export function nearbyAlert(item: NearbyItemWire, now: Date = new Date()): CommunityAlert | null {
  const id = text(item.id);
  const latitude = item.latitude;
  const longitude = item.longitude;

  if (!id || typeof latitude !== 'number' || typeof longitude !== 'number') return null;

  const payload = item.payload ?? {};
  const expiresAt = text(payload.expiresAt);
  const status = text(payload.status)?.toLowerCase();

  const expired =
    status === 'expired' || (expiresAt !== null && new Date(expiresAt).getTime() < now.getTime());

  return {
    id,
    kind: toAlertKind(toUpdateCategory(item.category)),
    category: toUpdateCategory(item.category),
    title: text(item.title) ?? 'Community update',
    body: text(payload.body) ?? '',
    severity: toAlertSeverity(toUrgencyLevel(payload.urgency)),
    urgency: toUrgencyLevel(payload.urgency),
    status: expired ? 'Expired' : 'Active',
    coordinate: { latitude, longitude },
    // No `area`: the platform carries no affected-area geometry, and drawing a
    // radius nobody published would be the client deciding the scope of an
    // emergency. FRONTEND-MAPS-GAP-017.
    areaName: text(item.areaName) ?? text(item.cityName) ?? '',
    cityName: text(item.cityName) ?? '',
    countryCode: text(payload.countryCode) ?? '',
    publishedAt: text(payload.publishedAt) ?? '',
    expiresAt: expiresAt ?? undefined,
    sourceName: 'Community report',
    confirmationCount: count(payload.confirmationCount),
    verificationStatus: text(payload.verificationStatus) ?? undefined,
    source: 'backend',
    isShareable: true,
  };
}
