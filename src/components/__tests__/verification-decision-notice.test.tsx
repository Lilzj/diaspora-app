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

function setState(accountState: string) {
  act(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { ...(useAuthStore.getState().user ?? {}), fullName: 'Zoe Gbogodor', accountState } as never,
    });
  });
}

beforeEach(() => mockShowAlert.mockReset());

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

  it('says nothing to a member who was already verified', () => {
    setState('DiasporaVerified');
    render(<VerificationDecisionNotice />);
    setState('FullCommunityAccess');

    expect(mockShowAlert).not.toHaveBeenCalled();
  });
});
