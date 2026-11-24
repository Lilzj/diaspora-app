/**
 * The contributor page's Follow button, once the server answers (RMD-009).
 *
 * The header seeds its button from the follow-state entry and remounts it when
 * the entry changes. The follow hook wrote `answer.isFollowing` into that entry,
 * and the server's answer has no `isFollowing` — it is the follow edge, not the
 * state — so the entry held `undefined` and the button went back to "Follow"
 * the moment the server confirmed the follow. The stubs here are the server's
 * records, typed as them.
 */
import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContributorHeader } from '@/components/knowledge/ContributorHeader';
import { followStateKey } from '@/hooks/community-social';
import { apiClient } from '@/lib/transport/apiClient';
import { useAuthStore } from '@/store/auth';
import type { FollowResponse } from '@/types/community-social';

jest.mock('@/hooks/creator-economy', () => ({
  usePublicCreatorByUser: () => ({ creator: null, isLoading: false }),
}));

jest.mock('@/components/creator/ReputationPanel', () => ({
  PublicReputationPanel: () => null,
}));

const MEMBER = 'c0ffee00-0000-4000-8000-000000000001';
const VIEWER = 'c0ffee00-0000-4000-8000-0000000000ff';
const FOLLOWS = new RegExp(`/community/follows/${MEMBER}`);

let mock: MockAdapter;
let client: QueryClient;

/** What both follow routes answer: the edge and the new count. */
function edge(followerCount: number): { data: FollowResponse } {
  return {
    data: {
      followId: 'f0110000-0000-4000-8000-000000000002',
      followerId: VIEWER,
      followeeId: MEMBER,
      targetType: 'member',
      isMuted: false,
      followerCount,
      createdAt: '2026-11-24T09:00:00Z',
    },
  };
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  useAuthStore.setState({ isAuthenticated: true, user: { userId: VIEWER } as never });
});

afterEach(() => {
  client.clear();
  mock.restore();
});

function renderHeader() {
  return render(
    <QueryClientProvider client={client}>
      <ContributorHeader userId={MEMBER} />
    </QueryClientProvider>
  );
}

/** The write has been sent, answered and settled into the cache. */
async function settled(verb: 'post' | 'delete') {
  await waitFor(() => {
    expect(mock.history[verb]).toHaveLength(1);
    expect(client.isMutating()).toBe(0);
  });
}

it('stays on "Following" once the server confirms the follow', async () => {
  mock.onGet(FOLLOWS).reply(200, { data: { isFollowing: false, followerCount: 4 } });
  mock.onPost(FOLLOWS).reply(200, edge(5));

  renderHeader();
  fireEvent.press(await screen.findByLabelText('Follow this member.'));
  await settled('post');

  expect(client.getQueryData(followStateKey(MEMBER))).toEqual({ isFollowing: true, followerCount: 5 });
  await waitFor(() => expect(screen.getByLabelText('Following. Tap to unfollow.')).toBeTruthy());
  expect(screen.queryByLabelText('Follow this member.')).toBeNull();
});

it('lands on "Follow" with the server\'s count once an unfollow is confirmed', async () => {
  mock.onGet(FOLLOWS).reply(200, { data: { isFollowing: true, followerCount: 5 } });
  mock.onDelete(FOLLOWS).reply(200, edge(4));

  renderHeader();
  fireEvent.press(await screen.findByLabelText('Following. Tap to unfollow.'));
  await settled('delete');

  expect(client.getQueryData(followStateKey(MEMBER))).toEqual({ isFollowing: false, followerCount: 4 });
  await waitFor(() => expect(screen.getByLabelText('Follow this member.')).toBeTruthy());
});
