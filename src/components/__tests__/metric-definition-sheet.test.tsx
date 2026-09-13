// ─────────────────────────────────────────────────────────────────────────────
// The definition sheet tells the truth about a real figure — 13 Sep 2026
//
// Found on the device. On Aisha's seller dashboard — real figures from
// `GET /analytics/sellers/me` — tapping "Conversions" opened a sheet saying the
// figure counted "a funnel's final step", was "recomputed once a day", was owned
// by B17, and came from nowhere: "Diaspora does not record this yet. Not a real
// measurement." Every line was false.
//
// Two causes, both between correct things:
//
//   **The sheet read only the shipped catalogue.** `useAnalyticsDefinitions`
//   reconciles the platform's own sentences into it, and the definitions screen
//   used that; the sheet beside every tile did not.
//
//   **"Where it comes from" read the metric's catalogue status**, which is about
//   the metric in general. Whether *this* number came from the platform or from a
//   development adapter is on the figure itself, and the sheet never looked.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { ANALYTICS_DEFINITIONS } from '@/lib/analytics/definitions';
import type { AnalyticsDefinition, AnalyticsMetric } from '@/types/analytics';

import { figureProvenance, useMetricDefinitionSheet } from '../analytics/MetricCards';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const mockCatalogue = jest.fn();

jest.mock('@/hooks/analytics', () => ({
  useAnalyticsDefinitions: () => mockCatalogue(),
}));

/** What `/analytics/definitions` serves for `conversion.count`, reconciled. */
const PLATFORM_CONVERSIONS: AnalyticsDefinition = {
  ...ANALYTICS_DEFINITIONS['conversion.count'],
  definition:
    'People who took the action your content asked for: an RSVP for an event, an application for a job, a purchase for a marketplace listing, a viewing for a housing listing.',
  owner: 'B9 Jobs, B10 Marketplace, B11 Housing and B12 Community Life',
  freshnessPolicy: 'Recomputed about every 30 seconds.',
  status: 'CONNECTED',
  gapKey: null,
};

function figure(source: 'backend' | 'simulated'): AnalyticsMetric {
  return {
    key: 'conversion.count',
    label: 'Conversions',
    value: { value: 4, source },
    format: 'count',
    computation: 'server-aggregate',
    higherIsBetter: true,
    comparison: null,
    freshness: {
      computedAt: '2026-09-13T09:00:00Z',
      sourceName: 'Diaspora analytics',
    },
    privacyClass: 'owner',
  };
}

function Opened({ metric }: { metric: AnalyticsMetric }) {
  const definitions = useMetricDefinitionSheet();

  useEffect(() => {
    definitions.open(metric);
    // Opened once, as a tap would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return definitions.sheet;
}

function renderSheet(metric: AnalyticsMetric, catalogue: AnalyticsDefinition[]) {
  mockCatalogue.mockReturnValue({ definitions: catalogue });

  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <Opened metric={metric} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

afterEach(() => {
  mockCatalogue.mockReset();
});

describe('the sheet beside a real figure', () => {
  it('says the platform’s sentence, not the shipped one', async () => {
    renderSheet(figure('backend'), [PLATFORM_CONVERSIONS]);

    expect(await screen.findByText(PLATFORM_CONVERSIONS.definition)).toBeTruthy();
    expect(screen.queryByText(ANALYTICS_DEFINITIONS['conversion.count'].definition)).toBeNull();
    expect(screen.getByText('B9 Jobs, B10 Marketplace, B11 Housing and B12 Community Life')).toBeTruthy();
    expect(screen.getByText('Recomputed about every 30 seconds.')).toBeTruthy();
  });

  it('calls a real figure real', async () => {
    renderSheet(figure('backend'), [PLATFORM_CONVERSIONS]);

    expect(await screen.findByText('A real Diaspora measurement.')).toBeTruthy();
    expect(screen.queryByText(/Diaspora does not record this yet/)).toBeNull();
  });

  it('calls a real figure real even where the catalogue is a release behind', async () => {
    // Offline, the reconciled catalogue is the shipped one, which still says this
    // metric is a gap. The number on screen came from the platform regardless.
    renderSheet(figure('backend'), [ANALYTICS_DEFINITIONS['conversion.count']]);

    expect(ANALYTICS_DEFINITIONS['conversion.count'].status).not.toBe('CONNECTED');
    expect(await screen.findByText('A real Diaspora measurement.')).toBeTruthy();
  });
});

describe('the sheet beside a simulated figure', () => {
  it('still says it is not a real measurement, whatever the catalogue says', async () => {
    // The other side. A connected metric shown from the development adapter in a
    // preview build is still an invented number.
    renderSheet(figure('simulated'), [PLATFORM_CONVERSIONS]);

    expect(await screen.findByText('A development adapter. Not a real measurement.')).toBeTruthy();
    expect(screen.queryByText('A real Diaspora measurement.')).toBeNull();
  });
});

describe('figureProvenance', () => {
  it('reads the figure, and only the figure', () => {
    expect(figureProvenance(figure('backend'))).toBe('A real Diaspora measurement.');
    expect(figureProvenance(figure('simulated'))).toBe('A development adapter. Not a real measurement.');
  });
});
