// RMD-009, Community Life. The Directory and Community search read the rows of
// `GET /community-life/organizations` as `CommunityOrganization`, whose `id`,
// `category`, `logo` and `followersCount` the route does not send. Every card
// opened `/community-life/org/undefined` and printed "undefined followers".
//
// `ROW` is typed `OrganizationSearchCard`, which `backend-response-field-drift`
// holds to the published `OrganizationSummaryResponse`. A field this file
// relies on that the server stopped sending fails that suite; it cannot pass
// here on a copy of what the screens used to expect.

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../transport/apiClient';
import { setupCommunityLifeMocks } from '@/mocks/handlers/community-life';
import { fetchOrganizations } from '../api/community-life-api';
import {
  organizationArea,
  organizationKind,
  organizationLine,
  organizationSearchResult,
} from '../domain/organization-summary';
import type { OrganizationSearchCard } from '@/types/community-life';

const LOGO = '5d1c3a2e-8f4b-4c6d-9e7a-1b2c3d4e5f60';

const ROW: OrganizationSearchCard = {
  organizationId: 'org-7',
  name: 'Peckham Yoruba Association',
  organizationTypeKey: 'cultural-association',
  location: {
    countryCode: 'GB',
    cityName: 'London',
    neighborhoodName: 'Peckham',
    latitude: 51.4742,
    longitude: -0.0691,
  },
  logoMediaId: LOGO,
  isVerified: true,
  memberCount: 42,
};

describe('an organisation row, as the Directory and Community search draw it', () => {
  it('opens the organisation the row names', () => {
    const result = organizationSearchResult(ROW);

    expect(result.entityId).toBe('org-7');
    expect(result.actionRoute).toBe('/community-life/org/org-7');
  });

  it('names the kind of organisation from its type key', () => {
    expect(organizationKind(ROW)).toBe('Cultural association');
    expect(organizationSearchResult(ROW).subtitle).toBe('Cultural association');
    expect(organizationSearchResult({ ...ROW, organizationTypeKey: null }).subtitle).toBeNull();
  });

  it('places it in its neighbourhood, or its city when the row names none', () => {
    expect(organizationArea(ROW)).toBe('Peckham');
    expect(organizationArea({ location: { cityName: 'London' } })).toBe('London');
    expect(organizationArea({ location: null })).toBe('');
  });

  it('counts members, because the row has no follower count', () => {
    expect(organizationLine(ROW)).toBe('Peckham · 42 members');
    expect(organizationLine({ ...ROW, memberCount: 1 })).toBe('Peckham · 1 member');
    // A row without the count says where, not "undefined members".
    expect(organizationLine({ ...ROW, memberCount: null })).toBe('Peckham');
  });

  it('loads the logo from its media id and claims no distance', () => {
    const result = organizationSearchResult(ROW);

    expect(result.imageUrl).toMatch(new RegExp(`/media/${LOGO}/content$`));
    expect(organizationSearchResult({ ...ROW, logoMediaId: null }).imageUrl).toBeNull();
    expect(result.distanceKm).toBeNull();
  });
});

describe('the development browse', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient, { delayResponse: 0 });
    setupCommunityLifeMocks(mock);
  });

  afterEach(() => mock.restore());

  it('serves the rows the route sends, so every card opens a real organisation', async () => {
    // The handler served its fixtures as they are, `id` and all, which is why
    // the Directory worked in development and not against the server.
    const page = await fetchOrganizations();

    expect(page.items.length).toBeGreaterThan(0);
    for (const row of page.items) {
      expect(row.organizationId).toMatch(/\S/);
      expect(row).not.toHaveProperty('id');
      expect(organizationSearchResult(row).actionRoute).toBe(
        `/community-life/org/${row.organizationId}`
      );
    }
  });
});
