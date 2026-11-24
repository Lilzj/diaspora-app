// ─────────────────────────────────────────────────────────────────────────────
// The community social mock serves what the contract describes (RMD-009)
//
// `mocks/handlers/community-social.ts` says it was written from the module's
// contract, and it had drifted all the same. Its post, its feed row, its
// reaction summary, its poll and its comment were the client's invented shapes —
// flat `authorId` and `cityName`, `counts` and `myReactionKey`, `isClosed` and
// `selectedOptionIds`, a `reviewStatus` — and the client read them back, so
// every test agreed with a server that sends none of them.
//
// `backend-response-field-drift` could not see it. That suite checks the types
// the client reads a route as, and the mock declares types of its own. So this
// one asks the mock, route by route, and holds each body to the schema the
// published contract documents for that route, both ways:
//
//   * **every name the mock sends is one the contract declares** — the half that
//     lets a client be built against a field no server has;
//   * **every name the contract declares is sent.** The server writes every
//     property of these records, nulls included (nothing in the module's
//     contracts carries `JsonIgnore`), so a body missing one is a body the
//     server never answers with.
//
// Each case also names the components its body must reach, so a comparison
// cannot pass by walking an empty list.
//
// The cases are the routes RMD-009's wave B2 reshaped: posts, the feed,
// comments, reactions and polls (B2a), then follows, shares, bookmarks,
// hashtags, reports and the moderation records (B2b). A route that is not
// listed is not yet held to the contract.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import type { AxiosResponse } from 'axios';

import { apiClient } from '@/lib/transport/apiClient';
import {
  resetCommunitySocialMocks,
  setupCommunitySocialMocks,
} from '@/mocks/handlers/community-social';

import { backendContractFile } from './support/backend-checkout';
import {
  operationKey,
  readPublishedContract,
  referencedName,
  resolveSchema,
  schemaKind,
  schemaProperties,
  type HttpMethod,
  type PublishedContract,
  type Schema,
} from './support/published-contract';

const CONTRACT_FILE = backendContractFile();
const describeAgainstContract = CONTRACT_FILE === null ? describe.skip : describe;

/** The seeded post the comment thread hangs off, written by somebody else. */
const OTHERS_POST = '00000000-0000-4000-c000-000000000001';
/** The seeded post with a poll. */
const POLL_POST = '00000000-0000-4000-c000-000000000004';
/** The seeded pinned post, which has a moderation history. */
const PINNED_POST = '00000000-0000-4000-c000-000000000003';
/** Somebody to follow. */
const FOLLOWED = '00000000-0000-4000-e000-0000000000f1';

/** A post with something in every list a post carries. */
const NEW_POST = {
  body: 'Water is off on Mill Road until four.',
  countryCode: 'GH',
  cityName: 'Accra',
  attachments: [
    { kind: 'image', mediaId: '5d1c3a2e-8f4b-4c6d-9e7a-1b2c3d4e5f60' },
    { kind: 'link', url: 'https://example.org/notice' },
  ],
  poll: { question: 'Is it back on?', options: [{ label: 'Yes' }, { label: 'No' }], allowsMultiple: false },
};

// ── The comparison ───────────────────────────────────────────────────────────

/** The component a schema stands for, through a nullable wrapper. */
function componentName(schema: Schema): string | null {
  const direct = referencedName(schema);
  if (direct !== null) return direct;
  const named = (schema.oneOf ?? schema.anyOf ?? [])
    .map((arm) => referencedName(arm))
    .filter((name): name is string => name !== null);
  return named.length === 1 ? named[0] : null;
}

interface Walk {
  problems: Set<string>;
  /** Every component a body actually reached. */
  reached: Set<string>;
}

function compare(contract: PublishedContract, schema: Schema, body: unknown, at: string, walk: Walk): void {
  if (body === null || body === undefined) return;
  const resolved = resolveSchema(contract, schema);
  if (resolved === null) return;
  const kind = schemaKind(contract, resolved);

  if (kind === 'list') {
    if (!Array.isArray(body)) {
      walk.problems.add(`${at || '(body)'}: the contract sends a list`);
      return;
    }
    if (resolved.items === undefined) return;
    for (const item of body) compare(contract, resolved.items, item, `${at}[]`, walk);
    return;
  }

  if (kind !== 'object') return;
  // A dictionary has no names to compare.
  const properties = schemaProperties(contract, resolved);
  if (properties === null) return;
  if (typeof body !== 'object' || Array.isArray(body)) {
    walk.problems.add(`${at || '(body)'}: the contract sends an object`);
    return;
  }

  const name = componentName(schema);
  if (name !== null) walk.reached.add(name);

  const sent = body as Record<string, unknown>;
  const prefix = at ? `${at}.` : '';
  for (const key of Object.keys(sent)) {
    if (properties[key] === undefined) walk.problems.add(`${prefix}${key}: sent, and not in the contract`);
    else compare(contract, properties[key], sent[key], `${prefix}${key}`, walk);
  }
  for (const key of Object.keys(properties)) {
    if (!(key in sent)) walk.problems.add(`${prefix}${key}: in the contract, and not sent`);
  }
}

// ── The routes ───────────────────────────────────────────────────────────────

interface Case {
  method: HttpMethod;
  /** The operation's path as the contract publishes it. */
  operation: string;
  /** Asks the mock, and returns what it answered. */
  ask: () => Promise<AxiosResponse>;
  /** Components the body must reach for the comparison to mean anything. */
  reaches: string[];
}

const CASES: Record<string, Case> = {
  'a feed page': {
    method: 'get',
    operation: '/api/v1/community/feeds/{feedKey}',
    ask: () => apiClient.get('/community/feeds/home', { params: { limit: 50 } }),
    reaches: [
      'FeedResponse',
      'FeedItemResponse',
      'CommunityPostSummaryResponse',
      'AuthorSummaryResponse',
      'LocationContextResponse',
      'ReactionSummaryResponse',
      'ReactionCountResponse',
    ],
  },
  'a post with a poll': {
    method: 'get',
    operation: '/api/v1/community/posts/{postId}',
    ask: () => apiClient.get(`/community/posts/${POLL_POST}`),
    reaches: ['CommunityPostResponse', 'Community.PollResponse', 'Community.PollOptionResponse'],
  },
  'a created post': {
    method: 'post',
    operation: '/api/v1/community/posts',
    ask: () => apiClient.post('/community/posts', NEW_POST),
    reaches: ['CommunityPostResponse', 'PostAttachmentResponse', 'Community.PollResponse'],
  },
  'an edited post': {
    method: 'put',
    operation: '/api/v1/community/posts/{postId}',
    ask: async () => {
      const created = await apiClient.post('/community/posts', NEW_POST);
      return apiClient.put(`/community/posts/${created.data.data.postId}`, {
        body: 'Water is back on Mill Road.',
        attachments: NEW_POST.attachments,
      });
    },
    reaches: ['CommunityPostResponse', 'PostAttachmentResponse'],
  },
  'a withdrawn post': {
    method: 'post',
    operation: '/api/v1/community/posts/{postId}/withdraw',
    ask: async () => {
      const created = await apiClient.post('/community/posts', NEW_POST);
      return apiClient.post(`/community/posts/${created.data.data.postId}/withdraw`);
    },
    reaches: ['CommunityPostResponse'],
  },
  'a cancelled post': {
    method: 'post',
    operation: '/api/v1/community/posts/{postId}/cancel',
    ask: async () => {
      const created = await apiClient.post('/community/posts', NEW_POST);
      return apiClient.post(`/community/posts/${created.data.data.postId}/cancel`);
    },
    reaches: ['CommunityPostResponse'],
  },
  'a poll vote': {
    method: 'post',
    operation: '/api/v1/community/posts/{postId}/poll/votes',
    ask: async () => {
      const post = await apiClient.get(`/community/posts/${POLL_POST}`);
      const optionId = post.data.data.poll.options[0].optionId;
      return apiClient.post(`/community/posts/${POLL_POST}/poll/votes`, { optionIds: [optionId] });
    },
    reaches: ['Community.PollResponse', 'Community.PollOptionResponse'],
  },
  "a post's comment thread": {
    method: 'get',
    operation: '/api/v1/community/posts/{postId}/comments',
    ask: async () => {
      await apiClient.post(`/community/posts/${OTHERS_POST}/reactions`, { reactionKey: 'like' });
      return apiClient.get(`/community/posts/${OTHERS_POST}/comments`, { params: { limit: 50 } });
    },
    reaches: ['CommentThreadResponse', 'CommentResponse', 'AuthorSummaryResponse', 'ReactionSummaryResponse'],
  },
  "any content's comment thread": {
    method: 'get',
    operation: '/api/v1/community/content/{contentType}/{contentId}/comments',
    ask: () => apiClient.get(`/community/content/post/${OTHERS_POST}/comments`),
    reaches: ['CommentThreadResponse', 'CommentResponse'],
  },
  'a new comment': {
    method: 'post',
    operation: '/api/v1/community/posts/{postId}/comments',
    ask: () => apiClient.post(`/community/posts/${OTHERS_POST}/comments`, { body: 'Thanks for this.' }),
    reaches: ['CommentResponse', 'AuthorSummaryResponse', 'ReactionSummaryResponse'],
  },
  'a reaction to a post': {
    method: 'post',
    operation: '/api/v1/community/posts/{postId}/reactions',
    ask: () => apiClient.post(`/community/posts/${OTHERS_POST}/reactions`, { reactionKey: 'helpful' }),
    reaches: ['ReactionResponse', 'ReactionSummaryResponse', 'ReactionCountResponse'],
  },
  'a reaction taken back': {
    method: 'delete',
    operation: '/api/v1/community/posts/{postId}/reactions/{reactionKey}',
    ask: () => apiClient.delete(`/community/posts/${OTHERS_POST}/reactions/like`),
    reaches: ['ReactionResponse', 'ReactionSummaryResponse', 'ReactionCountResponse'],
  },
  'a reaction to other content': {
    method: 'post',
    operation: '/api/v1/community/content/{contentType}/{contentId}/reactions',
    ask: () =>
      apiClient.post(`/community/content/post/${OTHERS_POST}/reactions`, { reactionKey: 'helpful' }),
    reaches: ['ReactionResponse', 'ReactionSummaryResponse', 'ReactionCountResponse'],
  },
  'a follow': {
    method: 'post',
    operation: '/api/v1/community/follows/{targetId}',
    ask: () => apiClient.post(`/community/follows/${FOLLOWED}`, { targetType: 'member', muted: false }),
    reaches: ['FollowResponse'],
  },
  'an unfollow': {
    method: 'delete',
    operation: '/api/v1/community/follows/{targetId}',
    ask: async () => {
      await apiClient.post(`/community/follows/${FOLLOWED}`, { targetType: 'member', muted: false });
      return apiClient.delete(`/community/follows/${FOLLOWED}`, { params: { targetType: 'member' } });
    },
    reaches: ['FollowResponse'],
  },
  "a follow's state": {
    method: 'get',
    operation: '/api/v1/community/follows/{targetId}',
    ask: () => apiClient.get(`/community/follows/${FOLLOWED}`, { params: { targetType: 'member' } }),
    reaches: ['FollowStateResponse'],
  },
  'a share of a post': {
    method: 'post',
    operation: '/api/v1/community/posts/{postId}/shares',
    ask: () =>
      apiClient.post(`/community/posts/${OTHERS_POST}/shares`, { kind: 'external', destination: 'whatsapp' }),
    reaches: ['ShareResponse'],
  },
  'a share of other content': {
    method: 'post',
    operation: '/api/v1/community/content/{contentType}/{contentId}/shares',
    ask: () => apiClient.post(`/community/content/post/${OTHERS_POST}/shares`, { kind: 'quote' }),
    reaches: ['ShareResponse'],
  },
  'the saved tiles': {
    method: 'get',
    operation: '/api/v1/community/bookmarks/collections',
    ask: async () => {
      await apiClient.post('/community/bookmarks/folders', { name: 'To read' });
      return apiClient.get('/community/bookmarks/collections');
    },
    reaches: ['BookmarkCollectionResponse'],
  },
  'a new bookmark': {
    method: 'post',
    operation: '/api/v1/community/bookmarks',
    ask: () => apiClient.post('/community/bookmarks', { contentType: 'post', contentId: OTHERS_POST }),
    reaches: ['Community.BookmarkResponse'],
  },
  'a new bookmark folder': {
    method: 'post',
    operation: '/api/v1/community/bookmarks/folders',
    ask: () => apiClient.post('/community/bookmarks/folders', { name: 'To read' }),
    reaches: ['BookmarkFolderResponse'],
  },
  'hashtag suggestions': {
    method: 'get',
    operation: '/api/v1/community/hashtags/suggest',
    ask: () => apiClient.get('/community/hashtags/suggest', { params: { prefix: 'ho' } }),
    reaches: ['HashtagResponse'],
  },
  'trending hashtags': {
    method: 'get',
    operation: '/api/v1/community/hashtags/trending',
    ask: () => apiClient.get('/community/hashtags/trending'),
    reaches: ['HashtagResponse'],
  },
  'a report': {
    method: 'post',
    operation: '/api/v1/community/reports',
    ask: () =>
      apiClient.post('/community/reports', { contentType: 'post', contentId: OTHERS_POST, reason: 'spam' }),
    reaches: ['Community.ReportResponse'],
  },
  'the report reasons': {
    method: 'get',
    operation: '/api/v1/community/reports/reasons',
    ask: () => apiClient.get('/community/reports/reasons'),
    reaches: ['ReportReasonResponse'],
  },
  'the moderation queue': {
    method: 'get',
    operation: '/api/v1/community/moderation/queue',
    ask: async () => {
      await apiClient.post('/community/reports', { contentType: 'post', contentId: OTHERS_POST, reason: 'spam' });
      return apiClient.get('/community/moderation/queue');
    },
    reaches: ['Community.ModerationQueueItemResponse', 'Community.ReportResponse', 'ContentReviewResponse'],
  },
  "a content's moderation history": {
    method: 'get',
    operation: '/api/v1/community/moderation/history/{contentType}/{contentId}',
    ask: () => apiClient.get(`/community/moderation/history/post/${PINNED_POST}`),
    reaches: ['Community.ModerationDecisionResponse'],
  },
};

describeAgainstContract('the community social mock, against the published contract', () => {
  let mock: MockAdapter;
  const contract = CONTRACT_FILE === null ? null : readPublishedContract(CONTRACT_FILE);

  beforeAll(() => {
    mock = new MockAdapter(apiClient, { delayResponse: 0 });
    setupCommunitySocialMocks(mock);
    mock.onAny().reply(404);
  });

  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    resetCommunitySocialMocks();
  });

  it.each(Object.keys(CASES))('serves %s as the contract describes it', async (label) => {
    const { method, operation, ask, reaches } = CASES[label];
    const success = contract!.operations.get(operationKey(method, operation));
    // The route is published and documents its body; a case that named a
    // route the contract does not have would compare against nothing.
    expect(success?.data).toBeTruthy();

    const response = await ask();
    const walk: Walk = { problems: new Set(), reached: new Set() };
    compare(contract!, success!.data!, response.data.data, '', walk);

    expect([...walk.problems].sort()).toEqual([]);
    expect([...walk.reached].sort()).toEqual(expect.arrayContaining(reaches));
  });

  it('would notice an invented name and a missing one', () => {
    // The comparison itself, against a body built to be wrong both ways.
    const schema: Schema = { $ref: '#/components/schemas/ReactionSummaryResponse' };
    const walk: Walk = { problems: new Set(), reached: new Set() };
    compare(contract!, schema, { totalCount: 1, counts: [], myReactionKey: null }, '', walk);

    expect([...walk.problems]).toEqual(
      expect.arrayContaining([
        'counts: sent, and not in the contract',
        'myReactionKey: sent, and not in the contract',
        'viewerReactions: in the contract, and not sent',
      ])
    );
  });
});
