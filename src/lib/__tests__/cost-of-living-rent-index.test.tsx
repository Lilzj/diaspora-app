// ─────────────────────────────────────────────────────────────────────────────
// Cost of living from Diaspora's own listings — 17 Sep 2026 (FRONTEND-MAPS-GAP-014)
//
// The platform publishes one cost category: rent, the median asking rent of the
// homes listed in an area against its country's, where enough are listed. It
// publishes no overall figure. The client used to treat "no overall figure" as
// "nothing to show", so a published rent index would have been thrown away on
// arrival; and it dropped every figure's method, limitations and sample size.
//
// Since 14 Oct 2026 the figure arrives on `GET /geo/area`, for the circle around
// a point, and too few listings is the reason `InsufficientSample`.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import MockAdapter from 'axios-mock-adapter';
import { ThemeProvider } from '@/design-system';
import { apiClient } from '@/lib/apiClient';
import { CostOfLivingPanel } from '@/components/maps';
import { fetchAreaReport } from '@/lib/maps/geo-client';
import { costOfLivingUnavailableText } from '@/lib/maps/area-copy';
import type { CostOfLivingIndex } from '@/types/maps';

const FRESHNESS = {
  computedAt: '2026-09-17T09:00:00Z',
  sourceName: 'Diaspora listings',
  methodology: 'The median monthly asking rent of the 5 homes to rent listed on Diaspora within 2 km…',
  limitations: ['Housing only. Food, transport, utilities, healthcare and leisure are not measured.'],
  validUntil: '2026-09-18T09:00:00Z',
  sampleSize: 5,
};

const RENT = {
  isAvailable: true,
  unavailableReason: null,
  sampleSize: 5,
  countrySampleSize: 31,
  overallIndex: null,
  baselineName: 'the median asking rent of homes listed on Diaspora in United Kingdom',
  currency: 'GBP',
  categories: [
    { id: 'housing', label: 'Rent', index: 213, typicalMonthlyAmount: 1700, typicalMonthlyCurrency: 'GBP' },
  ],
  freshness: FRESHNESS,
};

function areaWire(costOfLiving: object) {
  return {
    latitude: 51.4735,
    longitude: -0.0691,
    radiusKm: 2,
    countryCode: 'GB',
    countryName: 'United Kingdom',
    name: null,
    displayName: 'Within 2 km of you',
    resourceCounts: { housing: 5 },
    overall: null,
    dimensions: [],
    unavailableDimensions: [],
    costOfLiving,
    safety: { isAvailable: false, score: null, band: null, unavailableReason: 'NoDataSource', counts: [], limitations: [] },
    freshness: FRESHNESS,
  };
}

const POINT = { latitude: 51.4735, longitude: -0.0691, countryCode: 'GB' };

describe('the cost of living read', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient, { delayResponse: 0 });
  });

  afterEach(() => mock.restore());

  it('keeps a rent index that comes with no overall figure', async () => {
    mock.onGet('/geo/area').reply(200, { data: areaWire(RENT) });

    const { costOfLiving } = await fetchAreaReport(POINT);

    expect(costOfLiving.index).not.toBeNull();
    expect(costOfLiving.unavailableReason).toBeNull();
    expect(costOfLiving.index!.overallIndex).toBeNull();
    expect(costOfLiving.index!.categories).toEqual([
      { id: 'housing', label: 'Rent', index: 213, typicalMonthly: { amount: 1700, currency: 'GBP' } },
    ]);
  });

  it('keeps how the figure was made, what it cannot say and how many homes are behind it', async () => {
    mock.onGet('/geo/area').reply(200, { data: areaWire(RENT) });

    const { costOfLiving } = await fetchAreaReport(POINT);
    const index = costOfLiving.index!;

    expect(index.freshness.sourceName).toBe('Diaspora listings');
    expect(index.freshness.methodology).toContain('5 homes');
    expect(index.freshness.limitations).toHaveLength(1);
    expect(index.freshness.sampleSize).toBe(5);
    expect(index.freshness.validUntil).toBe('2026-09-18T09:00:00Z');
    expect(costOfLiving.sampleSize).toBe(5);
    expect(costOfLiving.countrySampleSize).toBe(31);
  });

  it('is nothing when too few homes are listed, and says "not enough nearby listings yet"', async () => {
    mock.onGet('/geo/area').reply(200, {
      data: areaWire({
        ...RENT,
        isAvailable: false,
        unavailableReason: 'InsufficientSample',
        sampleSize: 2,
        countrySampleSize: 2,
        categories: [],
        currency: null,
      }),
    });

    const { costOfLiving } = await fetchAreaReport(POINT);

    expect(costOfLiving.index).toBeNull();
    expect(costOfLiving.unavailableReason).toBe('InsufficientSample');
    const text = costOfLivingUnavailableText(costOfLiving);
    expect(text).toMatch(/^Not enough nearby listings yet/);
    expect(text).toContain('2 homes are listed to rent in this area and 2 in the country');
    // Never a figure guessed from a thin sample.
    expect(text).not.toMatch(/index of|\d+%/);
  });

  it('never publishes an index the server marked unavailable, whatever categories arrive', async () => {
    mock.onGet('/geo/area').reply(200, {
      data: areaWire({ ...RENT, isAvailable: false, unavailableReason: 'InsufficientSample' }),
    });

    const { costOfLiving } = await fetchAreaReport(POINT);

    expect(costOfLiving.index).toBeNull();
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
