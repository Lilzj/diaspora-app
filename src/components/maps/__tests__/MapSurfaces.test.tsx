// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — map component and accessibility tests (Frontend Phase 8)
//
// §50 is the section most of this file serves: maps must not be the only way to
// discover information, every marker needs a description, and legends and heat
// maps need a textual equivalent. Those are assertions about the accessibility
// tree, so they are tested against the accessibility tree.
//
// The other half is §21/§23/§25/§26: a simulated figure must be marked, and a
// safety score must carry its source, its date and its limitations. Those are
// tested by rendering the panels and asserting the caveats are present — a
// component that could render a safety number without them is the failure mode
// §26 describes.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/design-system';
import {
  AlertCard,
  CategoryFilterBar,
  CostOfLivingPanel,
  EstimateQualifier,
  FreshnessNote,
  HeatMapLegend,
  LocationPermissionCard,
  MapErrorState,
  MapModeSwitcher,
  MapResultList,
  MapsGapNotice,
  MarkerCallout,
  NavigationBanner,
  SafetyScorePanel,
  SourceBadge,
  SourcedFigure,
  TravelEstimateRow,
} from '@/components/maps';
import { initialNavigationState } from '@/lib/maps/navigation-machine';
import { routeDistance, toSafetyBand, type CommunityAlert, type MapSearchResult } from '@/types/maps';

function renderWithTheme(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

const freshness = {
  computedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  sourceName: 'Diaspora community reports',
  methodology: 'Aggregated from community reports for this neighbourhood.',
  limitations: [
    'A community-reported figure, not an official crime statistic.',
    'It says nothing about a particular street or time of day.',
  ],
  sampleSize: 42,
};

function makeResult(overrides: Partial<MapSearchResult['marker']> = {}): MapSearchResult {
  return {
    category: 'housing',
    detail: '2 bed · Furnished',
    marker: {
      id: 'housing:1',
      category: 'housing',
      coordinate: { latitude: 51.4742, longitude: -0.0691, precision: 'approximate' },
      title: 'Bright two-bedroom flat',
      subtitle: 'Flat · Peckham',
      badge: '£1.4k',
      accessibilityLabel:
        'Bright two-bedroom flat, Flat, 2 bedrooms, in Peckham, £1.4k a month, 400 metres away. Approximate location.',
      source: 'backend',
      isPrivacyReduced: true,
      destination: { pathname: '/housing/[id]', params: { id: '1' } },
      ...overrides,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// §50 — THE ACCESSIBLE ALTERNATIVE
// ═════════════════════════════════════════════════════════════════════════════

describe('the mode switcher is the route to the list — §50', () => {
  it('exposes three tabs with the selected one marked', () => {
    const onChange = jest.fn();
    renderWithTheme(<MapModeSwitcher mode="map" onChange={onChange} />);

    const list = screen.getByLabelText('List view');
    expect(list).toBeTruthy();
    expect(screen.getByLabelText('Map view').props.accessibilityState.selected).toBe(true);
    expect(list.props.accessibilityState.selected).toBe(false);
  });

  it('switches to the list', () => {
    const onChange = jest.fn();
    renderWithTheme(<MapModeSwitcher mode="map" onChange={onChange} />);

    fireEvent.press(screen.getByLabelText('List view'));
    expect(onChange).toHaveBeenCalledWith('list');
  });
});

describe('the result list reads out the same information as the map — §11, §50', () => {
  it('uses the marker’s own sentence rather than composing a second one', () => {
    // One label, one place to get it right. A row that built its own would
    // drift from the pin's.
    const result = makeResult();
    renderWithTheme(
      <MapResultList results={[result]} onSelect={jest.fn()} onOpen={jest.fn()} />
    );

    expect(screen.getByLabelText(result.marker.accessibilityLabel)).toBeTruthy();
  });

  it('marks the selected row so the map and list agree', () => {
    const result = makeResult();
    renderWithTheme(
      <MapResultList
        results={[result]}
        selectedMarkerId="housing:1"
        selectionOrigin="map"
        onSelect={jest.fn()}
        onOpen={jest.fn()}
      />
    );

    expect(
      screen.getByLabelText(result.marker.accessibilityLabel).props.accessibilityState.selected
    ).toBe(true);
  });

  it('reports the selection as coming from the list, so the map does not echo it', () => {
    // §11's infinite loop: the list scrolls to a selection, which fires a
    // selection, which scrolls the list. The origin is what breaks it.
    const onSelect = jest.fn();
    const result = makeResult();

    renderWithTheme(<MapResultList results={[result]} onSelect={onSelect} onOpen={jest.fn()} />);
    fireEvent.press(screen.getByLabelText(result.marker.accessibilityLabel));

    expect(onSelect).toHaveBeenCalledWith(result);
  });

  it('shows the approximation caveat for a privacy-reduced pin — §32, §39', () => {
    renderWithTheme(
      <MapResultList results={[makeResult()]} onSelect={jest.fn()} onOpen={jest.fn()} />
    );
    expect(screen.getByText('Approximate')).toBeTruthy();
  });
});

describe('the marker callout', () => {
  it('offers open, directions and share with named labels', () => {
    const result = makeResult();
    renderWithTheme(
      <MarkerCallout
        result={result}
        onOpen={jest.fn()}
        onClose={jest.fn()}
        onNavigate={jest.fn()}
        onShare={jest.fn()}
      />
    );

    expect(screen.getByLabelText('Open Bright two-bedroom flat')).toBeTruthy();
    expect(screen.getByLabelText('Get directions to Bright two-bedroom flat')).toBeTruthy();
    expect(screen.getByLabelText('Share Bright two-bedroom flat')).toBeTruthy();
    expect(screen.getByLabelText('Close this preview')).toBeTruthy();
  });

  it('renders nothing without a selection', () => {
    renderWithTheme(<MarkerCallout result={null} onOpen={jest.fn()} onClose={jest.fn()} />);
    expect(screen.queryByTestId('marker-callout')).toBeNull();
  });
});

describe('category filters', () => {
  it('reports the count in the label, and omits it when the server could not say', () => {
    renderWithTheme(
      <CategoryFilterBar
        categories={['housing', 'job']}
        active={['housing']}
        counts={{ housing: 12 }}
        onToggle={jest.fn()}
      />
    );

    expect(screen.getByLabelText('Homes, 12 on the map')).toBeTruthy();
    // Jobs has no count — "we could not ask" is not "there are none", and a
    // confident 0 would conflate them.
    expect(screen.getByLabelText('Jobs')).toBeTruthy();
  });

  it('marks the active filters as checked', () => {
    renderWithTheme(
      <CategoryFilterBar
        categories={['housing', 'job']}
        active={['housing']}
        onToggle={jest.fn()}
      />
    );

    expect(screen.getByLabelText('Homes').props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText('Jobs').props.accessibilityState.checked).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §5 — PERMISSION STATES
// ═════════════════════════════════════════════════════════════════════════════

describe('the permission card offers only the action that can work — §5', () => {
  const handlers = {
    onRequest: jest.fn(),
    onOpenSettings: jest.fn(),
    onRetry: jest.fn(),
    onContinueWithout: jest.fn(),
  };

  const base = { accuracy: 'unknown' as const, canOpenSettings: true, checkedAt: null };

  it('offers a prompt when nothing has been asked yet', () => {
    renderWithTheme(
      <LocationPermissionCard
        permission={{ ...base, status: 'notRequested' }}
        isResolving={false}
        {...handlers}
      />
    );
    expect(screen.getByLabelText('Use my location')).toBeTruthy();
    expect(screen.queryByLabelText('Open settings')).toBeNull();
  });

  it('offers settings — not a retry — for a permanent denial', () => {
    // A retry here is a button that cannot succeed, which teaches members that
    // this app's buttons do nothing.
    renderWithTheme(
      <LocationPermissionCard
        permission={{ ...base, status: 'deniedPermanently' }}
        isResolving={false}
        {...handlers}
      />
    );
    expect(screen.getByLabelText('Open settings')).toBeTruthy();
    expect(screen.queryByLabelText('Use my location')).toBeNull();
  });

  it('offers settings when location services are off entirely', () => {
    renderWithTheme(
      <LocationPermissionCard
        permission={{ ...base, status: 'servicesDisabled' }}
        isResolving={false}
        {...handlers}
      />
    );
    expect(screen.getByLabelText('Open settings')).toBeTruthy();
  });

  it('always offers a way to continue without location — §5', () => {
    for (const status of [
      'notRequested',
      'denied',
      'deniedPermanently',
      'servicesDisabled',
      'unavailable',
    ] as const) {
      const { unmount } = renderWithTheme(
        <LocationPermissionCard
          permission={{ ...base, status }}
          isResolving={false}
          {...handlers}
        />
      );

      expect(
        screen.getByLabelText(
          'Continue without using my location, and choose a neighbourhood instead'
        )
      ).toBeTruthy();
      unmount();
    }
  });

  it('says when the position is simulated', () => {
    renderWithTheme(
      <LocationPermissionCard
        permission={{ ...base, status: 'notRequested' }}
        isResolving={false}
        isSimulated
        {...handlers}
      />
    );
    expect(screen.getByText(/MAP-PROVIDER-GAP-002/)).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §44, §54 — ERROR STATES
// ═════════════════════════════════════════════════════════════════════════════

describe('error states name the failure and offer the right recovery — §44', () => {
  it('offers a retry for a transient failure', () => {
    const onRetry = jest.fn();
    renderWithTheme(<MapErrorState kind="network-unavailable" onRetry={onRetry} />);

    fireEvent.press(screen.getByLabelText('Try again'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('offers no retry for a route that cannot exist', () => {
    // A retry cannot conjure a road across the sea.
    renderWithTheme(<MapErrorState kind="no-route" onRetry={jest.fn()} />);
    expect(screen.queryByLabelText('Try again')).toBeNull();
  });

  it('offers to widen the search when there is simply nothing here', () => {
    const onWiden = jest.fn();
    renderWithTheme(<MapErrorState kind="no-results" onWiden={onWiden} />);

    fireEvent.press(screen.getByLabelText('Widen the search'));
    expect(onWiden).toHaveBeenCalled();
  });

  it('announces itself as an alert to assistive technology', () => {
    renderWithTheme(<MapErrorState kind="offline" />);
    expect(screen.getByTestId('map-error-offline').props.accessibilityRole).toBe('alert');
  });

  it('never leaks a provider name or a status code', () => {
    for (const kind of ['provider-unavailable', 'rate-limited', 'quota-exceeded'] as const) {
      const { unmount } = renderWithTheme(<MapErrorState kind={kind} />);
      const label = screen.getByTestId(`map-error-${kind}`).props.accessibilityLabel as string;

      expect(label).not.toMatch(/google|mapbox|apple|osm/i);
      expect(label).not.toMatch(/\b[45]\d{2}\b/);
      unmount();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §21–§26 — PROVENANCE
// ═════════════════════════════════════════════════════════════════════════════

describe('provenance markers', () => {
  it('marks a simulated figure and leaves a real one alone', () => {
    const { unmount } = renderWithTheme(
      <SourcedFigure value={{ value: 72, source: 'simulated', gapKey: 'x' }} label="Overall" />
    );
    expect(screen.getByText('Estimate')).toBeTruthy();
    unmount();

    renderWithTheme(<SourcedFigure value={{ value: 84, source: 'backend' }} label="Safety" />);
    expect(screen.queryByText('Estimate')).toBeNull();
  });

  it('says so in the accessibility label too, not only visually', () => {
    renderWithTheme(
      <SourcedFigure value={{ value: 72, source: 'simulated' }} label="Overall" suffix="/100" />
    );
    expect(
      screen.getByLabelText(
        'Overall: 72/100. This is a development estimate, not a real measurement.'
      )
    ).toBeTruthy();
  });

  it('badges simulated rows and stays silent on real ones', () => {
    const { unmount } = renderWithTheme(<SourceBadge source="simulated" />);
    expect(screen.getByText('Preview data')).toBeTruthy();
    unmount();

    renderWithTheme(<SourceBadge source="backend" />);
    expect(screen.queryByText('Preview data')).toBeNull();
  });

  it('renders the gap notice with its identifier in a development build', () => {
    // Fixture note: needs a gap that is still open. `heatMapAggregates` carries
    // coverage: 'full' — the backend has all of it and the client uses it — so
    // the notice correctly renders nothing once that is marked.
    renderWithTheme(<MapsGapNotice gapKey="offlineMapData" />);
    expect(screen.getByText(/FRONTEND-MAPS-GAP-021/)).toBeTruthy();
  });

  it('renders nothing for an unknown gap key', () => {
    renderWithTheme(<MapsGapNotice gapKey="not-a-real-gap" />);
    expect(screen.queryByTestId('maps-gap-notice-not-a-real-gap')).toBeNull();
  });
});

describe('freshness — §23, §25, §26', () => {
  it('shows the source, the date and every limitation in full', () => {
    renderWithTheme(<FreshnessNote freshness={freshness} />);

    expect(screen.getByText(/Diaspora community reports/)).toBeTruthy();
    expect(screen.getByText(/42 data points/)).toBeTruthy();
    // In full, not truncated and not behind a disclosure.
    for (const limitation of freshness.limitations) {
      expect(screen.getByText(`• ${limitation}`)).toBeTruthy();
    }
  });

  it('flags a figure past its validity as historical', () => {
    renderWithTheme(
      <FreshnessNote
        freshness={{ ...freshness, validUntil: new Date(Date.now() - 1000).toISOString() }}
      />
    );
    expect(screen.getByText('Out of date — treat as historical')).toBeTruthy();
  });
});

describe('the safety panel cannot render a score without its caveats — §26', () => {
  // Mirrors the real handler: the panel carries the full provenance, and each
  // breakdown dimension carries only its own date and source. Repeating the
  // limitations on every row would be noise, and the panel is where §26 wants
  // them.
  const dimensionFreshness = {
    computedAt: new Date().toISOString(),
    sourceName: 'Diaspora community data',
  };

  const score = {
    neighborhoodId: 'peckham',
    name: 'Peckham',
    score: 84,
    band: toSafetyBand(84),
    breakdown: [
      {
        id: 'community-activity' as const,
        label: 'Community presence',
        score: 61,
        explanation: '3 organizations and 4 events within 5 km.',
        freshness: dimensionFreshness,
      },
    ],
    freshness,
  };

  it('shows the number, the source, the methodology and the limitations together', () => {
    renderWithTheme(<SafetyScorePanel score={score} />);

    expect(screen.getByText('84')).toBeTruthy();
    expect(screen.getByText(/Diaspora community reports/)).toBeTruthy();
    expect(screen.getByText(/Aggregated from community reports/)).toBeTruthy();
    expect(screen.getByText('What this does not tell you')).toBeTruthy();
    for (const limitation of freshness.limitations) {
      expect(screen.getByText(`• ${limitation}`)).toBeTruthy();
    }
  });

  it('says in the accessibility label that it is community-reported', () => {
    renderWithTheme(<SafetyScorePanel score={score} />);

    // Twice, deliberately: once in the headline the screen reader announces
    // with the number itself, and once in the provenance block. A member who
    // hears "84 out of 100" and stops listening has still heard the caveat,
    // which is the whole point of §26 — so both are asserted rather than one.
    const announcements = screen.getAllByLabelText(
      /community-reported figure, not an official crime statistic/
    );
    expect(announcements.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the caveats even when the breakdown is empty', () => {
    // There is no branch in `SafetyScorePanel` that skips the freshness note.
    // A component that could render a safety number without its caveats is the
    // failure mode §26 describes.
    renderWithTheme(<SafetyScorePanel score={{ ...score, breakdown: [] }} />);
    expect(screen.getByText('What this does not tell you')).toBeTruthy();
  });
});

describe('cost of living states its baseline — §25', () => {
  it('never shows an index without what it is an index of', () => {
    // An index of 118 with no baseline is not a number, it is a suggestion of
    // one.
    renderWithTheme(
      <CostOfLivingPanel
        index={{
          neighborhoodId: 'peckham',
          name: 'Peckham',
          overallIndex: 118,
          baselineName: 'the UK national average',
          currency: 'GBP',
          categories: [{ id: 'housing', label: 'Housing', index: 132 }],
          freshness,
        }}
      />
    );

    expect(
      screen.getByLabelText(
        'Overall cost of living index 118, which is 18 percent above the UK national average.'
      )
    ).toBeTruthy();
    expect(screen.getByText(/100 = the UK national average/)).toBeTruthy();
  });
});

describe('the heat map legend is readable without seeing it — §22, §50', () => {
  it('describes the layer, the scale and the range in one sentence', () => {
    renderWithTheme(
      <HeatMapLegend
        data={{
          // The served safety layer (20 Oct 2026): counts from one named
          // source, never a score.
          layer: {
            id: 'safety',
            label: 'Safety reports',
            description:
              'Incidents counted by one named source in each square. Not a safety score: brighter means more were counted, which can also mean more people report there.',
            minZoom: 10,
            unit: 'reports',
            source: 'backend',
          },
          points: [
            { coordinate: { latitude: 51.4, longitude: -0.1 }, intensity: 0.4, rawValue: 40 },
          ],
          scale: 'relative-to-viewport',
          minValue: 10,
          maxValue: 90,
          freshness,
          bounds: { north: 52, south: 51, east: 0, west: -1 },
        }}
      />
    );

    const label = screen.getByTestId('heat-map-legend').props.accessibilityLabel as string;

    // Brightness is a count from a named source, which a member who read it as
    // danger would read wrongly.
    expect(label).toContain('Not a safety score');
    // And that the scale is fitted, which makes an empty area look busy.
    expect(label).toContain('fitted to what is currently on screen');
    expect(label).toContain('10');
    expect(label).toContain('90');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §14, §15, §48 — TRAVEL FIGURES
// ═════════════════════════════════════════════════════════════════════════════

describe('travel estimates carry their qualifier — §48', () => {
  it('says an unrouted figure is an estimate', () => {
    renderWithTheme(
      <TravelEstimateRow
        estimate={{
          travelMode: 'walking',
          distance: routeDistance(1200, 'walking'),
          duration: { seconds: 900 },
          source: 'simulated',
          isRouted: false,
        }}
      />
    );

    expect(screen.getByText(/Estimated from straight-line distance/)).toBeTruthy();
  });

  it('says so in the accessibility label as well', () => {
    renderWithTheme(
      <TravelEstimateRow
        estimate={{
          travelMode: 'walking',
          distance: routeDistance(1200, 'walking'),
          duration: { seconds: 900 },
          source: 'simulated',
          isRouted: false,
        }}
      />
    );
    expect(screen.getByLabelText(/This is an estimate from straight-line distance/)).toBeTruthy();
  });

  it('warns that traffic is not modelled for a routed driving time', () => {
    renderWithTheme(
      <EstimateQualifier isRouted supportsTraffic={false} travelMode="driving" />
    );
    expect(screen.getByText(/Typical traffic is not included/)).toBeTruthy();
  });

  it('says nothing when the figure is genuinely routed and traffic-aware', () => {
    renderWithTheme(<EstimateQualifier isRouted supportsTraffic travelMode="driving" />);
    expect(screen.queryByTestId('estimate-qualifier')).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §18, §19 — NAVIGATION
// ═════════════════════════════════════════════════════════════════════════════

describe('the navigation banner', () => {
  it('announces changes politely to assistive technology', () => {
    renderWithTheme(
      <NavigationBanner state={initialNavigationState()} onCancel={jest.fn()} />
    );
    expect(screen.getByTestId('navigation-banner-Idle').props.accessibilityLiveRegion).toBe(
      'polite'
    );
  });

  it('offers a new route when off-route', () => {
    const onRecalculate = jest.fn();
    renderWithTheme(
      <NavigationBanner
        state={{ ...initialNavigationState(), phase: 'OffRoute' }}
        onCancel={jest.fn()}
        onRecalculate={onRecalculate}
      />
    );

    fireEvent.press(screen.getByLabelText('Get a new route'));
    expect(onRecalculate).toHaveBeenCalled();
  });

  it('offers the device hand-off when no provider is connected — §18', () => {
    const onOpenExternal = jest.fn();
    renderWithTheme(
      <NavigationBanner
        state={{ ...initialNavigationState(), phase: 'ProviderUnavailable' }}
        onCancel={jest.fn()}
        onOpenExternal={onOpenExternal}
      />
    );

    fireEvent.press(screen.getByLabelText('Open in your maps app'));
    expect(onOpenExternal).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §27, §28, §29 — ALERTS
// ═════════════════════════════════════════════════════════════════════════════

describe('alert cards', () => {
  const alert: CommunityAlert = {
    id: 'u1',
    kind: 'road-closure',
    category: 'Traffic',
    title: 'Rye Lane closed at the junction',
    body: 'Roadworks are blocking the northbound lane.',
    severity: 'high',
    urgency: 'urgent',
    status: 'Active',
    coordinate: { latitude: 51.4742, longitude: -0.0691 },
    areaName: 'Peckham',
    cityName: 'London',
    countryCode: 'GB',
    publishedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    sourceName: 'Community report',
    confirmationCount: 4,
    source: 'backend',
    isShareable: true,
  };

  it('reads out the severity, the place and the corroboration', () => {
    renderWithTheme(<AlertCard alert={alert} onPress={jest.fn()} />);

    const label = screen.getByTestId('alert-card-u1').props.accessibilityLabel as string;
    expect(label).toContain('Urgent alert');
    expect(label).toContain('Rye Lane closed');
    expect(label).toContain('Peckham');
    expect(label).toContain('Confirmed by 4 people');
  });

  it('warns when an alert is about to expire — §29', () => {
    renderWithTheme(
      <AlertCard
        alert={{ ...alert, expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString() }}
      />
    );
    expect(screen.getByText(/Expires in 20 min/)).toBeTruthy();
  });
});
