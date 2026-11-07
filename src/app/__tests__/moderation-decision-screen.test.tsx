/**
 * The screen every moderation notice opens (7 Nov 2026): what was decided about the member's own
 * content, why, Diaspora's note, and what they can do about it.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import type { MyModerationCase } from '@/lib/trust-api';

const mockRequestReview = jest.fn();
const mockPush = jest.fn();
let mockDecision: MyModerationCase | null = null;

jest.mock('@/hooks/trust', () => ({
  useMyModerationCase: () => ({
    decision: mockDecision,
    isLoading: false,
    error: null,
    refresh: jest.fn(),
    requestReview: mockRequestReview,
    isRequestingReview: false,
    reviewError: null,
  }),
}));

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useLocalSearchParams: () => ({ caseId: 'case-1' }),
}));

jest.mock('@/providers/notification-provider', () => ({
  useNotification: () => ({ showToast: jest.fn(), showAlert: jest.fn() }),
}));

// eslint-disable-next-line import/first
import ModerationDecisionScreen from '../profile/moderation/[caseId]';
import { canAppeal, decisionHeadline } from '@/lib/moderation-case';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function decision(overrides: Partial<MyModerationCase> = {}): MyModerationCase {
  return {
    caseId: 'case-1',
    contentType: 'job',
    contentId: 'job-1',
    title: 'Care Assistant',
    outcome: 'HidePendingReview',
    reasonCode: 'AsksForFees',
    reasonLabel: 'asking people to pay up front',
    note: 'The advert asks candidates for a visa fee.',
    decidedAt: '2026-11-07T10:00:00.000Z',
    hiddenAutomatically: false,
    removalPending: false,
    appealDeadline: null,
    canRequestReview: true,
    reviewRequestedAt: null,
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ModerationDecisionScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestReview.mockResolvedValue(undefined);
});

it('says what happened, why, and Diaspora’s note, and never names the moderator', () => {
  mockDecision = decision();
  renderScreen();

  expect(screen.getByText('Your job advert is hidden while Diaspora reviews it.')).toBeTruthy();
  expect(screen.getByText('It was found to be asking people to pay up front.')).toBeTruthy();
  expect(screen.getByText(/The advert asks candidates for a visa fee/)).toBeTruthy();
});

it('lets the owner ask for a review once they have put it right', async () => {
  mockDecision = decision();
  renderScreen();

  fireEvent.press(screen.getByLabelText('Ask for a review of this decision'));

  await waitFor(() => expect(mockRequestReview).toHaveBeenCalled());
});

it('opens the appeal with the case already filled in', () => {
  mockDecision = decision();
  renderScreen();

  fireEvent.press(screen.getByLabelText('Appeal this decision'));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/profile/appeals',
    params: { type: 'Content', targetId: 'case-1' },
  });
});

it('a removal shows until when the owner can appeal, and offers no review', () => {
  mockDecision = decision({
    outcome: 'Remove',
    canRequestReview: false,
    appealDeadline: '2099-11-21T10:00:00.000Z',
  });
  renderScreen();

  expect(screen.getByText('Your job advert was removed.')).toBeTruthy();
  expect(screen.getByText(/You can appeal until/)).toBeTruthy();
  expect(screen.queryByLabelText('Ask for a review of this decision')).toBeNull();
});

describe('the rules the screen applies', () => {
  it('an automatic hide is not presented as anybody’s decision', () => {
    expect(decisionHeadline(decision({ hiddenAutomatically: true }))).toMatch(/Nobody at Diaspora has decided/);
  });

  it('a removal can be appealed only until its deadline', () => {
    const removal = decision({ outcome: 'Remove', appealDeadline: '2026-11-21T10:00:00.000Z' });

    expect(canAppeal(removal, new Date('2026-11-20T10:00:00.000Z'))).toBe(true);
    expect(canAppeal(removal, new Date('2026-11-22T10:00:00.000Z'))).toBe(false);
  });

  it('a restore leaves nothing to appeal', () => {
    expect(canAppeal(decision({ outcome: 'Restore' }))).toBe(false);
  });
});
