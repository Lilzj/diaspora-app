// ─────────────────────────────────────────────────────────────────────────────
// Cost of living from Diaspora's own listings — 17 Sep 2026 (FRONTEND-MAPS-GAP-014)
//
// The platform now publishes one cost category: rent, the median asking rent
// of the homes listed in a neighbourhood against its country's, where enough
// are listed. It publishes no overall figure. The client used to treat "no
// overall figure" as "nothing to show", so a published rent index would have
// been thrown away on arrival; and it dropped every figure's method, limitations
// and sample size on the way in.
//
// Also here: the neighbourhood screen reads the Location hub, whose unassessed
// figures are null and must not render as "null/100".
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import MockAdapter from 'axios-mock-adapter';
import { ThemeProvider } from '@/design-system';
import { apiClient } from '@/lib/apiClient';
import { CostOfLivingPanel } from '@/components/maps';
import { fetchCostOfLiving, fetchCostOfLivingAnswer } from '@/lib/maps/geo-client';
import { toNeighborhoodOverview } from '@/lib/maps-api';
import type { CostOfLivingIndex } from '@/types/maps';

const RENT_WIRE = {
  neighborhoodId: 'peckham',
  areaId: '7c0a4c7e-0000-4000-8000-000000000001',
  name: 'Peckham',
  isAvailable: true,
  band: null,
  bandScore: null,
  overallIndex: null,
  baselineName: 'the median asking rent of homes listed on Diaspora in United Kingdom',
  currency: 'GBP',
  categories: [
    { id: 'housing', label: 'Rent', index: 213, typicalMonthlyAmount: 1700, typicalMonthlyCurrency: 'GBP' },
  ],
  freshness: {
    computedAt: '2026-09-17T09:00:00Z',
    sourceName: 'Diaspora listings',
    methodology: 'The median monthly asking rent of the 5 homes to rent listed on Diaspora in Peckham…',
    limitations: ['Housing only. Food, transport, utilities, healthcare and leisure are not measured.'],
    validUntil: '2026-09-18T09:00:00Z',
    sampleSize: 5,
  },
};

describe('the cost of living read', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient, { delayResponse: 0 });
  });

  afterEach(() => mock.restore());

  it('keeps a rent index that comes with no overall figure', async () => {
    mock.onGet('/geo/neighborhoods/peckham/cost-of-living').reply(200, { data: RENT_WIRE });

    const index = await fetchCostOfLiving('peckham');

    expect(index).not.toBeNull();
    expect(index!.overallIndex).toBeNull();
    expect(index!.categories).toEqual([
      { id: 'housing', label: 'Rent', index: 213, typicalMonthly: { amount: 1700, currency: 'GBP' } },
    ]);
  });

  it('keeps how the figure was made, what it cannot say and how many homes are behind it', async () => {
    mock.onGet('/geo/neighborhoods/peckham/cost-of-living').reply(200, { data: RENT_WIRE });

    const index = await fetchCostOfLiving('peckham');

    expect(index!.freshness.sourceName).toBe('Diaspora listings');
    expect(index!.freshness.methodology).toContain('5 homes');
    expect(index!.freshness.limitations).toHaveLength(1);
    expect(index!.freshness.sampleSize).toBe(5);
    expect(index!.freshness.validUntil).toBe('2026-09-18T09:00:00Z');
  });

  it('is nothing when no category is published, and keeps the platform’s reason', async () => {
    const reason =
      'No rent index is published for Brixton: it has 2 homes to rent listed on Diaspora and its country has 2; an index needs at least 5 here and 20 in the country.';

    mock.onGet('/geo/neighborhoods/brixton/cost-of-living').reply(200, {
      data: {
        ...RENT_WIRE,
        neighborhoodId: 'brixton',
        isAvailable: false,
        categories: [],
        currency: null,
        freshness: { ...RENT_WIRE.freshness, methodology: reason, sampleSize: 2 },
      },
    });

    expect(await fetchCostOfLiving('brixton')).toBeNull();
    expect(await fetchCostOfLivingAnswer('brixton')).toEqual({ index: null, unavailableReason: reason });
  });
});

describe('a rent-only cost panel', () => {
  const index: CostOfLivingIndex = {
    neighborhoodId: 'peckham',
    name: 'Peckham',
    overallIndex: null,
    baselineName: 'the median asking rent of homes listed on Diaspora in United Kingdom',
    currency: 'GBP',
    categories: [{ id: 'housing', label: 'Rent', index: 213, typicalMonthly: { amount: 1700, currency: 'GBP' } }],
    freshness: {
      computedAt: '2026-09-17T09:00:00Z',
      sourceName: 'Diaspora listings',
      methodology: 'The median monthly asking rent of the 5 homes to rent listed on Diaspora in Peckham.',
      sampleSize: 5,
    },
  };

  function renderPanel() {
    return render(
      <ThemeProvider>
        <CostOfLivingPanel index={index} />
      </ThemeProvider>
    );
  }

  it('heads with the rent index under its own name and against its baseline', () => {
    renderPanel();

    expect(
      screen.getByLabelText(
        'Rent index 213, which is 113 percent above the median asking rent of homes listed on Diaspora in United Kingdom.'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/Overall cost of living/)).toBeNull();
  });

  it('names the categories nothing measures instead of leaving them out', () => {
    renderPanel();

    expect(screen.getByTestId('cost-unmeasured').props.children.join('')).toContain(
      'Food, Transport, Utilities, Healthcare, Leisure'
    );
  });

  it('shows the typical asking rent in its own currency', () => {
    renderPanel();

    expect(screen.getByTestId('cost-typical-rent')).toBeTruthy();
  });
});

describe('the neighbourhood page read', () => {
  it('reads unassessed figures as absent, not as zero or as "null"', () => {
    const overview = toNeighborhoodOverview({
      id: 'rose-hill-central',
      areaId: '7c0a4c7e-0000-4000-8000-000000000002',
      name: 'Rose Hill Central',
      cityName: null,
      countryName: 'Mauritius',
      countryCode: 'MU',
      latitude: null,
      longitude: null,
      overview: null,
      stats: { safetyScore: null, walkability: null, costOfLiving: null },
      resourceCounts: { housing: 2 },
    });

    expect(overview.cityName).toBe('');
    expect(Number.isNaN(overview.latitude)).toBe(true);
    expect(overview.overview).toBe('');
    expect(overview.stats).toEqual({ safetyScore: null, walkability: null, costOfLiving: null });
    expect(overview.resourceCounts).toEqual({ housing: 2 });
  });
});
