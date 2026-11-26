/**
 * The root layout moves a member on exactly when a member-only group withholds
 * itself (FARCH-006).
 *
 * A group wrapped in `RequireMember` draws a splash instead of itself whenever
 * `memberRouteDecision` says anything but `enter`, and it does not navigate: it
 * relies on the root layout's redirects to move the member on. If the two ever
 * disagreed, a member would be left on a splash with nowhere to go, or pulled
 * out of a group they were let into. So this renders the real root layout, with
 * everything around its two redirects stubbed, on a member-only route, for every
 * kind of session, and holds where it sends the member to the group's decision.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { memberRouteDecision, type MemberSession } from '@/lib/platform/member-route';
import { useAuthStore } from '@/store/auth';
import type { AccountState } from '@/types/trust';

jest.mock('../../../global.css', () => ({}));
jest.mock('expo-router', () => ({
  Stack: Object.assign(() => null, { Screen: () => null }),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useSegments: () => ['wallet'],
}));
jest.mock('@/mocks', () => ({ initMocks: jest.fn() }));
jest.mock('@/providers/app-provider', () => ({
  AppProvider: ({ children }: { children: unknown }) => children,
}));
jest.mock('@/components/explore/TourProvider', () => ({
  TourProvider: ({ children }: { children: unknown }) => children,
}));
jest.mock('@/components/StartupLocationPrompt', () => ({ StartupLocationPrompt: () => null }));
jest.mock('@/components/VerificationDecisionNotice', () => ({ VerificationDecisionNotice: () => null }));
jest.mock('@/components/StartupNotificationPrompt', () => ({ StartupNotificationPrompt: () => null }));
jest.mock('@/components/RealtimeAlerts', () => ({ RealtimeAlerts: () => null }));
jest.mock('@/hooks/presence', () => ({ PresenceReporter: () => null }));
jest.mock('@/lib/location/relocation-hint', () => ({ recordSighting: jest.fn() }));
jest.mock('@/lib/integrations/push-lifecycle', () => ({ registerPushToken: jest.fn(() => Promise.resolve()) }));
jest.mock('@/lib/api/telemetry-api', () => ({ startTelemetryDelivery: jest.fn(() => () => undefined) }));
jest.mock('@/store/location', () => ({
  useLocationStore: { getState: () => ({ syncPermissionStatus: jest.fn() }) },
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// eslint-disable-next-line import/first
import RootLayout from '../_layout';

const HELD: AccountState[] = [
  'DiasporaVerificationPending',
  'VerificationUnderReview',
  'VerificationRejected',
  'RequiresMoreInformation',
  'Suspended',
  'Restricted',
  'AppealPending',
];

const MEMBER: MemberSession = {
  status: 'authenticated',
  isAuthenticated: true,
  isExploringLimited: false,
  accountState: 'DiasporaVerified',
};

const NO_SESSION: MemberSession = {
  status: 'unauthenticated',
  isAuthenticated: false,
  isExploringLimited: false,
  accountState: null,
};

const SESSIONS: [string, MemberSession][] = [
  ['a session not read yet', { ...NO_SESSION, status: 'unknown' }],
  ['a restore', { ...NO_SESSION, status: 'restoring' }],
  ['a cold-start refresh', { ...NO_SESSION, status: 'refreshing' }],
  ['no session', NO_SESSION],
  ['a verified member', MEMBER],
  ['a member with limited access', { ...MEMBER, accountState: 'LimitedAccess' }],
  ['a member whose profile has not loaded', { ...MEMBER, accountState: undefined }],
  ['a member mid-refresh', { ...MEMBER, status: 'refreshing' }],
  ['a held member mid-refresh', { ...MEMBER, status: 'refreshing', accountState: 'Suspended' }],
  ...HELD.map((accountState): [string, MemberSession] => [`a member held as ${accountState}`, { ...MEMBER, accountState }]),
  ...HELD.map((accountState): [string, MemberSession] => [
    `a member held as ${accountState} who chose to explore`,
    { ...MEMBER, accountState, isExploringLimited: true },
  ]),
];

const DESTINATION = { 'sign-in': '/(auth)/login', gateway: '/access-gateway' } as const;

beforeEach(() => {
  jest.clearAllMocks();
});

it.each(SESSIONS)('moves %s on exactly when a member-only group withholds itself', (_, session) => {
  useAuthStore.setState({
    status: session.status,
    isAuthenticated: session.isAuthenticated,
    isExploringLimited: session.isExploringLimited,
    user:
      session.accountState === null
        ? null
        : {
            userId: '01a05770-33f2-7600-8000-0000000000da',
            fullName: 'Ama Owusu',
            role: 'Member',
            accountState: session.accountState,
          },
    restore: jest.fn(() => Promise.resolve()),
    syncAccess: jest.fn(() => Promise.resolve()),
  } as never);

  render(<RootLayout />).unmount();

  const decision = memberRouteDecision(session);
  const sent = (router.replace as jest.Mock).mock.calls.map(([href]) => href);

  if (decision === 'sign-in' || decision === 'gateway') {
    // The group draws a splash; the root layout is what takes the member away.
    expect(sent).toEqual([DESTINATION[decision]]);
  } else if (decision === 'enter') {
    // The group is drawn; nothing pulls the member out of it.
    expect(sent).toEqual([]);
  } else {
    // Still deciding. Whatever the root layout does, it must not send a member
    // to sign in before it knows they are not one: that was the cold-start bug.
    expect(sent).not.toContain(DESTINATION['sign-in']);
  }
});
