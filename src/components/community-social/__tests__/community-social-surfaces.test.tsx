// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community social surfaces (Remediation Wave D-2b)
//
// These are not "does it render" tests. Every case below is one of the traps
// the D-2 audit found on `Diaspora.Modules.Community`, asserted at the layer
// that can actually get it wrong — the screen.
//
// The failures they guard against all look the same from the outside: a number
// that is present and wrong, or a badge that is present and unearned. None of
// them throws, none of them logs, and none of them would be caught by a type.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import MockAdapter from 'axios-mock-adapter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ThemeProvider } from '@/design-system';
import { apiClient } from '@/lib/apiClient';
import { CommentThread } from '../CommentThread';
import { CommunityPostCard } from '../CommunityPostCard';
import { PollBlock } from '../PollBlock';
import { FollowButton } from '@/components/FollowButton';
import type { UseCommentThreadResult } from '@/hooks/community-social';
import type {
  CommentResponse,
  CommunityPostResponse,
  ContentReviewStatus,
  PollResponse,
} from '@/types/community-social';

let mock: MockAdapter;

const CAPABILITIES = {
  reactions: [
    // PascalCase `appliesTo`, camelCase everything else — the one island in the
    // module, reproduced here so the bar has to reconcile it rather than being
    // handed a list it can compare directly.
    { key: 'like', label: 'Like', glyph: '👍', appliesTo: ['Post', 'Comment'] },
    { key: 'celebrate', label: 'Celebrate', glyph: '🎉', appliesTo: ['Post'] },
  ],
  feedKeys: ['home'],
  rankingKeys: ['chronological'],
  reportReasons: [],
  contentTypes: ['post', 'comment'],
  limits: {
    postBodyMaxLength: 500,
    postTitleMaxLength: 200,
    commentBodyMaxLength: 2000,
    feedPageSize: 20,
    feedMaxPageSize: 50,
    commentPageSize: 20,
    commentMaxPageSize: 50,
  },
  visibilityRulesEnabled: false,
};

beforeAll(() => {
  mock = new MockAdapter(apiClient);
  mock.onGet(/\/community\/capabilities/).reply(200, { data: CAPABILITIES });

  // The one refusal in this module that is not a failure. `DELETE` on a follow
  // that does not exist answers `community.follow.not-found`, and
  // `ensureNotFollowing` swallows **that** and nothing else — so the button has
  // to land on "Follow", which is the true state, rather than reverting.
  mock.onDelete(/\/community\/follows\//).reply(404, {
    title: 'Not found',
    status: 404,
    code: 'community.follow.not-found',
  });

  mock.onAny().reply(404, { title: 'No handler', status: 404 });
});

afterAll(() => {
  mock.restore();
});

function renderSurface(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>{node}</ThemeProvider>
    </QueryClientProvider>
  );
}

// ── Fixtures shaped like the wire, not like the client ───────────────────────

function buildPost(overrides: Partial<CommunityPostResponse> = {}): CommunityPostResponse {
  const postId = overrides.postId ?? '00000000-0000-4000-c000-000000000001';
  const body = overrides.body ?? 'A crate is 340 this morning.';

  return {
    postId,
    // The same value under the module's older name. Never a second identifier.
    updateId: postId,
    title: 'Tomato prices at Ridge market',
    body,
    // The same value under the module's older name.
    description: body,
    category: 'marketPrices',
    urgency: 'normal',
    visibility: 'public',
    audienceCountryCode: 'GH',
    audienceAreaId: null,
    visibilityRuleId: null,
    countryCode: 'GH',
    areaId: null,
    cityName: 'Accra',
    areaName: null,
    latitude: null,
    longitude: null,
    authorId: 'author-1',
    organizationId: null,
    attachments: [],
    poll: null,
    reactions: { totalCount: 0, counts: [], myReactionKey: null },
    commentCount: 3,
    shareCount: 0,
    bookmarkCount: 0,
    isPinned: false,
    isEdited: false,
    isPublished: true,
    isBookmarked: false,
    reportCount: 0,
    reviewStatus: 'unavailable',
    versionNumber: 1,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    publishedAt: new Date().toISOString(),
    expiresAt: null,
    ...overrides,
  };
}

function buildComment(overrides: Partial<CommentResponse> = {}): CommentResponse {
  return {
    commentId: 'comment-1',
    contentType: 'post',
    contentId: 'post-1',
    postId: 'post-1',
    parentCommentId: null,
    quotedCommentId: null,
    body: 'Top-level comment.',
    authorId: 'author-1',
    depth: 0,
    renderedDepth: 0,
    isTombstoned: false,
    isPinned: false,
    isEdited: false,
    attachmentMediaId: null,
    reactions: { totalCount: 0, counts: [], myReactionKey: null },
    replies: [],
    replyCount: 0,
    reviewStatus: 'unavailable',
    createdAt: new Date().toISOString(),
    updatedAt: null,
    ...overrides,
  };
}

function buildThread(comments: CommentResponse[]): UseCommentThreadResult {
  return {
    comments,
    totalCount: comments.length,
    isLoading: false,
    isEmpty: comments.length === 0,
    hasMore: false,
    isFetchingMore: false,
    error: null,
    loadMore: jest.fn(),
    refresh: jest.fn(),
  };
}

// ── The safety badge ─────────────────────────────────────────────────────────

describe('the automated review badge', () => {
  /**
   * `unavailable` means **no provider answered**. It is what a deployment with
   * no content-review provider configured returns for everything, and it is the
   * most common value on the wire — so a card that treated "not flagged" as
   * "checked and safe" would put a reassurance on content nothing looked at.
   */
  it.each<ContentReviewStatus>(['unavailable', 'pending'])(
    'says nothing at all when the review status is %s',
    (reviewStatus) => {
      renderSurface(<CommunityPostCard post={buildPost({ reviewStatus })} />);

      expect(screen.queryByText(/Passed automated review/)).toBeNull();
      expect(screen.queryByText(/Flagged by automated review/)).toBeNull();
    }
  );

  it('vouches only for content the review actually cleared', () => {
    renderSurface(<CommunityPostCard post={buildPost({ reviewStatus: 'clean' })} />);
    expect(screen.getByText(/Passed automated review/)).toBeTruthy();
  });

  it('warns when the review flagged it', () => {
    renderSurface(<CommunityPostCard post={buildPost({ reviewStatus: 'flagged' })} />);
    expect(screen.getByText(/Flagged by automated review/)).toBeTruthy();
  });
});

// ── `reportCount` ────────────────────────────────────────────────────────────

describe('the report count on a post', () => {
  /**
   * The server suppresses the **figure**, not the field: `reportCount` is 0 for
   * anyone who is not the author. Rendered as a public signal it would tell
   * every member that nothing on the platform has ever been reported.
   */
  it('is not shown to anybody but the author', () => {
    renderSurface(
      <CommunityPostCard
        post={buildPost({ authorId: 'someone-else', reportCount: 4 })}
        viewerId="me"
      />
    );

    expect(screen.queryByText(/reports on your post/)).toBeNull();
  });

  it('is shown to the author, whose copy is the honest one', () => {
    renderSurface(
      <CommunityPostCard post={buildPost({ authorId: 'me', reportCount: 4 })} viewerId="me" />
    );

    expect(screen.getByText('4 reports on your post')).toBeTruthy();
  });
});

// ── Polls ────────────────────────────────────────────────────────────────────

function buildPoll(overrides: Partial<PollResponse> = {}): PollResponse {
  return {
    pollId: 'poll-1',
    question: 'Which evening suits everyone?',
    options: [
      { optionId: 'a', label: 'Thursday', imageMediaId: null, voteCount: null, sharePercent: null },
      { optionId: 'b', label: 'Friday', imageMediaId: null, voteCount: null, sharePercent: null },
    ],
    allowsMultiple: false,
    resultVisibility: 'afterVoting',
    closesAt: null,
    isClosed: false,
    totalVotes: null,
    hasVoted: false,
    selectedOptionIds: [],
    ...overrides,
  };
}

describe('a poll whose results are hidden', () => {
  /**
   * `null` is not `0`. A component that coalesced them would draw flat zeros
   * over a poll with twenty-five votes in it and give the member a reason to
   * distrust every count on the platform.
   */
  it('says when the results appear rather than reporting no votes', () => {
    renderSurface(<PollBlock poll={buildPoll()} />);

    expect(screen.getByText('Results appear once you vote.')).toBeTruthy();
    expect(screen.queryByText(/0 votes/)).toBeNull();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('distinguishes "after voting" from "after close"', () => {
    renderSurface(<PollBlock poll={buildPoll({ resultVisibility: 'afterClose' })} />);
    expect(screen.getByText('Results appear when the poll closes.')).toBeTruthy();
  });

  it('tells a screen reader the results are hidden, not that nobody voted', () => {
    renderSurface(<PollBlock poll={buildPoll()} />);
    expect(screen.getByLabelText('Thursday. Results hidden.')).toBeTruthy();
  });

  it('draws the figures once the server sends them', () => {
    renderSurface(
      <PollBlock
        poll={buildPoll({
          totalVotes: 22,
          hasVoted: true,
          selectedOptionIds: ['b'],
          options: [
            { optionId: 'a', label: 'Thursday', imageMediaId: null, voteCount: 8, sharePercent: 36.4 },
            { optionId: 'b', label: 'Friday', imageMediaId: null, voteCount: 14, sharePercent: 63.6 },
          ],
        })}
      />
    );

    expect(screen.getByText('22 votes')).toBeTruthy();
    expect(screen.getByText('63.6%')).toBeTruthy();
  });

  /**
   * A genuine zero is a different fact from a withheld one, and it has to
   * survive: an option nobody chose on a poll whose results are visible reads
   * "0%", and that is correct.
   */
  it('still reports a real zero when the results are visible', () => {
    renderSurface(
      <PollBlock
        poll={buildPoll({
          resultVisibility: 'always',
          totalVotes: 8,
          options: [
            { optionId: 'a', label: 'Thursday', imageMediaId: null, voteCount: 8, sharePercent: 100 },
            { optionId: 'b', label: 'Friday', imageMediaId: null, voteCount: 0, sharePercent: 0 },
          ],
        })}
      />
    );

    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByLabelText('Friday. 0 votes.')).toBeTruthy();
  });
});

// ── Comment threads ──────────────────────────────────────────────────────────

describe('a comment thread', () => {
  /**
   * A deleted comment arrives with `isTombstoned: true` and an **empty body**,
   * because removing it would orphan its replies. A thread that filtered it out
   * would take the replies with it; one that rendered `body` unconditionally
   * would draw an empty bubble with a reply count under it.
   */
  it('renders a tombstone rather than dropping it and orphaning its replies', () => {
    const tombstone = buildComment({
      commentId: 'gone',
      body: '',
      isTombstoned: true,
      depth: 1,
      renderedDepth: 1,
      replyCount: 1,
      replies: [
        buildComment({
          commentId: 'orphan-candidate',
          body: 'Still here.',
          depth: 2,
          renderedDepth: 2,
          parentCommentId: 'gone',
        }),
      ],
    });

    renderSurface(
      <CommentThread
        target={{ contentType: 'post', contentId: 'post-1' }}
        thread={buildThread([tombstone])}
      />
    );

    expect(screen.getByText('This comment was removed.')).toBeTruthy();
    expect(screen.getByText('Still here.')).toBeTruthy();
  });

  it('offers no controls on a tombstone — there is nothing to act on', () => {
    renderSurface(
      <CommentThread
        target={{ contentType: 'post', contentId: 'post-1' }}
        thread={buildThread([
          buildComment({ commentId: 'gone', body: '', isTombstoned: true }),
        ])}
        onReport={jest.fn()}
      />
    );

    expect(screen.queryByLabelText('Reply to this comment')).toBeNull();
    expect(screen.queryByLabelText('Report this comment')).toBeNull();
  });

  /**
   * `depth` is the true depth and is unbounded; `renderedDepth` is `min(depth,
   * 6)`. Indenting by `depth` runs a long argument off the side of the phone at
   * about the fifth reply and never brings it back.
   */
  it('indents by renderedDepth, so a chain past six stops moving right', () => {
    const deep = buildComment({
      commentId: 'six',
      body: 'At the cap.',
      depth: 6,
      renderedDepth: 6,
      replyCount: 1,
      replies: [
        buildComment({
          commentId: 'nine',
          body: 'Past the cap.',
          // The true depth keeps counting; the rendered one does not.
          depth: 9,
          renderedDepth: 6,
          parentCommentId: 'six',
        }),
      ],
    });

    renderSurface(
      <CommentThread
        target={{ contentType: 'post', contentId: 'post-1' }}
        thread={buildThread([deep])}
      />
    );

    // The reply is nested inside its parent's view, so its own margin is the
    // difference between the two rendered depths — which the cap makes zero.
    const reply = screen.getByTestId('comment-nine');
    expect(reply.props.style.marginLeft).toBe(0);
  });

  it('renders an empty thread as empty', () => {
    renderSurface(
      <CommentThread
        target={{ contentType: 'post', contentId: 'post-1' }}
        thread={buildThread([])}
      />
    );

    expect(screen.getByText('No comments yet')).toBeTruthy();
  });
});

// ── Follow ───────────────────────────────────────────────────────────────────

describe('the follow button', () => {
  it('starts from what the surrounding screen was given', () => {
    renderSurface(<FollowButton userId="member-1" isFollowing />);
    expect(screen.getByLabelText('Following. Tap to unfollow.')).toBeTruthy();
  });

  /**
   * Every follow route in the mock adapter answers 404 here, so this is the
   * failure path — and the assertion is that the control goes **back**. A button
   * that stayed on "Following" after the write was refused would be asserting
   * something the platform does not hold, which is the exact defect the local
   * follow store produced for as long as it existed.
   */
  it('reverts, and says why, when the server refuses the write', async () => {
    renderSurface(<FollowButton userId="member-1" isFollowing={false} />);

    fireEvent.press(screen.getByLabelText('Follow this member.'));

    // Back to "Follow", with the server's own sentence attached for a screen
    // reader rather than a silent snap-back nobody can account for.
    const button = await screen.findByLabelText(/^Follow\. /);
    expect(button.props.accessibilityState.selected).toBe(false);
    expect(screen.getByText('Follow')).toBeTruthy();
  });

  /**
   * The sharpest trap in the module. Unfollow is the one **non-idempotent**
   * removal here — un-reacting to something you never reacted to is a 200, but
   * unfollowing something you do not follow is a 404 — and the button was wrong
   * about the state, not about the intention. `ensureNotFollowing` swallows that
   * single failure, so the control settles on the truth ("Follow") instead of
   * snapping back to a "Following" the server has just denied.
   */
  it('settles on the truth when the unfollow finds no follow to remove', async () => {
    renderSurface(<FollowButton userId="member-1" isFollowing />);

    fireEvent.press(screen.getByLabelText('Following. Tap to unfollow.'));

    await waitFor(() => {
      expect(screen.getByLabelText('Follow this member.')).toBeTruthy();
    });
  });
});
