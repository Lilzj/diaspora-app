// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the Community Life hub, composed on the device
//
// `GET /community-life/hub/summary` was proposed (COMMUNITY-LIFE-GAP-030) and
// never served, so in every build without the simulation flag the hub's rails
// were empty and its tiles had no counts — over nine destinations whose data is
// all real. Every part of that summary has a served route:
//
//   upcoming and nearby events   GET /community-life/events
//   my memberships               GET /communities/memberships/me
//   my organisations             GET /communities/organizations/me
//   fundraisers                  GET /communities/campaigns
//   volunteering                 GET /communities/volunteer/opportunities
//   polls                        GET /communities/polls
//   announcements                GET /communities/announcements
//   the area around the member   GET /community-life/area/activity
//   "For you"                    GET /recommendations/communities
//
// `useCommunityLifeSummary` reads them in parallel and this file assembles the
// summary from whatever answered. Two rules, both about not inventing:
//
//   **A count comes from the list that was asked.** The server's `totalCount`
//   where it publishes one; otherwise the rows on the page, marked as a lower
//   bound when there are more pages. A list that has not answered gives `null`,
//   not zero.
//
//   **A rail shows rows the platform returned, in its order.** Nothing is
//   re-ranked; "active" fundraisers are the ones the server says can take a
//   donation (`canDonate`), not a status table kept here.
// ─────────────────────────────────────────────────────────────────────────────

import type { AreaActivityWire } from './community-life-api';
import type { MyProgrammeOrganization } from './community-programme-api';
import {
  COMMUNITIES_SURFACE,
  describeRecommendationLocation,
  routeForRecommendation,
  type FeedbackInput,
  type RecommendationPage,
} from './recommendations-api';
import type {
  CommunityAnnouncement,
  CommunityLifeCountKey,
  CommunityLifeSummary,
  CommunityMembership,
  CommunityPage,
  CommunityPoll,
  CommunityRecommendation,
  FundraisingCampaign,
  HubAreaActivity,
  VolunteerOpportunity,
} from '@/types/community-advanced';
import type { Event } from '@/types/community-life';

/** How many rows each rail shows. The screen behind each rail fetches the rest. */
export const HUB_RAIL_LIMITS = {
  events: 6,
  campaigns: 2,
  opportunities: 3,
  polls: 2,
  announcements: 3,
  recommendations: 5,
} as const;

/** How many rows a list is asked for, so a count without a total is still useful. */
export const HUB_PAGE_SIZE = 20;

/** The radius of the "around you" activity card, in kilometres. The server caps at 10. */
export const HUB_AREA_RADIUS_KM = 2;

/** The radius of the "Near you" events rail, in kilometres. */
export const HUB_NEARBY_RADIUS_KM = 25;

/** A list as it reached the hub: the platform's page, or nothing yet. */
type Answered<T> = T | undefined;

export interface CommunityLifeHubParts {
  upcomingEvents: Answered<{ items: Event[]; totalCount: number | null }>;
  nearbyEvents: Answered<Event[]>;
  myMemberships: Answered<CommunityMembership[]>;
  myOrganizations: Answered<MyProgrammeOrganization[]>;
  campaigns: Answered<CommunityPage<FundraisingCampaign>>;
  opportunities: Answered<CommunityPage<VolunteerOpportunity>>;
  polls: Answered<CommunityPage<CommunityPoll>>;
  announcements: Answered<CommunityPage<CommunityAnnouncement>>;
  areaActivity: Answered<AreaActivityWire | null>;
  recommendations: Answered<CommunityRecommendation[]>;
}

/** A count from a page: the server's total, or the rows seen and whether there are more. */
function countPage<T>(
  page: Answered<CommunityPage<T>>,
  rows?: (items: T[]) => T[]
): { count: number | null; atLeast: boolean } {
  if (!page) return { count: null, atLeast: false };
  // A filtered count cannot use the server's total, which counts every row.
  if (!rows && typeof page.totalCount === 'number') return { count: page.totalCount, atLeast: false };
  const seen = rows ? rows(page.items) : page.items;
  return { count: seen.length, atLeast: page.hasMore };
}

function toAreaActivity(wire: AreaActivityWire | null | undefined): HubAreaActivity | null {
  if (!wire) return null;
  return {
    displayName: wire.displayName,
    radiusKm: wire.radiusKm,
    windowDays: wire.windowDays,
    upcomingEventCount: wire.upcomingEventCount,
    organizationCount: wire.organizationCount,
    totalRsvps: wire.totalRsvps,
    isLowerBound: wire.isLowerBound === true,
  };
}

const canDonate = (campaigns: FundraisingCampaign[]) =>
  campaigns.filter((campaign) => campaign.canDonate === true);

/**
 * The summary, from whatever parts have answered.
 *
 * Pure, so the composition is tested without a network and the hook stays a
 * list of reads.
 */
export function composeCommunityLifeSummary(parts: CommunityLifeHubParts): CommunityLifeSummary {
  const campaigns = countPage(parts.campaigns, canDonate);
  const opportunities = countPage(parts.opportunities);
  const polls = countPage(parts.polls);

  const counts: Record<CommunityLifeCountKey, number | null> = {
    upcomingEvents: parts.upcomingEvents
      ? parts.upcomingEvents.totalCount ?? parts.upcomingEvents.items.length
      : null,
    myMemberships: parts.myMemberships ? parts.myMemberships.length : null,
    activeCampaigns: campaigns.count,
    openOpportunities: opportunities.count,
    openPolls: polls.count,
    // The announcements route carries no read state, so "unread" is not known.
    unreadAnnouncements: null,
  };

  const countIsLowerBound: Partial<Record<CommunityLifeCountKey, boolean>> = {};
  if (campaigns.atLeast) countIsLowerBound.activeCampaigns = true;
  if (opportunities.atLeast) countIsLowerBound.openOpportunities = true;
  if (polls.atLeast) countIsLowerBound.openPolls = true;

  return {
    upcomingEvents: (parts.upcomingEvents?.items ?? []).slice(0, HUB_RAIL_LIMITS.events),
    nearbyEvents: (parts.nearbyEvents ?? []).slice(0, HUB_RAIL_LIMITS.events),
    myMemberships: parts.myMemberships ?? [],
    myOrganizations: (parts.myOrganizations ?? []).map((organization) => ({
      organizationId: organization.organizationId,
      name: organization.name,
      // `GET /communities/organizations/me` sends no logo; none is invented.
      logo: null,
      role: organization.role,
    })),
    activeCampaigns: canDonate(parts.campaigns?.items ?? []).slice(0, HUB_RAIL_LIMITS.campaigns),
    openOpportunities: (parts.opportunities?.items ?? []).slice(0, HUB_RAIL_LIMITS.opportunities),
    openPolls: (parts.polls?.items ?? []).slice(0, HUB_RAIL_LIMITS.polls),
    announcements: (parts.announcements?.items ?? []).slice(0, HUB_RAIL_LIMITS.announcements),
    areaActivity: toAreaActivity(parts.areaActivity),
    recommendations: (parts.recommendations ?? []).slice(0, HUB_RAIL_LIMITS.recommendations),
    counts,
    countIsLowerBound,
  };
}

/** Whether a composed summary has any rail to draw. The tiles are always drawn. */
export function hasAnyHubRail(summary: CommunityLifeSummary): boolean {
  return (
    summary.recommendations.length > 0 ||
    summary.nearbyEvents.length > 0 ||
    summary.activeCampaigns.length > 0 ||
    summary.openOpportunities.length > 0 ||
    summary.openPolls.length > 0 ||
    summary.announcements.length > 0 ||
    summary.myOrganizations.length > 0 ||
    summary.areaActivity !== null
  );
}

/**
 * One recommended community as the hub's card.
 *
 * Null for an item no screen can open — a community without a slug, since
 * `/community/[slug]` takes one. The reason is the server's sentence; the image
 * is left out because `mediaReference` is a media identifier, not a URL.
 */
export function toHubRecommendation(
  item: RecommendationPage['items'][number],
  page: Pick<RecommendationPage, 'setId' | 'surface'>
): CommunityRecommendation | null {
  const route = routeForRecommendation(item);
  if (!route) return null;

  const place = describeRecommendationLocation(item);

  return {
    recommendationId: `${item.targetType}:${item.targetId}`,
    entityType: item.targetType === 'Community' ? 'community' : 'organization',
    entityId: item.targetId,
    title: item.title,
    subtitle: item.summary || place || null,
    imageUrl: null,
    reason: item.reason?.text ?? '',
    score: item.score,
    actionRoute: route,
    feedback: {
      targetType: item.targetType,
      targetId: item.targetId,
      surface: page.surface || COMMUNITIES_SURFACE,
      setId: page.setId,
      position: item.position,
    },
  };
}

/**
 * The `POST /recommendations/dismiss` body for a hub card, or null for one the
 * platform did not produce (and which therefore cannot be suppressed).
 */
export function hubDismissInput(recommendation: CommunityRecommendation): FeedbackInput | null {
  const feedback = recommendation.feedback;
  if (!feedback) return null;
  return {
    targetType: feedback.targetType,
    targetId: feedback.targetId,
    surface: feedback.surface,
    setId: feedback.setId ?? null,
    position: feedback.position ?? null,
  };
}

/** A recommendation page as hub cards, in the server's order. */
export function toHubRecommendations(page: RecommendationPage): CommunityRecommendation[] {
  return page.items
    .map((item) => toHubRecommendation(item, page))
    .filter((card): card is CommunityRecommendation => card !== null);
}
