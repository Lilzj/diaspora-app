import type { CommunitySearchResult } from '@/types/community-advanced';
import type { OrganizationSearchCard } from '@/types/community-life';
import { mediaImageUrl } from '@/lib/platform/media-url';
import { readableKey } from '@/lib/platform/readable-key';

// One organisation as a row of `GET /community-life/organizations` describes
// it (`OrganizationSummaryResponse`). The map, the Directory and Community
// search all draw these rows, and say the same things about each.

/** What kind of organisation it is. The row sends the type key, not its name. */
export function organizationKind(organization: Pick<OrganizationSearchCard, 'organizationTypeKey'>): string {
  return readableKey(organization.organizationTypeKey);
}

/** Where it is, as narrowly as the row says: the neighbourhood, else the city. */
export function organizationArea(organization: Pick<OrganizationSearchCard, 'location'>): string {
  return organization.location?.neighborhoodName ?? organization.location?.cityName ?? '';
}

/**
 * Where it is and how many members it has, for the line under a card's name.
 * Members, because the row has no follower count: the cards printed
 * "undefined followers" when they read it as `CommunityOrganization` (RMD-009).
 */
export function organizationLine(
  organization: Pick<OrganizationSearchCard, 'location' | 'memberCount'>
): string {
  const count = organization.memberCount;
  const members = typeof count === 'number' ? `${count} ${count === 1 ? 'member' : 'members'}` : '';
  return [organizationArea(organization), members].filter(Boolean).join(' · ');
}

/**
 * The organisation as one row of Community search.
 *
 * `organizationId`, where `CommunityOrganization` says `id`: read as that type,
 * every organisation in search opened `/community-life/org/undefined`
 * (RMD-009). A logo's media id rather than its address, and no distance,
 * because the summary has none.
 */
export function organizationSearchResult(organization: OrganizationSearchCard): CommunitySearchResult {
  return {
    entityType: 'organization',
    entityId: organization.organizationId,
    title: organization.name,
    subtitle: organizationKind(organization) || null,
    imageUrl: mediaImageUrl(organization.logoMediaId, 'original'),
    locationLabel: organization.location?.cityName ?? null,
    distanceKm: null,
    badge: organization.isVerified ? 'Verified' : null,
    actionRoute: `/community-life/org/${organization.organizationId}`,
    source: 'backend',
  };
}
