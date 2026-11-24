// The reaction bar against what the server really sends (14 Oct 2026).
//
// The app's type and its mock server both said `{ counts, myReactionKey }`; the
// server sends `{ reactions: [{ reactionKey, count, reactedByViewer }],
// viewerReactions }`. The bar read `summary.counts.find(...)` on undefined and
// threw, which crashed the official-notice screen the first time a member opened
// one. This feeds it the server's own shape, typed as the server's record.
//
// `viewerReactions` is a list because a member may hold several reactions on
// one item, and the server means them to. Until RMD-009 the tally kept only the
// first, so the bar drew the second as somebody else's and tapping it reacted
// again instead of taking it back.

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ReactionBar } from '@/components/community-social/ReactionBar';
import { toReactionTally } from '@/lib/api/community-social-api';
import type { ContentEngagementResponse, ReactionSummaryResponse } from '@/types/community-social';

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

function summary(viewerReactions: string[]): ReactionSummaryResponse {
  return {
    totalCount: 3,
    reactions: [
      { reactionKey: 'helpful', count: 1, reactedByViewer: viewerReactions.includes('helpful') },
      { reactionKey: 'like', count: 2, reactedByViewer: viewerReactions.includes('like') },
    ],
    viewerReactions,
    likeCount: 2,
    helpfulCount: 1,
    confirmationCount: 0,
    disputeCount: 0,
  };
}

function engagement(viewerReactions: string[]): ContentEngagementResponse {
  return {
    contentType: 'notice',
    contentId: '01a11959-3e02-70df-acfa-c97bf3eaeab0',
    reactions: summary(viewerReactions),
    commentCount: 0,
  };
}

describe('ReactionBar with the server shape', () => {
  it('renders counts and the member’s own reaction instead of throwing', () => {
    render(
      <ReactionBar
        content={engagement(['like'])}
        contentType="notice"
        onReact={jest.fn()}
        onUnreact={jest.fn()}
      />
    );

    expect(screen.getByLabelText('Like, 2. Tap to remove your reaction.')).toBeTruthy();
    expect(screen.getByLabelText('Helpful, 1. Tap to react.')).toBeTruthy();
  });

  it('marks every reaction the member holds, and takes back the second one', () => {
    const onReact = jest.fn();
    const onUnreact = jest.fn();
    render(
      <ReactionBar
        content={engagement(['like', 'helpful'])}
        contentType="notice"
        onReact={onReact}
        onUnreact={onUnreact}
      />
    );

    expect(screen.getByLabelText('Like, 2. Tap to remove your reaction.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Helpful, 1. Tap to remove your reaction.'));

    expect(onUnreact).toHaveBeenCalledWith('helpful');
    expect(onReact).not.toHaveBeenCalled();
  });

  it('reads the server shape into the tally a screen reads', () => {
    expect(toReactionTally(summary(['like', 'helpful']))).toEqual({
      totalCount: 3,
      counts: [
        { reactionKey: 'helpful', count: 1 },
        { reactionKey: 'like', count: 2 },
      ],
      myReactionKeys: ['like', 'helpful'],
    });
    expect(toReactionTally(summary([]))?.myReactionKeys).toEqual([]);
    expect(toReactionTally(null)).toBeNull();
  });
});
