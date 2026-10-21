// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — "Post in community" for an event
//
// Since 21 Oct 2026 `POST /community-life/events` takes an optional
// `communityId`. The host must be a current member of an Active community —
// CommunityProgramme's `CanPostToCommunity`, the same flag the membership set
// already carries per community — otherwise the server answers 403
// `community-life.event.community-forbidden`. It is set at creation only; the
// event then appears in that community's list
// (`GET /community-life/events?communityId=`), and its first publication fires
// the `community.eventCreated` automation trigger.
// ─────────────────────────────────────────────────────────────────────────────

import type { CommunityId, CommunityMembership, CommunityRef } from '@/types/community-directory';

export const EVENT_COMMUNITY_FORBIDDEN = 'community-life.event.community-forbidden';

export interface PostableCommunity {
  id: CommunityId;
  name: string;
  slug: string | null;
}

/**
 * The communities this member may post an event into: the server's own
 * `canPostToCommunity`, never a state the client reads its own rule from.
 * Sorted by name so the list is stable.
 */
export function postableCommunities(
  memberships: readonly CommunityMembership[],
  lookup: (id: CommunityId) => Pick<CommunityRef, 'name' | 'slug'> | undefined
): PostableCommunity[] {
  return memberships
    .filter((membership) => membership.capabilities?.canPostToCommunity === true)
    .map((membership) => {
      const ref = lookup(membership.communityId);
      return {
        id: membership.communityId,
        name: ref?.name?.trim() || 'A community you belong to',
        slug: ref?.slug ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether a create was refused because of the chosen community. */
export function isEventCommunityForbidden(cause: unknown): boolean {
  const response = (cause as { response?: { status?: number; data?: unknown } })?.response;
  if (response?.status !== 403) return false;
  const data = response.data as { code?: unknown } | string | undefined;
  if (typeof data === 'string') return data.includes(EVENT_COMMUNITY_FORBIDDEN);
  return data?.code === EVENT_COMMUNITY_FORBIDDEN;
}

/** What the member is told when that happens — with the way forward. */
export function eventCommunityRefusal(communityName: string | null): string {
  const where = communityName ? `“${communityName}”` : 'that community';
  return `Diaspora would not post this event in ${where}. Only a current member of a community that is open can post an event there — you may have left it, or it may be paused or closed. Choose another community, or “Don’t post in a community”, and try again. Your details are still here.`;
}
