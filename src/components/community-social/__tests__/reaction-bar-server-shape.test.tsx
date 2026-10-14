// The reaction bar against what the server really sends (14 Oct 2026).
//
// The app's type and its mock server both said `{ counts, myReactionKey }`; the
// server sends `{ reactions: [{ reactionKey, count, reactedByViewer }],
// viewerReactions }`. The bar read `summary.counts.find(...)` on undefined and
// threw, which crashed the official-notice screen the first time a member opened
// one. This feeds it the server's own shape.

import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { ReactionBar } from '@/components/community-social/ReactionBar';
import { toReactionSummary } from '@/lib/community-social-api';

jest.mock('@/hooks/community-social', () => ({
  useCommunityCapabilities: () => ({
    capabilities: {
      reactions: [
        { key: 'like', label: 'Like', glyph: '👍', appliesTo: [] },
        { key: 'helpful', label: 'Helpful', glyph: '🙏', appliesTo: [] },
      ],
    },
    reactionsFor: () => ['like', 'helpful'],
  }),
}));

const SERVER_ENGAGEMENT = {
  contentType: 'notice',
  contentId: '01a11959-3e02-70df-acfa-c97bf3eaeab0',
  reactions: {
    totalCount: 3,
    reactions: [
      { reactionKey: 'like', count: 2, reactedByViewer: true },
      { reactionKey: 'helpful', count: 1, reactedByViewer: false },
    ],
    viewerReactions: ['like'],
    likeCount: 2,
    helpfulCount: 1,
    confirmationCount: 0,
  },
  commentCount: 0,
};

describe('ReactionBar with the server shape', () => {
  it('renders counts and the member’s own reaction instead of throwing', () => {
    render(
      <ReactionBar
        content={SERVER_ENGAGEMENT as never}
        contentType="notice"
        onReact={jest.fn()}
        onUnreact={jest.fn()}
      />
    );

    expect(screen.getByLabelText('Like, 2. Tap to remove your reaction.')).toBeTruthy();
    expect(screen.getByLabelText('Helpful, 1. Tap to react.')).toBeTruthy();
  });

  it('reads both the server shape and the old one', () => {
    expect(toReactionSummary(SERVER_ENGAGEMENT.reactions)).toEqual({
      totalCount: 3,
      counts: [
        { reactionKey: 'like', count: 2 },
        { reactionKey: 'helpful', count: 1 },
      ],
      myReactionKey: 'like',
    });
    expect(
      toReactionSummary({ totalCount: 1, counts: [{ reactionKey: 'like', count: 1 }], myReactionKey: null })
    ).toEqual({ totalCount: 1, counts: [{ reactionKey: 'like', count: 1 }], myReactionKey: null });
    expect(toReactionSummary({ totalCount: 0, reactions: [], viewerReactions: [] })?.myReactionKey).toBeNull();
  });
});
