/**
 * Community administration, as the member sees it — 11 Sep 2026.
 *
 * "The person that creates the community is the owner of the community and can
 * also assign roles to members, and a community creator is automatically member
 * of the administrator."
 *
 * The server decides every one of these; what the screen owes the member is to
 * offer exactly what the server will accept, and to show its refusals as written.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import type { CommunityCapabilities, CommunityMember } from '@/types/community-directory';
import { noCommunityCapabilities } from '@/types/community-directory';
import { rolesForDisplay } from '@/components/community-directory';

const mockShowAlert = jest.fn();
const mockMutate = jest.fn();

let mockCapabilities: CommunityCapabilities;
let mockMembers: CommunityMember[];

jest.mock('@/providers/notification-provider', () => ({
  useNotification: () => ({ showAlert: mockShowAlert }),
}));

jest.mock('@/components/layout/bottom-inset', () => ({ useBottomInset: () => 0 }));

jest.mock('@/hooks/communities', () => ({
  useCommunity: () => ({
    data: { id: 'c1', name: 'Nigerians in Leeds', slug: 'nigerians-in-leeds' },
    isLoading: false,
  }),
  useCommunityCapabilities: () => ({ data: mockCapabilities, isLoading: false }),
  useCommunityMembers: () => ({
    members: mockMembers,
    isLoading: false,
    isError: false,
    hasMore: false,
    isFetchingMore: false,
    loadMore: jest.fn(),
  }),
  useChangeCommunityRole: () => ({ mutate: mockMutate, isPending: false }),
}));

// The avatar pulls in image machinery this test has no use for.
jest.mock('@/components/community-directory', () => {
  const actual = jest.requireActual('@/components/community-directory');
  return { ...actual, CommunityAvatar: () => null };
});

// eslint-disable-next-line import/first
import CommunityMembersScreen from '../[slug]/members';

const OWNER: CommunityMember = {
  userId: 'owner',
  displayName: 'Ada Founder',
  roles: ['Owner', 'Administrator'],
  visibility: 'CommunityOnly',
  joinedAt: null,
  isYou: false,
};

const MEMBER: CommunityMember = {
  userId: 'm1',
  displayName: 'Kemi Member',
  roles: [],
  visibility: 'CommunityOnly',
  joinedAt: null,
  isYou: false,
};

const ME: CommunityMember = {
  userId: 'me',
  displayName: 'Me',
  roles: ['Administrator'],
  visibility: 'CommunityOnly',
  joinedAt: null,
  isYou: true,
};

function withCapabilities(overrides: Partial<CommunityCapabilities>): CommunityCapabilities {
  return { ...noCommunityCapabilities('c1' as never), canViewMembers: true, ...overrides };
}

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen() {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ slug: 'nigerians-in-leeds' });
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <CommunityMembersScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** The labels of the buttons in the most recent alert. */
function lastButtons(): string[] {
  const call = mockShowAlert.mock.calls[mockShowAlert.mock.calls.length - 1][0];
  return (call.buttons ?? []).map((button: { text: string }) => button.text);
}

beforeEach(() => {
  mockShowAlert.mockReset();
  mockMutate.mockReset();
  mockMembers = [OWNER, MEMBER, ME];
});

describe('who is offered what', () => {
  it('offers a plain member nothing to change', () => {
    mockCapabilities = withCapabilities({});
    renderScreen();

    expect(screen.queryByText('Roles')).toBeNull();
  });

  it('never offers anybody a way to change the owner, or their own roles', () => {
    // Owner is founded, not given; your own roles are somebody else's to change.
    mockCapabilities = withCapabilities({ canManageRoles: true, canAppointAdministrators: true });
    renderScreen();

    expect(screen.getAllByText('Roles')).toHaveLength(1);
    expect(screen.getByLabelText('Change roles for Kemi Member')).toBeTruthy();
    expect(screen.queryByLabelText('Change roles for Ada Founder')).toBeNull();
    expect(screen.queryByLabelText('Change roles for Me')).toBeNull();
  });

  it('gives an administrator moderator and ambassador, and not administrator', () => {
    mockCapabilities = withCapabilities({ canManageRoles: true, canAppointAdministrators: false });
    renderScreen();

    fireEvent.press(screen.getByLabelText('Change roles for Kemi Member'));

    expect(lastButtons()).toEqual(['Make moderator', 'Make ambassador', 'Cancel']);
  });

  it('gives the owner administrator as well', () => {
    mockCapabilities = withCapabilities({ canManageRoles: true, canAppointAdministrators: true });
    renderScreen();

    fireEvent.press(screen.getByLabelText('Change roles for Kemi Member'));

    expect(lastButtons()).toEqual([
      'Make moderator',
      'Make ambassador',
      'Make administrator',
      'Cancel',
    ]);
  });

  it('offers to remove a role the member already holds', () => {
    mockMembers = [{ ...MEMBER, roles: ['Moderator'] }];
    mockCapabilities = withCapabilities({ canManageRoles: true });
    renderScreen();

    fireEvent.press(screen.getByLabelText('Change roles for Kemi Member'));

    expect(lastButtons()).toContain('Remove moderator');
  });

  it('confirms before changing anything, then sends the change', () => {
    mockCapabilities = withCapabilities({ canManageRoles: true });
    renderScreen();

    fireEvent.press(screen.getByLabelText('Change roles for Kemi Member'));
    const choose = mockShowAlert.mock.calls[0][0].buttons[0];
    choose.onPress();

    expect(mockMutate).not.toHaveBeenCalled();

    const confirm = mockShowAlert.mock.calls[1][0];
    expect(confirm.title).toBe('Make Kemi Member a moderator?');
    confirm.buttons[1].onPress();

    expect(mockMutate).toHaveBeenCalledWith(
      { userId: 'm1', role: 'Moderator', granted: true },
      expect.any(Object)
    );
  });

  it('shows the server refusal as it was written', () => {
    mockCapabilities = withCapabilities({ canManageRoles: true });
    renderScreen();

    fireEvent.press(screen.getByLabelText('Change roles for Kemi Member'));
    mockShowAlert.mock.calls[0][0].buttons[0].onPress();
    mockShowAlert.mock.calls[1][0].buttons[1].onPress();

    const { onError } = mockMutate.mock.calls[0][1];
    onError(
      new Error(
        'This member keeps their membership private. They need to make it visible to the community before they can hold a role.'
      )
    );

    const refusal = mockShowAlert.mock.calls[2][0];
    expect(refusal.type).toBe('error');
    expect(refusal.message).toMatch(/keeps their membership private/);
  });
});

describe('the list itself', () => {
  it('never prints an id where a name belongs', () => {
    mockMembers = [{ ...MEMBER, displayName: null }];
    mockCapabilities = withCapabilities({});
    renderScreen();

    expect(screen.getByText('A member')).toBeTruthy();
    expect(screen.queryByText('m1')).toBeNull();
  });

  it('refuses the list to somebody who is not a member, rather than showing it empty', () => {
    mockCapabilities = noCommunityCapabilities('c1' as never);
    renderScreen();

    expect(screen.queryByText('Kemi Member')).toBeNull();
  });
});

describe('badges', () => {
  it('shows an owner one badge, not Owner and Admin', () => {
    expect(rolesForDisplay(['Owner', 'Administrator'])).toEqual(['Owner']);
  });

  it('keeps other roles beside Owner, in order', () => {
    expect(rolesForDisplay(['Administrator', 'Moderator', 'Owner'])).toEqual(['Owner', 'Moderator']);
  });

  it('shows nothing for a plain member', () => {
    expect(rolesForDisplay(['Member'])).toEqual([]);
  });
});
