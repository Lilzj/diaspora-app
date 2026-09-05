// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — GET /community/capabilities, as actually served
//
// **This file is a recording, not a fixture somebody wrote.** It is the `data`
// envelope of a real 200 from a running `Diaspora.Api`, captured by the
// runtime-validation harness on 2026-08-23 against `127.0.0.1:5099`
// (`evidence-corroboration-bridge.json`, `label: capabilities`, `RV-0009`).
//
// ── Why a recording is committed at all ──────────────────────────────────────
//
// The client's `CommunityCapabilitiesResponse` was wrong about five of its seven
// fields for as long as this module has existed, and nothing caught it. The
// reason is structural rather than careless: the module's integration suite runs
// the real client against `mocks/handlers/community-social.ts`, and that mock was
// written from the same belief as the client. A mock and a client that agree with
// each other prove only that they agree. `capabilities.limits` was `undefined` on
// every deployment and threw in `CommentThread` on every guide and every update,
// with 8,000-odd green tests and a clean `tsc`.
//
// So the recording is committed as an independent third party. Two things hold it
// to account, and both are cheap:
//
//   1. It is annotated `CommunityCapabilitiesResponse`. If somebody adds a field
//      the server does not send, or renames one it does, this file stops
//      compiling — because a recording cannot be edited to agree with a type
//      without editing away the evidence.
//
//   2. The mock is asserted equal to it. The mock may not drift from what was
//      observed without a test saying so.
//
// **Re-record it, do not repair it.** If the server legitimately changes, capture
// a new body and replace this wholesale. Hand-editing a field to make a test pass
// is the exact move that produced the bug this file exists to prevent.
//
// The harness that produces these lives outside `src/` and is not committed; see
// `runtime-validation/` in a full checkout.
// ─────────────────────────────────────────────────────────────────────────────

import type { CommunityCapabilitiesResponse } from '@/types/community-social';

export const RECORDED_COMMUNITY_CAPABILITIES: CommunityCapabilitiesResponse = {
  reactions: [
    {
      key: 'like',
      label: 'Like',
      glyph: '👍',
      sentiment: 'positive',
      appliesTo: [],
      position: 0,
    },
    {
      key: 'helpful',
      label: 'Helpful',
      glyph: '👍',
      sentiment: 'positive',
      appliesTo: [],
      position: 1,
    },
    {
      key: 'useful',
      label: 'Useful',
      glyph: '💡',
      sentiment: 'positive',
      appliesTo: [],
      position: 2,
    },
    {
      key: 'confirmed',
      label: 'I can confirm this',
      glyph: '✅',
      sentiment: 'corroborating',
      appliesTo: ['Post', 'Guide'],
      position: 3,
    },
    {
      key: 'disputed',
      label: 'This is not accurate',
      glyph: '⚠',
      sentiment: 'disputing',
      appliesTo: ['Post', 'Guide'],
      position: 4,
    },
  ],
  feeds: [
    {
      key: 'contributor',
      defaultRanking: 'chronological',
      requiresViewer: true,
    },
    {
      key: 'country',
      defaultRanking: 'trust-weighted',
      requiresViewer: true,
    },
    {
      key: 'following',
      defaultRanking: 'chronological',
      requiresViewer: true,
    },
    {
      key: 'hashtag',
      defaultRanking: 'trending',
      requiresViewer: true,
    },
    {
      key: 'home',
      defaultRanking: 'location-weighted',
      requiresViewer: false,
    },
    {
      key: 'nearby',
      defaultRanking: 'location-weighted',
      requiresViewer: true,
    },
    {
      key: 'neighborhood',
      defaultRanking: 'location-weighted',
      requiresViewer: true,
    },
    {
      key: 'organization',
      defaultRanking: 'chronological',
      requiresViewer: true,
    },
    {
      key: 'profile',
      defaultRanking: 'chronological',
      requiresViewer: true,
    },
    {
      key: 'saved',
      defaultRanking: 'chronological',
      requiresViewer: true,
    },
    {
      key: 'trending',
      defaultRanking: 'trending',
      requiresViewer: false,
    },
  ],
  rankings: ['chronological', 'location-weighted', 'trending', 'trust-weighted'],
  reportReasons: [
    {
      code: 'misinformation',
      label: 'Misinformation',
      requiresEvidence: true,
    },
    {
      code: 'spam',
      label: 'Spam',
      requiresEvidence: false,
    },
    {
      code: 'harassment',
      label: 'Harassment',
      requiresEvidence: false,
    },
    {
      code: 'inappropriate',
      label: 'Inappropriate Content',
      requiresEvidence: false,
    },
    {
      code: 'outdated',
      label: 'Outdated Information',
      requiresEvidence: false,
    },
    {
      code: 'copyright',
      label: 'Copyright Violation',
      requiresEvidence: false,
    },
    {
      code: 'personalData',
      label: 'Exposes Personal Data',
      requiresEvidence: false,
    },
    {
      code: 'other',
      label: 'Other',
      requiresEvidence: false,
    },
  ],
  visibilityLevels: [
    'public',
    'members',
    'verifiedMembers',
    'country',
    'neighborhood',
    'followers',
    'custom',
    'private',
  ],
  supportedContentTypes: [
    'post',
    'comment',
    'guide',
    'listing',
    'job',
    'housing',
    'marketplace',
    'event',
    'organization',
    'poll',
    'member',
    'message',
  ],
  maxPostLength: 500,
  maxCommentLength: 2000,
  maxPostAttachments: 4,
  maxPollOptions: 12,
  maxFeedPageSize: 50,
  maxRenderedCommentDepth: 6,
  automatedReviewAvailable: false,
};
