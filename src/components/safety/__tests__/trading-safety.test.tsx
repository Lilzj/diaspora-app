// Phase 11 (decided 7 Oct 2026): no escrow, so the app tells members how to
// trade safely, and shows the other member's trust level where they deal.

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { TradeSafetyNote } from '../TradeSafetyNote';
import { MemberTrustLine } from '../MemberTrustLine';
import { IN_APP_TIPS, IN_PERSON_TIPS, SAFETY_LINE, TRADING_SAFETY_ROUTE } from '@/lib/trading-safety';

let mockProfile: unknown = null;
jest.mock('@/hooks/trust', () => ({
  usePublicTrustProfile: () => ({ profile: mockProfile, isLoading: false, error: null }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = null;
});

describe('the guidance', () => {
  it('covers meeting in person and paying in the app, as decided', () => {
    const inPerson = IN_PERSON_TIPS.map((tip) => `${tip.title} ${tip.body}`).join(' ');
    const inApp = IN_APP_TIPS.map((tip) => `${tip.title} ${tip.body}`).join(' ');

    expect(inPerson).toMatch(/day/i);
    expect(inPerson).toMatch(/public place/i);
    expect(inApp).toMatch(/know or trust/i);
    expect(inApp).toMatch(/trust level/i);
    // It never promises a protection the platform does not give.
    expect(`${inPerson} ${inApp} ${SAFETY_LINE}`).not.toMatch(/escrow protects|money back|held until/i);
  });
});

describe('TradeSafetyNote', () => {
  it('says the line and opens the full page', () => {
    const { getByTestId, getByText } = render(<TradeSafetyNote />);

    expect(getByText(/Meeting in person\?/)).toBeTruthy();
    fireEvent.press(getByTestId('trade-safety-note'));
    expect(router.push).toHaveBeenCalledWith(TRADING_SAFETY_ROUTE);
  });
});

describe('MemberTrustLine', () => {
  it('shows nothing until the platform has answered', () => {
    const { queryByTestId } = render(<MemberTrustLine userId="u1" />);
    expect(queryByTestId('member-trust-line')).toBeNull();
  });

  it('names a trusted member plainly', () => {
    mockProfile = { trustLevel: 'Trusted', isVerifiedMember: true, memberSince: '2025-03-01T00:00:00Z' };
    const { getByText, queryByText } = render(<MemberTrustLine userId="u1" />);

    expect(getByText(/Trust level: Trusted member · Verified · Member since 2025/)).toBeTruthy();
    expect(queryByText(/still building trust/)).toBeNull();
  });

  it('warns beside a member who is still building trust', () => {
    mockProfile = { trustLevel: 'Basic', isVerifiedMember: false, memberSince: '2026-10-01T00:00:00Z' };
    const { getByText } = render(<MemberTrustLine userId="u1" />);

    expect(getByText(/Trust level: New member/)).toBeTruthy();
    expect(getByText(/avoid paying in advance/)).toBeTruthy();
  });
});
