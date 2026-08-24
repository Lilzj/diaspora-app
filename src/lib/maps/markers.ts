// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — marker normalization (Frontend Phase 8, §8, §39, §50)
//
// One function per domain entity, each producing the same `MapMarker`. This is
// how §8's "do not create a separate marker rendering implementation for every
// feature" is actually achieved: the renderers take `MapMarker` and know
// nothing about housing, jobs or alerts, and every feature that wants to appear
// on a map writes a converter here rather than a pin component of its own.
//
// Every converter goes through `markerCoordinate()`, which applies the
// category's mandated precision from `lib/maps/privacy.ts`. That is not a
// convention a reviewer has to check — it is the only sanctioned path from an
// entity's coordinate to a marker's, and a converter that skipped it would be
// visible in a two-line diff.
//
// ── The accessibility label is required, not optional ────────────────────────
//
// `MapMarker.accessibilityLabel` is non-optional in the type, so every
// converter must decide what a screen reader says. The labels below are written
// as sentences a person would say — "Two-bedroom flat in Peckham, £1,450 a
// month, 800 metres away" — rather than as field dumps. §50 makes the list view
// a first-class representation and these strings are what it reads out; a label
// of "housing marker 3" would satisfy the type and fail the requirement.
//
// Distance is included whenever it is known, because on a map "how far" is the
// one thing the visual conveys instantly and the label otherwise loses entirely.
// ─────────────────────────────────────────────────────────────────────────────

import type { CommunityUpdate } from '@/types/update';
import type { HousingListing } from '@/types/housing';
import type { JobOpportunity } from '@/types/job';
import type { MarketplaceListing } from '@/types/marketplace';
import type { Guide } from '@/types/guide';
import type { CommunityOrganization, Event } from '@/types/community-life';
import {
  toAlertKind,
  toAlertSeverity,
  type CommunityAlert,
  type DataSource,
  type GeoCoordinate,
  type MapMarker,
  type MarkerCategory,
  type StraightLineDistance,
} from '@/types/maps';
import { formatDistance } from '@/utils/geo';
import { distanceBetween, isValidCoordinate, toKm } from './geo';
import { markerCoordinate } from './privacy';

/** Anything with a possibly-missing coordinate pair. */
interface LooseLocation {
  latitude?: number | null;
  longitude?: number | null;
}

function coordinateOf(location: LooseLocation | undefined | null): GeoCoordinate | null {
  if (!location) return null;
  const { latitude, longitude } = location;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  const coordinate = { latitude, longitude };
  return isValidCoordinate(coordinate) ? coordinate : null;
}

function distanceFrom(
  coordinate: GeoCoordinate,
  origin?: GeoCoordinate | null
): StraightLineDistance | undefined {
  if (!origin || !isValidCoordinate(origin)) return undefined;
  return distanceBetween(origin, coordinate);
}

/** "800 metres away" / "2.4 km away", or nothing when there is no origin. */
function distancePhrase(distance?: StraightLineDistance): string {
  if (!distance) return '';
  const km = toKm(distance);
  if (km < 1) return `, ${Math.round(km * 1000)} metres away`;
  return `, ${km.toFixed(1)} kilometres away`;
}

/**
 * Builds a marker with the privacy rule already applied.
 *
 * Private because nothing outside this module should be constructing markers:
 * a marker built elsewhere would be a marker that skipped `markerCoordinate`.
 */
function buildMarker(input: {
  id: string;
  category: MarkerCategory;
  rawCoordinate: GeoCoordinate;
  title: string;
  subtitle?: string;
  badge?: string;
  accessibilityLabel: string;
  destination?: MapMarker['destination'];
  entityId?: string;
  severity?: MapMarker['severity'];
  source: DataSource;
  origin?: GeoCoordinate | null;
}): MapMarker {
  const { coordinate, isPrivacyReduced } = markerCoordinate(
    input.rawCoordinate,
    input.category,
    input.entityId ?? input.id
  );

  // Distance is measured from the *displayed* coordinate, not the true one. A
  // label that said "120 m away" beside a pin deliberately offset by 150 m
  // would be a small, quiet way of leaking the real position back.
  const distance = distanceFrom(coordinate, input.origin);

  return {
    id: input.id,
    category: input.category,
    coordinate,
    title: input.title,
    subtitle: input.subtitle,
    badge: input.badge,
    accessibilityLabel: `${input.accessibilityLabel}${distancePhrase(distance)}${
      isPrivacyReduced ? '. Approximate location.' : ''
    }`,
    distance,
    destination: input.destination,
    entityId: input.entityId,
    severity: input.severity,
    source: input.source,
    isPrivacyReduced,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// HOUSING — §31
// ═════════════════════════════════════════════════════════════════════════════

export function housingMarker(
  listing: HousingListing,
  origin?: GeoCoordinate | null,
  source: DataSource = 'backend'
): MapMarker | null {
  const coordinate = coordinateOf(listing.location);
  if (!coordinate) return null;

  const price = formatPrice(listing.rent, listing.currency);

  return buildMarker({
    id: `housing:${listing.id}`,
    category: 'housing',
    rawCoordinate: coordinate,
    title: listing.title,
    subtitle: [listing.listingType, listing.location.areaName].filter(Boolean).join(' · '),
    badge: price || undefined,
    accessibilityLabel: [
      listing.title,
      listing.listingType,
      typeof listing.bedrooms === 'number' && listing.bedrooms > 0
        ? `${listing.bedrooms} bedroom${listing.bedrooms === 1 ? '' : 's'}`
        : '',
      listing.location.areaName ? `in ${listing.location.areaName}` : '',
      price ? `${price} a month` : '',
    ]
      .filter(Boolean)
      .join(', '),
    destination: { pathname: '/housing/[id]', params: { id: listing.id } },
    entityId: listing.id,
    source,
    origin,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// MARKETPLACE — §32
// ═════════════════════════════════════════════════════════════════════════════

export function marketplaceMarker(
  listing: MarketplaceListing,
  origin?: GeoCoordinate | null,
  source: DataSource = 'backend'
): MapMarker | null {
  const coordinate = coordinateOf(listing.location);
  if (!coordinate) return null;

  const price = formatPrice(listing.price, listing.currency);

  return buildMarker({
    id: `marketplace:${listing.id}`,
    category: 'marketplace',
    rawCoordinate: coordinate,
    title: listing.title,
    subtitle: [listing.category, listing.condition].filter(Boolean).join(' · '),
    badge: price || undefined,
    // §32: the seller is never named in the label. A marketplace pin says what
    // is for sale and roughly where, and nothing that identifies who is holding
    // it — a screen reader announcing a name beside an approximate home
    // location is the leak that section exists to prevent.
    accessibilityLabel: [
      listing.title,
      price ? `${price}` : '',
      listing.condition ? `condition ${listing.condition}` : '',
      listing.location.areaName ? `collect from around ${listing.location.areaName}` : '',
    ]
      .filter(Boolean)
      .join(', '),
    destination: { pathname: '/marketplace/[id]', params: { id: listing.id } },
    entityId: listing.id,
    source,
    origin,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// JOBS — §33
// ═════════════════════════════════════════════════════════════════════════════

export function jobMarker(
  job: JobOpportunity,
  origin?: GeoCoordinate | null,
  source: DataSource = 'backend'
): MapMarker | null {
  const coordinate = coordinateOf(job.location);
  if (!coordinate) return null;

  return buildMarker({
    id: `job:${job.jobId}`,
    category: 'job',
    rawCoordinate: coordinate,
    title: job.title,
    subtitle: [job.employer?.name, job.employmentType].filter(Boolean).join(' · '),
    badge: job.employmentType ? shortEmploymentType(job.employmentType) : undefined,
    accessibilityLabel: [
      job.title,
      job.employer?.name ? `at ${job.employer.name}` : '',
      job.employmentType ?? '',
      job.location.areaName ? `in ${job.location.areaName}` : '',
    ]
      .filter(Boolean)
      .join(', '),
    destination: { pathname: '/job/[id]', params: { id: job.jobId } },
    entityId: job.jobId,
    source,
    origin,
  });
}

function shortEmploymentType(type: string): string {
  if (/full/i.test(type)) return 'FT';
  if (/part/i.test(type)) return 'PT';
  if (/contract/i.test(type)) return 'Con';
  if (/temp/i.test(type)) return 'Tmp';
  return type.slice(0, 3);
}

// ═════════════════════════════════════════════════════════════════════════════
// PROVIDERS — §34
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A directory listing.
 *
 * Typed structurally rather than against a `Listing` interface: the provider
 * directory predates this phase and its shape varies between the mock data and
 * the search result meta. Taking only what a marker needs keeps this converter
 * from becoming a reason to change that type.
 */
export interface ProviderListingLike {
  listingId: string;
  title: string;
  category?: { name?: string } | string;
  rating?: number;
  isVerified?: boolean;
  location: LooseLocation & { areaName?: string; cityName?: string };
}

export function providerMarker(
  listing: ProviderListingLike,
  origin?: GeoCoordinate | null,
  source: DataSource = 'backend'
): MapMarker | null {
  const coordinate = coordinateOf(listing.location);
  if (!coordinate) return null;

  const category =
    typeof listing.category === 'string' ? listing.category : (listing.category?.name ?? '');

  return buildMarker({
    id: `provider:${listing.listingId}`,
    category: 'provider',
    rawCoordinate: coordinate,
    title: listing.title,
    subtitle: [category, listing.location.areaName].filter(Boolean).join(' · '),
    badge: typeof listing.rating === 'number' ? `★${listing.rating.toFixed(1)}` : undefined,
    accessibilityLabel: [
      listing.title,
      category,
      listing.isVerified ? 'verified' : '',
      typeof listing.rating === 'number' ? `rated ${listing.rating.toFixed(1)} out of 5` : '',
      listing.location.areaName ? `in ${listing.location.areaName}` : '',
    ]
      .filter(Boolean)
      .join(', '),
    destination: { pathname: '/provider/[id]', params: { id: listing.listingId } },
    entityId: listing.listingId,
    source,
    origin,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// EVENTS — §36
// ═════════════════════════════════════════════════════════════════════════════

export function eventMarker(
  event: Event,
  origin?: GeoCoordinate | null,
  source: DataSource = 'backend'
): MapMarker | null {
  const coordinate = coordinateOf(event.location);
  if (!coordinate) return null;

  const when = event.date ? formatEventDate(event.date) : '';

  return buildMarker({
    id: `event:${event.id}`,
    category: 'event',
    rawCoordinate: coordinate,
    title: event.title,
    subtitle: [when, event.location.landmark ?? event.location.areaName]
      .filter(Boolean)
      .join(' · '),
    badge: when || undefined,
    accessibilityLabel: [
      event.title,
      when ? `on ${when}` : '',
      event.time ? `at ${event.time}` : '',
      event.location.landmark ? `at ${event.location.landmark}` : '',
      event.location.areaName ? `in ${event.location.areaName}` : '',
    ]
      .filter(Boolean)
      .join(', '),
    destination: { pathname: '/community-life/event/[id]', params: { id: event.id } },
    entityId: event.id,
    source,
    origin,
  });
}

function formatEventDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ═════════════════════════════════════════════════════════════════════════════
// ORGANIZATIONS — §37
// ═════════════════════════════════════════════════════════════════════════════

export function organizationMarker(
  organization: CommunityOrganization,
  origin?: GeoCoordinate | null,
  source: DataSource = 'backend'
): MapMarker | null {
  const coordinate = coordinateOf(organization.location);
  if (!coordinate) return null;

  return buildMarker({
    id: `organization:${organization.id}`,
    category: 'organization',
    rawCoordinate: coordinate,
    title: organization.name,
    subtitle: [organization.category, organization.location.areaName].filter(Boolean).join(' · '),
    accessibilityLabel: [
      organization.name,
      organization.category ?? '',
      organization.isVerified ? 'verified organization' : '',
      organization.location.areaName ? `in ${organization.location.areaName}` : '',
    ]
      .filter(Boolean)
      .join(', '),
    destination: {
      pathname: '/community-life/org/[id]',
      params: { id: organization.id },
    },
    entityId: organization.id,
    source,
    origin,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// GUIDES — §35
// ═════════════════════════════════════════════════════════════════════════════

export function guideMarker(
  guide: Guide,
  origin?: GeoCoordinate | null,
  source: DataSource = 'backend'
): MapMarker | null {
  const coordinate = coordinateOf(guide.location);
  if (!coordinate) return null;

  return buildMarker({
    id: `guide:${guide.guideId}`,
    category: 'guide',
    rawCoordinate: coordinate,
    title: guide.title,
    subtitle: [guide.category, guide.location?.neighborhood ?? guide.location?.cityName]
      .filter(Boolean)
      .join(' · '),
    // §35 and FRONTEND-MAPS-GAP-004: a guide covers an area, not a point. The
    // label says "covering", never "at", so nobody reads the pin as an address.
    accessibilityLabel: [
      guide.title,
      guide.category ? `${guide.category} guide` : 'guide',
      guide.location?.neighborhood || guide.location?.cityName
        ? `covering ${guide.location.neighborhood ?? guide.location.cityName}`
        : '',
    ]
      .filter(Boolean)
      .join(', '),
    destination: { pathname: '/guide/[id]', params: { id: guide.guideId } },
    entityId: guide.guideId,
    source,
    origin,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// COMMUNITY ALERTS — §27, §28
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Maps a B9 Community Update onto the alert vocabulary.
 *
 * The reason §27 says "do not create a parallel notification system": this is
 * a *translation*, not a second feed. Every field comes from the certified
 * `CommunityUpdate`, and `toAlertSeverity` / `toAlertKind` in `types/maps.ts`
 * are the only mapping. An update that expires stops being an active alert
 * here without anybody having to remember to sweep it (§29).
 */
export function toCommunityAlert(update: CommunityUpdate): CommunityAlert {
  const expired =
    update.isExpired ||
    update.status === 'expired' ||
    (Boolean(update.expiresAt) && new Date(update.expiresAt).getTime() < Date.now());

  return {
    id: update.updateId,
    kind: toAlertKind(update.category),
    category: update.category,
    title: update.title,
    body: update.description,
    severity: toAlertSeverity(update.urgency),
    urgency: update.urgency,
    status: expired ? 'Expired' : update.status === 'active' ? 'Active' : 'Published',
    coordinate: { latitude: update.location.latitude, longitude: update.location.longitude },
    // No `area`. FRONTEND-MAPS-GAP-017: the certified contract carries no
    // affected-area geometry and drawing a radius the publisher did not state
    // would be the client deciding the scope of an emergency.
    areaName: update.location.areaName,
    cityName: update.location.cityName,
    countryCode: update.location.countryCode,
    publishedAt: update.publishedAt,
    expiresAt: update.expiresAt,
    sourceName: 'Community report',
    confirmationCount: update.confirmationCount,
    verificationStatus: update.verificationStatus,
    source: 'backend',
    isShareable: true,
  };
}

export function alertMarker(
  alert: CommunityAlert,
  origin?: GeoCoordinate | null
): MapMarker | null {
  if (!isValidCoordinate(alert.coordinate)) return null;

  // §29: expired alerts do not stay on the map. Filtered here rather than at
  // the call site so no surface can forget.
  if (alert.status === 'Expired' || alert.status === 'Withdrawn' || alert.status === 'Cancelled') {
    return null;
  }

  return buildMarker({
    id: `alert:${alert.id}`,
    category: 'alert',
    rawCoordinate: alert.coordinate,
    title: alert.title,
    subtitle: [alertKindLabel(alert.kind), alert.areaName].filter(Boolean).join(' · '),
    accessibilityLabel: [
      `${severityWord(alert.severity)} alert`,
      alert.title,
      alert.areaName ? `in ${alert.areaName}` : '',
      alert.confirmationCount
        ? `confirmed by ${alert.confirmationCount} ${
            alert.confirmationCount === 1 ? 'person' : 'people'
          }`
        : '',
    ]
      .filter(Boolean)
      .join(', '),
    destination: { pathname: '/update/[id]', params: { id: alert.id } },
    entityId: alert.id,
    severity: alert.severity,
    source: alert.source,
    origin,
  });
}

function severityWord(severity: CommunityAlert['severity']): string {
  switch (severity) {
    case 'critical':
      return 'Emergency';
    case 'high':
      return 'Urgent';
    case 'moderate':
      return 'Community';
    case 'low':
      return 'Low priority';
  }
}

export function alertKindLabel(kind: CommunityAlert['kind']): string {
  switch (kind) {
    case 'road-closure':
      return 'Road or transport';
    case 'community-event':
      return 'Community event';
    case 'emergency':
      return 'Emergency';
    case 'neighborhood-notice':
      return 'Neighbourhood notice';
    case 'announcement':
      return 'Announcement';
    case 'service-interruption':
      return 'Service interruption';
    case 'weather':
      return 'Weather';
    case 'other':
      return 'Community update';
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ROUTE ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

export function endpointMarker(
  id: string,
  category: Extract<MarkerCategory, 'origin' | 'destination' | 'waypoint'>,
  coordinate: GeoCoordinate,
  label: string
): MapMarker {
  const role =
    category === 'origin' ? 'Starting point' : category === 'destination' ? 'Destination' : 'Stop';

  return {
    id,
    category,
    coordinate,
    title: label,
    accessibilityLabel: `${role}: ${label}`,
    source: 'backend',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED
// ═════════════════════════════════════════════════════════════════════════════

function formatPrice(amount?: number | null, currency?: string | null): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '';

  const symbol = currencySymbol(currency);
  // Compact, because it renders inside a pin. £1,450 becomes £1.4k, which is
  // the difference between a badge and a paragraph.
  if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}m`;
  if (amount >= 1000) return `${symbol}${(amount / 1000).toFixed(amount >= 10_000 ? 0 : 1)}k`;
  return `${symbol}${Math.round(amount)}`;
}

function currencySymbol(currency?: string | null): string {
  switch (currency?.toUpperCase()) {
    case 'GBP':
      return '£';
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'MUR':
      return 'Rs';
    case undefined:
    case null:
      return '';
    default:
      return `${currency} `;
  }
}

/** Re-exported so the list view formats distance the same way as everything else. */
export { formatDistance };
