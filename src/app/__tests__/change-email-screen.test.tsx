/**
 * Changing the sign-in address — 20 Oct 2026.
 *
 * The form refuses until it has a password and an address, and says which is
 * missing before anything is pressed. A success says where the link went and
 * which address still signs in, never "changed". Each refusal is told in the
 * member's terms, and an unanswered request is told as unknown, not failed.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { EmailChangeError, type EmailChangeRefusal } from '@/lib/auth-api';
import { integrationError } from '@/lib/integrations/errors';
import type { IntegrationErrorKind } from '@/types/integrations';

const mockMutateAsync = jest.fn();
const mockIdentity = jest.fn();

jest.mock('@/hooks/integrations', () => ({
  useEmailIdentity: () => mockIdentity(),
  useEmailChange: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));
jest.mock('@/lib/navigation', () => ({ backOr: jest.fn() }));

// eslint-disable-next-line import/first
import ChangeEmailScreen from '../profile/change-email';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const OLD = 'old.address@example.test';
const NEW = 'new.address@example.test';
/** A fixture, never a real credential. */
const PASSWORD = 'fixture-password';

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ChangeEmailScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function fill(address = NEW, password = PASSWORD) {
  fireEvent.changeText(screen.getByTestId('new-email-input'), address);
  fireEvent.changeText(screen.getByTestId('current-password-input'), password);
}

function refusal(
  refusal: EmailChangeRefusal,
  kind: IntegrationErrorKind,
  overrides: Parameters<typeof integrationError>[1] = {}
) {
  return new EmailChangeError(refusal, integrationError(kind, overrides));
}

beforeEach(() => {
  mockMutateAsync.mockReset();
  mockIdentity.mockReturnValue({ email: { address: OLD }, pendingChange: null });
});

describe('what the form needs', () => {
  it('names both fields while both are empty, and sends nothing', () => {
    renderScreen();

    expect(screen.getByText('Still needed: your current password and the new email address.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('send-email-change'));
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('names the password once the address is in', () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('new-email-input'), NEW);

    expect(screen.getByText('Still needed: your current password.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('send-email-change'));
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('says an address is not one yet, and refuses it', () => {
    renderScreen();
    fill('not-an-address');

    expect(screen.getByText('That does not look like an email address yet.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('send-email-change'));
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('refuses the address already on the account', () => {
    renderScreen();
    fill(OLD.toUpperCase());

    expect(screen.getByText('That is already the email address on your account.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('send-email-change'));
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});

describe('asking', () => {
  it('says where the link went and which address still signs in', async () => {
    mockMutateAsync.mockResolvedValue({ address: OLD, pendingAddress: NEW });
    renderScreen();
    fill(`  ${NEW} `);

    fireEvent.press(screen.getByTestId('send-email-change'));

    await waitFor(() =>
      expect(
        screen.getByText(`We sent a link to ${NEW}; your sign-in stays ${OLD} until you open it.`)
      ).toBeTruthy()
    );
    expect(mockMutateAsync).toHaveBeenCalledWith({ address: NEW, currentPassword: PASSWORD });
  });

  it('tells a wrong password beside the password', async () => {
    mockMutateAsync.mockRejectedValue(refusal('wrongPassword', 'InvalidRequest'));
    renderScreen();
    fill();

    fireEvent.press(screen.getByTestId('send-email-change'));

    await waitFor(() => expect(screen.getByText('That is not your current password.')).toBeTruthy());
    expect(screen.getByText('Nothing was changed and no email was sent.')).toBeTruthy();
  });

  it('tells a rate limit with when to try again', async () => {
    mockMutateAsync.mockRejectedValue(refusal('rateLimited', 'RateLimited', { retryAfterSeconds: 42 }));
    renderScreen();
    fill();

    fireEvent.press(screen.getByTestId('send-email-change'));

    await waitFor(() => expect(screen.getByText('Too many tries for now.')).toBeTruthy());
    expect(screen.getByText(`You can try again in 42 seconds. You still sign in with ${OLD}.`)).toBeTruthy();
  });

  it('tells email being unavailable as nothing changed', async () => {
    mockMutateAsync.mockRejectedValue(
      refusal('emailUnavailable', 'ProviderUnavailable', { isIndeterminate: false })
    );
    renderScreen();
    fill();

    fireEvent.press(screen.getByTestId('send-email-change'));

    await waitFor(() =>
      expect(
        screen.getByText('Diaspora cannot send email right now, so your address was not changed.')
      ).toBeTruthy()
    );
  });

  it('tells no answer as unknown, not as failed', async () => {
    mockMutateAsync.mockRejectedValue(refusal('unanswered', 'NetworkFailure', { isIndeterminate: true }));
    renderScreen();
    fill();

    fireEvent.press(screen.getByTestId('send-email-change'));

    await waitFor(() =>
      expect(
        screen.getByText('No answer arrived from Diaspora, so we cannot tell whether the link was sent.')
      ).toBeTruthy()
    );
    expect(
      screen.getByText(
        `It may have been. Check ${NEW} for an email from Diaspora before asking again. You still sign in with ${OLD}.`
      )
    ).toBeTruthy();
  });
});

it('mentions a change already asked for whose link is still open', () => {
  mockIdentity.mockReturnValue({
    email: { address: OLD },
    pendingChange: {
      from: OLD,
      to: NEW,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      requestedAt: new Date().toISOString(),
    },
  });
  renderScreen();

  expect(screen.getByTestId('email-change-already-pending')).toBeTruthy();
});
