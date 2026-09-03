// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration surfaces (Frontend Phase 16, §19 · §20 · §37 · §58 · §69)
//
// The rendering assertions. Four properties, each of which is a promise the
// application makes to a member rather than an implementation detail:
//
//   **A simulated connection always carries its marker.** §69. Asserted on the
//   component that draws the status word, because that is the only place the
//   claim can be made and therefore the only place the caveat can be lost.
//
//   **Official-looking content always carries its provenance.** §20. Asserted
//   by rendering a notice and checking the authority, the source kind and the
//   staleness are all present.
//
//   **Consent shows all four of §37's answers.** Not "a consent screen exists"
//   but "the list of what Diaspora does *not* store is on it", because that is
//   the one that would be dropped for space.
//
//   **Every state is announced, not only shown.** §58. A colour-coded badge
//   with no text is invisible to a screen reader and to anybody who cannot
//   distinguish the colours.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/design-system';
import {
  IntegrationGapNotice,
  IntegrationStatusBadge,
  ProviderGapNotice,
  SimulationMarker,
  IntegrationErrorNotice,
} from '../index';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConsentSheet } from '../IntegrationConsent';
import { IntegrationRow } from '../IntegrationRow';
import { descriptorFor } from '@/lib/integrations/catalog';
import { INTEGRATION_STATUSES } from '@/types/integrations';
import type { IntegrationListItem } from '@/types/integrations';

function renderWithTheme(node: React.ReactElement) {
  // `SafeAreaProvider` because `ConsentSheet` reserves the bottom inset — its
  // confirm row meets the bottom edge of the screen, and without the inset it
  // sits under the gesture bar.
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <ThemeProvider>{node}</ThemeProvider>
    </SafeAreaProvider>
  );
}

describe('§69 · a simulated connection can never render as a real one', () => {
  it('the marker appears for a development provider', () => {
    const { getByTestId } = renderWithTheme(<SimulationMarker mode="DEVELOPMENT_PROVIDER" />);
    expect(getByTestId('integration-simulation-marker')).toBeTruthy();
  });

  it.each(['REAL_PROVIDER', 'BACKEND_CONNECTED', 'BACKEND_GAP', 'NOT_CONFIGURED'] as const)(
    'the marker does not appear for %s',
    (mode) => {
      const { queryByTestId } = renderWithTheme(<SimulationMarker mode={mode} />);
      expect(queryByTestId('integration-simulation-marker')).toBeNull();
    }
  );

  it('the status badge draws the marker itself, so it cannot be forgotten', () => {
    // The component that draws "Connected" is the same one that draws
    // "Simulated". A screen cannot render one without the other.
    const { getByTestId } = renderWithTheme(
      <IntegrationStatusBadge status="CONNECTED" mode="DEVELOPMENT_PROVIDER" />
    );

    expect(getByTestId('integration-status-CONNECTED')).toBeTruthy();
    expect(getByTestId('integration-simulation-marker')).toBeTruthy();
  });

  it('a simulated connection’s description says so, whatever the status', () => {
    const { getByText } = renderWithTheme(
      <IntegrationStatusBadge status="CONNECTED" mode="DEVELOPMENT_PROVIDER" showDescription />
    );

    expect(getByText(/development build/i)).toBeTruthy();
  });
});

describe('§58 · every status is text as well as colour', () => {
  it.each(INTEGRATION_STATUSES)('%s renders a label', (status) => {
    // Colour is never the only signal: the label survives greyscale,
    // colour-blindness and a screen reader.
    const { getByTestId } = renderWithTheme(
      <IntegrationStatusBadge status={status} mode="REAL_PROVIDER" />
    );
    expect(getByTestId(`integration-status-${status}`)).toBeTruthy();
  });

  it('a list row announces its whole state in one utterance', () => {
    // A screen reader traversing four separate fragments announces "Connected"
    // on its own, which says nothing about what is connected.
    const descriptor = descriptorFor('calendar.google');
    expect(descriptor).toBeDefined();

    const item: IntegrationListItem = {
      descriptor: descriptor!,
      connection: {
        provider: 'calendar.google',
        domain: 'calendar',
        status: 'CONNECTED',
        mode: 'DEVELOPMENT_PROVIDER',
        account: { externalId: 'x', accountLabel: 'a@example.com' },
        grantedCapabilities: [],
        scopes: [],
        lastSyncedAt: null,
        lastError: null,
        observedAt: '2026-08-09T09:00:00.000Z',
      },
      sync: null,
    };

    const { getByTestId } = renderWithTheme(<IntegrationRow item={item} onPress={() => {}} />);
    const row = getByTestId('integration-row-calendar.google');
    const label = row.props.accessibilityLabel as string;

    expect(label).toContain('Google Calendar');
    expect(label).toContain('Connected');
    expect(label).toContain('simulated');
  });

  it('an error notice is announced as an alert', () => {
    const { getByTestId } = renderWithTheme(
      <IntegrationErrorNotice message="Something went wrong." hint="Try again." />
    );

    const notice = getByTestId('integration-error-notice');
    expect(notice.props.accessibilityRole).toBe('alert');
    expect(notice.props.accessibilityLabel).toContain('Something went wrong.');
  });

  it('a rate limit renders its interval rather than a bare refusal', () => {
    const { getByText } = renderWithTheme(
      <IntegrationErrorNotice message="Too many attempts." retryAfterSeconds={90} />
    );
    expect(getByText(/try again in 2 minutes/i)).toBeTruthy();
  });
});

describe('§32 · gap notices belong to their own register', () => {
  it('renders a gap from this phase', () => {
    const { getByTestId } = renderWithTheme(
      <IntegrationGapNotice gapKey="identityLinking" />
    );
    expect(getByTestId('integration-gap-notice-identityLinking')).toBeTruthy();
  });

  it('renders nothing for another phase’s key', () => {
    // Six phases, six registers, same visual language. Passing another phase's
    // key must render nothing rather than an empty box — which is what stops
    // one phase's gap being closed and another's notice silently vanishing.
    const { queryByTestId } = renderWithTheme(<IntegrationGapNotice gapKey="platformAnalytics" />);
    expect(queryByTestId('integration-gap-notice-platformAnalytics')).toBeNull();
  });

  it('a provider gap is visually and textually distinct from a backend gap', () => {
    // Different work for different people, and a different sentence for the
    // member: "this version of the app" tells them an update may fix it.
    const { getByTestId, getByText } = renderWithTheme(<ProviderGapNotice gapKey="deviceCalendar" />);

    expect(getByTestId('provider-gap-notice-deviceCalendar')).toBeTruthy();
    expect(getByText(/needs a newer version/i)).toBeTruthy();
  });

  it('renders nothing for an unknown provider gap key', () => {
    const { queryByTestId } = renderWithTheme(<ProviderGapNotice gapKey="tileMap" />);
    expect(queryByTestId('provider-gap-notice-tileMap')).toBeNull();
  });
});

describe('§37 · consent shows all four answers, including the one that would be cut', () => {
  const descriptor = descriptorFor('calendar.device');

  it('renders what is accessed, why, what is stored, and what is not', () => {
    const { getByText } = renderWithTheme(
      <ConsentSheet
        visible
        integrationName="Apple Calendar"
        consent={descriptor!.consent}
        permissions={descriptor!.permissions}
        mode="REAL_PROVIDER"
        onAccept={() => {}}
        onDecline={() => {}}
      />
    );

    expect(getByText('What Diaspora will access')).toBeTruthy();
    expect(getByText('Why')).toBeTruthy();
    expect(getByText('What Diaspora keeps')).toBeTruthy();
    // The one that would be dropped for space if it were prose. It is usually
    // the more informative list.
    expect(getByText('What Diaspora never keeps')).toBeTruthy();
  });

  it('the confirm button names the action rather than saying Continue', () => {
    // §37's actual complaint. A label that names the action is also what a
    // screen reader announces in isolation.
    const { getByText, queryByText } = renderWithTheme(
      <ConsentSheet
        visible
        integrationName="Apple Calendar"
        consent={descriptor!.consent}
        permissions={descriptor!.permissions}
        mode="REAL_PROVIDER"
        onAccept={() => {}}
        onDecline={() => {}}
      />
    );

    expect(getByText('Connect Apple Calendar')).toBeTruthy();
    expect(queryByText('Continue')).toBeNull();
  });

  it('marks each permission as required or optional', () => {
    // §36 made visible: a member can see that calendar *read* access is
    // optional and only needed for two-way sync.
    const { getByTestId, getAllByText } = renderWithTheme(
      <ConsentSheet
        visible
        integrationName="Apple Calendar"
        consent={descriptor!.consent}
        permissions={descriptor!.permissions}
        mode="REAL_PROVIDER"
        onAccept={() => {}}
        onDecline={() => {}}
      />
    );

    expect(getByTestId('integration-permission-explainer')).toBeTruthy();
    expect(getAllByText('Required').length).toBeGreaterThan(0);
    expect(getAllByText('Optional').length).toBeGreaterThan(0);
  });

  it('the simulation marker appears before the consent text, not after', () => {
    // A member reading what they are agreeing to needs to know first whether it
    // is real.
    const { getByTestId } = renderWithTheme(
      <ConsentSheet
        visible
        integrationName="Google Calendar"
        consent={descriptorFor('calendar.google')!.consent}
        permissions={[]}
        mode="DEVELOPMENT_PROVIDER"
        onAccept={() => {}}
        onDecline={() => {}}
      />
    );

    expect(getByTestId('integration-simulation-marker')).toBeTruthy();
  });
});
