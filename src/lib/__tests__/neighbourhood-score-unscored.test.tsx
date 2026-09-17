// ─────────────────────────────────────────────────────────────────────────────
// An unassessed neighbourhood is not scored, not scored zero — 17 Sep 2026
//
// The server sends `overall: null` when nothing about a place has a source, and
// says why in its own comments: an unassessed neighbourhood must not read as a
// terrible one. The client turned that null into `{ value: 0, source:
// 'simulated' }`, so every neighbourhood page read "Overall 0/100 — a development
// estimate" beside the server's own note that nothing is estimated. Nobody saw it
// while the page 404'd; the day it opened, the emulator showed it.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import MockAdapter from 'axios-mock-adapter';
import { ThemeProvider } from '@/design-system';
import { apiClient } from '@/lib/apiClient';
import { NeighborhoodScorePanel } from '@/components/maps';
import { fetchNeighborhoodScore } from '@/lib/maps/geo-client';

const UNSCORED = {
  neighborhoodId: 'quatre-bornes-center',
  areaId: '7c0a4c7e-0000-4000-8000-000000000004',
  name: 'Quatre Bornes Center',
  cityName: 'Quatre Bornes',
  countryCode: 'MU',
  latitude: -20.2644,
  longitude: 57.4786,
  overall: null,
  dimensions: [],
  unavailableDimensions: [],
  resourceCounts: { housing: 1 },
  freshness: {
    computedAt: '2026-09-17T09:00:00Z',
    sourceName: 'Diaspora platform content',
    methodology: 'Composed on request from Diaspora’s own records. Nothing is estimated.',
  },
  nearbyNeighborhoodIds: [],
};

describe('a neighbourhood nothing has been assessed for', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient, { delayResponse: 0 });
    mock.onGet('/geo/neighborhoods/quatre-bornes-center/scores').reply(200, { data: UNSCORED });
  });

  afterEach(() => mock.restore());

  it('has no overall score, rather than a zero', async () => {
    const score = await fetchNeighborhoodScore('quatre-bornes-center');

    expect(score.overall).toBeNull();
  });

  it('reads "Not scored" and never "0/100" or "estimate"', async () => {
    const score = await fetchNeighborhoodScore('quatre-bornes-center');

    render(
      <ThemeProvider>
        <NeighborhoodScorePanel score={score} />
      </ThemeProvider>
    );

    expect(screen.getByTestId('score-overall-unscored')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByLabelText(/development estimate/)).toBeNull();
  });
});
