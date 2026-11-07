/**
 * A held member's review, filed from the appeals screen — 26 Oct 2026 (RWD-14, CS-4a).
 *
 * The points screens send a held member here with the type and target filled
 * in. A hold is appealed against the member themselves, so there is no
 * reference to type: the screen files it under the member's own id.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { useAuthStore } from '@/store/auth';

const mockSubmit = jest.fn();

jest.mock('@/hooks/trust', () => ({
  useMyAppeals: () => ({ appeals: [], isLoading: false, isEmpty: true, error: null, refresh: jest.fn() }),
  useSubmitAppeal: () => ({ submit: mockSubmit, isPending: false, error: null }),
}));

jest.mock('@/providers/notification-provider', () => ({
  useNotification: () => ({ showAlert: jest.fn(), showToast: jest.fn() }),
}));

let mockWallet: { walletId: string } | null = { walletId: 'wallet-1' };

jest.mock('@/hooks/financial', () => ({
  usePrimaryWallet: () => ({
    wallet: mockWallet,
    wallets: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

// eslint-disable-next-line import/first
import AppealsScreen from '../profile/appeals';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const REASON = 'My points are paused. I share a phone with my sister.';

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <AppealsScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  mockWallet = { walletId: 'wallet-1' };
  mockSubmit.mockReset().mockResolvedValue(undefined);
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  useAuthStore.setState({ isAuthenticated: true, user: { userId: 'member-1' } as never });
});

describe('opened to review a points hold', () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ type: 'RewardHold', targetId: 'member-1' });
  });

  it('opens the form on a points hold, with no reference to type', () => {
    renderScreen();

    expect(screen.getByText('Points Hold')).toBeTruthy();
    expect(screen.queryByTestId('appeal-reference')).toBeNull();
  });

  it('files the review against the member themselves', () => {
    renderScreen();

    fireEvent.changeText(screen.getByTestId('appeal-reason'), REASON);
    fireEvent.press(screen.getByText('Submit Appeal'));

    expect(mockSubmit).toHaveBeenCalledWith({ type: 'RewardHold', targetId: 'member-1', reason: REASON });
  });
});

describe('opened plainly', () => {
  it('still asks for a reference for every other kind of appeal', () => {
    renderScreen();

    fireEvent.press(screen.getByText('File New Appeal'));

    expect(screen.getByTestId('appeal-reference')).toBeTruthy();
  });

  it('offers a points hold among the kinds of appeal, under the member’s own id', () => {
    renderScreen();

    fireEvent.press(screen.getByText('File New Appeal'));
    fireEvent.press(screen.getByText('Points Hold'));
    fireEvent.changeText(screen.getByTestId('appeal-reason'), REASON);
    fireEvent.press(screen.getByText('Submit Appeal'));

    expect(screen.queryByTestId('appeal-reference')).toBeNull();
    expect(mockSubmit).toHaveBeenCalledWith({ type: 'RewardHold', targetId: 'member-1', reason: REASON });
  });
});

// A frozen wallet (7 Nov 2026). Its notice says "appeal from Profile, Appeals",
// and the member never sees their wallet's id, so the form names it for them.
describe('appealing a wallet freeze', () => {
  it('files it against the member’s own wallet, with no reference to type', () => {
    renderScreen();

    fireEvent.press(screen.getByText('File New Appeal'));
    fireEvent.press(screen.getByText('Wallet Frozen'));

    expect(screen.queryByTestId('appeal-reference')).toBeNull();
    expect(screen.getByText('We will review the freeze on your wallet.')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('appeal-reason'), REASON);
    fireEvent.press(screen.getByText('Submit Appeal'));

    expect(mockSubmit).toHaveBeenCalledWith({ type: 'Money', targetId: 'wallet-1', reason: REASON });
  });

  it('uses the wallet the wallet screen named', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ type: 'Money', targetId: 'wallet-9' });
    renderScreen();

    expect(screen.queryByTestId('appeal-reference')).toBeNull();
    fireEvent.changeText(screen.getByTestId('appeal-reason'), REASON);
    fireEvent.press(screen.getByText('Submit Appeal'));

    expect(mockSubmit).toHaveBeenCalledWith({ type: 'Money', targetId: 'wallet-9', reason: REASON });
  });

  it('cannot be sent by a member with no wallet', () => {
    mockWallet = null;
    renderScreen();

    fireEvent.press(screen.getByText('File New Appeal'));
    fireEvent.press(screen.getByText('Wallet Frozen'));
    fireEvent.changeText(screen.getByTestId('appeal-reason'), REASON);
    fireEvent.press(screen.getByText('Submit Appeal'));

    expect(screen.getByText('You have no wallet to appeal about yet.')).toBeTruthy();
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
