// useDeviceDraft, the one draft hook (FARCH-007, 27 Nov 2026).
//
// Six wizards wrote this by hand: a module variable typed `any`, a banner, a
// load on opening, restore and discard. These tests hold the hook to what those
// copies did, and to the two things they did not: a draft discarded from the
// Draft Center is forgotten by the wizard too, and the verification wizard's
// draft, kept under a key of its own, is moved across rather than lost.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  clearDeviceDraft,
  listDeviceDrafts,
  saveDeviceDraft,
  useDeviceDraft,
  type DraftKind,
} from '@/lib/platform/device-drafts';

const KINDS: DraftKind[] = ['provider', 'housing', 'marketplace', 'verification', 'guide', 'update'];
const KEY_PREFIX = 'diaspora_wizard_draft_';
const LEGACY_VERIFICATION_KEY = 'diaspora_verification_draft';

interface Draft {
  title: string;
  step?: number;
}

/** Every key this test wrote, so a test can say what reached the phone. */
async function storedKeys(): Promise<readonly string[]> {
  return AsyncStorage.getAllKeys();
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(async () => {
  // The hook holds each kind's draft in module state for the session. Through
  // its own API, so the tests leave nothing behind for the next one.
  for (const kind of KINDS) {
    const { result, unmount } = renderHook(() => useDeviceDraft<Draft>(kind));
    act(() => result.current.clear());
    unmount();
  }
  await act(async () => {
    await AsyncStorage.clear();
  });
});

describe('a draft kept on the phone', () => {
  it('is offered when the wizard opens, and restoring hands it back and hides the banner', async () => {
    await saveDeviceDraft('marketplace', { title: 'A bicycle' }, 'A bicycle');

    const { result } = renderHook(() => useDeviceDraft<Draft>('marketplace'));
    expect(result.current.bannerVisible).toBe(false);
    await waitFor(() => expect(result.current.bannerVisible).toBe(true));

    let restored: Draft | null = null;
    act(() => {
      restored = result.current.restore();
    });
    expect(restored).toEqual({ title: 'A bicycle' });
    expect(result.current.bannerVisible).toBe(false);
  });

  it('is written to the phone under its title on every save', async () => {
    const { result } = renderHook(() => useDeviceDraft<Draft>('housing'));
    act(() => result.current.save({ title: 'Two rooms in Accra' }, 'Two rooms in Accra'));

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(KEY_PREFIX + 'housing');
      expect(raw && JSON.parse(raw)).toMatchObject({
        title: 'Two rooms in Accra',
        data: { title: 'Two rooms in Accra' },
      });
    });
  });

  it('is offered at once on reopening the same session, without waiting for storage', async () => {
    const first = renderHook(() => useDeviceDraft<Draft>('housing'));
    act(() => first.result.current.save({ title: 'Two rooms' }));
    first.unmount();

    const { result } = renderHook(() => useDeviceDraft<Draft>('housing'));
    // The first render, before any effect or read: no flash of a form without it.
    expect(result.current.bannerVisible).toBe(true);
  });

  it('is still held when the wizard closed before the phone was read', async () => {
    await saveDeviceDraft('provider', { title: 'Barbers' }, 'Barbers');

    const early = renderHook(() => useDeviceDraft<Draft>('provider'));
    early.unmount();
    await act(async () => {
      await Promise.resolve();
    });

    const { result } = renderHook(() => useDeviceDraft<Draft>('provider'));
    expect(result.current.bannerVisible).toBe(true);
  });

  it('is thrown away on discard, in this session and on the phone', async () => {
    const { result, unmount } = renderHook(() => useDeviceDraft<Draft>('marketplace'));
    act(() => result.current.save({ title: 'A lamp' }));
    act(() => result.current.discard());

    expect(result.current.bannerVisible).toBe(false);
    expect(result.current.hasDraft()).toBe(false);
    await waitFor(async () => expect(await AsyncStorage.getItem(KEY_PREFIX + 'marketplace')).toBeNull());
    unmount();

    const reopened = renderHook(() => useDeviceDraft<Draft>('marketplace'));
    expect(reopened.result.current.bannerVisible).toBe(false);
  });

  it('is forgotten by its wizard when the Draft Center discards it', async () => {
    // The three copies kept their own module variable, which the Draft Center
    // could not reach: a draft discarded there was offered again by the wizard
    // until the app restarted.
    const first = renderHook(() => useDeviceDraft<Draft>('provider'));
    act(() => first.result.current.save({ title: 'Tailor' }));
    first.unmount();

    await act(async () => {
      await clearDeviceDraft('provider');
    });

    const { result } = renderHook(() => useDeviceDraft<Draft>('provider'));
    expect(result.current.bannerVisible).toBe(false);
    expect(result.current.hasDraft()).toBe(false);
  });
});

describe('restoring with no draft', () => {
  it('hands back nothing', () => {
    const { result } = renderHook(() => useDeviceDraft<Draft>('housing'));
    let restored: Draft | null = { title: 'not called' };
    act(() => {
      restored = result.current.restore();
    });
    expect(restored).toBeNull();
  });
});

describe('hasDraft', () => {
  it('is true from the first save, restored or not, until the draft is cleared', () => {
    const { result } = renderHook(() => useDeviceDraft<Draft>('guide'));
    expect(result.current.hasDraft()).toBe(false);

    act(() => result.current.save({ title: 'Opening a bank account' }));
    expect(result.current.hasDraft()).toBe(true);

    act(() => {
      result.current.restore();
    });
    expect(result.current.hasDraft()).toBe(true);

    act(() => result.current.clear());
    expect(result.current.hasDraft()).toBe(false);
  });
});

describe('a session draft', () => {
  it.each(['guide', 'update'] as const)('(%s) is never read from or written to the phone', async (kind) => {
    const { result, unmount } = renderHook(() => useDeviceDraft<Draft>(kind));
    act(() => result.current.save({ title: 'Power cut on Ring Road' }));
    unmount();

    const reopened = renderHook(() => useDeviceDraft<Draft>(kind));
    expect(reopened.result.current.bannerVisible).toBe(true);
    act(() => reopened.result.current.discard());
    await act(async () => {
      await Promise.resolve();
    });

    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(await storedKeys()).toEqual([]);
  });
});

describe('the verification draft', () => {
  it('kept under its old key is moved across the first time it is read', async () => {
    // What the wizard wrote by hand before 27 Nov 2026: the draft itself, unwrapped.
    await AsyncStorage.setItem(LEGACY_VERIFICATION_KEY, JSON.stringify({ title: 'GH', step: 2 }));

    const { result } = renderHook(() => useDeviceDraft<Draft>('verification'));
    await waitFor(() => expect(result.current.bannerVisible).toBe(true));

    let restored: Draft | null = null;
    act(() => {
      restored = result.current.restore();
    });
    expect(restored).toEqual({ title: 'GH', step: 2 });

    expect(await AsyncStorage.getItem(LEGACY_VERIFICATION_KEY)).toBeNull();
    const moved = await AsyncStorage.getItem(KEY_PREFIX + 'verification');
    expect(moved && JSON.parse(moved)).toMatchObject({ data: { title: 'GH', step: 2 } });
  });

  it('is not listed in the Draft Center', async () => {
    await saveDeviceDraft('verification', { title: 'GH' });
    await saveDeviceDraft('housing', { title: 'Two rooms' }, 'Two rooms');

    const listed = await listDeviceDrafts();
    expect(listed.map((draft) => draft.kind)).toEqual(['housing']);
  });

  it('is cleared from both keys once the application is sent', async () => {
    await AsyncStorage.setItem(LEGACY_VERIFICATION_KEY, JSON.stringify({ title: 'GH' }));
    await saveDeviceDraft('verification', { title: 'GH' });

    const { result } = renderHook(() => useDeviceDraft<Draft>('verification'));
    act(() => result.current.clear());

    await waitFor(async () => {
      expect(await AsyncStorage.getItem(KEY_PREFIX + 'verification')).toBeNull();
      expect(await AsyncStorage.getItem(LEGACY_VERIFICATION_KEY)).toBeNull();
    });
  });
});
