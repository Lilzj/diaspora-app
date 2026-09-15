/**
 * Viewings, from both sides — 15 Sep 2026.
 *
 * A member could ask to see a home and the landlord had nowhere to answer.
 * These render the diary against `HousingViewingResponse` and walk each move.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ThemeProvider } from '@/design-system';
import type { HousingViewing } from '@/lib/housing-viewings-api';

const mockViewings = jest.fn();
const mockMutateAsync = jest.fn();
const mockShowAlert = jest.fn();

jest.mock('@/hooks/housing-viewings', () => ({
  useViewings: (side: string) => mockViewings(side),
  useUpdateViewing: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));
jest.mock('@/hooks/usePullToRefresh', () => ({ useRefreshControl: () => undefined }));
jest.mock('@/providers/notification-provider', () => ({
  ...jest.requireActual('@/providers/notification-provider'),
  useNotification: () => ({ showAlert: mockShowAlert }),
}));

// eslint-disable-next-line import/first
import ViewingsScreen from '../housing/viewings';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** Aisha's request to see David's Rose Hill room, as the diary serves it. */
function request(overrides: Partial<HousingViewing> = {}): HousingViewing {
  return {
    id: 'viewing-1',
    listingId: 'listing-1',
    listingTitle: 'Single room in a shared house, Rose Hill',
    listingSlug: 'single-room-rose-hill',
    landlordId: 'landlord-1',
    landlordName: 'Mensah Property Rentals',
    seekerUserId: 'aisha',
    seekerName: 'Aisha Okonkwo',
    seekerIsVerified: true,
    status: 'Requested',
    preferredAt: '2099-09-20T10:00:00Z',
    confirmedAt: null,
    durationMinutes: 30,
    isVirtual: false,
    place: null,
    message: 'Could I come on Saturday?',
    landlordFailedToAttend: null,
    closureReason: null,
    unlocksAddress: false,
    satisfiesReservationRequirement: false,
    history: [],
    createdAt: '2026-09-14T09:00:00Z',
    ...overrides,
  };
}

function given(items: HousingViewing[] | { error: unknown }) {
  const refetch = jest.fn();
  mockViewings.mockReturnValue(
    Array.isArray(items)
      ? { data: items, isLoading: false, isError: false, error: null, refetch }
      : { data: undefined, isLoading: false, isError: true, error: items.error, refetch }
  );
  return refetch;
}

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ViewingsScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ side: 'landlord' });
  mockMutateAsync.mockResolvedValue(request({ status: 'Scheduled' }));
});

describe('a landlord answering a request', () => {
  it('sees who asked, when they would like to come, and what they said', () => {
    given([request()]);
    renderScreen();

    expect(mockViewings).toHaveBeenCalledWith('landlord');
    expect(screen.getByText('Single room in a shared house, Rose Hill')).toBeTruthy();
    expect(screen.getByText(/Aisha Okonkwo/)).toBeTruthy();
    expect(screen.getByText(/✓ Verified/)).toBeTruthy();
    expect(screen.getByText('Waiting for your answer')).toBeTruthy();
    expect(screen.getByText(/Asked for/)).toBeTruthy();
    expect(screen.getByText('“Could I come on Saturday?”')).toBeTruthy();
    expect(screen.getByText('Agree a time')).toBeTruthy();
    expect(screen.getByText('Decline')).toBeTruthy();
  });

  it('agrees a time, and says so only once the platform has recorded it', async () => {
    given([request()]);
    renderScreen();

    fireEvent.press(screen.getByText('Agree a time'));
    fireEvent.changeText(screen.getByLabelText('Time'), '11:15');
    fireEvent.changeText(screen.getByLabelText('Where to meet'), 'At the front gate');
    fireEvent.press(screen.getByText('Agree this time'));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    const { viewingId, request: body } = mockMutateAsync.mock.calls[0][0];
    expect(viewingId).toBe('viewing-1');
    expect(body.action).toBe('Schedule');
    expect(body.place).toBe('At the front gate');
    expect(new Date(body.scheduledFor).getTime()).toBeGreaterThan(Date.now());

    await waitFor(() =>
      expect(mockShowAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }))
    );
  });

  it('refuses a time that is not a time, without calling the platform', () => {
    given([request()]);
    renderScreen();

    fireEvent.press(screen.getByText('Agree a time'));
    fireEvent.changeText(screen.getByLabelText('Time'), 'noon');
    fireEvent.press(screen.getByText('Agree this time'));

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockShowAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', title: 'Pick a time' }));
  });

  it('declines only after confirming, as a cancellation with a reason', async () => {
    given([request()]);
    renderScreen();

    fireEvent.press(screen.getByText('Decline'));
    const question = mockShowAlert.mock.calls[0][0];
    expect(question.type).toBe('question');
    expect(mockMutateAsync).not.toHaveBeenCalled();

    question.buttons.find((button: { text: string }) => button.text === 'Decline').onPress();

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        viewingId: 'viewing-1',
        request: { action: 'Cancel', reason: 'The host declined the request.' },
      })
    );
  });

  it('shows a refusal in the platform’s terms and never as done', async () => {
    mockMutateAsync.mockRejectedValue({ response: { data: { code: 'housing.viewing.transition-invalid' } } });
    given([request()]);
    renderScreen();

    fireEvent.press(screen.getByText('Agree a time'));
    fireEvent.changeText(screen.getByLabelText('Time'), '11:15');
    fireEvent.press(screen.getByText('Agree this time'));

    await waitFor(() =>
      expect(mockShowAlert).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: 'Nothing was changed', message: expect.stringMatching(/moved on/) })
      )
    );
    expect(mockShowAlert).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('says there are no requests when there are none', () => {
    given([]);
    renderScreen();

    expect(screen.getByText('No viewing requests yet')).toBeTruthy();
  });
});

describe('a member following their own request', () => {
  it('sees the host and can cancel, but cannot agree a time', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ side: 'member' });
    given([request()]);
    renderScreen();

    expect(mockViewings).toHaveBeenCalledWith('member');
    expect(screen.getByText('Host: Mensah Property Rentals')).toBeTruthy();
    expect(screen.getByText('Waiting for the host')).toBeTruthy();
    expect(screen.getByText('Cancel request')).toBeTruthy();
    expect(screen.queryByText('Agree a time')).toBeNull();
  });

  it('switches sides from the tabs', () => {
    given([]);
    renderScreen();

    fireEvent.press(screen.getByText('Your requests'));
    expect(mockViewings).toHaveBeenLastCalledWith('member');
    expect(screen.getByText('You have not asked to see a home yet')).toBeTruthy();
  });
});
