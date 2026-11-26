/**
 * AnalyticsScreen reads its load state and its availability as groups
 * (FSOLID-005).
 *
 * The shell took these as eight flat props. They arrive as `load` and
 * `availability` now, each unpacked on the way in, and nothing else exercised
 * either one on this shell: a shell that stopped reading them would draw its
 * figures over a failed load, or over a report this build cannot reach.
 */
import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { FinancialError } from '@/lib/transport/financial-errors';
import { AnalyticsScreen } from '../AnalyticsScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  usePathname: jest.fn(() => '/analytics/wallet'),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const FIGURES = 'The wallet figures';

function renderShell(props: Partial<React.ComponentProps<typeof AnalyticsScreen>> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <AnalyticsScreen title="Wallet analytics" dataset={null} {...props}>
          <Text>{FIGURES}</Text>
        </AnalyticsScreen>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

it('shows the figures when nothing is loading, failing or out of reach', () => {
  renderShell();

  expect(screen.getByText(FIGURES)).toBeTruthy();
});

it('shows a skeleton instead of the figures while they load', () => {
  renderShell({ load: { isLoading: true } });

  expect(screen.queryByText(FIGURES)).toBeNull();
  expect(screen.getByLabelText('Loading figures')).toBeTruthy();
});

it('shows the failure instead of the figures', () => {
  renderShell({
    load: {
      error: new FinancialError({
        kind: 'unavailable',
        code: 'frontend.analytics-gap.wallet',
        message: 'Wallet analytics is not available on Diaspora yet.',
        hint: 'The platform does not support it yet.',
        isRetryable: false,
        isTerminal: true,
        isIndeterminate: false,
      }),
      onRetry: jest.fn(),
    },
  });

  expect(screen.queryByText(FIGURES)).toBeNull();
  expect(screen.getByText(/not available on Diaspora yet/i)).toBeTruthy();
});

it('says the report is not available yet where this build cannot reach it', () => {
  // `walletAnalytics` is a gap the backend has only partly closed, so its
  // statement still renders.
  renderShell({ availability: { isEnabled: false, gapKey: 'walletAnalytics' } });

  expect(screen.queryByText(FIGURES)).toBeNull();
  expect(screen.getByText('Not available yet')).toBeTruthy();
});
