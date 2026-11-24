// A feed page holds feed items, not posts (14 Oct 2026). The Updates list read
// each item AS the post and crashed on `visibility` the first time it held one.
//
// The fixtures are the server's records, typed as them (RMD-009). Until then
// they were untyped literals, and `toFeedPost` also passed "already-shaped
// posts" through untouched, because the development feed served posts.

import { toCommunityPost, toFeedPost } from '../api/community-social-api';
import type {
  CommunityPostResponse,
  CommunityPostSummaryResponse,
  FeedItemResponse,
  ReactionSummaryResponse,
} from '@/types/community-social';

const NO_REACTIONS: ReactionSummaryResponse = {
  totalCount: 0,
  reactions: [],
  viewerReactions: [],
  likeCount: 0,
  helpfulCount: 0,
  confirmationCount: 0,
  disputeCount: 0,
};

const SUMMARY: CommunityPostSummaryResponse = {
  postId: 'p1',
  updateId: 'p1',
  author: { userId: 'u1', name: 'Zoe Gbogodor', organizationId: null },
  title: 'TEST alert',
  body: 'From the emulator',
  description: 'From the emulator',
  category: 'traffic',
  urgency: 'normal',
  status: 'published',
  location: {
    countryCode: 'MU',
    areaId: null,
    areaName: 'Pereybere',
    cityName: 'Grand Baie',
    latitude: -20.01,
    longitude: 57.59,
    distanceKm: null,
    pointIsExact: true,
  },
  reactions: NO_REACTIONS,
  commentCount: 0,
  bookmarkedByViewer: true,
  isPinned: false,
  hasPoll: true,
  publishedAt: '2026-10-14T10:55:40Z',
  expiresAt: null,
  affectedRadiusMetres: 250,
  closedAt: null,
};

const ITEM: FeedItemResponse = {
  contentType: 'post',
  contentId: 'p1',
  post: SUMMARY,
  distanceKm: null,
  reason: null,
};

describe('toFeedPost', () => {
  it('unwraps the item and maps the summary onto what a card reads', () => {
    const post = toFeedPost(ITEM)!;

    expect(post.postId).toBe('p1');
    expect(post.authorId).toBe('u1');
    expect(post.organizationId).toBeNull();
    expect(post.cityName).toBe('Grand Baie');
    expect(post.areaName).toBe('Pereybere');
    expect(post.latitude).toBe(-20.01);
    expect(post.isBookmarked).toBe(true);
    expect(post.publishedAt).toBe('2026-10-14T10:55:40Z');
    expect(post.affectedRadiusMetres).toBe(250);
  });

  it('leaves what a summary does not carry empty rather than guessing it', () => {
    const post = toFeedPost(ITEM)!;

    expect(post.visibility).toBeNull();
    expect(post.createdAt).toBeNull();
    expect(post.reportCount).toBeNull();
    expect(post.isEdited).toBeNull();
    expect(post.canEdit).toBeNull();
    expect(post.attachments).toEqual([]);
    // The summary says there is a poll; it does not carry it.
    expect(post.poll).toBeNull();
    expect(post.hasPoll).toBe(true);
  });

  it('drops an item that holds no post', () => {
    expect(toFeedPost({ contentType: 'guide', contentId: 'g1', post: null, distanceKm: null, reason: null })).toBeNull();
  });
});

describe('toCommunityPost on a whole post', () => {
  const WHOLE: CommunityPostResponse = {
    postId: 'p2',
    updateId: 'p2',
    author: { userId: 'u2', organizationId: 'org-9', organizationName: 'Port Louis Residents' },
    title: null,
    body: 'Water is off on Royal Road.',
    description: 'Water is off on Royal Road.',
    category: 'utilities',
    urgency: 'urgent',
    status: 'published',
    visibility: 'public',
    location: {
      countryCode: 'MU',
      areaId: null,
      areaName: null,
      cityName: 'Port Louis',
      latitude: null,
      longitude: null,
      distanceKm: null,
      pointIsExact: false,
    },
    attachments: [],
    poll: null,
    reactions: NO_REACTIONS,
    commentCount: 2,
    shareCount: 1,
    bookmarkCount: 4,
    bookmarkedByViewer: false,
    reportCount: 0,
    isPinned: false,
    isEdited: true,
    publishedAt: '2026-10-14T09:00:00Z',
    expiresAt: null,
    editedAt: '2026-10-14T09:30:00Z',
    affectedRadiusMetres: null,
    closedAt: null,
    createdAt: '2026-10-14T08:59:00Z',
    canEdit: true,
    canWithdraw: true,
    canCancel: false,
  };

  it('keeps what only a whole post carries', () => {
    const post = toCommunityPost(WHOLE);

    expect(post.authorId).toBe('u2');
    expect(post.organizationId).toBe('org-9');
    expect(post.visibility).toBe('public');
    expect(post.createdAt).toBe('2026-10-14T08:59:00Z');
    expect(post.shareCount).toBe(1);
    expect(post.bookmarkCount).toBe(4);
    expect(post.reportCount).toBe(0);
    expect(post.isEdited).toBe(true);
    expect(post.editedAt).toBe('2026-10-14T09:30:00Z');
    expect(post.canEdit).toBe(true);
    expect(post.canWithdraw).toBe(true);
    expect(post.canCancel).toBe(false);
    expect(post.hasPoll).toBe(false);
  });
});
