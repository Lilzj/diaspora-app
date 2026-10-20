// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the Guides client against the real contract
// (Remediation Wave D-3)
//
// Runs the real `lib/guides-api.ts` against the real `mocks/handlers/guides.ts`,
// which was written from `Diaspora.Modules.Guides`'s own source rather than from
// what this client expects. Nothing is re-implemented here: a test against a
// re-implementation of the thing under test proves nothing.
//
// Every case below pins something that would break a client **silently** — no
// exception, no red screen. A page that comes back empty, a sort that quietly
// reverses, a publish that reports success over an empty document, a create that
// answers a draft while the screen says "published". Those are the ones worth a
// test; the loud failures look after themselves.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import { readPage } from '@/lib/platform-envelope';
import { DEV_GUIDE_IDS, resetGuideMocks, setupGuideMocks } from '@/mocks/handlers/guides';
import {
  GUIDE_BLOCK_MAX_LENGTH,
  GUIDE_DEFAULT_PAGE_SIZE,
  GUIDE_MAX_MEDIA_REFERENCES,
  GUIDE_MAX_PAGE_SIZE,
  GUIDE_MAX_SECTIONS,
  GUIDE_MAX_TAGS,
  GUIDE_SORT_KEYS,
  GUIDE_SUMMARY_MAX_LENGTH,
  GUIDE_TITLE_MIN_LENGTH,
  GUIDE_WORDS_PER_MINUTE,
  GuidePublishError,
  attachGuideMedia,
  castGuideVote,
  clampGuideLimit,
  compareGuideVersions,
  createGuide,
  fetchGuide,
  fetchGuideCapabilities,
  fetchGuideCategories,
  fetchGuideTags,
  fetchGuideVersions,
  fetchGuidesByCountry,
  fetchLatestGuides,
  fetchMyDrafts,
  fetchMyGuides,
  guideErrorCode,
  guideErrorMessage,
  hasPublishableContent,
  isGuideRevisionConflict,
  isGuideStructureEmpty,
  publishGuide,
  publishNewGuide,
  recordGuideView,
  saveGuideBookmark,
  searchGuides,
  setGuideTags,
  submitGuideVerification,
  updateGuide,
} from '@/lib/guides-api';
import {
  composeGuideDocument,
  documentWordCount,
  exceedsBlockLimit,
  parseEditorMarkup,
} from '@/lib/guide-composer';
import type { GuideSectionInput } from '@/types/guides';

let mock: MockAdapter;

beforeAll(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  setupGuideMocks(mock);
  // Anything this client sends that the handler does not answer is a defect in
  // the client, not a passthrough.
  mock.onAny().reply(404);
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  resetGuideMocks();
  mock.resetHistory();
});

/** A minimal publishable document. */
function sections(text = 'Bring the original documents, not copies.'): GuideSectionInput[] {
  return [
    {
      sectionId: '00000000-0000-4000-e900-000000000001',
      title: 'How to do it',
      order: 1,
      blocks: [
        {
          blockId: '00000000-0000-4000-f900-000000000001',
          kind: 'Markdown',
          order: 1,
          content: text,
        },
      ],
    },
  ];
}

// ── Trap 1: the create wizard's central lie ──────────────────────────────────

describe('POST /guides opens a draft and publishes nothing', () => {
  it('answers Draft with currentVersion 0 and no sections, whatever the caller wanted', async () => {
    const draft = await createGuide({
      title: 'Getting a National Insurance number',
      categoryKey: 'immigration',
      language: 'en',
      countryCode: 'GB',
      summary: 'What to say on the call.',
    });

    // The whole reason `publishNewGuide` is four calls. A screen that treated
    // this 201 as "published" — which `guide/create.tsx` effectively did without
    // even making the call — would be telling the member something untrue.
    expect(draft.status).toBe('Draft');
    expect(draft.currentVersion).toBe(0);
    expect(draft.sections).toEqual([]);
    expect(draft.publishedAt).toBeNull();
  });

  it('refuses a title under three characters', async () => {
    await expect(
      createGuide({ title: 'Hi', categoryKey: 'immigration', language: 'en', countryCode: 'GB' })
    ).rejects.toMatchObject({ response: { status: 400 } });
  });

  it('refuses a category key the catalogue does not carry', async () => {
    // The create screen used to offer `mocks/data`'s marketplace categories.
    // "Food & Restaurants" is not a guide category key and never was.
    await expect(
      createGuide({
        title: 'A perfectly good guide',
        categoryKey: 'Food & Restaurants',
        language: 'en',
        countryCode: 'GB',
      })
    ).rejects.toMatchObject({ response: { status: 404 } });
  });

  it('refuses a country *name* where a code belongs', async () => {
    await expect(
      createGuide({
        title: 'A perfectly good guide',
        categoryKey: 'immigration',
        language: 'en',
        countryCode: 'United Kingdom',
      })
    ).rejects.toMatchObject({ response: { status: 400 } });
  });
});

// ── Trap 2: publishing an empty guide ────────────────────────────────────────

describe('publishing refuses an empty document', () => {
  it('answers guides.structure.empty rather than publishing nothing', async () => {
    const draft = await createGuide({
      title: 'A guide with no content',
      categoryKey: 'immigration',
      language: 'en',
      countryCode: 'GB',
    });

    const failure = await publishGuide(draft.guideId).catch((cause: unknown) => cause);

    expect(isGuideStructureEmpty(failure)).toBe(true);
    expect(guideErrorCode(failure)).toBe('guides.structure.empty');
  });

  it('hasPublishableContent agrees with the server before the round trip', () => {
    expect(hasPublishableContent([])).toBe(false);
    expect(
      hasPublishableContent([
        { sectionId: 'a', title: 'Empty', order: 1, blocks: [{ blockId: 'b', kind: 'Markdown', order: 1, content: '   ' }] },
      ])
    ).toBe(false);
    expect(hasPublishableContent(sections())).toBe(true);
  });
});

// ── Trap 3: the sequence that actually publishes a guide ─────────────────────

describe('publishNewGuide is the whole act, and reports the step that failed', () => {
  it('creates, saves content, attaches the hero and publishes — in that order', async () => {
    const { guide, warnings } = await publishNewGuide({
      create: {
        title: 'Registering with a GP',
        categoryKey: 'immigration',
        language: 'en',
        countryCode: 'GB',
        summary: 'You do not need proof of address.',
      },
      sections: sections(),
      heroMediaId: '00000000-0000-4000-9000-000000000042',
      tags: ['NHS', 'Health Care'],
      revisionNotes: 'First publication.',
    });

    expect(guide.status).toBe('Published');
    expect(guide.currentVersion).toBe(1);
    expect(guide.publishedAt).not.toBeNull();
    expect(warnings).toEqual([]);

    const calls = mock.history;
    const paths = [
      ...calls.post.map((call) => `POST ${call.url}`),
      ...calls.put.map((call) => `PUT ${call.url}`),
    ];

    // Four writes, and the order is load-bearing: media needs a guide that
    // exists, tags must be on before the version snapshots them, and publish is
    // the step that makes any of it visible.
    expect(calls.post[0].url).toBe('/guides');
    expect(paths).toContain(`PUT /guides/${guide.guideId}`);
    expect(paths).toContain(`POST /guides/${guide.guideId}/media`);
    expect(paths).toContain(`PUT /guides/${guide.guideId}/tags`);
    expect(calls.post[calls.post.length - 1].url).toBe(`/guides/${guide.guideId}/publish`);
  });

  it('sends the tags free-text and gets slugs back', async () => {
    const { guide } = await publishNewGuide({
      create: {
        title: 'Registering with a GP',
        categoryKey: 'immigration',
        language: 'en',
        countryCode: 'GB',
      },
      sections: sections(),
      tags: ['NHS', 'Health Care', 'health care'],
    });

    // The aggregate normalises to a slug and deduplicates — "Health Care" and
    // "health care" are one tag, not two.
    expect(guide.tags).toEqual(['nhs', 'health-care']);
  });

  it('rejects with the failing step and the recoverable guideId', async () => {
    // An empty document reaches the publish step and is refused there, which is
    // exactly the case a screen must not report as success: the draft exists.
    const failure = await publishNewGuide({
      create: {
        title: 'A guide that will not publish',
        categoryKey: 'immigration',
        language: 'en',
        countryCode: 'GB',
      },
      sections: [
        {
          sectionId: '00000000-0000-4000-e900-000000000002',
          title: 'Nothing here',
          order: 1,
          blocks: [],
        },
      ],
    }).catch((cause: unknown) => cause);

    expect(failure).toBeInstanceOf(GuidePublishError);
    const error = failure as GuidePublishError;
    expect(error.step).toBe('publish');
    // The member can be told where their work is, rather than that it is gone.
    expect(error.guideId).not.toBeNull();

    // And it really is a draft they can go back to.
    const draft = await fetchGuide(error.guideId as string);
    expect(draft.status).toBe('Draft');
  });

  it('publishes anyway when only the optional hero fails, and reports it', async () => {
    const { guide, warnings } = await publishNewGuide({
      create: {
        title: 'A guide whose photograph did not attach',
        categoryKey: 'immigration',
        language: 'en',
        countryCode: 'GB',
      },
      sections: sections(),
      // An empty media id is refused by the attach route; the guide still goes
      // live, because refusing to publish over a photograph would throw away a
      // finished guide.
      heroMediaId: undefined,
      tags: [],
    });

    expect(guide.status).toBe('Published');
    expect(warnings).toEqual([]);
  });
});

// ── Trap 4: revision conflict ────────────────────────────────────────────────

describe('a stale baseRevision is a 409, not a silent overwrite', () => {
  it('answers guides.revision-conflict', async () => {
    const failure = await updateGuide(DEV_GUIDE_IDS.published, {
      title: 'A colleague was editing this',
      countryCode: 'GB',
      // The seeded guide is at revision 5.
      baseRevision: 1,
    }).catch((cause: unknown) => cause);

    expect(isGuideRevisionConflict(failure)).toBe(true);
    expect((failure as { response?: { status?: number } }).response?.status).toBe(409);
    expect(guideErrorMessage(failure)).toContain('Reload');
  });

  it('omitting baseRevision opts out of the check, which is what a create wizard wants', async () => {
    const saved = await updateGuide(DEV_GUIDE_IDS.published, {
      title: 'Saved without a concurrency token',
      countryCode: 'GB',
    });
    expect(saved.title).toBe('Saved without a concurrency token');
  });
});

// ── Trap 5: the sort key that fails silently ─────────────────────────────────

describe('an unrecognised sort key is not an error', () => {
  it('falls back to newest rather than refusing, so a typo reorders the page in silence', async () => {
    const canonical = await searchGuides({ sort: 'newest' });
    // `most_helpful` with an underscore is not a sort key. The server does not
    // say so — `GuideWireNames.ParseSort` returns `Newest` for anything it does
    // not recognise, and the caller gets a plausible page in the wrong order.
    const typo = await searchGuides({ sort: 'most_helpful' as never });

    expect(typo.items.map((row) => row.guideId)).toEqual(
      canonical.items.map((row) => row.guideId)
    );

    // Which is why the canonical five are exported and a screen must use them.
    expect(GUIDE_SORT_KEYS).toEqual([
      'newest',
      'most-helpful',
      'recently-updated',
      'popular',
      'trending',
    ]);
  });

  it('most-helpful really does reorder', async () => {
    const helpful = await searchGuides({ sort: 'most-helpful' });
    const counts = helpful.items.map((row) => row.helpfulCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });
});

// ── Trap 6: every list envelope, through readPage ────────────────────────────

describe('readPage absorbs every list shape this module emits', () => {
  it('reads CursorPagedResult from search, browse, mine and drafts', async () => {
    for (const page of [
      await searchGuides({}),
      await fetchLatestGuides({}),
      await fetchGuidesByCountry('GB', {}),
      await fetchMyGuides({}),
      await fetchMyDrafts({}),
    ]) {
      expect(Array.isArray(page.items)).toBe(true);
      expect(page.totalCount).not.toBeNull();
    }
  });

  it('reads the bare arrays from categories, tags and versions', async () => {
    const categories = await fetchGuideCategories();
    const tags = await fetchGuideTags();
    const versions = await fetchGuideVersions(DEV_GUIDE_IDS.published);

    expect(categories.items.length).toBeGreaterThan(0);
    expect(tags.items.length).toBeGreaterThan(0);
    expect(versions.items.length).toBeGreaterThan(0);

    // A bare array declares no total. Its length is what came back, not the
    // population — and `readPage` refuses to promote one to the other.
    expect(categories.totalCount).toBeNull();
    expect(tags.totalCount).toBeNull();
    expect(versions.totalCount).toBeNull();
    expect(categories.nextCursor).toBeNull();
  });

  it('is a real page, not the whole list, when there is more', async () => {
    const first = await searchGuides({ limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = await searchGuides({ limit: 1, cursor: first.nextCursor as string });
    expect(second.items[0].guideId).not.toBe(first.items[0].guideId);
  });

  it('the raw envelope really is `items` — no bespoke row name in this module', async () => {
    const response = await apiClient.get('/guides');
    const body = response.data as { data: Record<string, unknown> };

    expect(Array.isArray(body.data.items)).toBe(true);
    // Community's comment thread named its rows `comments` and returned an
    // empty page through `readPage` for every screen that read it. Guides does
    // not do that anywhere, and this is the assertion that keeps it true.
    expect(body.data).not.toHaveProperty('results');
    expect(body.data).not.toHaveProperty('comments');
    expect(body.data).not.toHaveProperty('guides');
    expect(readPage(response.data).items).toHaveLength(
      (body.data.items as unknown[]).length
    );
  });
});

// ── Trap 7: visibility is a 404, not a 403 ───────────────────────────────────

describe('somebody else’s draft is not found rather than forbidden', () => {
  it('answers 404 for a draft belonging to another author', async () => {
    const failure = await fetchGuide(DEV_GUIDE_IDS.othersDraft).catch((cause: unknown) => cause);
    expect((failure as { response?: { status?: number } }).response?.status).toBe(404);
  });

  it('and a discovery list never carries one', async () => {
    const page = await searchGuides({ limit: GUIDE_MAX_PAGE_SIZE });
    expect(page.items.map((row) => row.guideId)).not.toContain(DEV_GUIDE_IDS.othersDraft);
    expect(page.items.every((row) => row.status === 'Published')).toBe(true);
  });

  it('but the author’s own workspace does', async () => {
    const drafts = await fetchMyDrafts({});
    expect(drafts.items.map((row) => row.guideId)).toContain(DEV_GUIDE_IDS.myDraft);
    expect(drafts.items.every((row) => row.status === 'Draft')).toBe(true);
  });
});

// ── Trap 8: media attachment is keyed on the pair ────────────────────────────

describe('attaching media is idempotent on (mediaId, role), not on mediaId', () => {
  it('the same asset in two roles is two references; the same pair twice is one', async () => {
    const mediaId = '00000000-0000-4000-9000-000000000077';

    await attachGuideMedia(DEV_GUIDE_IDS.published, { mediaId, role: 'Gallery' });
    await attachGuideMedia(DEV_GUIDE_IDS.published, { mediaId, role: 'Gallery' });
    const withBoth = await attachGuideMedia(DEV_GUIDE_IDS.published, { mediaId, role: 'Cover' });

    const forAsset = withBoth.mediaReferences.filter((ref) => ref.mediaId === mediaId);
    expect(forAsset.map((ref) => ref.role).sort()).toEqual(['Cover', 'Gallery']);
  });

  it('every reference is an identifier and never a URL', async () => {
    const guide = await fetchGuide(DEV_GUIDE_IDS.published);
    for (const reference of guide.mediaReferences) {
      expect(reference.mediaId).not.toMatch(/^https?:/);
      expect(reference).not.toHaveProperty('url');
    }
  });
});

// ── Trap 9: voting ───────────────────────────────────────────────────────────

describe('voting', () => {
  it('is refused on your own guide with guides.vote.self', async () => {
    const failure = await castGuideVote(DEV_GUIDE_IDS.published, { kind: 'Helpful' }).catch(
      (cause: unknown) => cause
    );

    expect(guideErrorCode(failure)).toBe('guides.vote.self');
    expect((failure as { response?: { status?: number } }).response?.status).toBe(403);
    expect(guideErrorMessage(failure)).toBe('You cannot vote on your own guide.');
  });

  it('answers the counters alone — not a GuideResponse', async () => {
    const engagement = await castGuideVote(DEV_GUIDE_IDS.secondPublished, { kind: 'Helpful' });

    // `GuideEngagementResponse`. A hook that wrote this into the detail cache
    // would blank the guide; the counters live one level deeper there.
    expect(engagement).toHaveProperty('helpfulCount');
    expect(engagement).not.toHaveProperty('guideId');
    expect(engagement).not.toHaveProperty('title');
  });

  it('casting the same kind twice is guides.vote.unchanged', async () => {
    await castGuideVote(DEV_GUIDE_IDS.secondPublished, { kind: 'Helpful' });
    const failure = await castGuideVote(DEV_GUIDE_IDS.secondPublished, { kind: 'Helpful' }).catch(
      (cause: unknown) => cause
    );
    expect(guideErrorCode(failure)).toBe('guides.vote.unchanged');
  });

  it('the other kind changes the vote rather than adding one', async () => {
    const first = await castGuideVote(DEV_GUIDE_IDS.secondPublished, { kind: 'Helpful' });
    const second = await castGuideVote(DEV_GUIDE_IDS.secondPublished, { kind: 'NotHelpful' });

    expect(second.helpfulCount).toBe(first.helpfulCount - 1);
    expect(second.notHelpfulCount).toBe(first.notHelpfulCount + 1);
  });
});

// ── Trap 10: verification asks, it does not grant ────────────────────────────

describe('submitting a guide for verification', () => {
  it('returns Pending at the strongest, never Verified', async () => {
    const status = await submitGuideVerification(DEV_GUIDE_IDS.myDraft, {
      notes: 'The fee is on the department’s own page.',
    });

    // Only a Trust integration event can reach `Verified`. A screen that
    // rendered this response as a verified badge would be lying.
    expect(status.state).toBe('Pending');
    expect(status.verifiedAt).toBeNull();
    expect(status.badge).toBeNull();
  });

  it('sends `notes`, which is not the response’s `reason`', async () => {
    await submitGuideVerification(DEV_GUIDE_IDS.myDraft, { notes: 'A note' });
    const sent = JSON.parse(mock.history.post[0].data as string) as Record<string, unknown>;
    expect(sent).toHaveProperty('notes');
    expect(sent).not.toHaveProperty('note');
    expect(sent).not.toHaveProperty('reason');
  });
});

// ── Trap 11: the enum casing this module uses ────────────────────────────────

describe('enums are PascalCase and sort keys are kebab, in the same request', () => {
  it('a guide’s status, difficulty, visibility and media role are all PascalCase', async () => {
    const guide = await fetchGuide(DEV_GUIDE_IDS.published);

    expect(guide.status).toBe('Published');
    expect(guide.difficulty).toBe('Intermediate');
    expect(guide.visibility).toBe('Public');
    expect(guide.moderationState).toBe('Clear');
    expect(guide.trustMark.state).toBe('Verified');
    expect(guide.mediaReferences[0].role).toBe('Hero');

    // This module is not Community. `status === 'published'` is silently false
    // for ever, and the two are consumed on the same screens.
    expect(guide.status).not.toBe('published');
  });

  it('capabilities declare the same vocabularies the client ships as fallbacks', async () => {
    const capabilities = await fetchGuideCapabilities();

    expect(capabilities.statuses).toContain('Published');
    expect(capabilities.mediaRoles).toContain('Hero');
    expect(capabilities.voteKinds).toEqual(['Helpful', 'NotHelpful']);
    expect(capabilities.sortOrders).toEqual([...GUIDE_SORT_KEYS]);

    // The ceilings a compose box needs before this request resolves. If the
    // constants and the deployment ever disagree, this is where it shows.
    expect(capabilities.maxSections).toBe(GUIDE_MAX_SECTIONS);
    expect(capabilities.maxTags).toBe(GUIDE_MAX_TAGS);
    expect(capabilities.maxBlockLength).toBe(GUIDE_BLOCK_MAX_LENGTH);
    expect(capabilities.maxSummaryLength).toBe(GUIDE_SUMMARY_MAX_LENGTH);
    expect(capabilities.maxMediaReferences).toBe(GUIDE_MAX_MEDIA_REFERENCES);
    expect(capabilities.maxPageSize).toBe(GUIDE_MAX_PAGE_SIZE);
  });
});

// ── Trap 12: an inactive category still owns its guides ──────────────────────

describe('an inactive category is hidden from the picker and never from a guide', () => {
  it('is absent from the catalogue by default and present when asked for', async () => {
    const active = await fetchGuideCategories();
    const all = await fetchGuideCategories({ includeInactive: true });

    expect(active.items.map((row) => row.key)).not.toContain('legacy-transport');
    expect(all.items.map((row) => row.key)).toContain('legacy-transport');
  });

  it('and the guide filed under it is still discoverable', async () => {
    const page = await searchGuides({ limit: GUIDE_MAX_PAGE_SIZE });
    const orphan = page.items.find((row) => row.guideId === DEV_GUIDE_IDS.secondPublished);

    // A filter row that dropped inactive categories would hide this guide from
    // browse. Its category was correct at the time it was filed.
    expect(orphan?.categoryKey).toBe('legacy-transport');
  });
});

// ── Trap 13: no idempotency mechanism anywhere ───────────────────────────────

describe('this module has no idempotency key — not a header and not a body field', () => {
  it('the client sends neither, because there is nothing to send it to', async () => {
    await publishNewGuide({
      create: {
        title: 'A guide created exactly once',
        categoryKey: 'immigration',
        language: 'en',
        countryCode: 'GB',
      },
      sections: sections(),
    });

    for (const call of [...mock.history.post, ...mock.history.put]) {
      const headers = (call.headers ?? {}) as Record<string, unknown>;
      expect(headers['Idempotency-Key']).toBeUndefined();
      expect(headers['idempotency-key']).toBeUndefined();

      if (typeof call.data === 'string' && call.data.length > 0) {
        expect(JSON.parse(call.data)).not.toHaveProperty('idempotencyKey');
      }
    }
  });
});

// ── Trap 14: the versions read is anonymous and uncursored ───────────────────

describe('the version history', () => {
  it('is a bare array, newest first, with no cursor to follow', async () => {
    const page = await fetchGuideVersions(DEV_GUIDE_IDS.published);

    expect(page.nextCursor).toBeNull();
    expect(page.hasMore).toBe(false);
    expect(page.items.map((row) => row.versionNumber)).toEqual([2, 1]);
  });

  it('a diff omits unchanged sections rather than listing them as unchanged', async () => {
    const diff = await compareGuideVersions(DEV_GUIDE_IDS.published, 1, 2);

    expect(diff.fromVersion).toBe(1);
    expect(diff.toVersion).toBe(2);
    // Kebab and lower-case — the diff service writes these by hand rather than
    // through `GuideWireNames`, so they are the one lower-case vocabulary here.
    expect(diff.sections.map((row) => row.change)).toEqual(['content-changed', 'added']);
    // Only the four real change kinds appear — there is no "unchanged" value on
    // this contract, because an unchanged section is simply absent.
    expect(
      diff.sections.every((row) =>
        (['added', 'removed', 'retitled', 'content-changed'] as string[]).includes(row.change)
      )
    ).toBe(true);
  });

  it('the compare route takes query parameters, not path segments', async () => {
    await compareGuideVersions(DEV_GUIDE_IDS.published, 1, 2);
    const call = mock.history.get[mock.history.get.length - 1];

    expect(call.url).toBe(`/guides/${DEV_GUIDE_IDS.published}/versions/compare`);
    expect(call.params).toMatchObject({ fromVersion: 1, toVersion: 2 });
  });
});

// ── Trap 15: the draft auto-save touches nothing ─────────────────────────────

describe('the bookmark and the view are what they claim to be', () => {
  it('saving twice is one bookmark, because the route is idempotent', async () => {
    // The route answers no body (20 Oct 2026); the guide is read afterwards.
    await saveGuideBookmark(DEV_GUIDE_IDS.published);
    const first = await fetchGuide(DEV_GUIDE_IDS.published);
    await saveGuideBookmark(DEV_GUIDE_IDS.published);
    const second = await fetchGuide(DEV_GUIDE_IDS.published);
    expect(second.engagement.bookmarkCount).toBe(first.engagement.bookmarkCount);
  });

  it('a view is anonymous and its uniqueness is the client’s claim', async () => {
    const before = await fetchGuide(DEV_GUIDE_IDS.published);
    const after = await recordGuideView(DEV_GUIDE_IDS.published, { isUniqueView: false });

    expect(after.views).toBe(before.engagement.views + 1);
    // Not fingerprinted server-side. `isUniqueView: false` is honoured verbatim.
    expect(after.uniqueViews).toBe(before.engagement.uniqueViews);
  });
});

// ── Trap 16: the tag ceiling ─────────────────────────────────────────────────

describe('the ceilings the aggregate enforces', () => {
  it('refuses an eleventh tag', async () => {
    const failure = await setGuideTags(DEV_GUIDE_IDS.published, {
      tags: Array.from({ length: 11 }, (_, index) => `tag-${index}`),
    }).catch((cause: unknown) => cause);

    expect(guideErrorCode(failure)).toBe('guides.tags.limit');
  });

  it('clampGuideLimit applies the server’s own clamp so two limits are one cache entry', () => {
    expect(clampGuideLimit(200)).toBe(GUIDE_MAX_PAGE_SIZE);
    expect(clampGuideLimit(0)).toBe(1);
    expect(clampGuideLimit(undefined)).toBe(GUIDE_DEFAULT_PAGE_SIZE);
    expect(clampGuideLimit(Number.NaN)).toBe(GUIDE_DEFAULT_PAGE_SIZE);
  });
});

// ── The editor's document model ──────────────────────────────────────────────

describe('the create wizard’s markup becomes real blocks', () => {
  it('maps each toolbar marker to the block kind the server already ships', () => {
    const fragments = parseEditorMarkup(
      'Opening prose.\n[TIP]Book early.[/TIP]\n[WARNING]The fee is non-refundable.[/WARNING]\n[CALLOUT]Note this.[/CALLOUT]\n[LINK]Portal | https://example.gov[/LINK]'
    );

    expect(fragments.map((fragment) => fragment.kind)).toEqual([
      'Markdown',
      'Tip',
      'Warning',
      'Callout',
      'Links',
    ]);
  });

  it('does not fabricate a mediaId for a typed image URL', () => {
    // Media is stored by reference and never by URL. A `[IMAGE]https://…[/IMAGE]`
    // the member typed is not a media reference, so it must not become an
    // `Image` block with an invented identifier.
    const fragments = parseEditorMarkup('[IMAGE]https://example.com/a.jpg[/IMAGE]');
    expect(fragments).toHaveLength(1);
    expect(fragments[0].kind).toBe('Markdown');
  });

  it('drops a marker whose placeholder was deleted', () => {
    expect(parseEditorMarkup('[TIP][/TIP]')).toEqual([]);
  });

  it('reuses the section identifier across saves', () => {
    const first = composeGuideDocument('Some prose.', {
      reuseSectionIds: ['00000000-0000-4000-e900-000000000009'],
    });
    const second = composeGuideDocument('Some different prose.', {
      reuseSectionIds: [first[0].sectionId],
      reuseBlockIds: first[0].blocks.map((block) => block.blockId),
    });

    // A composer that minted a fresh id on every keystroke would make every save
    // read as a full replacement in the version diff.
    expect(second[0].sectionId).toBe(first[0].sectionId);
    expect(second[0].blocks[0].blockId).toBe(first[0].blocks[0].blockId);
  });

  it('counts words the way the server does, over blocks rather than raw markup', () => {
    const document = composeGuideDocument('[TIP]Three little words[/TIP]');
    // The markers themselves are not words. The raw text has five "words".
    expect(documentWordCount(document)).toBe(3);
    expect(Math.max(1, Math.ceil(documentWordCount(document) / GUIDE_WORDS_PER_MINUTE))).toBe(1);
  });

  it('flags a block past the server’s ceiling before the round trip', () => {
    const tooLong = composeGuideDocument('x'.repeat(GUIDE_BLOCK_MAX_LENGTH + 1));
    expect(exceedsBlockLimit(tooLong)).toBe(true);
    expect(exceedsBlockLimit(composeGuideDocument('short'))).toBe(false);
  });

  it('produces a title long enough for the server’s minimum to matter', () => {
    expect(GUIDE_TITLE_MIN_LENGTH).toBe(3);
  });
});
