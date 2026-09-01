// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Status, error and gap component tests (Frontend Phase 5)
//
// What is asserted here is mostly what these components *refuse* to do:
//
//   * a status badge never carries its meaning in colour alone
//   * an error view never offers a retry that cannot work
//   * a gap notice never lets a simulated capability read as a real one
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '@/design-system';
import { StatusBadge, StatusBanner } from '../StatusBadge';
import { FinancialErrorInline, FinancialErrorView, GapNotice, GapUnavailableView } from '../FinancialError';
import { AccessGate } from '../AccessGate';
import { FinancialError } from '@/lib/financial-errors';
import { presentPaymentStatus, presentWalletStatus } from '@/lib/financial-status';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';

function renderWithTheme(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('StatusBadge', () => {
  it('shows the label and speaks the full sentence', () => {
    renderWithTheme(<StatusBadge status={presentPaymentStatus('Captured')} />);

    expect(screen.getByText('Paid')).toBeTruthy();
    // The badge shows one word; a screen reader gets the whole explanation.
    expect(screen.getByLabelText(/paid\. the payment completed successfully/i)).toBeTruthy();
  });

  it('says explicitly that a failed payment charged nothing', () => {
    renderWithTheme(<StatusBadge status={presentPaymentStatus('Failed')} />);
    expect(screen.getByLabelText(/nothing was charged/i)).toBeTruthy();
  });

  it('renders an unknown status as in-progress, never as failed', () => {
    renderWithTheme(<StatusBadge status={presentPaymentStatus('SomethingNew')} />);

    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.queryByText(/failed/i)).toBeNull();
  });
});

describe('StatusBanner', () => {
  it('folds the detail into the spoken label', () => {
    renderWithTheme(
      <StatusBanner status={presentWalletStatus('Frozen')} detail="Under review by our team." />
    );

    expect(screen.getByLabelText(/frozen.*under review by our team/i)).toBeTruthy();
  });
});

describe('FinancialErrorView', () => {
  it('offers a retry for a retryable failure', () => {
    const onRetry = jest.fn();

    renderWithTheme(
      <FinancialErrorView
        error={
          new FinancialError({
            kind: 'server',
            message: 'Something went wrong on our side.',
            isRetryable: true,
            isTerminal: false,
            isIndeterminate: false,
          })
        }
        onRetry={onRetry}
      />
    );

    fireEvent.press(screen.getByLabelText('Try again'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('offers no retry for a refusal that would refuse identically', () => {
    // A button that cannot work is a button that teaches somebody the app is
    // broken.
    renderWithTheme(
      <FinancialErrorView
        error={
          new FinancialError({
            kind: 'refused',
            code: 'financial.wallet.insufficient_funds',
            message: 'There is not enough in your wallet for this.',
            isRetryable: false,
            isTerminal: true,
            isIndeterminate: false,
          })
        }
        onRetry={jest.fn()}
      />
    );

    expect(screen.queryByLabelText('Try again')).toBeNull();
  });

  it('sends an unauthenticated member to sign in rather than to a retry', () => {
    renderWithTheme(
      <FinancialErrorView
        error={
          new FinancialError({
            kind: 'unauthenticated',
            message: 'Your session has ended.',
            isRetryable: false,
            isTerminal: true,
            isIndeterminate: false,
          })
        }
      />
    );

    fireEvent.press(screen.getByLabelText('Sign in'));
    expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('sends a forbidden member to verification', () => {
    renderWithTheme(
      <FinancialErrorView
        error={
          new FinancialError({
            kind: 'forbidden',
            message: 'This action is not available on your account.',
            isRetryable: false,
            isTerminal: true,
            isIndeterminate: false,
          })
        }
      />
    );

    fireEvent.press(screen.getByLabelText('Start verification'));
    expect(router.push).toHaveBeenCalledWith('/verification/diaspora');
  });
});

describe('FinancialErrorInline', () => {
  it('announces itself politely rather than interrupting', () => {
    renderWithTheme(
      <FinancialErrorInline
        error={
          new FinancialError({
            kind: 'offline',
            message: 'You are offline.',
            hint: 'Balances may be out of date.',
            isRetryable: false,
            isTerminal: false,
            isIndeterminate: false,
          })
        }
      />
    );

    const region = screen.getByLabelText(/you are offline.*balances may be out of date/i);
    expect(region.props.accessibilityLiveRegion).toBe('polite');
  });
});

describe('GapNotice', () => {
  // 'rewards' rather than 'withdrawal': the withdrawal gap closed when a
  // settlement provider landed, and a component test pinned to a capability
  // that is now real would fail for a reason that has nothing to do with the
  // component.
  it('names the capability and says nothing real moves', () => {
    // Fixture note: this asserts the notice *renders*, so it needs a gap that is
    // still open. The one it used was marked `backendStatus: 'connected'` once the
    // capability shipped, at which point the notice correctly renders nothing.
    renderWithTheme(<GapNotice gapId="protection" />);

    expect(screen.getByLabelText(/not supported by the diaspora backend yet/i)).toBeTruthy();
    expect(screen.getByText(/nothing here moves real money/i)).toBeTruthy();
  });

  it('names the missing contract for whoever is building the backend', () => {
    renderWithTheme(<GapNotice gapId="protection" />);
    expect(screen.getByText(/POST \/api\/v1\/financial\/escrows/)).toBeTruthy();
  });

  it('says nothing at all for an unregistered gap', () => {
    const { toJSON } = renderWithTheme(<GapNotice gapId="not-a-gap" />);
    expect(toJSON()).toBeNull();
  });
});

describe('GapUnavailableView', () => {
  it('states plainly that the platform cannot do this', () => {
    renderWithTheme(<GapUnavailableView gapId="protection" />);

    expect(screen.getByText(/is not available yet/i)).toBeTruthy();
    // §20: it must not read as though the protection exists but is switched off.
    expect(screen.getByText(/nothing on the platform claims to provide it/i)).toBeTruthy();
  });
});

describe('AccessGate', () => {
  it('gives somebody under review no action, because there is nothing to do', () => {
    renderWithTheme(
      <AccessGate
        refusal={checkAccess(FinancialPermissions.PaymentsManage, 'VerificationUnderReview', true)}
      />
    );

    expect(screen.getByText('Verification in progress')).toBeTruthy();
    expect(screen.queryByLabelText('Start verification')).toBeNull();
  });

  it('sends an unverified member to start verification', () => {
    renderWithTheme(
      <AccessGate refusal={checkAccess(FinancialPermissions.PaymentsManage, 'LimitedAccess', true)} />
    );

    fireEvent.press(screen.getByLabelText('Start verification'));
    expect(router.push).toHaveBeenCalledWith('/verification/diaspora');
  });

  it('tells a restricted member that reading still works', () => {
    renderWithTheme(
      <AccessGate refusal={checkAccess(FinancialPermissions.PaymentsManage, 'Suspended', true)} />
    );

    expect(screen.getByText('Payments are paused')).toBeTruthy();
    expect(screen.getByText(/still see your balance and history/i)).toBeTruthy();
  });

  it('renders nothing when access is allowed', () => {
    const { toJSON } = renderWithTheme(<AccessGate refusal={{ allowed: true }} />);
    expect(toJSON()).toBeNull();
  });
});
