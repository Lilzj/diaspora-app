/**
 * The creator workspace reads each row by the names its route sends (RMD-009).
 *
 * Its rows are narrowed declarations of the `/mine` routes' cards, and four of
 * them named fields no card sends:
 *
 *   a guide's summary      read `summary`         the card sends `excerpt`
 *   a business's summary   read `description`     the summary sends `summary`
 *   a business's date      read `createdAt`       not sent; only `publishedAt`
 *   an event's city        read `cityName`        sent inside `location`
 *
 * The reads were tolerant, so nothing threw. A guide and a business showed no
 * summary and an event no city, and the Content Health Center, which scores the
 * summary at 40 points and the city at 10, told their authors to add what they
 * had. The rows here are picked from the client's declarations of those cards,
 * so a name the declaration does not have will not compile.
 */
import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../transport/apiClient';
import { fetchWorkspaceContent } from '../creator/workspace';
import { HINT, PLATFORM_RUBRIC } from './support/content-health-rubric';
import type { ProviderSummary } from '../api/providers-api';
import type { EventSummary } from '@/types/community-life';
import type { GuideCardResponse } from '@/types/guides';
import type { UnifiedContentItem } from '@/types/creator';

const GUIDE: Pick<
  GuideCardResponse,
  'guideId' | 'title' | 'excerpt' | 'status' | 'categoryKey' | 'countryCode' | 'cityName' | 'heroMediaId' | 'tags' | 'publishedAt' | 'updatedAt'
> = {
  guideId: 'c0ffee00-0000-4000-8000-000000000001',
  title: 'Registering a birth in Port Louis',
  excerpt: 'Which office, which forms, and how long it takes.',
  status: 'Published',
  categoryKey: 'civil-status',
  countryCode: 'MU',
  cityName: 'Port Louis',
  heroMediaId: 'c0ffee00-0000-4000-8000-0000000000a1',
  tags: ['birth', 'registration'],
  publishedAt: '2026-11-02T09:00:00Z',
  updatedAt: '2026-11-10T09:00:00Z',
};

const BUSINESS: Pick<ProviderSummary, 'providerId' | 'name' | 'summary' | 'status' | 'category' | 'coverMedia' | 'publishedAt'> = {
  providerId: 'c0ffee00-0000-4000-8000-000000000002',
  name: 'Josh Kitchen',
  summary: 'Home-cooked Ghanaian lunches, delivered.',
  status: 'Draft',
  category: { categoryId: 'c0ffee00-0000-4000-8000-0000000000c1', slug: 'food', name: 'Food & drink' },
  coverMedia: { mediaId: 'c0ffee00-0000-4000-8000-0000000000a2', role: 'Cover', position: 0, isClaimed: false },
  publishedAt: null,
};

const EVENT: Pick<EventSummary, 'eventId' | 'title' | 'summary' | 'startsAt' | 'location' | 'coverMediaId'> & {
  status: string;
} = {
  eventId: 'c0ffee00-0000-4000-8000-000000000003',
  title: 'Diaspora meetup',
  summary: 'An evening for newcomers.',
  status: 'Published',
  startsAt: '2026-12-05T17:00:00Z',
  location: { countryCode: 'MU', cityName: 'Port Louis', displayName: 'Caudan, Port Louis' },
  coverMediaId: 'c0ffee00-0000-4000-8000-0000000000a3',
};

const WRITE_A_SUMMARY = HINT.summary;
const ADD_A_CITY = HINT.location;

let api: MockAdapter;

beforeEach(() => {
  api = new MockAdapter(apiClient, { delayResponse: 0 });
  api.onGet('/guides/mine').reply(200, { data: { items: [GUIDE], nextCursor: null, hasMore: false } });
  api.onGet('/marketplace/listings/mine').reply(200, { data: { items: [], nextCursor: null, hasMore: false } });
  api.onGet('/housing/listings/mine').reply(200, { data: { items: [], nextCursor: null, hasMore: false } });
  api.onGet('/community-life/events/mine').reply(200, { data: { items: [EVENT], nextCursor: null, hasMore: false } });
  api.onGet('/providers/me').reply(200, { data: [BUSINESS] });
  api.onGet('/creators/content-health/rubric').reply(200, { data: PLATFORM_RUBRIC });
});

afterEach(() => api.restore());

async function itemOf(contentType: UnifiedContentItem['contentType']): Promise<UnifiedContentItem> {
  const content = await fetchWorkspaceContent({ id: 'me', type: 'personal', name: 'Zoe' } as never);
  const item = content.items.find((candidate) => candidate.contentType === contentType);
  if (!item) throw new Error(`no ${contentType} item`);
  return item;
}

function tipsFor(item: UnifiedContentItem): string[] {
  return (item.healthRecommendations ?? []).map((recommendation) => recommendation.title);
}

describe('a workspace row, read from the card its route sends', () => {
  it("gives a guide its card's excerpt as the summary", async () => {
    expect((await itemOf('Guide')).summary).toBe(GUIDE.excerpt);
  });

  it('gives a business its summary', async () => {
    expect((await itemOf('Provider')).summary).toBe(BUSINESS.summary);
  });

  it('gives an unpublished business no date, rather than one it was not sent', async () => {
    const item = await itemOf('Provider');

    expect(item.createdDate).toBe('');
    expect(item.lastUpdated).toBe('');
  });

  it('gives an event the city inside its location', async () => {
    expect((await itemOf('Event')).location).toBe('Port Louis');
  });
});

describe("the Content Health Center, scoring those rows by the platform's rubric", () => {
  it('scores a complete guide in full, and does not ask for the summary it has', async () => {
    const item = await itemOf('Guide');

    expect(tipsFor(item)).not.toContain(WRITE_A_SUMMARY);
    expect(item.healthScore).toBe(100);
  });

  it('does not ask a business for the summary it has', async () => {
    const item = await itemOf('Provider');

    expect(tipsFor(item)).not.toContain(WRITE_A_SUMMARY);
    expect(item.healthStatus).toBe('healthy');
  });

  it('does not ask an event for the city it has', async () => {
    expect(tipsFor(await itemOf('Event'))).not.toContain(ADD_A_CITY);
  });
});
