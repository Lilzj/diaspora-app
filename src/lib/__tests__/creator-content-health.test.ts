/**
 * Complete content can reach a healthy Content Health score.
 *
 * The Content Health Center scores each workspace item against the rubric the
 * platform publishes, by looking each criterion's field name up on the item.
 * Three criteria could not be met by content that had what they ask for:
 *
 *   an event's category   `categoryKey` is sent, and the event row never kept it
 *   an event's date       the rubric asks for `startsAt`, which no item carried
 *   a business's tags     `tags` is sent, and the business row never kept them
 *
 * So every event was told to choose a category and set a date it had, and every
 * business to add tags it had: a complete event scored at most 68%, "needs
 * attention", and a complete business at most 89%.
 *
 * The fourth was the rubric's: it scored tags for every type, and events and
 * homes cannot have tags at all. Version 2 of the platform's rubric applies
 * tags only where the list card carries them, so a complete event or home is
 * no longer told to add one.
 *
 * The rows here are picked from the client's declarations of the routes'
 * cards, and the rubric is the platform's (`support/content-health-rubric`).
 */
import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../transport/apiClient';
import { fetchWorkspaceContent } from '../creator/workspace';
import { HINT, PLATFORM_RUBRIC } from './support/content-health-rubric';
import type { ProviderSummary } from '../api/providers-api';
import type { HousingCardWire } from '../platform/housing-cards';
import type { EventSummary } from '@/types/community-life';
import type { UnifiedContentItem } from '@/types/creator';

const EVENT: Pick<
  EventSummary,
  'eventId' | 'title' | 'summary' | 'categoryKey' | 'startsAt' | 'location' | 'coverMediaId'
> & { status: string } = {
  eventId: 'c0ffee00-0000-4000-8000-000000000003',
  title: 'Diaspora meetup',
  summary: 'An evening for newcomers.',
  categoryKey: 'social',
  status: 'Published',
  startsAt: '2026-12-05T17:00:00Z',
  location: { countryCode: 'MU', cityName: 'Port Louis', displayName: 'Caudan, Port Louis' },
  coverMediaId: 'c0ffee00-0000-4000-8000-0000000000a3',
};

const BUSINESS: Pick<
  ProviderSummary,
  'providerId' | 'name' | 'summary' | 'status' | 'category' | 'coverMedia' | 'tags' | 'publishedAt'
> = {
  providerId: 'c0ffee00-0000-4000-8000-000000000002',
  name: 'Josh Kitchen',
  summary: 'Home-cooked Ghanaian lunches, delivered.',
  status: 'Active',
  category: { categoryId: 'c0ffee00-0000-4000-8000-0000000000c1', slug: 'food', name: 'Food & drink' },
  coverMedia: { mediaId: 'c0ffee00-0000-4000-8000-0000000000a2', role: 'Cover', position: 0, isClaimed: false },
  tags: ['catering', 'lunch'],
  publishedAt: '2026-11-01T09:00:00Z',
};

const HOME: HousingCardWire = {
  id: 'c0ffee00-0000-4000-8000-000000000004',
  title: 'Studio near the market',
  summary: 'Bright, quiet, two minutes from the bus.',
  status: 'Published',
  accommodationTypeKey: 'studio',
  accommodationTypeName: 'Studio',
  price: { isDisclosed: true, amount: 9500, currencyCode: 'MUR', period: 'PerMonth' },
  location: { countryCode: 'MU', cityName: 'Rose Hill', neighborhoodName: 'Plateau', displayName: 'Plateau, Rose Hill' },
  coverImage: { mediaId: 'c0ffee00-0000-4000-8000-0000000000a4', role: 'Cover', order: 0 },
  publishedAt: '2026-11-18T09:00:00Z',
};

let api: MockAdapter;

beforeEach(() => {
  api = new MockAdapter(apiClient, { delayResponse: 0 });
  api.onGet('/guides/mine').reply(200, { data: { items: [], nextCursor: null, hasMore: false } });
  api.onGet('/marketplace/listings/mine').reply(200, { data: { items: [], nextCursor: null, hasMore: false } });
  api.onGet('/housing/listings/mine').reply(200, { data: { items: [HOME], nextCursor: null, hasMore: false } });
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

describe('an event', () => {
  it('is credited with the category it was given', async () => {
    const item = await itemOf('Event');

    expect(item.category).toBe(EVENT.categoryKey);
    expect(tipsFor(item)).not.toContain(HINT.category);
  });

  it('is credited with the date it starts', async () => {
    expect(tipsFor(await itemOf('Event'))).not.toContain(HINT.schedule);
  });

  it('is not asked for tags, which an event cannot have', async () => {
    expect(tipsFor(await itemOf('Event'))).not.toContain(HINT.tags);
  });

  it('scores in full when it is complete', async () => {
    const item = await itemOf('Event');

    expect(item.healthScore).toBe(100);
    expect(item.healthStatus).toBe('healthy');
  });
});

describe('a business', () => {
  it('is credited with its tags', async () => {
    const item = await itemOf('Provider');

    expect(item.tags).toEqual(BUSINESS.tags);
    expect(tipsFor(item)).not.toContain(HINT.tags);
  });

  it('scores in full when it is complete', async () => {
    expect((await itemOf('Provider')).healthScore).toBe(100);
  });
});

describe('a home', () => {
  it('is not asked for tags, which a home cannot have', async () => {
    expect(tipsFor(await itemOf('Housing'))).not.toContain(HINT.tags);
  });

  it('scores in full when it is complete', async () => {
    const item = await itemOf('Housing');

    expect(item.healthScore).toBe(100);
    expect(item.healthStatus).toBe('healthy');
  });
});
