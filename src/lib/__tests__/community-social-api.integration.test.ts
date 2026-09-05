// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the community social graph against the real contract
// (Remediation Wave D-2)
//
// Runs the real `lib/community-social-api.ts` against the real
// `mocks/handlers/community-social.ts`, which was written from the module's
// contract rather than from what this client expects. Nothing is re-implemented
// here: a test against a re-implementation of the thing under test proves
// nothing.
//
// Every case below pins a detail that would break a client **silently** — no
// exception, no red screen, just a blank comment thread, a flat poll, a badge
// on unreviewed content, or a mute that turned itself off. Those are the ones
// worth a test. The loud failures look after themselves.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import { RECORDED_COMMUNITY_CAPABILITIES } from '@/mocks/recorded/community-capabilities';
import { readPage, resetBespokeEnvelopeWarnings } from '@/lib/platform-envelope';
import {
  resetCommunitySocialMocks,
  setupCommunitySocialMocks,
} from '@/mocks/handlers/community-social';
import {
  COMMENT_BODY_MAX_LENGTH,
  COMMUNITY_FEEDS_WITHOUT_PROVIDERS,
  MAX_RENDERED_COMMENT_DEPTH,
  POST_BODY_MAX_LENGTH,
  POST_TITLE_MAX_LENGTH,
  SELECTABLE_POST_VISIBILITIES,
  arePollResultsHidden,
  capabilityAppliesTo,
  clampLimit,
  commentBodyText,
  communitySocialKeys,
  createBookmark,
  createBookmarkFolder,
  createPost,
  createPostComment,
  deleteBookmark,
  deleteComment,
  deletePost,
  ensureNotFollowing,
  fetchBookmarkCollections,
  fetchCommunityCapabilities,
  fetchFeed,
  fetchModerationHistory,
  fetchModerationQueue,
  fetchPost,
  fetchPostComments,
  fetchPostRevisions,
  fetchReportReasons,
  fetchTrendingHashtags,
  flattenComments,
  followTarget,
  isFlaggedContent,
  isFollowNotFoundError,
  isPrefixRequiredError,
  reactToPost,
  reactionCount,
  reactionKeysFor,
  readReactionSummary,
  replyToComment,
  reportContent,
  setPostPinned,
  shouldRenderSafetyBadge,
  sharePost,
  submitModerationDecision,
  suggestHashtags,
  toCommentPage,
  toFeedPage,
  unfollowTarget,
  unreactToPost,
  updatePost,
  votePoll,
} from '@/lib/community-social-api';
import type {
  CommentResponse,
  CommunityCapabilitiesResponse,
  CommunityPostResponse,
} from '@/types/community-social';

let mock: MockAdapter;

/** The post the seed thread hangs off, authored by somebody else. */
const OTHERS_POST = '00000000-0000-4000-c000-000000000001';
/** The one seeded post this member wrote. */
const MY_POST = '00000000-0000-4000-c000-000000000002';
/** The flagged one. */
const FLAGGED_POST = '00000000-0000-4000-c000-000000000003';
/** The one with a poll whose results are hidden until you vote. */
const POLL_POST = '00000000-0000-4000-c000-000000000004';

beforeAll(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  setupCommunitySocialMocks(mock);
  // Anything this client sends that the handler does not answer is a defect in
  // the client, not a passthrough.
  mock.onAny().reply(404);
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  resetCommunitySocialMocks();
  mock.resetHistory();
});

// ── Trap 1 ───────────────────────────────────────────────────────────────────

describe('the capabilities mock is the capabilities recording', () => {
  it('serves exactly the body that was captured from a running server', async () => {
    // ── Why this one assertion carries the rest ─────────────────────────────
    //
    // Every other case in this file asks the real client a question and checks
    // the answer against this mock. That proved nothing while the mock was
    // hand-written from the client's own types: the two agreed with each other
    // and both disagreed with the server. The suite was green while
    // `capabilities.limits` was `undefined` on every deployment and
    // `CommentThread` threw on it.
    //
    // `RECORDED_COMMUNITY_CAPABILITIES` is not a fixture anybody authored — it is
    // a captured 200 from a running API. Pinning the mock to it is what makes
    // every other case here a statement about the platform rather than a
    // statement about our own expectations.
    //
    // **If this fails, re-record the body. Do not edit it to match the mock.**
    await expect(fetchCommunityCapabilities()).resolves.toEqual(
      RECORDED_COMMUNITY_CAPABILITIES
    );
  });

  it('names no field the recording does not carry', () => {
    // The narrower half, and the one that would have caught the original bug on
    // the day it was written: five declared fields that the server never sent.
    // A type is a claim about somebody else's JSON, and this is the claim being
    // checked rather than assumed.
    for (const invented of [
      'contentTypes',
      'feedKeys',
      'rankingKeys',
      'limits',
      'visibilityRulesEnabled',
    ]) {
      expect(RECORDED_COMMUNITY_CAPABILITIES).not.toHaveProperty(invented);
    }
  });
});

describe('enum values are camelCase, with exactly one PascalCase island', () => {
  it('emits camelCase categories, urgencies, visibilities and reasons', async () => {
    const feed = await fetchFeed('home', { limit: 50 });

    const categories = feed.items.map((post) => post.category).filter(Boolean) as string[];
    // `marketPrices`, not `market-prices` and not `market_prices`. Every other
    // list surface in this application uses kebab-cased category slugs, which is
    // exactly why this is the spelling a client gets wrong.
    expect(categories).toContain('marketPrices');
    expect(categories).toContain('safetyAlert');
    expect(categories).toContain('jobLead');

    for (const value of categories) {
      expect(value).not.toContain('-');
      expect(value).not.toContain('_');
    }

    const visibilities = feed.items.map((post) => post.visibility);
    expect(visibilities).toContain('verifiedMembers');
    expect(visibilities).toContain('communityVerified');

    const reasons = await fetchReportReasons();
    expect(reasons.map((reason) => reason.code)).toEqual(
      // `misinformation` and `personalData`, not `hateSpeech`: the seeded
      // deployment has never served a `hateSpeech` reason, and this asserted it
      // against a mock that invented one.
      expect.arrayContaining(['misinformation', 'personalData'])
    );
    for (const reason of reasons) {
      expect(reason.code).not.toMatch(/[-_]/);
    }
  });

  it('emits `appliesTo` in PascalCase while `contentTypes` on the same response is camelCase', async () => {
    const capabilities = await fetchCommunityCapabilities();

    const appliesTo = capabilities.reactions.flatMap((reaction) => reaction.appliesTo);
    expect(appliesTo).toContain('Post');
    expect(appliesTo).toContain('Guide');
    // Every entry starts upper-case. This list is persisted joined and split
    // verbatim, so it never passes through the wire-name converter.
    for (const value of appliesTo) {
      expect(value[0]).toBe(value[0].toUpperCase());
    }

    // …and the content-type list on the *same object* is camelCase. A client
    // that normalised one to the other would break the one it normalised.
    expect(capabilities.supportedContentTypes).toContain('post');
    expect(capabilities.supportedContentTypes).toContain('guide');
    for (const value of capabilities.supportedContentTypes) {
      expect(value[0]).toBe(value[0].toLowerCase());
    }
  });

  it('reconciles the two casings in exactly one place', async () => {
    const capabilities = await fetchCommunityCapabilities();

    // A naive `appliesTo.includes(contentType)` finds nothing at all.
    expect(capabilities.reactions[0].appliesTo.includes('post')).toBe(false);

    expect(capabilityAppliesTo(capabilities.reactions[0].appliesTo, 'post')).toBe(true);
    expect(reactionKeysFor(capabilities, 'post')).toContain('like');
    // `celebrate` applies to posts and events only, so a comment does not offer it.
    expect(reactionKeysFor(capabilities, 'comment')).not.toContain('celebrate');
    expect(reactionKeysFor(null, 'post')).toEqual([]);
  });

  it('spells the ranking keys kebab-case, unlike every enum on the same module', async () => {
    const capabilities = await fetchCommunityCapabilities();

    // `trust-weighted`, not `trustWeighted`. These are ordering keys rather than
    // enum names and do not pass through the converter.
    expect(capabilities.rankings).toContain('trust-weighted');
    expect(capabilities.rankings).toContain('location-weighted');

    const weighted = await fetchFeed('home', { ranking: 'trust-weighted' });
    expect(weighted.ranking).toBe('trust-weighted');

    await expect(
      apiClient.get('/community/feeds/home', { params: { ranking: 'trustWeighted' } })
    ).rejects.toMatchObject({ response: { status: 400 } });
  });
});

// ── Trap 2 ───────────────────────────────────────────────────────────────────

describe('three values arrive under two names each', () => {
  it('sends the same value as `postId` and `updateId`, and as `body` and `description`', async () => {
    const post = await fetchPost(OTHERS_POST);

    // Not two identifiers. The module was CommunityUpdates before it was
    // Community and the older name is still emitted; there is nothing to look
    // `updateId` up in.
    expect(post.updateId).toBe(post.postId);
    expect(post.description).toBe(post.body);
  });

  it('keeps them equal through a create and an edit', async () => {
    const created = await createPost({ body: 'A post about nothing in particular.' });
    expect(created.updateId).toBe(created.postId);
    expect(created.description).toBe(created.body);

    const edited = await updatePost(created.postId, { body: 'Now it is about something.' });
    expect(edited.updateId).toBe(edited.postId);
    expect(edited.description).toBe('Now it is about something.');
    expect(edited.description).toBe(edited.body);
  });

  it('sends the same value as `bookmarkId` and `savedId`', async () => {
    const bookmark = await createBookmark({ contentType: 'post', contentId: OTHERS_POST });

    expect(bookmark.savedId).toBe(bookmark.bookmarkId);
  });
});

// ── Trap 3 ───────────────────────────────────────────────────────────────────

describe('changeSummary is a string in and an array out', () => {
  it('accepts a sentence and returns lines', async () => {
    const created = await createPost({ body: 'First draft.', title: 'A title' });

    await updatePost(created.postId, {
      body: 'Second draft.',
      // A `string` on the request contract.
      changeSummary: 'Fixed the date.\nAdded the address.',
    });

    const revisions = await fetchPostRevisions(created.postId);
    expect(revisions).toHaveLength(1);

    // **A `string[]` on the response contract.** A client that declared one type
    // for both would either render `[object Object]` or iterate a sentence one
    // character at a time — neither of which throws.
    expect(Array.isArray(revisions[0].changeSummary)).toBe(true);
    expect(revisions[0].changeSummary).toEqual(['Fixed the date.', 'Added the address.']);

    // The revision holds the version that was replaced, under the name
    // `content` rather than `body`.
    expect(revisions[0].content).toBe('First draft.');
    expect(revisions[0].versionNumber).toBe(1);
  });

  it('returns an empty array rather than a null when no summary was sent', async () => {
    const created = await createPost({ body: 'Draft.' });
    await updatePost(created.postId, { body: 'Redraft.' });

    const revisions = await fetchPostRevisions(created.postId);
    expect(revisions[0].changeSummary).toEqual([]);
  });

  it('returns revisions as a bare array with no page around it', async () => {
    const revisions = await fetchPostRevisions(OTHERS_POST);
    expect(Array.isArray(revisions)).toBe(true);
  });
});

// ── Trap 4 ───────────────────────────────────────────────────────────────────

describe('report reason is `reason` in and `reasonCode` out', () => {
  it('renames the field across the round trip', async () => {
    const report = await reportContent({
      contentType: 'post',
      contentId: OTHERS_POST,
      reason: 'harassment',
    });

    // The one that exists.
    expect(report.reasonCode).toBe('harassment');
    // The one a confirmation screen would reach for, and get `undefined` from —
    // which renders as an empty chip rather than anything that looks wrong.
    expect((report as unknown as Record<string, unknown>).reason).toBeUndefined();

    const sent = JSON.parse(String(mock.history.post[mock.history.post.length - 1].data));
    expect(sent.reason).toBe('harassment');
    expect(sent.reasonCode).toBeUndefined();
  });

  it('refuses a reason the server does not know', async () => {
    await expect(
      reportContent({ contentType: 'post', contentId: OTHERS_POST, reason: 'hate_speech' })
    ).rejects.toMatchObject({ response: { status: 400 } });
  });
});

// ── Trap 5 ───────────────────────────────────────────────────────────────────

describe('the reaction summary has two names depending on where it hangs', () => {
  it('is `summary` on a reaction response and `reactions` on a post', async () => {
    const post = await fetchPost(OTHERS_POST);
    // On a post.
    expect(post.reactions.totalCount).toBeGreaterThan(0);
    expect((post as unknown as Record<string, unknown>).summary).toBeUndefined();

    const reaction = await reactToPost(OTHERS_POST, 'like');
    // On a reaction response.
    expect(reaction.summary.totalCount).toBeGreaterThan(0);
    expect((reaction as unknown as Record<string, unknown>).reactions).toBeUndefined();
  });

  it('reads either through one function, so an optimistic update cannot pick the wrong name', async () => {
    const post = await fetchPost(OTHERS_POST);
    const reaction = await reactToPost(OTHERS_POST, 'like');

    expect(readReactionSummary(post)).not.toBeNull();
    expect(readReactionSummary(reaction)).not.toBeNull();
    expect(readReactionSummary(null)).toBeNull();

    expect(reactionCount(reaction, 'like')).toBe(reaction.summary.myReactionKey === 'like' ? 13 : 12);
    // A key nobody used is 0 rather than undefined.
    expect(reactionCount(post, 'celebrate')).toBe(0);
  });

  it('carries the same shape on a comment', async () => {
    const thread = await fetchPostComments(OTHERS_POST);
    const summary = readReactionSummary(thread.comments[0]);

    expect(summary).not.toBeNull();
    expect(summary!.counts).toEqual([]);
    expect(summary!.myReactionKey).toBeNull();
  });
});

// ── Trap 6 ───────────────────────────────────────────────────────────────────

describe('follow.targetType is a body field on POST and a query parameter on DELETE', () => {
  it('puts it in the body on the way in', async () => {
    await followTarget(OTHERS_POST, { targetType: 'organization', muted: false });

    const request = mock.history.post[mock.history.post.length - 1];
    const sent = JSON.parse(String(request.data));

    expect(sent.targetType).toBe('organization');
    // Not a query parameter here. Sending it as one is ignored, and the follow
    // lands on the default target type instead.
    expect(request.params).toBeUndefined();
  });

  it('puts it in the query string on the way out', async () => {
    await followTarget(OTHERS_POST, { targetType: 'organization', muted: false });
    await unfollowTarget(OTHERS_POST, 'organization');

    const request = mock.history.delete[mock.history.delete.length - 1];

    expect(request.params).toEqual({ targetType: 'organization' });
    // Not a body field here.
    expect(request.data).toBeUndefined();
  });

  it('treats the two transports as one fact — a mismatched type is a different follow', async () => {
    await followTarget('00000000-0000-4000-e000-000000000001', {
      targetType: 'organization',
      muted: false,
    });

    // The same id under a different target type is not the same follow, so this
    // is the 404 rather than a successful unfollow.
    await expect(
      unfollowTarget('00000000-0000-4000-e000-000000000001', 'member')
    ).rejects.toMatchObject({ response: { status: 404 } });

    // Named correctly, it works.
    const removed = await unfollowTarget('00000000-0000-4000-e000-000000000001', 'organization');
    expect(removed.isFollowing).toBe(false);
  });
});

// ── Trap 9 ───────────────────────────────────────────────────────────────────

describe('a malformed cursor is page one at HTTP 200', () => {
  it('serves the first page again rather than refusing', async () => {
    const first = await fetchFeed('home', { limit: 2 });
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = await fetchFeed('home', { limit: 2, cursor: first.nextCursor });
    expect(second.items[0].postId).not.toBe(first.items[0].postId);

    // The trap. Not a 400, not an empty page — **page one**, silently, with
    // nothing on the response saying the cursor was not understood.
    const garbled = await fetchFeed('home', { limit: 2, cursor: 'not-a-real-cursor' });
    expect(garbled.items.map((item) => item.postId)).toEqual(
      first.items.map((item) => item.postId)
    );
  });

  it('does the same on a comment thread', async () => {
    const first = await fetchPostComments(OTHERS_POST, { limit: 2 });
    expect(first.hasMore).toBe(true);

    const garbled = await fetchPostComments(OTHERS_POST, { limit: 2, cursor: 'cur_' });
    expect(garbled.comments.map((comment) => comment.commentId)).toEqual(
      first.comments.map((comment) => comment.commentId)
    );
  });

  it('is why `hasMore` is the only safe stop condition', async () => {
    // A page can come back full and still be the last one, and a bad cursor can
    // come back full and be the first one. Only `hasMore` distinguishes them,
    // which is what the hooks page on.
    const all = await fetchFeed('home', { limit: 50 });
    const exact = await fetchFeed('home', { limit: all.items.length });

    expect(exact.items).toHaveLength(all.items.length);
    expect(exact.hasMore).toBe(false);
    expect(exact.nextCursor).toBeNull();
  });

  it('clamps an out-of-range limit rather than refusing it', async () => {
    // Not a 400. 200, with a page size the caller did not ask for and is not
    // told about — which is why the client applies the same clamp so its cache
    // key names the size that was actually used.
    expect(clampLimit(200)).toBe(50);
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-4)).toBe(1);
    expect(clampLimit(null)).toBe(20);
    expect(clampLimit(7.9)).toBe(7);

    await fetchFeed('home', { limit: 500 });
    expect(mock.history.get[mock.history.get.length - 1].params.limit).toBe(50);
  });
});

// ── Trap 10 ──────────────────────────────────────────────────────────────────

describe('poll counts are null, not zero, while results are hidden', () => {
  it('hides every figure until this member has voted', async () => {
    const post = await fetchPost(POLL_POST);
    expect(post.poll).not.toBeNull();

    const poll = post.poll!;
    expect(poll.resultVisibility).toBe('afterVoting');
    expect(poll.hasVoted).toBe(false);

    // **Null, not 0.** Zero would mean "nobody chose this"; null means "you are
    // not allowed to know yet". A client that coalesced them draws a flat bar
    // chart over a poll with twenty-five votes and gives the member a reason to
    // distrust the count.
    expect(poll.totalVotes).toBeNull();
    for (const option of poll.options) {
      expect(option.voteCount).toBeNull();
      expect(option.sharePercent).toBeNull();
    }

    expect(arePollResultsHidden(poll)).toBe(true);
    expect(arePollResultsHidden(null)).toBe(false);
  });

  it('reveals real numbers once the member votes', async () => {
    const before = await fetchPost(POLL_POST);
    const optionId = before.poll!.options[0].optionId;

    const poll = await votePoll(POLL_POST, [optionId]);

    expect(poll.hasVoted).toBe(true);
    expect(arePollResultsHidden(poll)).toBe(false);
    expect(poll.totalVotes).toBe(26);
    expect(poll.options[0].voteCount).toBe(9);
    expect(poll.options.every((option) => option.sharePercent !== null)).toBe(true);
  });

  it('answers a vote with 200, not 201 — a vote is not a resource', async () => {
    const before = await fetchPost(POLL_POST);
    const response = await apiClient.post(`/community/posts/${POLL_POST}/poll/votes`, {
      optionIds: [before.poll!.options[1].optionId],
    });

    expect(response.status).toBe(200);
  });

  it('refuses more than one answer on a single-choice poll', async () => {
    const before = await fetchPost(POLL_POST);
    const ids = before.poll!.options.map((option) => option.optionId);

    await expect(votePoll(POLL_POST, ids)).rejects.toMatchObject({ response: { status: 400 } });
  });

  it('reports reportCount as zero for anyone who is not the author', async () => {
    await reportContent({ contentType: 'post', contentId: OTHERS_POST, reason: 'spam' });
    await reportContent({ contentType: 'post', contentId: MY_POST, reason: 'spam' });

    // Suppressed, not absent. A moderation surface built on this field would
    // report a clean platform to every moderator who is not also the author of
    // the thing they are reviewing.
    expect((await fetchPost(OTHERS_POST)).reportCount).toBe(0);
    // The author sees the real figure.
    expect((await fetchPost(MY_POST)).reportCount).toBe(1);
  });
});

// ── Trap 12 ──────────────────────────────────────────────────────────────────

describe('a content review status of `unavailable` is not `clean`', () => {
  it('never renders a safety badge for content nothing looked at', async () => {
    const post = await fetchPost(OTHERS_POST);

    // This deployment has no review provider configured, so most content
    // carries `unavailable`: the review did not run.
    expect(post.reviewStatus).toBe('unavailable');

    // The whole point. A screen that showed a badge for anything that is not
    // `flagged` would put "checked and safe" on content nobody checked.
    expect(shouldRenderSafetyBadge(post.reviewStatus)).toBe(false);
    expect(isFlaggedContent(post.reviewStatus)).toBe(false);
  });

  it('distinguishes flagged from unavailable', async () => {
    const flagged = await fetchPost(FLAGGED_POST);

    expect(flagged.reviewStatus).toBe('flagged');
    expect(isFlaggedContent(flagged.reviewStatus)).toBe(true);
    expect(shouldRenderSafetyBadge(flagged.reviewStatus)).toBe(false);
  });

  it('only ever says yes to `clean`', () => {
    expect(shouldRenderSafetyBadge('clean')).toBe(true);
    expect(shouldRenderSafetyBadge('pending')).toBe(false);
    expect(shouldRenderSafetyBadge('unavailable')).toBe(false);
    expect(shouldRenderSafetyBadge(null)).toBe(false);
    expect(shouldRenderSafetyBadge(undefined)).toBe(false);
  });

  it('marks a new comment unavailable too', async () => {
    const comment = await createPostComment(OTHERS_POST, { body: 'Thanks for this.' });
    expect(comment.reviewStatus).toBe('unavailable');
    expect(shouldRenderSafetyBadge(comment.reviewStatus)).toBe(false);
  });
});

// ── Trap 13 ──────────────────────────────────────────────────────────────────

describe('unfollowing something you do not follow is a failure', () => {
  it('answers 404 FollowNotFound rather than a 200 no-op', async () => {
    await expect(unfollowTarget('00000000-0000-4000-e000-0000000000ff')).rejects.toMatchObject({
      response: { status: 404 },
    });

    try {
      await unfollowTarget('00000000-0000-4000-e000-0000000000ff');
      throw new Error('should have thrown');
    } catch (cause) {
      expect(isFollowNotFoundError(cause)).toBe(true);
      expect(isFollowNotFoundError({ response: { status: 404, data: { code: 'other' } } })).toBe(
        false
      );
    }
  });

  it('is the opposite of un-reacting, which is a 200 for something never reacted to', async () => {
    // Same shape of call, opposite behaviour. This is why the two are not
    // written as one helper.
    const before = await fetchPost(MY_POST);
    expect(before.reactions.myReactionKey).toBeNull();

    const response = await unreactToPost(MY_POST, 'like');
    // No throw, no 404 — the current tally, unchanged, because there was nothing
    // of this member's to remove. Other people's reactions are untouched.
    expect(response.myReactionKey).toBeNull();
    expect(response.summary.totalCount).toBe(before.reactions.totalCount);
  });

  it('offers an idempotent form, because the wire does not', async () => {
    expect(await ensureNotFollowing('00000000-0000-4000-e000-0000000000fe')).toBeNull();

    await followTarget('00000000-0000-4000-e000-0000000000fe', { muted: false });
    const removed = await ensureNotFollowing('00000000-0000-4000-e000-0000000000fe');

    expect(removed).not.toBeNull();
    expect(removed!.isFollowing).toBe(false);
  });

  it('un-mutes an already-muted follow when the POST carries no body', async () => {
    const target = '00000000-0000-4000-e000-0000000000fd';

    const muted = await followTarget(target, { muted: true });
    expect(muted.muted).toBe(true);

    // The trap, sent the way the wire allows: the whole body is optional, and
    // `SetMuted(request.Muted)` is applied unconditionally, so an absent body
    // deserialises to `false` and turns the member's mute off.
    const bare = await apiClient.post(`/community/follows/${target}`);
    expect(bare.status).toBe(200);
    expect(bare.data.data.muted).toBe(false);
  });

  it('requires the caller to state `muted`, because there is no safe default', async () => {
    const target = '00000000-0000-4000-e000-0000000000fc';

    await followTarget(target, { muted: true });
    // The client never sends an absent body — `muted` is a required argument, so
    // a "follow" tap cannot un-mute by omission.
    const sent = JSON.parse(String(mock.history.post[mock.history.post.length - 1].data));
    expect(sent.muted).toBe(true);
  });
});

// ── Traps 7, 14: the moderation queue ────────────────────────────────────────

describe('the moderation queue accepts a cursor and cannot be paged', () => {
  it('returns a bare array with no cursor anywhere', async () => {
    await reportContent({ contentType: 'post', contentId: OTHERS_POST, reason: 'spam' });

    const items = await fetchModerationQueue();
    expect(Array.isArray(items)).toBe(true);

    // Nothing to send as the next page. Not in the rows, not beside them.
    const raw = await apiClient.get('/community/moderation/queue');
    expect(Array.isArray(raw.data.data)).toBe(true);
    expect(raw.data.data.nextCursor).toBeUndefined();
    expect(raw.data.meta.nextCursor).toBeUndefined();
  });

  it('applies `limit` to reports and then groups, so the row count is under it unpredictably', async () => {
    // Four reports about two posts.
    await reportContent({ contentType: 'post', contentId: OTHERS_POST, reason: 'spam' });
    await reportContent({ contentType: 'post', contentId: OTHERS_POST, reason: 'harassment' });
    await reportContent({ contentType: 'post', contentId: MY_POST, reason: 'spam' });
    // `inappropriate`, not `scam`. The mock serves the recording now and refuses
    // a reason no deployment has: this line used to pass because the mock made
    // one up.
    await reportContent({ contentType: 'post', contentId: MY_POST, reason: 'inappropriate' });

    const items = await fetchModerationQueue({ limit: 4 });

    // Two rows for a limit of four, and nothing on the response says so. "Fewer
    // rows than the limit" therefore does not mean "that is all there is" —
    // which is the only inference a paging control would want it for.
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.reportCount === 2)).toBe(true);
  });

  it('hardcodes the four display names to null', async () => {
    await reportContent({ contentType: 'post', contentId: OTHERS_POST, reason: 'spam' });

    const [item] = await fetchModerationQueue();

    // Three on the row, and `moderatorName` on a decision. A queue that
    // identifies people cannot be built on this contract.
    expect(item.reporterName).toBeNull();
    expect(item.authorName).toBeNull();
    expect(item.authorLevel).toBeNull();

    const decision = await submitModerationDecision({
      contentType: 'post',
      contentId: OTHERS_POST,
      action: 'dismiss',
    });
    expect(decision.moderatorName).toBeNull();
  });

  it('falls back to the literal "(removed)" for content that is already gone', async () => {
    const thread = await fetchPostComments(OTHERS_POST);
    const commentId = thread.comments[1].commentId;

    await reportContent({ contentType: 'comment', contentId: commentId, reason: 'harassment' });
    await deleteComment(commentId);

    const [item] = await fetchModerationQueue({ contentType: 'comment' });

    // A literal the server writes, not a sentinel a client is expected to
    // recognise — and not a null, so a screen showing `title ?? 'Untitled'`
    // never fires its fallback.
    expect(item.title).toBe('(removed)');
  });

  it('records a decision at 201 and reads the history back as a bare array', async () => {
    await reportContent({ contentType: 'post', contentId: OTHERS_POST, reason: 'spam' });

    const response = await apiClient.post('/community/moderation/decisions', {
      contentType: 'post',
      contentId: OTHERS_POST,
      action: 'hide',
      reason: 'Off topic',
    });
    expect(response.status).toBe(201);

    const history = await fetchModerationHistory('post', OTHERS_POST);
    expect(history).toHaveLength(1);
    expect(history[0].action).toBe('hide');
  });
});

// ── Trap 8: fields that are declared and never read ──────────────────────────

describe('the route always wins over the body', () => {
  it('ignores `contentType` and `contentId` on a reaction request', async () => {
    // Declared on `ReactRequest` and never read. The client does not send them
    // at all, which is the only way to be sure nobody believes they select
    // something.
    await reactToPost(OTHERS_POST, 'like');

    const sent = JSON.parse(String(mock.history.post[mock.history.post.length - 1].data));
    expect(Object.keys(sent)).toEqual(['reactionKey']);
  });

  it('ignores them on a comment request too, and strips a redundant parent on /replies', async () => {
    await createPostComment(OTHERS_POST, {
      body: 'A comment.',
      // A caller who filled these in, believing they choose the target.
      contentType: 'guide',
      contentId: '00000000-0000-4000-f000-000000000001',
    });

    const sentComment = JSON.parse(String(mock.history.post[mock.history.post.length - 1].data));
    expect(sentComment.contentType).toBeUndefined();
    expect(sentComment.contentId).toBeUndefined();

    const thread = await fetchPostComments(OTHERS_POST);
    await replyToComment(thread.comments[0].commentId, {
      body: 'A reply.',
      parentCommentId: '00000000-0000-4000-f000-000000000002',
    });

    const sentReply = JSON.parse(String(mock.history.post[mock.history.post.length - 1].data));
    // The parent comes from the route. Sending a different one in the body would
    // be a silently ignored instruction.
    expect(sentReply.parentCommentId).toBeNull();
  });
});

// ── Trap 11: the quote share that is never created ───────────────────────────

describe('a quote share creates no post', () => {
  it('answers with a null quotePostId for every kind, including quote', async () => {
    const link = await sharePost(OTHERS_POST, { kind: 'link' });
    expect(link.quotePostId).toBeNull();

    const quote = await sharePost(OTHERS_POST, { kind: 'quote', message: 'Look at this' });
    // Both contracts document a post carrying the original, and no handler ever
    // creates one. A UI that promised "your quote has been posted" would have
    // nowhere to send the member.
    expect(quote.quotePostId).toBeNull();
  });

  it('is a 201, and refuses an unknown kind', async () => {
    const response = await apiClient.post(`/community/posts/${OTHERS_POST}/shares`, {
      kind: 'link',
    });
    expect(response.status).toBe(201);

    await expect(sharePost(OTHERS_POST, { kind: 'retweet' })).rejects.toMatchObject({
      response: { status: 400 },
    });
  });
});

// ── Traps 15, 16: the two bespoke page shapes ────────────────────────────────

describe('neither list envelope is a CursorPagedResult', () => {
  it('names the feed rows `items` and its count `totalAvailable`', async () => {
    const feed = await fetchFeed('home', { limit: 2 });

    expect(Array.isArray(feed.items)).toBe(true);
    expect(typeof feed.totalAvailable).toBe('number');
    expect((feed as unknown as Record<string, unknown>).totalCount).toBeUndefined();
  });

  it('names the thread rows `comments` and its count `totalCount`', async () => {
    const thread = await fetchPostComments(OTHERS_POST);

    expect(Array.isArray(thread.comments)).toBe(true);
    expect(typeof thread.totalCount).toBe('number');
    // Not `items`. This is the difference that costs a client every row.
    expect((thread as unknown as Record<string, unknown>).items).toBeUndefined();
  });

  it('shows what readPage does to each — the feed loses its count, the thread loses everything', async () => {
    const feed = await fetchFeed('home', { limit: 2 });
    const thread = await fetchPostComments(OTHERS_POST, { limit: 2 });

    const feedPage = readPage<CommunityPostResponse>({ data: feed });
    // The rows and the cursor survive, because the record happens to spell its
    // rows `items`.
    expect(feedPage.items).toHaveLength(2);
    expect(feedPage.hasMore).toBe(true);
    // The count does not: `toPage` reads `totalCount` and this record spells it
    // `totalAvailable`, so a screen renders no figure at all.
    expect(feedPage.totalCount).toBeNull();
    expect(feed.totalAvailable).not.toBeNull();

    // Wave N: `toPage` warns in development on this exact signature — an object
    // with no `items` and precisely one array-valued property. Captured rather
    // than left to print, and asserted, because the warning is now part of the
    // behaviour this test describes.
    const original = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(String(args[0]));
    };

    let threadPage;
    try {
      threadPage = readPage<CommentResponse>({ data: thread });
    } finally {
      console.warn = original;
      resetBespokeEnvelopeWarnings();
    }

    // **Empty, at no cost.** `toPage` looks for `items`, does not find it, and
    // takes its fourth branch — the one that exists so a dashboard returned
    // where a list was expected does not crash a screen. Every comment thread in
    // the application would render "no comments yet".
    expect(threadPage.items).toEqual([]);
    expect(threadPage.hasMore).toBe(false);
    expect(thread.comments.length).toBeGreaterThan(0);

    // It is no longer *silent*, which is the half of the defect Wave N fixed.
    // The rows are still lost — that is what the named adapter below is for —
    // but the page says so and the log says so.
    expect(threadPage.shape).toBe('unrecognised');
    expect(warnings.some((line) => line.includes('"comments"'))).toBe(true);
  });

  it('uses the named adapters instead, which lose nothing', async () => {
    const feed = await fetchFeed('home', { limit: 2 });
    const thread = await fetchPostComments(OTHERS_POST, { limit: 2 });

    const feedPage = toFeedPage(feed);
    expect(feedPage.items).toHaveLength(2);
    expect(feedPage.totalCount).toBe(feed.totalAvailable);
    expect(feedPage.nextCursor).toBe(feed.nextCursor);

    const commentPage = toCommentPage(thread);
    expect(commentPage.items).toHaveLength(thread.comments.length);
    expect(commentPage.totalCount).toBe(thread.totalCount);
  });
});

describe('comments are a tree, and deleted ones stay in it', () => {
  it('nests replies under their parent all the way down', async () => {
    const thread = await fetchPostComments(OTHERS_POST);
    const flat = flattenComments(thread.comments);

    expect(thread.comments.length).toBeLessThan(flat.length);
    expect(flat.some((comment) => comment.depth > 5)).toBe(true);
  });

  it('clamps renderedDepth at six while depth keeps counting', async () => {
    const thread = await fetchPostComments(OTHERS_POST);
    const deep = flattenComments(thread.comments).filter((comment) => comment.depth > 6);

    expect(deep.length).toBeGreaterThan(0);
    for (const comment of deep) {
      // A screen that indented by `depth` would run a long argument off the side
      // of the phone at about the fifth reply.
      expect(comment.renderedDepth).toBe(MAX_RENDERED_COMMENT_DEPTH);
      expect(comment.depth).toBeGreaterThan(comment.renderedDepth);
    }
  });

  it('delivers a deleted comment tombstoned, with its replies still attached', async () => {
    const thread = await fetchPostComments(OTHERS_POST);
    const tombstone = flattenComments(thread.comments).find((comment) => comment.isTombstoned);

    expect(tombstone).toBeDefined();
    // An empty string, not a sentence and not an omission — removing the row
    // would orphan everything under it.
    expect(tombstone!.body).toBe('');
    expect(tombstone!.replies.length).toBeGreaterThan(0);

    // Which is why a screen needs its own words for it.
    expect(commentBodyText(tombstone!)).toBe('This comment was removed.');
    expect(commentBodyText(thread.comments[0])).toBe(thread.comments[0].body);
  });

  it('tombstones rather than removes on delete, so a cache splice would be wrong', async () => {
    const before = await fetchPostComments(OTHERS_POST);
    const target = before.comments[2].commentId;

    await deleteComment(target);

    const after = await fetchPostComments(OTHERS_POST);
    const still = after.comments.find((comment) => comment.commentId === target);

    // Still there. A hook that spliced it out of its cached tree would take
    // every reply under it off the screen, and they would come back on the next
    // refetch.
    expect(still).toBeDefined();
    expect(still!.isTombstoned).toBe(true);
    expect(after.totalCount).toBe(before.totalCount);
  });
});

// ── Trap 3's other half: the character ceilings ──────────────────────────────

describe('the 500 and the 2000 are enforced by the server, not just counted locally', () => {
  it('refuses a post body over 500 characters', async () => {
    await expect(createPost({ body: 'x'.repeat(POST_BODY_MAX_LENGTH + 1) })).rejects.toMatchObject({
      response: { status: 400 },
    });

    const accepted = await createPost({ body: 'x'.repeat(POST_BODY_MAX_LENGTH) });
    expect(accepted.body).toHaveLength(POST_BODY_MAX_LENGTH);
  });

  it('refuses a title over 200 characters', async () => {
    await expect(
      createPost({ body: 'Fine.', title: 'x'.repeat(POST_TITLE_MAX_LENGTH + 1) })
    ).rejects.toMatchObject({ response: { status: 400 } });
  });

  it('refuses a comment body over 2000 characters — four times the post limit', async () => {
    await expect(
      createPostComment(OTHERS_POST, { body: 'x'.repeat(COMMENT_BODY_MAX_LENGTH + 1) })
    ).rejects.toMatchObject({ response: { status: 400 } });

    const accepted = await createPostComment(OTHERS_POST, {
      body: 'x'.repeat(COMMENT_BODY_MAX_LENGTH),
    });
    expect(accepted.body).toHaveLength(COMMENT_BODY_MAX_LENGTH);
  });

  it('publishes the same numbers on /capabilities that the client falls back to', async () => {
    const capabilities: CommunityCapabilitiesResponse = await fetchCommunityCapabilities();

    // The client duplicates these so a compose box has a counter before the
    // capabilities request resolves. Duplication is only safe while the two
    // agree, so this is the assertion that keeps it safe.
    //
    // Flat, not nested. These read `capabilities.limits.*` and passed against a
    // mock that invented the object; against a real deployment `limits` is
    // `undefined` and `CommentThread` threw on it.
    expect(capabilities.maxPostLength).toBe(POST_BODY_MAX_LENGTH);
    expect(capabilities.maxCommentLength).toBe(COMMENT_BODY_MAX_LENGTH);

    // No `postTitleMaxLength` on the wire at all: the server publishes a body
    // limit and a comment limit and says nothing about titles.
    expect(POST_TITLE_MAX_LENGTH).toBeGreaterThan(0);
  });
});

// ── Trap 1's requirement: prefix on hashtag suggest ──────────────────────────

describe('hashtag suggest requires a prefix', () => {
  it('is a 400 when the prefix is absent, not "everything"', async () => {
    await expect(suggestHashtags('')).rejects.toMatchObject({ response: { status: 400 } });

    try {
      await suggestHashtags('   ');
      throw new Error('should have thrown');
    } catch (cause) {
      // The obvious autocomplete — fire on mount, then filter as the member
      // types — fails on its first call and shows an error under an empty field.
      expect(isPrefixRequiredError(cause)).toBe(true);
    }
  });

  it('answers with matches once there is one', async () => {
    const suggestions = await suggestHashtags('ho');
    expect(suggestions.map((entry) => entry.tag)).toContain('housing');
  });

  it('does not require anything on trending, which is the contrast', async () => {
    const trending = await fetchTrendingHashtags();
    expect(trending.length).toBeGreaterThan(0);
    expect(trending[0].rank).toBe(1);

    const scoped = await fetchTrendingHashtags('gh');
    expect(mock.history.get[mock.history.get.length - 1].params.countryCode).toBe('GH');
    expect(scoped.every((entry) => entry.countryCode === 'GH')).toBe(true);
  });
});

// ── Trap 18: routes that do not exist ────────────────────────────────────────

describe('the routes this module does not have', () => {
  it('has no list route for posts — the collection is a 405', async () => {
    await expect(apiClient.get('/community/posts')).rejects.toMatchObject({
      response: { status: 405 },
    });
  });

  it('has no search feed, despite the key being declared', async () => {
    expect(COMMUNITY_FEEDS_WITHOUT_PROVIDERS).toContain('search');

    await expect(apiClient.get('/community/feeds/search')).rejects.toMatchObject({
      response: { status: 404 },
    });
  });

  it('does not offer `custom` visibility, because no route creates a rule', async () => {
    expect(SELECTABLE_POST_VISIBILITIES).not.toContain('custom');

    // `visibilityRulesEnabled` was never sent. The server publishes the list of
    // levels instead, and `custom` appearing on it is not the same claim as a
    // rule engine existing to back it.
    const capabilities = await fetchCommunityCapabilities();
    expect(capabilities.visibilityLevels).toContain('custom');
  });

  it('refuses a feed key the server does not know', async () => {
    await expect(apiClient.get('/community/feeds/for-you')).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});

// ── The remaining status codes and null bodies ───────────────────────────────

describe('status codes and null bodies', () => {
  it('creates a post at 201 and publishes by default', async () => {
    const response = await apiClient.post('/community/posts', { body: 'Hello.' });

    expect(response.status).toBe(201);
    // **Defaults to true.** A client that omitted `publish` expecting a draft
    // publishes.
    expect(response.data.data.isPublished).toBe(true);
    expect(response.data.data.publishedAt).not.toBeNull();
  });

  it('deletes a post at 200 with a null body, not a 204', async () => {
    const created = await createPost({ body: 'Temporary.' });

    const response = await apiClient.delete(`/community/posts/${created.postId}`);
    expect(response.status).toBe(200);
    // A client checking for 204 sees a success it does not recognise.
    expect(response.data.data).toBeNull();

    await expect(fetchPost(created.postId)).rejects.toMatchObject({ response: { status: 404 } });
  });

  it('pins at 200 with a null body, so there is nothing to write into a cache', async () => {
    const created = await createPost({ body: 'Pin me.' });

    const response = await apiClient.put(`/community/posts/${created.postId}/pin`, {
      pinned: true,
    });
    expect(response.status).toBe(200);
    expect(response.data.data).toBeNull();

    await setPostPinned(created.postId, true);
    expect((await fetchPost(created.postId)).isPinned).toBe(true);
  });

  it('creates a comment at 201 and a reaction at 200', async () => {
    const comment = await apiClient.post(`/community/posts/${OTHERS_POST}/comments`, {
      body: 'A comment.',
    });
    expect(comment.status).toBe(201);

    // A reaction is set membership rather than a resource, so creating one is
    // not a 201 and removing an absent one is not a 404.
    const reaction = await apiClient.post(`/community/posts/${OTHERS_POST}/reactions`, {
      reactionKey: 'like',
    });
    expect(reaction.status).toBe(200);

    const removal = await apiClient.delete(`/community/posts/${OTHERS_POST}/reactions/like`);
    expect(removal.status).toBe(200);
  });

  it('creates a bookmark at 201 and deletes it by content, at 200 with a null body', async () => {
    const created = await apiClient.post('/community/bookmarks', {
      contentType: 'post',
      contentId: OTHERS_POST,
    });
    expect(created.status).toBe(201);

    // Keyed by the content, not by the bookmark id — so a caller holding only
    // the identifier cannot delete it.
    const removed = await apiClient.delete(`/community/bookmarks/post/${OTHERS_POST}`);
    expect(removed.status).toBe(200);
    expect(removed.data.data).toBeNull();

    // Un-saving something never saved is a 200, unlike unfollowing.
    await expect(deleteBookmark('post', MY_POST)).resolves.toBeUndefined();
  });

  it('answers the collections route with a bare array of folders and their items', async () => {
    const folder = await createBookmarkFolder({ name: 'To read', glyph: '📚' });
    await createBookmark({ contentType: 'post', contentId: OTHERS_POST, folderId: folder.folderId });
    await createBookmark({ contentType: 'post', contentId: MY_POST });

    const collections = await fetchBookmarkCollections();
    expect(Array.isArray(collections)).toBe(true);

    const named = collections.find((entry) => entry.folderId === folder.folderId);
    expect(named!.itemCount).toBe(1);

    // The un-foldered collection carries a null `folderId`. There is no route
    // that moves a bookmark into a folder afterwards.
    const loose = collections.find((entry) => entry.folderId === null);
    expect(loose!.itemCount).toBe(1);
  });
});

// ── The feed's own rules ─────────────────────────────────────────────────────

describe('the feed', () => {
  it('omits expired posts unless includeExpired is asked for', async () => {
    const normal = await fetchFeed('home', { limit: 50 });
    const withExpired = await fetchFeed('home', { limit: 50, includeExpired: true });

    expect(withExpired.items.length).toBeGreaterThan(normal.items.length);
    expect(normal.items.some((post) => post.expiresAt !== null)).toBe(false);
  });

  it('always states includeExpired rather than relying on the server default', async () => {
    await fetchFeed('home');
    expect(mock.history.get[mock.history.get.length - 1].params.includeExpired).toBe(false);
  });

  it('leads with a pinned post whatever the ranking', async () => {
    const chronological = await fetchFeed('home', { ranking: 'chronological', limit: 50 });
    const trending = await fetchFeed('home', { ranking: 'trending', limit: 50 });

    expect(chronological.items[0].postId).toBe(FLAGGED_POST);
    expect(chronological.items[0].isPinned).toBe(true);
    expect(trending.items[0].isPinned).toBe(true);
  });

  it('narrows by country, category and hashtag', async () => {
    const ghana = await fetchFeed('home', { countryCode: 'GH', limit: 50 });
    expect(ghana.items.every((post) => post.countryCode === 'GH')).toBe(true);

    const markets = await fetchFeed('home', { category: 'marketPrices', limit: 50 });
    expect(markets.items.every((post) => post.category === 'marketPrices')).toBe(true);

    const housing = await fetchFeed('hashtag', { hashtag: 'housing', limit: 50 });
    expect(housing.items).toHaveLength(1);
  });

  it('keys the cache by the filters and not by the cursor', () => {
    const first = communitySocialKeys.feed('home', { limit: 20, cursor: 'cur_0' });
    const second = communitySocialKeys.feed('home', { limit: 20, cursor: 'cur_2' });

    // Folding the cursor into the key would give every page its own entry and
    // defeat the infinite query entirely.
    expect(first).toEqual(second);

    expect(communitySocialKeys.feed('home', { countryCode: 'GH' })).not.toEqual(
      communitySocialKeys.feed('home', { countryCode: 'GB' })
    );
    expect(communitySocialKeys.feed('home')).not.toEqual(communitySocialKeys.feed('nearby'));
  });
});
