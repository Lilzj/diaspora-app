// ─────────────────────────────────────────────────────────────────────────────
// Live alerts on the map — 16 Sep 2026
//
// `useMapRealtime` used to poll once a minute and say so, because the platform
// had no geographic channel. It now joins the viewport's alert cells and says
// `live` — but only when that is true. These tests hold both halves: live when
// the connection is up and every cell was joined, and the honest `polling`
// otherwise, which is the promise §43 forbids breaking about safety data.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { ResourceChangedPayload } from '@/lib/realtime';

type FrameHandler = (change: ResourceChangedPayload) => void;

const mockFakeClient = {
  state: 'connected' as string,
  joinAnswer: true,
  joined: [] as string[],
  left: [] as string[],
  frameHandlers: new Set<FrameHandler>(),
  getConnectionState() {
    return this.state;
  },
  async joinGroup(group: string) {
    this.joined.push(group);
    return this.joinAnswer;
  },
  async leaveGroup(group: string) {
    this.left.push(group);
  },
  onResourceChanged(handler: FrameHandler) {
    this.frameHandlers.add(handler);
    return () => this.frameHandlers.delete(handler);
  },
  connectCalls: 0,
  async connect() {
    this.connectCalls += 1;
  },
  onConnectionStateChange() {
    return () => undefined;
  },
};

let mockClientPresent = true;

jest.mock('@/lib/realtime', () => ({
  getRealtimeClient: () => mockFakeClient,
}));

// Signed in, or not: the map opens the connection only for a member.
jest.mock('@/store/auth', () => ({
  useAuthStore: (select: (state: { user: { userId: string } | null }) => unknown) =>
    select({ user: mockClientPresent ? { userId: 'member-1' } : null }),
}));

jest.mock('@/config/map-config', () => ({
  getMapFeatureFlags: () => ({ realtimeMapUpdatesEnabled: true, communityAlertsEnabled: true }),
}));

// Imported after the mocks, so the hook sees them.
// eslint-disable-next-line import/first
import { useMapRealtime } from '../maps';

const LONDON = { north: 51.55, south: 51.4, east: 0.1, west: -0.25 };

let queryClient: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient();
  mockClientPresent = true;
  mockFakeClient.state = 'connected';
  mockFakeClient.joinAnswer = true;
  mockFakeClient.joined = [];
  mockFakeClient.left = [];
  mockFakeClient.frameHandlers.clear();
  mockFakeClient.connectCalls = 0;
});

afterEach(() => {
  queryClient.clear();
});

describe('useMapRealtime', () => {
  it('joins the viewport’s alert cells and says live', async () => {
    const { result } = renderHook(() => useMapRealtime(LONDON), { wrapper });

    await waitFor(() => expect(result.current.mode).toBe('live'));

    expect(mockFakeClient.joined.length).toBeGreaterThan(0);
    expect(mockFakeClient.joined.every((group) => group.startsWith('geo:alerts:'))).toBe(true);
  });

  it('refetches the alerts when a frame about an alert arrives', async () => {
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useMapRealtime(LONDON), { wrapper });

    await waitFor(() => expect(result.current.mode).toBe('live'));
    invalidate.mockClear();

    jest.useFakeTimers();
    try {
      act(() => {
        mockFakeClient.frameHandlers.forEach((handler) =>
          handler({
            resourceType: 'alert',
            resourceId: 'a1',
            changeKind: 'status.changed',
            reason: 'withdrawn',
            occurredAt: '2026-09-16T12:00:00Z',
          })
        );
        jest.advanceTimersByTime(500);
      });
    } finally {
      jest.useRealTimers();
    }

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['maps', 'alerts'] });
  });

  it('opens the connection itself, rather than waiting for the Messages tab to', async () => {
    const { result } = renderHook(() => useMapRealtime(LONDON), { wrapper });

    await waitFor(() => expect(result.current.mode).toBe('live'));
    expect(mockFakeClient.connectCalls).toBeGreaterThan(0);
  });

  it('says polling, not live, for somebody not signed in', async () => {
    mockClientPresent = false;

    const { result } = renderHook(() => useMapRealtime(LONDON), { wrapper });

    await waitFor(() => expect(result.current.mode).toBe('polling'));
    expect(mockFakeClient.connectCalls).toBe(0);
  });

  it('says polling while the connection is down', async () => {
    mockFakeClient.state = 'disconnected';

    const { result } = renderHook(() => useMapRealtime(LONDON), { wrapper });

    await waitFor(() => expect(result.current.mode).toBe('polling'));
    expect(mockFakeClient.joined).toEqual([]);
  });

  it('says polling when the hub refused a cell', async () => {
    mockFakeClient.joinAnswer = false;

    const { result } = renderHook(() => useMapRealtime(LONDON), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.mode).toBe('polling');
  });

  it('says polling for a viewport too wide to watch', async () => {
    const { result } = renderHook(
      () => useMapRealtime({ north: 58.6, south: 49.9, east: 1.8, west: -8.2 }),
      { wrapper }
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.mode).toBe('polling');
    expect(mockFakeClient.joined).toEqual([]);
  });

  it('leaves its cells when the map goes away', async () => {
    const { result, unmount } = renderHook(() => useMapRealtime(LONDON), { wrapper });

    await waitFor(() => expect(result.current.mode).toBe('live'));
    unmount();

    expect([...mockFakeClient.left].sort()).toEqual([...mockFakeClient.joined].sort());
  });
});
