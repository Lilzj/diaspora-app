// ─────────────────────────────────────────────────────────────────────────────
// Editing an update and a guide (14 Oct 2026).
//
// Both edit routes punish a request that sends only what the form showed:
//
//   * `PUT /guides/{id}` is replace-style. `summary`, the SEO four, the location
//     and `estimatedCompletionMinutes` are written as they arrive, so a title fix
//     that left them out would blank them. Every unchanged field must go back
//     exactly as read, and each write's revision is the next write's token.
//   * `PUT /community/posts/{id}` treats a supplied `attachments` list as a
//     replacement and an absent one as "keep". The edit form does not touch
//     photos, so the field must be absent — never an empty list.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import { GuideEditError, saveGuideEdits } from '../guides-api';
import { postEditRequest, updatePost } from '../community-social-api';
import type { GuideResponse } from '@/types/guides';
import type { CommunityPostResponse } from '@/types/community-social';

const GUIDE_ID = '6f1c2a40-0b7e-4c1d-9a55-3d2e1f0a9b11';
const POST_ID = '9b8a7c60-2d1e-4f3a-8b77-1c2d3e4f5a6b';

const envelope = <T,>(data: T) => ({ data, meta: {} });

function guideWire(over: Partial<GuideResponse> = {}): GuideResponse {
  return {
    guideId: GUIDE_ID,
    slug: 'work-permits',
    title: 'Getting a work permit',
    summary: 'The documents, the queue and the fee.',
    excerpt: null,
    categoryKey: 'immigration',
    language: 'en',
    translationGroupId: 'a1a1a1a1-0000-4000-8000-000000000001',
    status: 'Published',
    visibility: 'Unlisted',
    moderationState: 'Approved' as GuideResponse['moderationState'],
    isFeatured: false,
    publishedAt: '2026-10-01T00:00:00Z',
    firstPublishedAt: '2026-10-01T00:00:00Z',
    scheduledPublishAt: null,
    archivedAt: null,
    createdAt: '2026-09-30T00:00:00Z',
    updatedAt: null,
    countryCode: 'MU',
    regionName: 'Plaines Wilhems',
    cityName: 'Quatre Bornes',
    areaId: 'b2b2b2b2-0000-4000-8000-000000000002',
    difficulty: 'Advanced',
    readingTimeMinutes: 4,
    estimatedCompletionMinutes: 90,
    wordCount: 800,
    currentVersion: 1,
    revision: 7,
    authorId: 'c3c3c3c3-0000-4000-8000-000000000003',
    author: null,
    sections: [
      {
        sectionId: 'd4d4d4d4-0000-4000-8000-000000000004',
        title: 'Guide',
        order: 1,
        blocks: [
          {
            blockId: 'e5e5e5e5-0000-4000-8000-000000000005',
            kind: 'Markdown',
            order: 1,
            content: 'Start at the passport office.',
            mediaId: null,
            metadata: null,
          },
        ],
      },
    ],
    tags: ['visas'],
    mediaReferences: [
      { mediaId: 'f6f6f6f6-0000-4000-8000-000000000006', role: 'Hero', order: 0, caption: null },
    ],
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
    seo: {
      metaTitle: 'Work permits in Mauritius',
      metaDescription: 'Step by step.',
      canonicalUrl: 'https://example.org/work-permits',
      keywords: 'work,permit',
    },
    ...over,
  };
}

describe('saveGuideEdits', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('sends every unchanged field back exactly as read, and only the title changed', async () => {
    const guide = guideWire();
    let body: Record<string, unknown> | null = null;
    mock.onPut(`/guides/${GUIDE_ID}`).reply((config) => {
      body = JSON.parse(config.data);
      return [200, envelope(guideWire({ title: 'Work permits, 2026', revision: 8 }))];
    });

    const saved = await saveGuideEdits(guide, { title: 'Work permits, 2026' });

    expect(saved.revision).toBe(8);
    expect(body).toEqual({
      title: 'Work permits, 2026',
      summary: 'The documents, the queue and the fee.',
      visibility: 'Unlisted',
      difficulty: 'Advanced',
      estimatedCompletionMinutes: 90,
      countryCode: 'MU',
      regionName: 'Plaines Wilhems',
      cityName: 'Quatre Bornes',
      areaId: 'b2b2b2b2-0000-4000-8000-000000000002',
      metaTitle: 'Work permits in Mauritius',
      metaDescription: 'Step by step.',
      canonicalUrl: 'https://example.org/work-permits',
      keywords: 'work,permit',
      // An untouched document is "metadata only", not a rewrite.
      sections: null,
      baseRevision: 7,
    });
    // Nothing else was asked for, so nothing else was called.
    expect(mock.history.put).toHaveLength(1);
    expect(mock.history.post).toHaveLength(0);
    expect(mock.history.delete).toHaveLength(0);
  });

  it('threads the revision from each write into the next', async () => {
    mock.onPut(`/guides/${GUIDE_ID}/category`).reply(200, envelope(guideWire({ categoryKey: 'work', revision: 8 })));
    mock.onPut(`/guides/${GUIDE_ID}/tags`).reply(200, envelope(guideWire({ categoryKey: 'work', tags: ['jobs'], revision: 9 })));

    await saveGuideEdits(guideWire(), { categoryKey: 'work', tags: ['jobs'] });

    expect(JSON.parse(mock.history.put[0].data)).toEqual({ categoryKey: 'work', baseRevision: 7 });
    expect(JSON.parse(mock.history.put[1].data)).toEqual({ tags: ['jobs'], baseRevision: 8 });
  });

  it('attaches the new cover before detaching the old one', async () => {
    const next = 'a7a7a7a7-0000-4000-8000-000000000007';
    mock.onPost(`/guides/${GUIDE_ID}/media`).reply(200, envelope(guideWire()));
    mock
      .onDelete(`/guides/${GUIDE_ID}/media/f6f6f6f6-0000-4000-8000-000000000006/Hero`)
      .reply(200, envelope(guideWire({ mediaReferences: [] })));

    await saveGuideEdits(guideWire(), { heroMediaId: next });

    expect(JSON.parse(mock.history.post[0].data)).toEqual({ mediaId: next, role: 'Hero' });
    expect(mock.history.delete).toHaveLength(1);
  });

  it('reports the step that failed with the guide as it stood', async () => {
    mock.onPut(`/guides/${GUIDE_ID}`).reply(200, envelope(guideWire({ title: 'New title', revision: 8 })));
    mock.onPut(`/guides/${GUIDE_ID}/tags`).reply(400, { detail: 'A tag is not valid.' });

    const failure = await saveGuideEdits(guideWire(), { title: 'New title', tags: ['!!'] }).catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(GuideEditError);
    expect((failure as GuideEditError).step).toBe('tags');
    expect((failure as GuideEditError).guide.revision).toBe(8);
  });
});

describe('postEditRequest + updatePost', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  const post = {
    postId: POST_ID,
    title: 'Road closed',
    body: 'Royal Road is closed at the market.',
    urgency: 'urgent',
    status: 'published',
    attachments: [
      {
        attachmentId: '11111111-0000-4000-8000-000000000011',
        kind: 'image',
        mediaId: '22222222-0000-4000-8000-000000000022',
        url: null,
        role: null,
        caption: null,
        position: 0,
      },
    ],
  } as unknown as CommunityPostResponse;

  it('keeps existing attachments by leaving the field out of the PUT', async () => {
    let body: Record<string, unknown> | null = null;
    mock.onPut(`/community/posts/${POST_ID}`).reply((config) => {
      body = JSON.parse(config.data);
      return [200, envelope(post)];
    });

    await updatePost(
      POST_ID,
      postEditRequest(post, {
        body: 'Royal Road is closed at the bus station.',
        title: 'Road closed',
        urgency: 'urgent',
        changeSummary: 'Corrected the place',
      })
    );

    expect(body).not.toBeNull();
    // Absent means "keep" on the server; a list — even an empty one — replaces.
    expect(Object.prototype.hasOwnProperty.call(body, 'attachments')).toBe(false);
    // Unchanged urgency is not sent: it would route a draft through AmendAlert.
    expect(Object.prototype.hasOwnProperty.call(body, 'urgency')).toBe(false);
    expect(body).toEqual({
      body: 'Royal Road is closed at the bus station.',
      title: 'Road closed',
      changeSummary: 'Corrected the place',
    });
  });

  it('sends urgency only when the author changed it', () => {
    const request = postEditRequest(post, {
      body: post.body,
      title: '',
      urgency: 'low',
      changeSummary: '',
    });
    expect(request).toEqual({ body: post.body, title: null, changeSummary: null, urgency: 'low' });
  });
});
