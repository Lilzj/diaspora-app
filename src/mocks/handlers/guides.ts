// ═════════════════════════════════════════════════════════════════════════════
// Diaspora Platform — Guides, development handlers for the REAL contract
// (Remediation Wave D-3)
//
// `Diaspora.Modules.Guides` serves 44 routes under `/api/v1/guides`. This file
// answers them in development, and **every shape here was read from
// `Api/GuideEndpoints.cs`, `Api/GuideDiscoveryEndpoints.cs`,
// `Api/GuideEngagementEndpoints.cs`, `Api/GuideVersionEndpoints.cs`,
// `Contracts/V1/Requests/*` and `Contracts/V1/Responses/*`** — not from what any
// screen or `lib/guides-api.ts` expects.
//
// That distinction is the whole point of the file. The remediation's recurring
// finding, now hit in eight handlers, is:
//
//   > A development handler written from the client's expectations proves the
//   > client is self-consistent. It proves nothing about the platform.
//
// ── The refusals this file ENFORCES rather than describes ───────────────────
//
// Every one is a real refusal on the real server, and every one is otherwise
// invisible until a deployment.
//
//   1. **`POST /guides` does not publish.** It answers a guide whose `status` is
//      `Draft`, `currentVersion` is `0` and `sections` is empty — whatever the
//      caller sent. A create screen that treated the 201 as "published" would be
//      lying, which is precisely what `guide/create.tsx` used to do without even
//      making the call.
//   2. **Publishing an empty guide is 400 `guides.structure.empty`.** So the
//      create wizard's four-call sequence has to run in order; a client that
//      published before saving content gets the server's real refusal here.
//   3. **A stale `baseRevision` is 409 `guides.revision-conflict`.** Not a
//      silent overwrite.
//   4. **A title under three characters is a 400.** `CreateGuideCommandValidator`
//      sets `MinimumLength(GuideLimits.MinTitle)`, which is 3.
//   5. **An unknown `?sort=` is NOT an error.** `GuideWireNames.ParseSort` falls
//      back to `newest`. A client that sent `sort=most_helpful` gets a plausible
//      page in the wrong order and no complaint — which is exactly the kind of
//      wrongness a test has to pin, because nothing else will find it.
//   6. **Attaching the same (mediaId, role) twice is one reference.** The pair is
//      the idempotency key, and the same image may legitimately be both `Hero`
//      and `Gallery`.
//   7. **Voting on your own guide is 403 `guides.vote.self`.**
//   8. **A draft belonging to somebody else is 404, not 403.** Visibility is
//      applied inside the handler, so "not visible to you" and "does not exist"
//      are indistinguishable to a reader — deliberately.
//   9. **An inactive category is still returned to a guide that uses it.**
//      `includeInactive` defaults to false and governs the *catalogue* listing
//      only; it never hides a guide.
//
// ── Enum casing, which is the trap most likely to bite ──────────────────────
//
// **PascalCase for every rendered value, kebab for sort keys.** `Published`,
// `Beginner`, `Hero`, `Helpful` — and `most-helpful`. Both facts come from
// `Application/Services/GuideWireNames.cs`. This module is not Community, which
// is camelCase throughout and is consumed on the same screens.
//
// ── Pagination ──────────────────────────────────────────────────────────────
//
// `CursorPagedResult<T>` — `{ items, nextCursor, hasMore, totalCount }` inside
// `data` — for every paged route, and a bare array inside `data` for
// `/categories`, `/tags`, `/versions` and `/{id}/translations`. Those are the
// only two shapes this module emits, and `readPage` absorbs both.
//
// ── What this file deliberately does NOT do ─────────────────────────────────
//
// **It serves no route the backend does not have.** In particular there is no
// comment route here: a guide's discussion is Community's generic content thread
// and is served by `handlers/community-social.ts`. There is no author-profile
// route either — `GuideCardResponse` carries `authorId` and nothing else.
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';

import type {
  GuideBlockResponse,
  GuideCapabilitiesResponse,
  GuideCardResponse,
  GuideCategoryResponse,
  GuideMediaRole,
  GuideResponse,
  GuideSectionInput,
  GuideSectionResponse,
  GuideSortKey,
  GuideSuggestionResponse,
  GuideTagResponse,
  GuideVersionSummaryResponse,
} from '@/types/guides';

const ROOT = '/guides';

type Reply = [number, unknown];

function ok(data: unknown): Reply {
  return [200, { data, meta: { requestId: 'dev', correlationId: 'dev', timestamp: 'dev' } }];
}

function created(data: unknown): Reply {
  return [201, { data, meta: { requestId: 'dev', correlationId: 'dev', timestamp: 'dev' } }];
}

/** `CursorPagedResult<T>`, inside `data`. `totalCount` is `int?` — null is legitimate. */
function okPage(items: unknown[], nextCursor: string | null, totalCount: number | null): Reply {
  return ok({ items, nextCursor, hasMore: nextCursor !== null, totalCount });
}

/**
 * The platform's problem document.
 *
 * `type` is `https://diaspora.app/errors/{code}` lower-cased and the machine
 * -readable code lives in the `code` **extension** — see
 * `Diaspora.Platform/Http/PlatformProblem.cs`. Clients switch on `code`.
 */
function problem(status: number, code: string, detail: string): Reply {
  return [
    status,
    {
      type: `https://diaspora.app/errors/${code.toLowerCase()}`,
      title:
        status === 400
          ? 'Validation failed'
          : status === 404
            ? 'Not found'
            : status === 409
              ? 'Conflict'
              : status === 403
                ? 'Forbidden'
                : 'Unexpected error',
      status,
      detail,
      code,
      correlationId: 'dev',
      traceId: 'dev',
      timestamp: '2026-08-01T09:00:00.000Z',
    },
  ];
}

function params(config: { params?: Record<string, unknown> }): Record<string, string> {
  const source = config.params ?? {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null) result[key] = String(value);
  }
  return result;
}

function body(config: { data?: unknown }): Record<string, unknown> {
  if (typeof config.data !== 'string') return (config.data as Record<string, unknown>) ?? {};
  try {
    return JSON.parse(config.data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** The path, with the query string removed — `config.url` carries neither in axios. */
function path(config: { url?: string }): string {
  return (config.url ?? '').split('?')[0];
}

// ── The signed-in member ─────────────────────────────────────────────────────
//
// A constant rather than a token read, because these handlers never see one:
// axios-mock-adapter intercepts after the request interceptor has attached the
// bearer, and reading it back would be reading this client's own header. The
// ownership refusals below are expressed against this id.

export const DEV_GUIDE_AUTHOR_ID = '00000000-0000-4000-a000-000000000001';
const OTHER_AUTHOR_ID = '00000000-0000-4000-a000-000000000002';

// ── Seed ─────────────────────────────────────────────────────────────────────

interface GuideRecord extends GuideResponse {
  /** Not on the wire. The store's own flag for the soft delete. */
  isDeleted: boolean;
}

const PUBLISHED_GUIDE_ID = '00000000-0000-4000-b000-000000000001';
const OTHERS_DRAFT_ID = '00000000-0000-4000-b000-000000000002';
const MY_DRAFT_ID = '00000000-0000-4000-b000-000000000003';
const SECOND_PUBLISHED_ID = '00000000-0000-4000-b000-000000000004';

function block(
  id: string,
  kind: GuideBlockResponse['kind'],
  order: number,
  content: string | null,
  mediaId: string | null = null
): GuideBlockResponse {
  return { blockId: id, kind, order, content, mediaId, metadata: null };
}

function section(
  id: string,
  title: string,
  order: number,
  blocks: GuideBlockResponse[]
): GuideSectionResponse {
  return { sectionId: id, title, order, blocks };
}

function baseGuide(overrides: Partial<GuideRecord> & { guideId: string }): GuideRecord {
  return {
    slug: `guide-${overrides.guideId.slice(-4)}`,
    title: 'A guide',
    summary: null,
    excerpt: null,
    categoryKey: 'immigration',
    language: 'en',
    translationGroupId: '00000000-0000-4000-c000-000000000001',
    status: 'Draft',
    visibility: 'Public',
    moderationState: 'Clear',
    isFeatured: false,
    publishedAt: null,
    firstPublishedAt: null,
    scheduledPublishAt: null,
    archivedAt: null,
    createdAt: '2026-07-01T09:00:00.000Z',
    updatedAt: null,
    countryCode: 'GB',
    regionName: null,
    cityName: null,
    areaId: null,
    difficulty: 'Beginner',
    readingTimeMinutes: 1,
    estimatedCompletionMinutes: null,
    wordCount: 0,
    currentVersion: 0,
    revision: 1,
    authorId: DEV_GUIDE_AUTHOR_ID,
    author: null,
    sections: [],
    tags: [],
    mediaReferences: [],
    providers: [],
    trustMark: { state: 'None', badge: null, reason: null, verifiedAt: null },
    engagement: {
      views: 0,
      uniqueViews: 0,
      helpfulCount: 0,
      notHelpfulCount: 0,
      bookmarkCount: 0,
      shareCount: 0,
      commentCount: 0,
    },
    seo: null,
    isDeleted: false,
    ...overrides,
  };
}

let guides: GuideRecord[] = [];
let versions: GuideVersionSummaryResponse[] = [];
let suggestions: GuideSuggestionResponse[] = [];
let bookmarked: Set<string> = new Set();
let votes: Map<string, 'Helpful' | 'NotHelpful'> = new Map();

const CATEGORIES: GuideCategoryResponse[] = [
  {
    categoryId: '00000000-0000-4000-d000-000000000001',
    key: 'immigration',
    name: 'Immigration & Visas',
    description: 'Permits, status and the paperwork behind them.',
    icon: 'document-text-outline',
    order: 1,
    isActive: true,
    parentKey: null,
  },
  {
    categoryId: '00000000-0000-4000-d000-000000000002',
    key: 'housing',
    name: 'Housing',
    description: 'Finding somewhere, and keeping it.',
    icon: 'home-outline',
    order: 2,
    isActive: true,
    parentKey: null,
  },
  {
    categoryId: '00000000-0000-4000-d000-000000000003',
    key: 'banking',
    name: 'Banking & Money',
    description: null,
    icon: 'card-outline',
    order: 3,
    isActive: true,
    parentKey: null,
  },
  {
    // Retired from the picker, and **still the filed category of a published
    // guide**. Property 9: `includeInactive` governs this listing only.
    categoryId: '00000000-0000-4000-d000-000000000004',
    key: 'legacy-transport',
    name: 'Transport (retired)',
    description: 'Kept because guides were filed under it correctly at the time.',
    icon: null,
    order: 9,
    isActive: false,
    parentKey: null,
  },
];

const CAPABILITIES: GuideCapabilitiesResponse = {
  statuses: ['Draft', 'Published', 'Archived'],
  visibilities: ['Public', 'Unlisted', 'Private'],
  blockKinds: [
    'Markdown',
    'RichText',
    'Image',
    'Video',
    'Table',
    'Links',
    'Callout',
    'Warning',
    'Tip',
    'Attachment',
    'CodeSnippet',
  ],
  difficulties: ['Beginner', 'Intermediate', 'Advanced'],
  mediaRoles: ['Hero', 'Cover', 'Gallery', 'Attachment', 'Embedded'],
  sortOrders: ['newest', 'most-helpful', 'recently-updated', 'popular', 'trending'],
  rankingKeys: ['trending'],
  voteKinds: ['Helpful', 'NotHelpful'],
  verificationAvailable: true,
  // Exactly `Domain/Policies/GuideLimits.cs`. The integration test asserts the
  // client's fallback constants equal these.
  maxSections: 100,
  maxBlocksPerSection: 200,
  maxBlockLength: 20_000,
  maxTags: 10,
  maxMediaReferences: 50,
  maxProviderReferences: 20,
  maxSummaryLength: 500,
  maxPageSize: 50,
};

/** Restores the seed. Called by `setupGuideMocks` and by tests between cases. */
export function resetGuideMocks(): void {
  guides = [
    baseGuide({
      guideId: PUBLISHED_GUIDE_ID,
      slug: 'uk-residence-permit',
      title: 'Getting a UK residence permit',
      summary: 'What to bring, what it costs, and how long it actually takes.',
      excerpt: 'What to bring, what it costs, and how long it actually takes.',
      categoryKey: 'immigration',
      status: 'Published',
      publishedAt: '2026-07-10T09:00:00.000Z',
      firstPublishedAt: '2026-07-10T09:00:00.000Z',
      updatedAt: '2026-07-20T09:00:00.000Z',
      countryCode: 'GB',
      cityName: 'London',
      difficulty: 'Intermediate',
      readingTimeMinutes: 6,
      wordCount: 1180,
      currentVersion: 2,
      revision: 5,
      authorId: DEV_GUIDE_AUTHOR_ID,
      author: {
        userId: DEV_GUIDE_AUTHOR_ID,
        isApprovedContributor: true,
        isCommunityGuide: false,
        trustLevel: 'Established',
        badges: [{ badge: 'CountryVerified', countryCode: 'GB', awardedAt: '2026-05-01T09:00:00.000Z' }],
      },
      sections: [
        section('00000000-0000-4000-e000-000000000001', 'Before you start', 1, [
          block(
            '00000000-0000-4000-f000-000000000001',
            'Markdown',
            1,
            'Book the biometric appointment before you pay the fee — the slots go first.'
          ),
          block(
            '00000000-0000-4000-f000-000000000002',
            'Warning',
            2,
            'The fee is non-refundable once the application is submitted.'
          ),
        ]),
        section('00000000-0000-4000-e000-000000000002', 'The appointment', 2, [
          block('00000000-0000-4000-f000-000000000003', 'Markdown', 1, 'Bring the original documents, not copies.'),
          block(
            '00000000-0000-4000-f000-000000000004',
            'Image',
            2,
            'The document checklist, as issued',
            '00000000-0000-4000-9000-000000000001'
          ),
        ]),
      ],
      tags: ['visa', 'brp', 'london'],
      mediaReferences: [
        {
          mediaId: '00000000-0000-4000-9000-000000000001',
          role: 'Hero',
          order: 0,
          caption: null,
        },
      ],
      trustMark: {
        state: 'Verified',
        badge: 'CommunityVerified',
        reason: null,
        verifiedAt: '2026-07-15T09:00:00.000Z',
      },
      engagement: {
        views: 4820,
        uniqueViews: 3910,
        helpfulCount: 214,
        notHelpfulCount: 6,
        bookmarkCount: 88,
        shareCount: 31,
        commentCount: 12,
      },
    }),
    baseGuide({
      guideId: SECOND_PUBLISHED_ID,
      slug: 'opening-a-bank-account',
      title: 'Opening a bank account without a UK address',
      summary: 'The three banks that will, and what they ask for instead.',
      excerpt: 'The three banks that will, and what they ask for instead.',
      // Filed under a category that has since been retired. Property 9.
      categoryKey: 'legacy-transport',
      status: 'Published',
      publishedAt: '2026-06-02T09:00:00.000Z',
      firstPublishedAt: '2026-06-02T09:00:00.000Z',
      updatedAt: '2026-06-02T09:00:00.000Z',
      countryCode: 'GB',
      difficulty: 'Beginner',
      readingTimeMinutes: 3,
      wordCount: 520,
      currentVersion: 1,
      revision: 2,
      authorId: OTHER_AUTHOR_ID,
      sections: [
        section('00000000-0000-4000-e000-000000000003', 'What they ask for', 1, [
          block('00000000-0000-4000-f000-000000000005', 'Markdown', 1, 'A letter from your employer is usually enough.'),
        ]),
      ],
      tags: ['banking'],
      engagement: {
        views: 990,
        uniqueViews: 840,
        helpfulCount: 41,
        notHelpfulCount: 2,
        bookmarkCount: 12,
        shareCount: 4,
        commentCount: 3,
      },
    }),
    baseGuide({
      // Somebody else's draft. **404 to this member**, not 403.
      guideId: OTHERS_DRAFT_ID,
      slug: 'someone-elses-draft',
      title: 'A draft nobody else can see',
      status: 'Draft',
      authorId: OTHER_AUTHOR_ID,
    }),
    baseGuide({
      guideId: MY_DRAFT_ID,
      slug: 'my-unfinished-guide',
      title: 'My unfinished guide',
      status: 'Draft',
      authorId: DEV_GUIDE_AUTHOR_ID,
      revision: 3,
    }),
  ];

  versions = [
    {
      versionId: '00000000-0000-4000-8000-000000000002',
      guideId: PUBLISHED_GUIDE_ID,
      versionNumber: 2,
      title: 'Getting a UK residence permit',
      revisionNotes: 'Updated the fee and the processing time.',
      editorId: DEV_GUIDE_AUTHOR_ID,
      publishedAt: '2026-07-20T09:00:00.000Z',
      wordCount: 1180,
      readingTimeMinutes: 6,
    },
    {
      versionId: '00000000-0000-4000-8000-000000000001',
      guideId: PUBLISHED_GUIDE_ID,
      versionNumber: 1,
      revisionNotes: null,
      title: 'Getting a UK residence permit',
      editorId: DEV_GUIDE_AUTHOR_ID,
      publishedAt: '2026-07-10T09:00:00.000Z',
      wordCount: 940,
      readingTimeMinutes: 5,
    },
  ];

  suggestions = [
    {
      suggestionId: '00000000-0000-4000-7000-000000000001',
      guideId: PUBLISHED_GUIDE_ID,
      authorId: OTHER_AUTHOR_ID,
      targetSectionId: '00000000-0000-4000-e000-000000000001',
      proposedContent: 'The fee went up to £1,048 in April.',
      rationale: 'I paid it last week.',
      status: 'Open',
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      createdAt: '2026-07-25T09:00:00.000Z',
    },
  ];

  bookmarked = new Set();
  votes = new Map();
}

resetGuideMocks();

// ── Store helpers ────────────────────────────────────────────────────────────

function find(guideId: string): GuideRecord | undefined {
  return guides.find((guide) => guide.guideId === guideId);
}

/**
 * The visibility rule, applied where the server applies it — inside the read.
 *
 * A draft, a hidden guide and a deleted one resolve as **not found** to
 * everybody but their author and staff. That is why the reads carry no
 * authorisation attribute and still cannot leak a draft.
 */
function visibleToMember(guide: GuideRecord): boolean {
  if (guide.authorId === DEV_GUIDE_AUTHOR_ID) return !guide.isDeleted;
  if (guide.isDeleted) return false;
  if (guide.status === 'Draft') return false;
  if (guide.moderationState === 'Hidden') return false;
  return true;
}

function toCard(guide: GuideRecord): GuideCardResponse {
  return {
    guideId: guide.guideId,
    slug: guide.slug,
    title: guide.title,
    excerpt: guide.excerpt,
    categoryKey: guide.categoryKey,
    countryCode: guide.countryCode,
    cityName: guide.cityName,
    language: guide.language,
    status: guide.status,
    difficulty: guide.difficulty,
    readingTimeMinutes: guide.readingTimeMinutes,
    isVerified: guide.trustMark.state === 'Verified',
    isFeatured: guide.isFeatured,
    authorId: guide.authorId,
    publishedAt: guide.publishedAt,
    updatedAt: guide.updatedAt,
    heroMediaId: guide.mediaReferences.find((media) => media.role === 'Hero')?.mediaId ?? null,
    tags: guide.tags,
    views: guide.engagement.views,
    helpfulCount: guide.engagement.helpfulCount,
    commentCount: guide.engagement.commentCount,
    bookmarkCount: guide.engagement.bookmarkCount,
  };
}

/**
 * Property 5. `GuideWireNames.ParseSort` never errors.
 *
 * `most-helpful`, `mosthelpful` and `helpful` all mean the same thing; anything
 * else — including a typo, and including a key a later deployment removed —
 * falls back to `newest`. A browse must not fail over a sort key.
 */
function parseSort(value: string | undefined): GuideSortKey {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'most-helpful':
    case 'mosthelpful':
    case 'helpful':
      return 'most-helpful';
    case 'recently-updated':
    case 'recentlyupdated':
    case 'updated':
      return 'recently-updated';
    case 'popular':
      return 'popular';
    case 'trending':
      return 'trending';
    default:
      return 'newest';
  }
}

function sortCards(cards: GuideCardResponse[], sort: GuideSortKey): GuideCardResponse[] {
  const time = (value: string | null) => (value ? Date.parse(value) : 0);
  const copy = [...cards];
  switch (sort) {
    case 'most-helpful':
      return copy.sort((a, b) => b.helpfulCount - a.helpfulCount);
    case 'recently-updated':
      return copy.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
    case 'popular':
      return copy.sort((a, b) => b.views - a.views);
    case 'trending':
      return copy.sort((a, b) => b.views + b.helpfulCount * 10 - (a.views + a.helpfulCount * 10));
    default:
      return copy.sort((a, b) => time(b.publishedAt) - time(a.publishedAt));
  }
}

/**
 * The server's clamp, and an offset cursor.
 *
 * The real cursor is an opaque encoded token; an offset is the smallest thing
 * that behaves the same way at the boundary this file is testing — `nextCursor`
 * present exactly when there is another page, absent when there is not.
 */
function page<T>(rows: T[], query: Record<string, string>): Reply {
  const limit = Math.min(50, Math.max(1, Number(query.limit ?? 20) || 20));
  const offset = query.cursor ? Number(query.cursor) || 0 : 0;
  const slice = rows.slice(offset, offset + limit);
  const nextCursor = offset + limit < rows.length ? String(offset + limit) : null;
  return okPage(slice, nextCursor, rows.length);
}

function nowIso(): string {
  return '2026-08-01T09:00:00.000Z';
}

function wordsIn(sections: GuideSectionInput[]): number {
  return sections.reduce(
    (total, current) =>
      total +
      current.blocks.reduce(
        (blockTotal, currentBlock) =>
          blockTotal + (currentBlock.content ?? '').trim().split(/\s+/).filter(Boolean).length,
        0
      ),
    0
  );
}

function toSectionResponses(sections: GuideSectionInput[]): GuideSectionResponse[] {
  return sections.map((source) => ({
    sectionId: source.sectionId,
    title: source.title,
    order: source.order,
    blocks: (source.blocks ?? []).map((sourceBlock) => ({
      blockId: sourceBlock.blockId,
      kind: sourceBlock.kind,
      order: sourceBlock.order,
      content: sourceBlock.content ?? null,
      mediaId: sourceBlock.mediaId ?? null,
      metadata: sourceBlock.metadata ?? null,
    })),
  }));
}

/** Property 3. A supplied `baseRevision` that is not the current one is a 409. */
function revisionConflict(guide: GuideRecord, payload: Record<string, unknown>): Reply | null {
  const baseRevision = payload.baseRevision;
  if (typeof baseRevision !== 'number') return null;
  if (baseRevision === guide.revision) return null;
  return problem(
    409,
    'guides.revision-conflict',
    'The guide changed since you loaded it. Reload before saving again.'
  );
}

/** The one ownership check the editorial writes share. `guides.not-author` is a 403. */
function notAuthor(guide: GuideRecord): Reply | null {
  if (guide.authorId === DEV_GUIDE_AUTHOR_ID) return null;
  return problem(403, 'guides.not-author', 'Only the author can edit this guide.');
}

const NOT_FOUND = () =>
  problem(404, 'guides.not-found', 'That guide could not be found.');

// ═════════════════════════════════════════════════════════════════════════════

export function setupGuideMocks(mock: MockAdapter): void {
  // ── Fixed paths first ─────────────────────────────────────────────────────
  //
  // axios-mock-adapter is first-match-wins and `/{guideId}` matches everything.
  // `/capabilities`, `/categories`, `/tags`, `/featured`, `/latest`, `/trending`,
  // `/nearby`, `/mine`, `/bookmarked`, `/slug/…`, `/countries/…`, `/authors/…`
  // and `/moderation/queue` are all registered ahead of it.

  mock.onGet(new RegExp(`${ROOT}/capabilities$`)).reply(() => ok(CAPABILITIES));

  mock.onGet(new RegExp(`${ROOT}/categories$`)).reply((config) => {
    const query = params(config);
    const includeInactive = query.includeInactive === 'true';
    const parentKey = query.parentKey ?? null;

    const rows = CATEGORIES.filter(
      (category) =>
        (includeInactive || category.isActive) &&
        (parentKey === null || category.parentKey === parentKey)
    ).sort((a, b) => a.order - b.order);

    // A bare `IReadOnlyList<GuideCategoryResponse>`, not a page.
    return ok(rows);
  });

  mock.onGet(new RegExp(`${ROOT}/tags$`)).reply((config) => {
    const query = params(config);
    const counts = new Map<string, number>();

    for (const guide of guides) {
      if (!visibleToMember(guide) || guide.status !== 'Published') continue;
      if (query.countryCode && guide.countryCode !== query.countryCode) continue;
      if (query.categoryKey && guide.categoryKey !== query.categoryKey) continue;
      for (const tag of guide.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }

    const rows: GuideTagResponse[] = [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    // A bare array.
    return ok(query.limit ? rows.slice(0, Number(query.limit)) : rows);
  });

  // ── Shelves ───────────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/featured$`)).reply((config) => {
    const query = params(config);
    const rows = guides
      .filter((guide) => visibleToMember(guide) && guide.status === 'Published' && guide.isFeatured)
      .filter((guide) => !query.countryCode || guide.countryCode === query.countryCode)
      .map(toCard);
    return page(rows, query);
  });

  mock.onGet(new RegExp(`${ROOT}/latest$`)).reply((config) => {
    const query = params(config);
    const rows = sortCards(
      guides
        .filter((guide) => visibleToMember(guide) && guide.status === 'Published')
        .filter((guide) => !query.countryCode || guide.countryCode === query.countryCode)
        .filter((guide) => !query.language || guide.language === query.language)
        .map(toCard),
      'newest'
    );
    return page(rows, query);
  });

  mock.onGet(new RegExp(`${ROOT}/trending$`)).reply((config) => {
    const query = params(config);
    const rows = sortCards(
      guides
        .filter((guide) => visibleToMember(guide) && guide.status === 'Published')
        .filter((guide) => !query.countryCode || guide.countryCode === query.countryCode)
        .filter((guide) => !query.categoryKey || guide.categoryKey === query.categoryKey)
        .map(toCard),
      'trending'
    );
    return page(rows, query);
  });

  mock.onGet(new RegExp(`${ROOT}/nearby$`)).reply((config) => {
    const query = params(config);
    // Location resolves the scope on the real server; the only thing this
    // reproduces is that every geographic field is optional and none is refused.
    const rows = guides
      .filter((guide) => visibleToMember(guide) && guide.status === 'Published')
      .filter((guide) => !query.countryCode || guide.countryCode === query.countryCode)
      .filter((guide) => !query.cityName || guide.cityName === query.cityName)
      .filter((guide) => !query.category || guide.categoryKey === query.category)
      .map(toCard);
    return page(rows, query);
  });

  // ── The author's workspace ────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/mine/drafts$`)).reply((config) => {
    const query = params(config);
    const rows = guides
      .filter((guide) => guide.authorId === DEV_GUIDE_AUTHOR_ID && !guide.isDeleted)
      .filter((guide) => guide.status === 'Draft')
      .map(toCard);
    return page(rows, query);
  });

  mock.onGet(new RegExp(`${ROOT}/mine$`)).reply((config) => {
    const query = params(config);
    const rows = sortCards(
      guides
        .filter((guide) => guide.authorId === DEV_GUIDE_AUTHOR_ID && !guide.isDeleted)
        .filter((guide) => !query.status || guide.status === query.status)
        .map(toCard),
      parseSort(query.sort)
    );
    return page(rows, query);
  });

  mock.onGet(new RegExp(`${ROOT}/bookmarked$`)).reply((config) => {
    const query = params(config);
    const rows = guides
      .filter((guide) => bookmarked.has(guide.guideId) && visibleToMember(guide))
      .map(toCard);
    return page(rows, query);
  });

  // ── Browse ────────────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/slug/[^/?]+$`)).reply((config) => {
    const slug = decodeURIComponent(path(config).split('/slug/')[1] ?? '');
    const guide = guides.find((candidate) => candidate.slug === slug);
    if (!guide || !visibleToMember(guide)) return NOT_FOUND();
    return ok(strip(guide));
  });

  mock.onGet(new RegExp(`${ROOT}/countries/[^/?]+$`)).reply((config) => {
    const query = params(config);
    const countryCode = decodeURIComponent(path(config).split('/countries/')[1] ?? '');
    const rows = sortCards(
      guides
        .filter((guide) => visibleToMember(guide) && guide.status === 'Published')
        .filter((guide) => guide.countryCode === countryCode)
        .filter((guide) => !query.categoryKey || guide.categoryKey === query.categoryKey)
        .filter((guide) => !query.language || guide.language === query.language)
        .map(toCard),
      parseSort(query.sort)
    );
    return page(rows, query);
  });

  mock.onGet(new RegExp(`${ROOT}/categories/[^/?]+/guides$`)).reply((config) => {
    const query = params(config);
    const categoryKey = decodeURIComponent(
      path(config).split('/categories/')[1]?.split('/guides')[0] ?? ''
    );
    const rows = sortCards(
      guides
        .filter((guide) => visibleToMember(guide) && guide.status === 'Published')
        .filter((guide) => guide.categoryKey === categoryKey)
        .filter((guide) => !query.countryCode || guide.countryCode === query.countryCode)
        .map(toCard),
      parseSort(query.sort)
    );
    return page(rows, query);
  });

  mock.onGet(new RegExp(`${ROOT}/authors/[^/?]+$`)).reply((config) => {
    const query = params(config);
    const authorId = decodeURIComponent(path(config).split('/authors/')[1] ?? '');
    const rows = sortCards(
      guides
        .filter((guide) => visibleToMember(guide) && guide.status === 'Published')
        .filter((guide) => guide.authorId === authorId)
        .map(toCard),
      parseSort(query.sort)
    );
    return page(rows, query);
  });

  mock.onGet(new RegExp(`${ROOT}/moderation/queue$`)).reply((config) => {
    const query = params(config);
    const rows = guides
      .filter((guide) => guide.moderationState !== 'Clear')
      .filter((guide) => !query.moderationState || guide.moderationState === query.moderationState)
      .map((guide) => ({
        guideId: guide.guideId,
        slug: guide.slug,
        title: guide.title,
        authorId: guide.authorId,
        status: guide.status,
        moderationState: guide.moderationState,
        countryCode: guide.countryCode,
        categoryKey: guide.categoryKey,
        openSuggestions: suggestions.filter(
          (item) => item.guideId === guide.guideId && item.status === 'Open'
        ).length,
        updatedAt: guide.updatedAt,
      }));
    return page(rows, query);
  });

  // ── Per-guide sub-resources, before the bare `/{guideId}` ─────────────────

  mock.onGet(new RegExp(`${ROOT}/[^/?]+/preview$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();
    // `guides.drafts.view` scopes this to the author's own drafts on the server.
    if (guide.authorId !== DEV_GUIDE_AUTHOR_ID) return NOT_FOUND();
    return ok(strip(guide));
  });

  mock.onGet(new RegExp(`${ROOT}/[^/?]+/translations$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide || !visibleToMember(guide)) return NOT_FOUND();

    const rows = guides
      .filter(
        (candidate) =>
          candidate.translationGroupId === guide.translationGroupId &&
          candidate.guideId !== guide.guideId &&
          visibleToMember(candidate)
      )
      .map(toCard);

    // A bare array. The language switcher is short by construction.
    return ok(rows);
  });

  mock.onGet(new RegExp(`${ROOT}/[^/?]+/versions/compare$`)).reply((config) => {
    const query = params(config);
    const guideId = path(config).split('/').slice(-3)[0];
    const guide = find(guideId);
    if (!guide || !visibleToMember(guide)) return NOT_FOUND();

    return ok({
      guideId,
      fromVersion: Number(query.fromVersion ?? 1),
      toVersion: Number(query.toVersion ?? 2),
      // Unchanged sections are **omitted**, not reported as unchanged.
      sections: [
        {
          sectionId: '00000000-0000-4000-e000-000000000001',
          change: 'content-changed',
          fromTitle: 'Before you start',
          toTitle: 'Before you start',
          contentChanged: true,
        },
        {
          sectionId: '00000000-0000-4000-e000-000000000002',
          change: 'added',
          fromTitle: null,
          toTitle: 'The appointment',
          contentChanged: true,
        },
      ],
    });
  });

  mock.onGet(new RegExp(`${ROOT}/[^/?]+/versions/\\d+$`)).reply((config) => {
    const segments = path(config).split('/');
    const versionNumber = Number(segments[segments.length - 1]);
    const guideId = segments[segments.length - 3];
    const guide = find(guideId);
    if (!guide || !visibleToMember(guide)) return NOT_FOUND();

    const summary = versions.find(
      (version) => version.guideId === guideId && version.versionNumber === versionNumber
    );
    if (!summary) {
      return problem(404, 'guides.version.not-found', 'That version could not be found.');
    }

    return ok({
      ...summary,
      summary: guide.summary,
      language: guide.language,
      categoryKey: guide.categoryKey,
      sections: guide.sections,
    });
  });

  mock.onGet(new RegExp(`${ROOT}/[^/?]+/versions$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide || !visibleToMember(guide)) return NOT_FOUND();

    // A bare array, newest first, capped at fifty by the server.
    const rows = versions
      .filter((version) => version.guideId === guideId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
    return ok(rows.slice(0, 50));
  });

  mock.onGet(new RegExp(`${ROOT}/[^/?]+/suggestions$`)).reply((config) => {
    const query = params(config);
    const guideId = path(config).split('/').slice(-2)[0];
    const rows = suggestions
      .filter((item) => item.guideId === guideId)
      .filter((item) => !query.status || item.status === query.status);
    return page(rows, query);
  });

  mock.onGet(new RegExp(`${ROOT}/[^/?]+/analytics$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();
    if (guide.authorId !== DEV_GUIDE_AUTHOR_ID) {
      return problem(403, 'guides.not-author', 'Only the author can read these figures.');
    }

    return ok({
      guideId,
      views: guide.engagement.views,
      uniqueViews: guide.engagement.uniqueViews,
      completions: Math.round(guide.engagement.uniqueViews * 0.4),
      totalReadSeconds: guide.engagement.views * 90,
      bookmarks: guide.engagement.bookmarkCount,
      shares: guide.engagement.shareCount,
      helpfulVotes: guide.engagement.helpfulCount,
      notHelpfulVotes: guide.engagement.notHelpfulCount,
      searchImpressions: guide.engagement.views * 3,
      searchClicks: guide.engagement.views,
      versionAdoptions: 0,
      lastViewedAt: nowIso(),
    });
  });

  mock.onGet(new RegExp(`${ROOT}/[^/?]+/verification$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    return ok({
      guideId,
      state: guide.trustMark.state,
      verificationId: guide.trustMark.state === 'None' ? null : '00000000-0000-4000-6000-000000000001',
      badge: guide.trustMark.badge,
      // Populated for the author, and never for readers.
      reason: guide.authorId === DEV_GUIDE_AUTHOR_ID ? guide.trustMark.reason : null,
      verifiedAt: guide.trustMark.verifiedAt,
      changedAt: guide.trustMark.verifiedAt,
    });
  });

  // ── Search, and then the bare detail read ─────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/?$`)).reply((config) => {
    const query = params(config);
    const text = (query.q ?? query.query ?? '').toLowerCase();

    const rows = sortCards(
      guides
        .filter((guide) => visibleToMember(guide) && guide.status === 'Published')
        .filter((guide) =>
          text
            ? guide.title.toLowerCase().includes(text) ||
              (guide.summary ?? '').toLowerCase().includes(text) ||
              guide.tags.some((tag) => tag.includes(text))
            : true
        )
        .filter((guide) => !query.country || guide.countryCode === query.country)
        .filter((guide) => !query.city || guide.cityName === query.city)
        .filter((guide) => !query.category || guide.categoryKey === query.category)
        .filter((guide) => !query.tag || guide.tags.includes(query.tag))
        .filter((guide) => !query.language || guide.language === query.language)
        .filter((guide) => !query.authorId || guide.authorId === query.authorId)
        .filter((guide) => !query.difficulty || guide.difficulty === query.difficulty)
        .filter((guide) => query.verified !== 'true' || guide.trustMark.state === 'Verified')
        .filter((guide) => query.featured !== 'true' || guide.isFeatured)
        .map(toCard),
      // Property 5: an unrecognised sort key silently becomes `newest`.
      parseSort(query.sort)
    );

    return page(rows, query);
  });

  mock.onGet(new RegExp(`${ROOT}/[^/?]+$`)).reply((config) => {
    const guideId = path(config).split('/').pop() ?? '';
    const guide = find(guideId);
    // Property 8. Somebody else's draft is **404**, not 403.
    if (!guide || !visibleToMember(guide)) return NOT_FOUND();
    return ok(strip(guide));
  });

  // ── Authoring ─────────────────────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/?$`)).reply((config) => {
    const payload = body(config);

    const title = typeof payload.title === 'string' ? payload.title : '';
    // Property 4. `CreateGuideCommandValidator`: `MinimumLength(3)`.
    if (title.trim().length < 3) {
      return problem(400, 'guides.title.invalid', 'A guide title needs at least three characters.');
    }
    if (title.length > 200) {
      return problem(400, 'guides.title.invalid', 'A guide title may be at most 200 characters.');
    }

    const categoryKey = typeof payload.categoryKey === 'string' ? payload.categoryKey : '';
    if (!CATEGORIES.some((category) => category.key === categoryKey)) {
      return problem(404, 'guides.category.not-found', 'That category does not exist.');
    }
    if (!CATEGORIES.some((category) => category.key === categoryKey && category.isActive)) {
      return problem(400, 'guides.category.inactive', 'That category is no longer accepting guides.');
    }

    const language = typeof payload.language === 'string' ? payload.language : '';
    if (language.length !== 2) {
      return problem(400, 'guides.language.invalid', 'Language must be a two-letter ISO 639-1 code.');
    }

    const countryCode = typeof payload.countryCode === 'string' ? payload.countryCode : '';
    if (countryCode.length !== 2) {
      return problem(400, 'guides.country.invalid', 'Country must be a two-letter ISO 3166-1 code.');
    }

    const requestedSlug = typeof payload.slug === 'string' ? payload.slug : null;
    if (requestedSlug && guides.some((guide) => guide.slug === requestedSlug)) {
      return problem(409, 'guides.slug.taken', 'That web address is already in use.');
    }

    const summary = typeof payload.summary === 'string' ? payload.summary : null;
    if (summary && summary.length > 500) {
      return problem(400, 'guides.summary.too-long', 'A summary may be at most 500 characters.');
    }

    const guideId = `00000000-0000-4000-b000-${String(guides.length + 100).padStart(12, '0')}`;

    // Property 1. **A draft.** No sections, version zero — whatever was sent.
    const record = baseGuide({
      guideId,
      slug: requestedSlug ?? slugify(title),
      title,
      summary,
      excerpt: summary,
      categoryKey,
      language,
      countryCode,
      regionName: typeof payload.regionName === 'string' ? payload.regionName : null,
      cityName: typeof payload.cityName === 'string' ? payload.cityName : null,
      areaId: typeof payload.areaId === 'string' ? payload.areaId : null,
      status: 'Draft',
      currentVersion: 0,
      revision: 1,
      createdAt: nowIso(),
      authorId: DEV_GUIDE_AUTHOR_ID,
      translationGroupId: guideId,
    });

    guides = [...guides, record];
    return created(strip(record));
  });

  mock.onPut(new RegExp(`${ROOT}/[^/?]+/draft$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const refusal = notAuthor(guide);
    if (refusal) return refusal;

    // **The auto-save never touches the guide.** The snapshot is kept aside, so
    // the response is the guide exactly as it was.
    return ok(strip(guide));
  });

  mock.onPut(new RegExp(`${ROOT}/[^/?]+/tags$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const refusal = notAuthor(guide) ?? revisionConflict(guide, body(config));
    if (refusal) return refusal;

    const requested = (body(config).tags as unknown[] | undefined) ?? [];
    if (requested.length > 10) {
      return problem(400, 'guides.tags.limit', 'A guide may carry at most ten tags.');
    }

    // Free text in; the aggregate normalises each entry to a slug and dedupes.
    const normalised = [
      ...new Set(
        requested
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => slugify(tag))
          .filter(Boolean)
      ),
    ];

    guide.tags = normalised;
    guide.revision += 1;
    return ok(strip(guide));
  });

  mock.onPut(new RegExp(`${ROOT}/[^/?]+/category$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const refusal = notAuthor(guide) ?? revisionConflict(guide, body(config));
    if (refusal) return refusal;

    const categoryKey = body(config).categoryKey;
    if (typeof categoryKey !== 'string' || !CATEGORIES.some((item) => item.key === categoryKey)) {
      return problem(404, 'guides.category.not-found', 'That category does not exist.');
    }

    guide.categoryKey = categoryKey;
    guide.revision += 1;
    return ok(strip(guide));
  });

  mock.onPut(new RegExp(`${ROOT}/[^/?]+/language$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const refusal = notAuthor(guide) ?? revisionConflict(guide, body(config));
    if (refusal) return refusal;

    const language = body(config).language;
    if (typeof language !== 'string' || language.length !== 2) {
      return problem(400, 'guides.language.invalid', 'Language must be a two-letter code.');
    }

    guide.language = language;
    guide.revision += 1;
    return ok(strip(guide));
  });

  mock.onPut(new RegExp(`${ROOT}/[^/?]+/providers$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const refusal = notAuthor(guide);
    if (refusal) return refusal;

    const references = (body(config).references as Record<string, unknown>[] | undefined) ?? [];
    if (references.length > 20) {
      return problem(400, 'guides.provider-references.limit', 'At most twenty providers.');
    }

    guide.providers = references.map((reference, index) => ({
      providerId: String(reference.providerId ?? ''),
      role: typeof reference.role === 'string' ? reference.role : null,
      note: typeof reference.note === 'string' ? reference.note : null,
      order: index,
      // Hydrated from the Providers directory at read time. **Null when it could
      // not be resolved**, which is not the same as having no name.
      name: null,
      slug: null,
      isVerified: null,
      logoMediaId: null,
    }));
    guide.revision += 1;
    return ok(strip(guide));
  });

  mock.onPut(new RegExp(`${ROOT}/[^/?]+/bookmark$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide || !visibleToMember(guide)) return NOT_FOUND();

    // Idempotent: saving twice is one bookmark and one increment.
    if (!bookmarked.has(guideId)) {
      bookmarked.add(guideId);
      guide.engagement = {
        ...guide.engagement,
        bookmarkCount: guide.engagement.bookmarkCount + 1,
      };
    }
    return ok(strip(guide));
  });

  mock.onPut(new RegExp(`${ROOT}/[^/?]+/featured$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();
    guide.isFeatured = true;
    return ok(strip(guide));
  });

  // Registered after every `/{id}/…` PUT above, because it would shadow them.
  mock.onPut(new RegExp(`${ROOT}/[^/?]+$`)).reply((config) => {
    const guideId = path(config).split('/').pop() ?? '';
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const payload = body(config);
    const refusal = notAuthor(guide) ?? revisionConflict(guide, payload);
    if (refusal) return refusal;

    const title = typeof payload.title === 'string' ? payload.title : guide.title;
    if (title.trim().length < 3) {
      return problem(400, 'guides.title.invalid', 'A guide title needs at least three characters.');
    }

    guide.title = title;
    guide.summary = typeof payload.summary === 'string' ? payload.summary : null;
    guide.excerpt = guide.summary;
    if (typeof payload.difficulty === 'string') {
      guide.difficulty = payload.difficulty as GuideResponse['difficulty'];
    }
    if (typeof payload.visibility === 'string') {
      guide.visibility = payload.visibility as GuideResponse['visibility'];
    }
    guide.estimatedCompletionMinutes =
      typeof payload.estimatedCompletionMinutes === 'number'
        ? payload.estimatedCompletionMinutes
        : null;
    if (typeof payload.countryCode === 'string') guide.countryCode = payload.countryCode;
    guide.regionName = typeof payload.regionName === 'string' ? payload.regionName : null;
    guide.cityName = typeof payload.cityName === 'string' ? payload.cityName : null;

    // `sections: null` edits metadata only. An explicit array replaces the whole
    // structure — wholesale, because that is how the editor saves.
    if (Array.isArray(payload.sections)) {
      const sections = payload.sections as GuideSectionInput[];
      if (sections.length > 100) {
        return problem(400, 'guides.sections.limit', 'At most one hundred sections.');
      }
      for (const item of sections) {
        if ((item.blocks ?? []).length > 200) {
          return problem(400, 'guides.blocks.limit', 'At most two hundred blocks in a section.');
        }
        for (const itemBlock of item.blocks ?? []) {
          if ((itemBlock.content ?? '').length > 20_000) {
            return problem(400, 'guides.block.invalid', 'A block may be at most 20,000 characters.');
          }
        }
      }

      guide.sections = toSectionResponses(sections);
      guide.wordCount = wordsIn(sections);
      // The server's own reading-time calculation, at `GuideLimits.WordsPerMinute`.
      guide.readingTimeMinutes = Math.max(1, Math.ceil(guide.wordCount / 200));
    }

    guide.revision += 1;
    guide.updatedAt = nowIso();
    return ok(strip(guide));
  });

  // ── Media ─────────────────────────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/media$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const refusal = notAuthor(guide);
    if (refusal) return refusal;

    const payload = body(config);
    const mediaId = typeof payload.mediaId === 'string' ? payload.mediaId : '';
    const role = typeof payload.role === 'string' ? (payload.role as GuideMediaRole) : 'Gallery';

    if (!mediaId) {
      return problem(400, 'guides.media.invalid', 'A media reference is required.');
    }
    if (!CAPABILITIES.mediaRoles.includes(role)) {
      return problem(400, 'guides.media.invalid', `'${role}' is not a media role.`);
    }
    if (guide.mediaReferences.length >= 50) {
      return problem(400, 'guides.media.limit', 'At most fifty media references.');
    }

    // Property 6. Idempotent on **(mediaId, role)** — the same asset may be both
    // the hero and a gallery item, so the pair is the key rather than the id.
    const existing = guide.mediaReferences.find(
      (reference) => reference.mediaId === mediaId && reference.role === role
    );
    if (!existing) {
      guide.mediaReferences = [
        ...guide.mediaReferences,
        {
          mediaId,
          role,
          order: guide.mediaReferences.length,
          caption: typeof payload.caption === 'string' ? payload.caption : null,
        },
      ];
    }

    return ok(strip(guide));
  });

  mock.onDelete(new RegExp(`${ROOT}/[^/?]+/media/[^/?]+/[^/?]+$`)).reply((config) => {
    const segments = path(config).split('/');
    const role = segments[segments.length - 1];
    const mediaId = segments[segments.length - 2];
    const guideId = segments[segments.length - 4];

    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const refusal = notAuthor(guide);
    if (refusal) return refusal;

    // Idempotent: detaching what is not there succeeds.
    guide.mediaReferences = guide.mediaReferences.filter(
      (reference) => !(reference.mediaId === mediaId && reference.role === role)
    );
    return ok(strip(guide));
  });

  // ── Publishing and lifecycle ──────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/publish$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const payload = body(config);
    const refusal = notAuthor(guide) ?? revisionConflict(guide, payload);
    if (refusal) return refusal;

    // Property 2. **The refusal that makes the create wizard's ordering matter.**
    const hasContent = guide.sections.some((item) =>
      item.blocks.some((itemBlock) => (itemBlock.content ?? '').trim().length > 0 || itemBlock.mediaId)
    );
    if (!hasContent) {
      return problem(400, 'guides.structure.empty', 'A guide needs content before it can be published.');
    }

    const revisionNotes =
      typeof payload.revisionNotes === 'string' ? payload.revisionNotes : null;
    if (revisionNotes && revisionNotes.length > 1000) {
      return problem(400, 'guides.revision-notes.invalid', 'Revision notes are too long.');
    }

    guide.status = 'Published';
    guide.currentVersion += 1;
    guide.revision += 1;
    guide.publishedAt = nowIso();
    guide.firstPublishedAt = guide.firstPublishedAt ?? guide.publishedAt;
    guide.updatedAt = guide.publishedAt;

    versions = [
      {
        versionId: `00000000-0000-4000-8000-${String(versions.length + 100).padStart(12, '0')}`,
        guideId,
        versionNumber: guide.currentVersion,
        title: guide.title,
        revisionNotes,
        editorId: guide.authorId,
        publishedAt: guide.publishedAt,
        wordCount: guide.wordCount,
        readingTimeMinutes: guide.readingTimeMinutes,
      },
      ...versions,
    ];

    return ok(strip(guide));
  });

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/schedule$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const refusal = notAuthor(guide);
    if (refusal) return refusal;

    if (guide.status !== 'Draft') {
      return problem(409, 'guides.not-draft', 'Only a draft can be scheduled.');
    }

    const publishAt = body(config).publishAt;
    if (typeof publishAt !== 'string' || Date.parse(publishAt) <= Date.parse(nowIso())) {
      return problem(400, 'guides.schedule.in-past', 'A publication must be scheduled in the future.');
    }

    guide.scheduledPublishAt = publishAt;
    return ok(strip(guide));
  });

  mock.onDelete(new RegExp(`${ROOT}/[^/?]+/schedule$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const refusal = notAuthor(guide);
    if (refusal) return refusal;

    if (!guide.scheduledPublishAt) {
      return problem(409, 'guides.not-scheduled', 'This guide is not scheduled.');
    }
    guide.scheduledPublishAt = null;
    return ok(strip(guide));
  });

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/archive$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const refusal = notAuthor(guide);
    if (refusal) return refusal;

    if (guide.status !== 'Published') {
      return problem(409, 'guides.not-published', 'Only a published guide can be archived.');
    }

    guide.status = 'Archived';
    guide.archivedAt = nowIso();
    return ok(strip(guide));
  });

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/restore$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const refusal = notAuthor(guide);
    if (refusal) return refusal;

    if (guide.status !== 'Archived') {
      return problem(409, 'guides.not-archived', 'This guide is not archived.');
    }

    guide.status = 'Published';
    guide.archivedAt = null;
    return ok(strip(guide));
  });

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/undelete$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();
    if (!guide.isDeleted) {
      return problem(409, 'guides.not-deleted', 'This guide is not deleted.');
    }
    guide.isDeleted = false;
    return ok(strip(guide));
  });

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/versions/\\d+/restore$`)).reply((config) => {
    const segments = path(config).split('/');
    const versionNumber = Number(segments[segments.length - 2]);
    const guideId = segments[segments.length - 4];

    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const refusal = notAuthor(guide) ?? revisionConflict(guide, body(config));
    if (refusal) return refusal;

    if (!versions.some((item) => item.guideId === guideId && item.versionNumber === versionNumber)) {
      return problem(404, 'guides.version.not-found', 'That version could not be found.');
    }

    // Restoring writes the **draft**. The status does not change and no new
    // version is minted — publishing afterwards is what does that.
    guide.revision += 1;
    guide.updatedAt = nowIso();
    return ok(strip(guide));
  });

  // ── Engagement ────────────────────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/vote$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide || !visibleToMember(guide)) return NOT_FOUND();

    // Property 7.
    if (guide.authorId === DEV_GUIDE_AUTHOR_ID) {
      return problem(403, 'guides.vote.self', 'You cannot vote on your own guide.');
    }

    const kind = body(config).kind;
    if (kind !== 'Helpful' && kind !== 'NotHelpful') {
      return problem(400, 'guides.vote.unchanged', `'${String(kind)}' is not a vote kind.`);
    }

    const previous = votes.get(guideId);
    if (previous === kind) {
      return problem(409, 'guides.vote.unchanged', 'You have already cast that vote.');
    }

    const engagement = { ...guide.engagement };
    if (previous === 'Helpful') engagement.helpfulCount -= 1;
    if (previous === 'NotHelpful') engagement.notHelpfulCount -= 1;
    if (kind === 'Helpful') engagement.helpfulCount += 1;
    else engagement.notHelpfulCount += 1;

    votes.set(guideId, kind);
    guide.engagement = engagement;

    // `GuideEngagementResponse` — the counters alone, not a `GuideResponse`.
    return ok(engagement);
  });

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/view$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide || !visibleToMember(guide)) return NOT_FOUND();

    const payload = body(config);
    guide.engagement = {
      ...guide.engagement,
      views: guide.engagement.views + 1,
      uniqueViews: guide.engagement.uniqueViews + (payload.isUniqueView === true ? 1 : 0),
    };
    return ok(guide.engagement);
  });

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/share$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide || !visibleToMember(guide)) return NOT_FOUND();

    guide.engagement = { ...guide.engagement, shareCount: guide.engagement.shareCount + 1 };
    return ok(guide.engagement);
  });

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/report$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide || !visibleToMember(guide)) return NOT_FOUND();

    const reason = body(config).reason;
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      return problem(400, 'guides.report.failed', 'A reason is required.');
    }

    // The report is Community's from here — this module implements none of the
    // workflow. `data: null`, as `PlatformResults.Ok(context, Result)` emits.
    return ok(null);
  });

  mock.onDelete(new RegExp(`${ROOT}/[^/?]+/bookmark$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide || !visibleToMember(guide)) return NOT_FOUND();

    if (bookmarked.has(guideId)) {
      bookmarked.delete(guideId);
      guide.engagement = {
        ...guide.engagement,
        bookmarkCount: Math.max(0, guide.engagement.bookmarkCount - 1),
      };
    }
    return ok(strip(guide));
  });

  mock.onDelete(new RegExp(`${ROOT}/[^/?]+/featured$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();
    // Idempotent — un-featuring what is not featured succeeds.
    guide.isFeatured = false;
    return ok(strip(guide));
  });

  // ── Suggestions ───────────────────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/suggestions/[^/?]+/decision$`)).reply((config) => {
    const suggestionId = path(config).split('/').slice(-2)[0];
    const suggestion = suggestions.find((item) => item.suggestionId === suggestionId);
    if (!suggestion) {
      return problem(404, 'guides.suggestion.not-found', 'That suggestion could not be found.');
    }
    if (suggestion.status !== 'Open') {
      return problem(409, 'guides.suggestion.closed', 'That suggestion has already been decided.');
    }

    const payload = body(config);
    suggestion.status = payload.accept === true ? 'Accepted' : 'Rejected';
    suggestion.decidedBy = DEV_GUIDE_AUTHOR_ID;
    suggestion.decidedAt = nowIso();
    suggestion.decisionNote = typeof payload.note === 'string' ? payload.note : null;
    return ok(suggestion);
  });

  mock.onPost(new RegExp(`${ROOT}/suggestions/[^/?]+/withdrawal$`)).reply((config) => {
    const suggestionId = path(config).split('/').slice(-2)[0];
    const suggestion = suggestions.find((item) => item.suggestionId === suggestionId);
    if (!suggestion) {
      return problem(404, 'guides.suggestion.not-found', 'That suggestion could not be found.');
    }
    // Only the suggester may withdraw. The seeded one is somebody else's.
    if (suggestion.authorId !== DEV_GUIDE_AUTHOR_ID) {
      return problem(403, 'guides.suggestion.not-author', 'Only the suggester can withdraw it.');
    }
    suggestion.status = 'Withdrawn';
    return ok(suggestion);
  });

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/suggestions$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide || !visibleToMember(guide)) return NOT_FOUND();

    // You cannot suggest an improvement to your own guide — you can just edit it.
    if (guide.authorId === DEV_GUIDE_AUTHOR_ID) {
      return problem(403, 'guides.suggestion.self', 'This is your guide — edit it instead.');
    }

    const payload = body(config);
    const proposedContent =
      typeof payload.proposedContent === 'string' ? payload.proposedContent : '';
    if (proposedContent.trim().length === 0) {
      return problem(400, 'guides.suggestion.not-found', 'A suggestion needs some content.');
    }

    const suggestion: GuideSuggestionResponse = {
      suggestionId: `00000000-0000-4000-7000-${String(suggestions.length + 100).padStart(12, '0')}`,
      guideId,
      authorId: DEV_GUIDE_AUTHOR_ID,
      targetSectionId:
        typeof payload.targetSectionId === 'string' ? payload.targetSectionId : null,
      proposedContent,
      rationale: typeof payload.rationale === 'string' ? payload.rationale : null,
      status: 'Open',
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      createdAt: nowIso(),
    };

    suggestions = [...suggestions, suggestion];
    return created(suggestion);
  });

  // ── Verification, moderation, translations ────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/verification$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const refusal = notAuthor(guide);
    if (refusal) return refusal;

    if (guide.trustMark.state === 'Pending') {
      return problem(409, 'guides.verification.already-pending', 'A claim is already open.');
    }

    // **Pending is the strongest thing this can return.** Only a Trust
    // integration event reaches `Verified`.
    guide.trustMark = { ...guide.trustMark, state: 'Pending' };

    return ok({
      guideId,
      state: 'Pending',
      verificationId: '00000000-0000-4000-6000-000000000002',
      badge: null,
      reason: null,
      verifiedAt: null,
      changedAt: nowIso(),
    });
  });

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/translations$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const source = find(guideId);
    if (!source || !visibleToMember(source)) return NOT_FOUND();

    const payload = body(config);
    const language = typeof payload.language === 'string' ? payload.language : '';
    if (language.length !== 2) {
      return problem(400, 'guides.language.invalid', 'Language must be a two-letter code.');
    }
    if (language === source.language) {
      return problem(409, 'guides.translation.self', 'That is already this guide’s language.');
    }
    if (
      guides.some(
        (candidate) =>
          candidate.translationGroupId === source.translationGroupId &&
          candidate.language === language
      )
    ) {
      return problem(409, 'guides.translation.exists', 'A translation already exists for that language.');
    }

    const translationId = `00000000-0000-4000-b000-${String(guides.length + 200).padStart(12, '0')}`;
    const translation = baseGuide({
      ...source,
      guideId: translationId,
      slug: `${source.slug}-${language}`,
      title: typeof payload.title === 'string' ? payload.title : source.title,
      language,
      status: 'Draft',
      currentVersion: 0,
      revision: 1,
      publishedAt: null,
      firstPublishedAt: null,
      authorId: DEV_GUIDE_AUTHOR_ID,
      isDeleted: false,
    });

    guides = [...guides, translation];
    return created(strip(translation));
  });

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/hide$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const reason = body(config).reason;
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      // The reason is required: "a moderation action nobody can explain six
      // months later is an action that should not have been possible."
      return problem(400, 'guides.moderation-note.invalid', 'A reason is required.');
    }

    guide.moderationState = 'Hidden';
    return ok(strip(guide));
  });

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/unhide$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();
    guide.moderationState = 'Clear';
    return ok(strip(guide));
  });

  mock.onPost(new RegExp(`${ROOT}/[^/?]+/moderation-notes$`)).reply((config) => {
    const guideId = path(config).split('/').slice(-2)[0];
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const note = body(config).note;
    if (typeof note !== 'string' || note.trim().length === 0) {
      return problem(400, 'guides.moderation-note.invalid', 'A note is required.');
    }
    // Append-only, and never shown to readers — so nothing on the wire changes.
    return ok(strip(guide));
  });

  // Registered last among the DELETEs, because it would shadow the sub-resources.
  mock.onDelete(new RegExp(`${ROOT}/[^/?]+$`)).reply((config) => {
    const guideId = path(config).split('/').pop() ?? '';
    const guide = find(guideId);
    if (!guide) return NOT_FOUND();

    const refusal = notAuthor(guide);
    if (refusal) return refusal;

    // Soft, and recoverable.
    guide.isDeleted = true;
    return ok(strip(guide));
  });
}

/** The store's private flag is not on the wire. */
function strip(record: GuideRecord): GuideResponse {
  const { isDeleted: _isDeleted, ...wire } = record;
  return wire;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 220);
}

/** The identifiers the integration test addresses. */
export const DEV_GUIDE_IDS = {
  published: PUBLISHED_GUIDE_ID,
  secondPublished: SECOND_PUBLISHED_ID,
  othersDraft: OTHERS_DRAFT_ID,
  myDraft: MY_DRAFT_ID,
  otherAuthor: OTHER_AUTHOR_ID,
} as const;
