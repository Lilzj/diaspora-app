// ─────────────────────────────────────────────────────────────────────────────
// A whole post, as the server sends one (RMD-009)
//
// Every route that returns a post maps it through `toCommunityPost`, which
// reads `author` and `location`. A stub that answered a create with
// `{ postId }` — a body no server sends — passed while `createPost` handed the
// answer back unread, and stopped passing the day it was mapped. Tests that need
// a post only to get past the route take this one; tests whose subject is the
// post spell out the fields they mean.
// ─────────────────────────────────────────────────────────────────────────────

import type { CommunityPostResponse, ReactionSummaryResponse } from '@/types/community-social';

/** A reaction summary nobody has reacted to. */
export const NO_REACTIONS: ReactionSummaryResponse = {
  totalCount: 0,
  reactions: [],
  viewerReactions: [],
  likeCount: 0,
  helpfulCount: 0,
  confirmationCount: 0,
  disputeCount: 0,
};

/** `CommunityPostResponse`, whole, as `GET /community/posts/{postId}` answers it. */
export function wirePost(overrides: Partial<CommunityPostResponse> = {}): CommunityPostResponse {
  const postId = overrides.postId ?? '00000000-0000-4000-c000-0000000000aa';
  const body = overrides.body ?? 'Water is off on Mill Road.';

  return {
    postId,
    updateId: postId,
    author: { userId: '33333333-0000-4000-8000-000000000033' },
    title: null,
    body,
    description: body,
    category: 'utilities',
    urgency: 'normal',
    status: 'published',
    visibility: 'public',
    location: {
      countryCode: 'GB',
      areaId: null,
      areaName: 'Peckham',
      cityName: 'London',
      latitude: null,
      longitude: null,
      distanceKm: null,
      pointIsExact: false,
    },
    attachments: [],
    poll: null,
    reactions: NO_REACTIONS,
    commentCount: 0,
    shareCount: 0,
    bookmarkCount: 0,
    bookmarkedByViewer: false,
    reportCount: 0,
    isPinned: false,
    isEdited: false,
    publishedAt: '2026-10-14T09:00:00Z',
    expiresAt: null,
    editedAt: null,
    affectedRadiusMetres: null,
    closedAt: null,
    createdAt: '2026-10-14T09:00:00Z',
    canEdit: false,
    canWithdraw: false,
    canCancel: false,
    ...overrides,
  };
}
