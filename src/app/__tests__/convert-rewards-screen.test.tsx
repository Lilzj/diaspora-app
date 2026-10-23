/**
 * The convert screen says what the server said, about the number in the field
 * — 22 Oct 2026 (step 2, S2-5).
 *
 * It kept a reason table of its own keyed on a code the server never sends,
 * asserted " · no fee", labelled "Use all N" while filling in a capped number,
 * left a failed preview's error beside the next quote (and a stale quote beside
 * the next error), and let a slow answer for an earlier number replace the
 * answer for the current one.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { FinancialError } from '@/lib/financial-errors';
import type { Money } from '@/types/financial';
import type { RewardConversionPolicy, RewardConversionPreview } from '@/types/financial-gaps';

const mockPolicy = jest.fn();
const mockBalance = jest.fn();
const mockPreview = jest.fn();

jest.mock('@/hooks/financial-gaps', () => ({
  useConversionPolicy: () => ({ data: mockPolicy() }),
  useRewardBalance: () => ({ data: mockBalance() }),
  usePreviewConversion: () => ({ mutateAsync: mockPreview, isPending: false }),
  useCreateConversion: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/providers/notification-provider', () => ({
  useNotification: () => ({ showAlert: jest.fn(), showToast: jest.fn() }),
}));

// eslint-disable-next-line import/first
import ConvertRewardsScreen from '../wallet/rewards/convert';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function gbp(minorUnits: number): Money {
  return { amount: minorUnits / 100, currency: 'GBP', minorUnits, exponent: 2, symbol: '£' };
}

function policy(overrides: Partial<RewardConversionPolicy> = {}): RewardConversionPolicy {
  return {
    isEligible: true,
    ineligibleReason: null,
    ineligibleCode: null,
    pointsPerMinorUnit: 2,
    pointsPerMajorUnit: 200,
    currency: 'GBP',
    exponent: 2,
    symbol: '£',
    minimumPoints: 10,
    maximumPoints: 1_000,
    availablePoints: 1_000,
    ...overrides,
  };
}

function quote(points: number, credit: number): RewardConversionPreview {
  return {
    points,
    grossValue: gbp(credit),
    fee: gbp(0),
    netValue: gbp(credit),
    isValid: true,
    refusalCode: null,
    refusalMessage: null,
  };
}

function refusal(points: number, message: string): RewardConversionPreview {
  return { ...quote(points, 0), isValid: false, refusalCode: 'financial.rewards.below_minimum', refusalMessage: message };
}

const PREVIEW_FAILED = new FinancialError({
  kind: 'network',
  message: 'We could not work out the value.',
  isRetryable: true,
  isTerminal: false,
  isIndeterminate: false,
});

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ConvertRewardsScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Types a number and lets the 400 ms debounce and the preview answer run. */
async function enter(text: string) {
  fireEvent.changeText(screen.getByLabelText('Number of points to convert'), text);
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockPolicy.mockReturnValue(policy());
  mockBalance.mockReturnValue({ available: 1_000, lifetimeEarned: 1_000, lifetimeConverted: 0, lifetimeSpent: 0 });
  mockPreview.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('when the member cannot convert', () => {
  it('shows the server’s reason, whatever it is', () => {
    mockPolicy.mockReturnValue(
      policy({
        isEligible: false,
        ineligibleReason: 'You need at least 500 points to convert. You have 320.',
        ineligibleCode: 'financial.rewards.below_minimum',
      })
    );

    renderScreen();

    expect(screen.getByText('You cannot convert points right now')).toBeTruthy();
    expect(screen.getByText('You need at least 500 points to convert. You have 320.')).toBeTruthy();
  });

  it('puts words to a bare code from the one shared map, never the code', () => {
    mockPolicy.mockReturnValue(
      policy({ isEligible: false, ineligibleReason: 'financial.rewards.daily_limit_reached' })
    );

    renderScreen();

    expect(screen.getByText('You have converted as much as you can today.')).toBeTruthy();
    expect(screen.queryByText(/financial\.rewards/)).toBeNull();
  });
});

describe('the rate and the limits', () => {
  it('prices one whole unit by the currency’s own exponent', () => {
    mockPolicy.mockReturnValue(
      policy({ currency: 'JPY', exponent: 0, symbol: '¥', pointsPerMinorUnit: 2, pointsPerMajorUnit: 2 })
    );

    renderScreen();

    expect(screen.getByText('2 points = 1 JPY')).toBeTruthy();
    expect(screen.queryByText('200 points = 1 JPY')).toBeNull();
  });

  it('makes no claim about a fee', () => {
    renderScreen();

    expect(screen.queryByText(/fee/i)).toBeNull();
  });

  it('offers the most the member can convert, and says so, when that is below the balance', () => {
    mockPolicy.mockReturnValue(policy({ maximumPoints: 400 }));

    renderScreen();

    fireEvent.press(screen.getByText('Use the most you can (400)'));

    expect(screen.getByLabelText('Number of points to convert').props.value).toBe('400');
    expect(screen.queryByText(/Use all/)).toBeNull();
  });

  it('says "use all" when nothing caps it', () => {
    renderScreen();

    expect(screen.getByText('Use all 1,000')).toBeTruthy();
  });
});

describe('the preview describes the number in the field', () => {
  it('drops an earlier failure once a preview succeeds', async () => {
    mockPreview.mockRejectedValueOnce(PREVIEW_FAILED).mockResolvedValueOnce(quote(500, 250));

    renderScreen();

    await enter('100');
    expect(screen.getByText('We could not work out the value.')).toBeTruthy();

    await enter('500');
    expect(screen.getByText('You would receive')).toBeTruthy();
    expect(screen.queryByText('We could not work out the value.')).toBeNull();
  });

  it('drops an earlier quote once a preview fails', async () => {
    mockPreview.mockResolvedValueOnce(quote(500, 250)).mockRejectedValueOnce(PREVIEW_FAILED);

    renderScreen();

    await enter('500');
    expect(screen.getByText('You would receive')).toBeTruthy();

    await enter('600');
    expect(screen.queryByText('You would receive')).toBeNull();
    expect(screen.getByText('We could not work out the value.')).toBeTruthy();
  });

  it('ignores a slow answer for a number the member has since changed', async () => {
    let answerFirst: (value: RewardConversionPreview) => void = () => undefined;
    let answerSecond: (value: RewardConversionPreview) => void = () => undefined;

    mockPreview
      .mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { answerSecond = resolve; }));

    renderScreen();

    await enter('5');
    await enter('1000');

    await act(async () => {
      answerSecond(quote(1_000, 500));
    });
    await act(async () => {
      answerFirst(refusal(5, 'The smallest conversion is 10 points.'));
    });

    expect(screen.getByText('You would receive')).toBeTruthy();
    expect(screen.queryByText('The smallest conversion is 10 points.')).toBeNull();
  });

  it('clears the quote and the error when the field is emptied', async () => {
    mockPreview.mockResolvedValueOnce(quote(500, 250));

    renderScreen();

    await enter('500');
    expect(screen.getByText('You would receive')).toBeTruthy();

    await enter('');
    expect(screen.queryByText('You would receive')).toBeNull();
  });
});
