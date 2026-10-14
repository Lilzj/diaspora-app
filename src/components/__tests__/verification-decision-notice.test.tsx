// The approval is announced (14 Oct 2026): a member watching the waiting screen
// used to see it change underneath them, 10 to 15 seconds late, with no word.

import React from 'react';
import { act, render } from '@testing-library/react-native';

import { VerificationDecisionNotice } from '@/components/VerificationDecisionNotice';
import { useAuthStore } from '@/store/auth';

const mockShowAlert = jest.fn();
jest.mock('@/providers/notification-provider', () => ({
  useNotification: () => ({ showAlert: mockShowAlert, showToast: jest.fn() }),
}));

// The member's socket: frames are delivered by calling the captured handler.
const mockFrameHandlers: Array<(change: { resourceType: string; changeKind: string }) => void> = [];
const mockConnect = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/realtime', () => ({
  getRealtimeClient: () => ({
    connect: mockConnect,
    getConnectionState: () => 'connected',
    onConnectionStateChange: () => () => undefined,
    onResourceChanged: (handler: (change: { resourceType: string; changeKind: string }) => void) => {
      mockFrameHandlers.push(handler);
      return () => mockFrameHandlers.splice(mockFrameHandlers.indexOf(handler), 1);
    },
  }),
}));

function setState(accountState: string) {
  act(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { ...(useAuthStore.getState().user ?? {}), userId: 'u-1', fullName: 'Zoe Gbogodor', accountState } as never,
    });
  });
}

beforeEach(() => {
  mockShowAlert.mockReset();
  mockFrameHandlers.length = 0;
});

describe('VerificationDecisionNotice', () => {
  it('welcomes a waiting member the moment they are approved', () => {
    setState('VerificationUnderReview');
    render(<VerificationDecisionNotice />);
    expect(mockShowAlert).not.toHaveBeenCalled();

    setState('DiasporaVerified');

    expect(mockShowAlert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: "You're verified, Zoe!" })
    );
  });

  it('asks for its access when the socket says it changed, and never polls', () => {
    jest.useFakeTimers();
    const syncAccess = jest.fn().mockResolvedValue(undefined);
    act(() => useAuthStore.setState({ syncAccess } as never));
    setState('VerificationUnderReview');
    render(<VerificationDecisionNotice />);

    expect(mockConnect).toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(60_000));
    expect(syncAccess).not.toHaveBeenCalled();

    act(() => mockFrameHandlers.forEach((h) => h({ resourceType: 'listing', changeKind: 'updated' })));
    expect(syncAccess).not.toHaveBeenCalled();

    act(() => mockFrameHandlers.forEach((h) => h({ resourceType: 'account', changeKind: 'access.changed' })));
    expect(syncAccess).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('says nothing to a member who was already verified', () => {
    setState('DiasporaVerified');
    render(<VerificationDecisionNotice />);
    setState('FullCommunityAccess');

    expect(mockShowAlert).not.toHaveBeenCalled();
  });
});
