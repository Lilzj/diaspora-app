/**
 * A member-only route group withholds itself (FARCH-006).
 *
 * The root layout's redirects run in effects, after a render. These hold the
 * group to the one thing that cannot do: nothing of it is drawn while the
 * session is unknown, and nothing survives the render that ends a session. And
 * it does not navigate, because the root layout already does.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import type { AccountState } from '@/types/trust';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

// eslint-disable-next-line import/first
import { RequireMember } from '../RequireMember';

const BALANCE = 'Balance £1,240.00';

function session(
  status: 'unknown' | 'restoring' | 'authenticated' | 'unauthenticated' | 'refreshing',
  accountState: AccountState | null = 'DiasporaVerified',
  isExploringLimited = false
) {
  const isAuthenticated = status === 'authenticated' || (status === 'refreshing' && accountState !== null);

  useAuthStore.setState({
    status,
    isAuthenticated,
    isExploringLimited,
    user:
      isAuthenticated && accountState !== null
        ? { userId: '01a05770-33f2-7600-8000-0000000000da', fullName: 'Ama Owusu', role: 'Member', accountState }
        : null,
  } as never);
}

function renderGroup() {
  return render(
    <RequireMember>
      <Text>{BALANCE}</Text>
    </RequireMember>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('shows the group to a member in good standing', () => {
  session('authenticated');
  renderGroup();

  expect(screen.getByText(BALANCE)).toBeTruthy();
  expect(screen.queryByTestId('member-route-splash')).toBeNull();
});

it.each(['unknown', 'restoring'] as const)('draws nothing of the group while the session is %s', (status) => {
  session(status, null);
  renderGroup();

  expect(screen.queryByText(BALANCE)).toBeNull();
  expect(screen.getByTestId('member-route-splash')).toBeTruthy();
});

it('takes the group off screen in the same render that ends the session', () => {
  session('authenticated');
  renderGroup();
  expect(screen.getByText(BALANCE)).toBeTruthy();

  act(() => {
    useAuthStore.setState({ status: 'unauthenticated', isAuthenticated: false, user: null } as never);
  });

  // Not a frame later: the root layout's redirect has not run yet, and the
  // balance is already gone.
  expect(screen.queryByText(BALANCE)).toBeNull();
  expect(screen.getByTestId('member-route-splash')).toBeTruthy();
});

it('withholds the group from a member held at the gateway', () => {
  session('authenticated', 'Suspended');
  renderGroup();

  expect(screen.queryByText(BALANCE)).toBeNull();
});

it('keeps the group on screen through a token refresh', () => {
  session('authenticated');
  renderGroup();

  act(() => {
    useAuthStore.setState({ status: 'refreshing' } as never);
  });

  expect(screen.getByText(BALANCE)).toBeTruthy();
});

it('never navigates: the root layout does that', () => {
  for (const [status, accountState] of [
    ['unknown', null],
    ['unauthenticated', null],
    ['authenticated', 'Suspended'],
  ] as const) {
    session(status, accountState);
    renderGroup().unmount();
  }

  expect(router.replace).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
});
