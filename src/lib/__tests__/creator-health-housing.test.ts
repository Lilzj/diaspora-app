// ─────────────────────────────────────────────────────────────────────────────
// Content Health on a home that has photographs — Android UAT, 3 Nov 2026
//
// "3 bedroom duplex for rent" had photographs, and the Content Health Center
// said "Add a photograph. Members scroll past items they cannot see." — twice,
// as the tip's title and again as its description — and its Edit button opened
// the empty new-listing wizard instead of the listing's own photos.
//
// The workspace read `coverMediaId`, `rent` and `location.neighbourhood` from
// `GET /housing/listings/mine`; the housing card sends `coverImage.mediaId`,
// `price` and `location.neighborhoodName`. The row below is the card's shape
// (`HousingListingCardResponse`), trimmed to the fields that matter.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import { fetchWorkspaceContent } from '../creator/workspace';
import { assess, type HealthRubric } from '../creator/health';
import { editorRouteFor } from '../creator/editor-route';
import type { UnifiedContentItem } from '@/types/creator';

const HOUSING_CARD = {
  id: '5b0f3c1e-9d77-4b8e-a1d2-0c3b2a7e9f10',
  title: '3 bedroom duplex for rent',
  summary: 'Spacious duplex near the beach',
  status: 'Published',
  accommodationTypeKey: 'duplex',
  price: { isDisclosed: true, amount: 25000, currencyCode: 'MUR' },
  location: { countryCode: 'MU', cityName: null, neighborhoodName: 'Grand Baie' },
  coverImage: { mediaId: 'f2b7a0c4-3e1d-4c2a-9b8f-7d6e5c4b3a21' },
  publishedAt: '2026-10-30T09:00:00Z',
};

const RUBRIC: HealthRubric = {
  version: 1,
  healthyAtOrAbove: 80,
  needsWorkBelow: 50,
  criteria: [
    { key: 'cover-image', field: 'coverImage', weight: 40, appliesTo: [], hint: 'Add a photograph. Members scroll past items they cannot see.' },
    { key: 'summary', field: 'summary', weight: 20, appliesTo: [], hint: 'Write a summary. It is what appears in search results.' },
  ],
} as unknown as HealthRubric;

let api: MockAdapter;

beforeEach(() => {
  api = new MockAdapter(apiClient);
  api.onGet('/guides/mine').reply(200, { data: { items: [] } });
  api.onGet('/marketplace/listings/mine').reply(200, { data: { items: [] } });
  api.onGet('/housing/listings/mine').reply(200, { data: { items: [HOUSING_CARD] } });
  api.onGet('/community-life/events/mine').reply(200, { data: { items: [] } });
  api.onGet('/providers/me').reply(404, {});
  api.onGet('/creators/content-health/rubric').reply(404, {});
});

afterEach(() => api.restore());

async function housingItem(): Promise<UnifiedContentItem> {
  const content = await fetchWorkspaceContent({ id: 'me', type: 'personal', name: 'Zoe' } as never);
  const item = content.items.find((candidate) => candidate.contentType === 'Housing');
  if (!item) throw new Error('no housing item');
  return item;
}

describe('a home read from the housing card', () => {
  it('has the photograph the card sends', async () => {
    expect((await housingItem()).thumbnail).toBe(HOUSING_CARD.coverImage.mediaId);
  });

  it('has its price and its area', async () => {
    const item = await housingItem();

    expect(item.price).toBe('MUR 25000');
    expect(item.location).toBe('Grand Baie');
  });

  it('is not told to add a photograph it has', async () => {
    const health = assess(await housingItem(), RUBRIC);

    expect(health.recommendations.map((rec) => rec.title)).not.toContain(RUBRIC.criteria[0].hint);
  });
});

describe('a tip', () => {
  it('is said once, not as its title and again as its description', () => {
    const bare = { id: 'x', contentType: 'Housing', title: 'A home' } as UnifiedContentItem;
    const [tip] = assess(bare, RUBRIC).recommendations;

    expect(tip.title).toBe(RUBRIC.criteria[0].hint);
    expect(tip.description).toBe('');
  });
});

describe('where a tip’s Edit button goes', () => {
  const item = (contentType: string) => ({ id: 'abc', contentType } as UnifiedContentItem);

  it("opens the item's own editor, at its photos when the tip is about photos", () => {
    expect(editorRouteFor(item('Housing'), 'photos')).toBe('/housing/edit/abc?focus=photos');
    expect(editorRouteFor(item('Housing'))).toBe('/housing/edit/abc');
    expect(editorRouteFor(item('Marketplace'), 'photos')).toBe('/marketplace/edit/abc?focus=photos');
    expect(editorRouteFor(item('Guide'))).toBe('/guide/edit/abc');
  });

  it('never opens the new-listing wizard', () => {
    const fs = require('fs');
    const path = require('path');
    const studio: string = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'creator', 'index.tsx'), 'utf8');

    expect(studio).not.toContain("router.push('/housing/create')");
  });
});
