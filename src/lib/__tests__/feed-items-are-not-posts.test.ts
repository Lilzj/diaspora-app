// A feed page holds feed items, not posts (14 Oct 2026). The Updates list read
// each item AS the post and crashed on `visibility` the first time it held one.

import { toFeedPost } from '../community-social-api';

const SERVER_ITEM = {
  contentType: 'post',
  contentId: 'p1',
  post: {
    postId: 'p1',
    title: 'TEST alert',
    body: 'From the emulator',
    category: 'traffic',
    author: { userId: 'u1', name: 'Zoe Gbogodor', organizationId: null },
    location: { countryCode: 'MU', cityName: 'Grand Baie', areaName: null, latitude: -20.01, longitude: 57.59 },
    bookmarkedByViewer: true,
    publishedAt: '2026-10-14T10:55:40Z',
    reactions: { totalCount: 0, reactions: [], viewerReactions: [] },
    commentCount: 0,
  },
};

describe('toFeedPost', () => {
  it('unwraps the item and maps the summary onto what a card reads', () => {
    const post = toFeedPost(SERVER_ITEM)!;
    expect(post.postId).toBe('p1');
    expect(post.authorId).toBe('u1');
    expect(post.cityName).toBe('Grand Baie');
    expect(post.isBookmarked).toBe(true);
    expect(post.createdAt).toBe('2026-10-14T10:55:40Z');
    // Not carried by the summary, and not guessed.
    expect(post.visibility).toBeUndefined();
  });

  it('passes an already-shaped post through, and drops items that are not posts', () => {
    const full = { postId: 'p2', authorId: 'u2', visibility: 'public' };
    expect(toFeedPost(full)).toBe(full);
    expect(toFeedPost({ contentType: 'guide', contentId: 'g1', post: null })).toBeNull();
  });
});
