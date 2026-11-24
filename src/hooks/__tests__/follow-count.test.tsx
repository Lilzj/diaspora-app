/**
 * The follower count after Follow — Android UAT, 3 Nov 2026.
 *
 * A member followed a contributor and the count stayed at 0 until they left
 * the screen and came back. The follow call's answer carries the new count and
 * was thrown away; the header waited for a second request, and the directory
 * rows read the Creator module's copy, which nothing refreshed.
 *
 * Now the count moves on the tap (and moves back if the server refuses), the
 * server's own count replaces the guess when it answers, and every place that
 * shows the count reads that same entry.
 *
 * The answer is stubbed as the server's record (RMD-009). Until then the stub
 * was the client's own shape, with an `isFollowing` no server sends, so these
 * tests passed while the hook wrote `undefined` into the entry — and the
 * contributor page, which seeds its button from the entry, showed "Follow"
 * again the moment the server confirmed the follow.
 */
import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { apiClient } from '@/lib/transport/apiClient';
import type { FollowResponse } from '@/types/community-social';
import { followStateKey, useFollow, useLiveFollowerCount } from '../community-social';

const MEMBER = 'a3c1f0de-0000-4000-8000-000000000001';
const FOLLOWS = new RegExp(`/community/follows/${MEMBER}`);

let mock: MockAdapter;
let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * What both follow routes answer: the edge and the target's new count. No
 * `isFollowing` — which route answered is the state.
 */
function followResponse(followerCount: number) {
  const edge: FollowResponse = {
    followId: 'f0110000-0000-4000-8000-000000000001',
    followerId: 'a3c1f0de-0000-4000-8000-0000000000ff',
    followeeId: MEMBER,
    targetType: 'member',
    isMuted: false,
    followerCount,
    createdAt: '2026-11-03T20:00:00Z',
  };
  return { data: edge };
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
});

afterEach(() => {
  client.clear();
  mock.restore();
});

describe('following a member', () => {
  it('counts the follow on the tap, before the server answers', async () => {
    client.setQueryData(followStateKey(MEMBER), { isFollowing: false, followerCount: 0 });

    let answer: (value: [number, unknown]) => void = () => undefined;
    mock.onPost(FOLLOWS).reply(() => new Promise((resolve) => { answer = resolve; }));

    const { result } = renderHook(() => useFollow(), { wrapper });

    let done: Promise<void> = Promise.resolve();
    act(() => { done = result.current.follow(MEMBER, { targetType: 'member', muted: false }); });

    await waitFor(() =>
      expect(client.getQueryData(followStateKey(MEMBER))).toEqual({ isFollowing: true, followerCount: 1 }));

    await act(async () => {
      answer([200, followResponse(1)]);
      await done;
    });
  });

  it("keeps the server's count once it answers, and that the member now follows", async () => {
    client.setQueryData(followStateKey(MEMBER), { isFollowing: false, followerCount: 0 });
    // Someone else followed in the meantime: the server knows 2.
    mock.onPost(FOLLOWS).reply(200, followResponse(2));

    const { result } = renderHook(() => useFollow(), { wrapper });
    await act(() => result.current.follow(MEMBER, { targetType: 'member', muted: false }));

    expect(client.getQueryData(followStateKey(MEMBER))).toEqual({ isFollowing: true, followerCount: 2 });
  });

  it('puts the count back when the server refuses', async () => {
    client.setQueryData(followStateKey(MEMBER), { isFollowing: false, followerCount: 4 });
    mock.onPost(FOLLOWS).reply(500, { error: { code: 'platform.unavailable' } });

    const { result } = renderHook(() => useFollow(), { wrapper });
    await act(async () => {
      await result.current.follow(MEMBER, { targetType: 'member', muted: false }).catch(() => undefined);
    });

    expect(client.getQueryData(followStateKey(MEMBER))).toEqual({ isFollowing: false, followerCount: 4 });
  });

  it('counts an unfollow down', async () => {
    client.setQueryData(followStateKey(MEMBER), { isFollowing: true, followerCount: 3 });
    mock.onDelete(FOLLOWS).reply(200, followResponse(2));

    const { result } = renderHook(() => useFollow(), { wrapper });
    await act(() => result.current.unfollow(MEMBER, 'member'));

    expect(client.getQueryData(followStateKey(MEMBER))).toEqual({ isFollowing: false, followerCount: 2 });
  });

  it("refreshes the Creator module's copy that the directory and profiles read", async () => {
    mock.onPost(FOLLOWS).reply(200, followResponse(1));
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useFollow(), { wrapper });
    await act(() => result.current.follow(MEMBER, { targetType: 'member', muted: false }));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['creator-gap', 'directory'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['creator-gap', 'profile', 'public'] });
  });
});

describe('useLiveFollowerCount', () => {
  it("shows the row's own count until a follow-state answer exists", () => {
    const { result } = renderHook(() => useLiveFollowerCount(MEMBER, 7), { wrapper });

    expect(result.current).toBe(7);
  });

  it('moves with the follow-state entry, without fetching it', async () => {
    const { result } = renderHook(() => useLiveFollowerCount(MEMBER, 0), { wrapper });

    act(() => { client.setQueryData(followStateKey(MEMBER), { isFollowing: true, followerCount: 1 }); });

    await waitFor(() => expect(result.current).toBe(1));
    expect(mock.history.get).toHaveLength(0);
  });
});
