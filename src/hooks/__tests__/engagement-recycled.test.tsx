/**
 * A reaction or a bookmark is reported for the content it was about, and only
 * that content (FARCH-004, 27 Nov 2026).
 *
 * Posts and comments are drawn by lists that recycle their rows. A row's
 * `useReact` and `useBookmark` live on when FlashList hands the row the next
 * post, while the last post's request may still be pending, or may have failed.
 * Reported for whatever the row now shows, the next post would carry a spinner
 * or an error that is not its own. Each test hands one hook the next post, as
 * recycling does, and checks that only the post that was asked about says so.
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useBookmark, useReact } from '@/hooks/community-social';
import { createBookmark, reactToPost } from '@/lib/api/community-social-api';

jest.mock('@/lib/api/community-social-api', () => ({
  ...jest.requireActual('@/lib/api/community-social-api'),
  reactToPost: jest.fn(),
  createBookmark: jest.fn(),
}));

const failing = () => Promise.reject(new Error('offline'));

// A request still in flight, settled once its test is done. A mutation that
// never settles is never collected, and the collector's timer, rescheduled for
// as long as it is pending, would keep Jest from exiting.
let inFlight: (() => void)[] = [];
const hanging = () =>
  new Promise<void>((resolve) => {
    inFlight.push(resolve);
  });

const clients: QueryClient[] = [];

afterEach(() => {
  inFlight.forEach((settle) => settle());
  inFlight = [];
  clients.splice(0).forEach((client) => client.clear());
});

function harness() {
  // Nothing kept once unused, so no cache timer outlives the test.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return wrapper;
}

const post = (contentId: string) => ({ contentType: 'post' as const, contentId });

beforeEach(() => {
  (reactToPost as jest.Mock).mockReset();
  (createBookmark as jest.Mock).mockReset();
});

describe('a reaction', () => {
  it('that failed is said on its post, not on the next one the row shows', async () => {
    (reactToPost as jest.Mock).mockImplementation(failing);
    const { result, rerender } = renderHook(({ id }: { id: string }) => useReact(post(id)), {
      initialProps: { id: 'post-a' },
      wrapper: harness(),
    });

    await act(async () => {
      await result.current.react('like').catch(() => undefined);
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    rerender({ id: 'post-b' });
    expect(result.current.error).toBeNull();

    // Handed its own post again, the row says it again: the failure is that post's.
    rerender({ id: 'post-a' });
    expect(result.current.error).not.toBeNull();
  });

  it('still in flight is pending on its post only', async () => {
    (reactToPost as jest.Mock).mockImplementation(hanging);
    const { result, rerender } = renderHook(({ id }: { id: string }) => useReact(post(id)), {
      initialProps: { id: 'post-a' },
      wrapper: harness(),
    });

    act(() => {
      void result.current.react('like');
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));

    rerender({ id: 'post-b' });
    expect(result.current.isPending).toBe(false);
  });

  it('is sent for the post the row showed when it was asked', async () => {
    (reactToPost as jest.Mock).mockImplementation(hanging);
    const { result } = renderHook(() => useReact(post('post-a')), { wrapper: harness() });

    act(() => {
      void result.current.react('celebrate');
    });

    await waitFor(() => expect(reactToPost).toHaveBeenCalledWith('post-a', 'celebrate'));
  });
});

describe('a bookmark', () => {
  it('that failed is said on its post, not on the next one, when the hook knows its post', async () => {
    (createBookmark as jest.Mock).mockImplementation(failing);
    const { result, rerender } = renderHook(({ id }: { id: string }) => useBookmark(post(id)), {
      initialProps: { id: 'post-a' },
      wrapper: harness(),
    });

    await act(async () => {
      await result.current.save(post('post-a')).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    rerender({ id: 'post-b' });
    expect(result.current.error).toBeNull();
  });

  it('is reported whatever it was about, for a screen that names no post', async () => {
    (createBookmark as jest.Mock).mockImplementation(failing);
    const { result } = renderHook(() => useBookmark(), { wrapper: harness() });

    await act(async () => {
      await result.current.save(post('post-a')).catch(() => undefined);
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
  });
});
