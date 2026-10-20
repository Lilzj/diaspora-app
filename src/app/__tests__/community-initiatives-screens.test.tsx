/**
 * A community's initiatives, against what the real routes serve — 20 Oct 2026.
 *
 * The screens draw a control only where the server said so — "Start an
 * initiative" on `canManageInitiatives`, "Take part" on `canJoin`, "Edit" on
 * `canEdit`, the update form on `canPostUpdate` — and draw no progress bar,
 * because the server sends no progress figure. The update form names what it
 * still needs and waits; an unanswered write says it may have been saved.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ThemeProvider } from '@/design-system';
import type { CommunityInitiative } from '@/types/community-directory';

const mockCapabilities = jest.fn();
const mockList = jest.fn();
const mockOne = jest.fn();
const mockJoin = jest.fn();
const mockLeave = jest.fn();
const mockPost = jest.fn();
const mockMutations = jest.fn();

jest.mock('@/hooks/communities', () => ({
  useCommunity: () => ({
    data: { id: 'c1', slug: 'nigerians', name: 'Nigerians in Leeds', origin: {}, identity: {} },
    isLoading: false,
    unavailable: null,
  }),
  useCommunityCapabilities: () => mockCapabilities(),
  useCommunityInitiatives: (...args: unknown[]) => mockList(...args),
  useCommunityInitiative: () => mockOne(),
  useCommunityInitiativeUpdates: () => ({
    data: [{ id: 'up1', initiativeId: 'i1', title: 'First week', body: '12 coats', postedAt: '2026-10-08T00:00:00Z', author: null }],
    isLoading: false,
    isError: false,
  }),
  useCommunityInitiativeParticipants: () => ({
    data: [{ userId: 'u3', displayName: 'Kofi', joinedAt: '2026-10-02T00:00:00Z' }],
    isLoading: false,
    isError: false,
  }),
  useCommunityInitiativeMutations: () => mockMutations(),
}));

// eslint-disable-next-line import/first
import InitiativesRoute from '../community/[slug]/initiatives/index';
// eslint-disable-next-line import/first
import InitiativeRoute from '../community/[slug]/initiatives/[initiativeId]';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function initiative(overrides: Partial<CommunityInitiative> = {}): CommunityInitiative {
  return {
    id: 'i1',
    communityId: 'c1' as CommunityInitiative['communityId'],
    title: 'Winter coat drive',
    description: 'Coats for people who arrived this autumn.',
    status: 'Active',
    targetDate: '2026-12-31',
    startedAt: '2026-10-01T09:00:00Z',
    closedAt: null,
    organisers: [{ userId: 'u1', displayName: 'Ada', role: 'Ambassador' }],
    participantCount: 3,
    updateCount: 1,
    isParticipant: false,
    isOrganiser: false,
    canJoin: true,
    canEdit: false,
    canPostUpdate: false,
    createdAt: '2026-09-30T09:00:00Z',
    updatedAt: '2026-10-01T09:00:00Z',
    ...overrides,
  };
}

function mutation(extra: Record<string, unknown> = {}) {
  return { mutate: jest.fn(), mutateAsync: jest.fn(), reset: jest.fn(), isPending: false, error: null, ...extra };
}

function givenMutations(overrides: Record<string, unknown> = {}) {
  const join = mutation({ mutate: mockJoin });
  const leave = mutation({ mutate: mockLeave });
  const postUpdate = mutation({ mutateAsync: mockPost });
  mockMutations.mockReturnValue({ create: mutation(), update: mutation(), join, leave, postUpdate, ...overrides });
}

function renderWith(node: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{node}</ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ slug: 'nigerians', initiativeId: 'i1' });
  mockCapabilities.mockReturnValue({ isLoading: false, data: { communityId: 'c1', roles: [], canManageInitiatives: false } });
  givenMutations();
});

describe('the initiatives list', () => {
  function givenList(data: CommunityInitiative[], extra: Record<string, unknown> = {}) {
    mockList.mockReturnValue({ data, isLoading: false, isError: false, error: null, refetch: jest.fn(), unavailable: null, isSimulated: false, ...extra });
  }

  it('shows counts the server made, and no progress figure', () => {
    givenList([initiative()]);
    renderWith(<InitiativesRoute />);

    expect(screen.getByText(/3 taking part · 1 update/)).toBeTruthy();
    expect(screen.getByText(/Organised by Ada/)).toBeTruthy();
    expect(screen.queryByText(/Progress/)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    // No gap notice: nothing here is simulated.
    expect(screen.queryByTestId('multi-community-gap-notice-communityInitiatives')).toBeNull();
  });

  it('offers "Start an initiative" only on canManageInitiatives', () => {
    givenList([]);
    const first = renderWith(<InitiativesRoute />);
    expect(screen.queryByRole('button', { name: 'Start an initiative' })).toBeNull();
    first.unmount();

    mockCapabilities.mockReturnValue({ isLoading: false, data: { communityId: 'c1', roles: ['Ambassador'], canManageInitiatives: true } });
    renderWith(<InitiativesRoute />);
    expect(screen.getByRole('button', { name: 'Start an initiative' })).toBeTruthy();
  });

  it('asks the server for one status when a filter is chosen', () => {
    givenList([]);
    renderWith(<InitiativesRoute />);

    fireEvent.press(screen.getByRole('tab', { name: 'Show completed initiatives' }));
    expect(mockList).toHaveBeenLastCalledWith('c1', 'Completed');
  });

  it('shows an unanswered list as an error with the server’s words, never as an empty one', () => {
    givenList([], { isError: true, unavailable: 'error', error: { message: 'Diaspora could not be reached.' } });
    renderWith(<InitiativesRoute />);

    expect(screen.getByTestId('community-unavailable-error')).toBeTruthy();
    expect(screen.getByText('Diaspora could not be reached.')).toBeTruthy();
    expect(screen.queryByTestId('community-unavailable-empty')).toBeNull();
  });
});

describe('one initiative', () => {
  function givenOne(data: CommunityInitiative | undefined, extra: Record<string, unknown> = {}) {
    mockOne.mockReturnValue({ data, isLoading: false, isError: false, error: null, refetch: jest.fn(), unavailable: null, isSimulated: false, ...extra });
  }

  it('offers "Take part" where the server says canJoin, and sends it', () => {
    givenOne(initiative());
    renderWith(<InitiativeRoute />);

    fireEvent.press(screen.getByRole('button', { name: 'Take part' }));
    expect(mockJoin).toHaveBeenCalledWith('i1');
    expect(screen.queryByRole('button', { name: 'Edit this initiative' })).toBeNull();
    expect(screen.queryByTestId('initiative-update-form')).toBeNull();
  });

  it('offers "Stop taking part" to a participant', () => {
    givenOne(initiative({ isParticipant: true, canJoin: false }));
    renderWith(<InitiativeRoute />);

    fireEvent.press(screen.getByRole('button', { name: 'Stop taking part' }));
    expect(mockLeave).toHaveBeenCalledWith('i1');
  });

  it('lists updates and names those taking part, saying how many keep out of view', () => {
    givenOne(initiative());
    renderWith(<InitiativeRoute />);

    expect(screen.getByText('First week')).toBeTruthy();
    expect(screen.getByText('Kofi')).toBeTruthy();
    expect(screen.getByText('2 more people are taking part and keep their membership private.')).toBeTruthy();
  });

  it('names what the update form still needs, and waits', () => {
    givenOne(initiative({ canPostUpdate: true, canEdit: true }));
    renderWith(<InitiativeRoute />);

    expect(screen.getByText('Still needed: a title and what has happened.')).toBeTruthy();
    const post = screen.getByRole('button', { name: 'Post update' });
    expect(post.props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByLabelText('Update title'), 'Second week');
    expect(screen.getByText('Still needed: what has happened.')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('What has happened'), '30 coats');
    expect(screen.queryByTestId('initiative-update-missing')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Post update' }));
    expect(mockPost).toHaveBeenCalledWith({ initiativeId: 'i1', input: { title: 'Second week', body: '30 coats' } });
  });

  it('does not call an unanswered update a refusal', () => {
    givenOne(initiative({ canPostUpdate: true }));
    givenMutations({ postUpdate: mutation({ error: { isIndeterminate: true, message: 'timeout' } }) });
    renderWith(<InitiativeRoute />);

    expect(screen.getByText(/It may have been saved/)).toBeTruthy();
  });

  it('shows the server’s reason when the initiative cannot be read', () => {
    givenOne(undefined, { isError: true, unavailable: 'error', error: { message: 'This community has no such initiative.' } });
    renderWith(<InitiativeRoute />);

    expect(screen.getByText('This community has no such initiative.')).toBeTruthy();
  });
});
