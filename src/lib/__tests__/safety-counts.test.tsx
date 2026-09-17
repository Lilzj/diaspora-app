// ─────────────────────────────────────────────────────────────────────────────
// Safety as sourced counts — 17 Sep 2026 (FRONTEND-MAPS-GAP-015)
//
// The user decided the platform publishes what named sources counted instead of
// a safety score. What matters here is what a member could misread: a source
// that could not be read must never show as zero, the two sources must stay
// apart, and every figure keeps its source, period, method and credit.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import MockAdapter from 'axios-mock-adapter';
import { ThemeProvider } from '@/design-system';
import { apiClient } from '@/lib/apiClient';
import { SafetyCountsPanel } from '@/components/maps';
import { fetchSafetyReport, fetchSafetyScore } from '@/lib/maps/geo-client';

const WIRE = {
  neighborhoodId: 'peckham',
  areaId: '7c0a4c7e-0000-4000-8000-000000000003',
  name: 'Peckham',
  isAvailable: false,
  score: null,
  band: null,
  breakdown: [],
  trend: null,
  unavailableReason: 'NoDataSource',
  limitations: ['Diaspora does not publish a safety score.'],
  counts: [
    {
      kind: 'community-reports',
      source: 'Diaspora community reports',
      isAvailable: true,
      from: '2026-06-19T09:00:00Z',
      to: '2026-09-17T09:00:00Z',
      area: 'Alerts filed in Peckham',
      method: 'Police and Emergency alerts members published in Peckham over the last 90 days…',
      total: 3,
      categories: [
        { id: 'Police', label: 'Police', count: 2 },
        { id: 'Emergency', label: 'Emergency', count: 1 },
      ],
    },
    {
      kind: 'police-recorded-crime',
      source: 'data.police.uk',
      isAvailable: false,
      unavailableReason: 'SourceUnavailable',
      area: "Within one mile of Peckham's centre",
      method: 'Street-level crimes recorded by the police within one mile…',
      licence: 'OGL-UK-3.0',
      attribution: 'Contains public sector information licensed under the Open Government Licence v3.0.',
      total: 0,
      categories: [{ id: 'burglary', label: 'Burglary', count: 0 }],
    },
  ],
};

describe('the safety read', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient, { delayResponse: 0 });
    mock.onGet('/geo/neighborhoods/peckham/safety').reply(200, { data: WIRE });
  });

  afterEach(() => mock.restore());

  it('keeps the counts and publishes no score', async () => {
    const report = await fetchSafetyReport('peckham');

    expect(report.score).toBeNull();
    expect(await fetchSafetyScore('peckham')).toBeNull();
    expect(report.counts.map((count) => count.kind)).toEqual(['community-reports', 'police-recorded-crime']);
    expect(report.counts[0].total).toBe(3);
    expect(report.limitations).toEqual(['Diaspora does not publish a safety score.']);
  });

  it('never reads a source it could not read as zero, whatever the wire says', async () => {
    const report = await fetchSafetyReport('peckham');
    const police = report.counts[1];

    expect(police.isAvailable).toBe(false);
    expect(police.total).toBeNull();
    expect(police.categories).toEqual([]);
    expect(police.attribution).toContain('Open Government Licence');
  });
});

describe('the safety counts panel', () => {
  async function renderPanel() {
    const mock = new MockAdapter(apiClient, { delayResponse: 0 });
    mock.onGet('/geo/neighborhoods/peckham/safety').reply(200, { data: WIRE });
    const report = await fetchSafetyReport('peckham');
    mock.restore();

    render(
      <ThemeProvider>
        <SafetyCountsPanel counts={report.counts} limitations={report.limitations} />
      </ThemeProvider>
    );
  }

  it('says there is no score before it shows a figure', async () => {
    await renderPanel();

    expect(screen.getByText(/does not give places a safety score/)).toBeTruthy();
  });

  it('shows each source on its own, with the figure and its categories', async () => {
    await renderPanel();

    expect(screen.getByTestId('safety-count-community-reports')).toBeTruthy();
    expect(screen.getByLabelText(/^3 counted\. Alerts filed in Peckham/)).toBeTruthy();
    expect(screen.getByText('Police')).toBeTruthy();
  });

  it('explains a source that could not be read instead of showing a number', async () => {
    await renderPanel();

    expect(screen.getByTestId('safety-count-unavailable-police-recorded-crime')).toBeTruthy();
    expect(screen.getByText(/could not be read just now/)).toBeTruthy();
    // The licence credit stays with the source even when there is no figure.
    expect(screen.getByText(/Open Government Licence/)).toBeTruthy();
  });

  it('renders the platform’s limitations verbatim', async () => {
    await renderPanel();

    expect(screen.getByText('What this does not tell you')).toBeTruthy();
    expect(screen.getByText('• Diaspora does not publish a safety score.')).toBeTruthy();
  });
});
