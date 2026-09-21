// ─────────────────────────────────────────────────────────────────────────────
// A failed upload says what went wrong — 21 Sep 2026
//
// `messageFor` read the platform's problem envelope and, finding none, said
// "That file could not be uploaded. Please try again." for everything else.
//
// The failure that actually happens carries no envelope. When a body is still
// arriving after the client's timeout, or the socket drops, `uploadOverXhr`
// rejects from `ontimeout`/`onerror` with `status: 0` and no body — so the one
// case a member is most likely to hit was the one case they were told nothing
// about, and "Please try again" asks them to send the same bytes over the same
// connection and watch it fail the same way.
//
// These tests go through `useMediaUpload` rather than calling `messageFor`,
// which is private and should stay that way: what matters is the sentence that
// reaches `state.error`, and that is reachable the way the screens reach it.
// ─────────────────────────────────────────────────────────────────────────────

import { act, renderHook } from '@testing-library/react-native';

import { useMediaUpload } from '../media';
import type { LocalFile } from '@/types/media';

const WAS_DEV = (global as { __DEV__?: boolean }).__DEV__;
const OriginalXhr = (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest;

/** What the transport does to this attempt. One member per branch it can take. */
type Outcome =
  | { fire: 'error' }
  | { fire: 'timeout' }
  | { fire: 'status'; status: number; body: unknown };

let outcome: Outcome;

beforeEach(() => {
  // `__DEV__` is true under jest, and `uploadDirect` sends a dev build through
  // the mock adapter. Without this the tests below would never reach the
  // transport whose failures they are about.
  (global as { __DEV__?: boolean }).__DEV__ = false;
  outcome = { fire: 'error' };

  class FailingXhr {
    status = 0;
    responseText = '';
    timeout = 0;
    responseType = '';
    upload = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    open() {}
    setRequestHeader() {}
    abort() {}
    send() {
      // Read once. `outcome` is a mutable binding from an enclosing scope, so
      // TypeScript drops the narrowing the moment a call it cannot see through
      // — `this.onerror?.()` — could have reassigned it.
      const plan = outcome;

      if (plan.fire === 'error') {
        this.onerror?.();
        return;
      }

      if (plan.fire === 'timeout') {
        this.ontimeout?.();
        return;
      }

      this.status = plan.status;
      this.responseText = plan.body === null ? '' : JSON.stringify(plan.body);
      this.onload?.();
    }
  }

  (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FailingXhr;
});

afterEach(() => {
  (global as { __DEV__?: boolean }).__DEV__ = WAS_DEV;
  (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = OriginalXhr;
});

const PHOTO: LocalFile = {
  uri: 'file:///tmp/IMG_0042.jpg',
  name: 'IMG_0042.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 4_812_004,
};

async function uploadAndRead(): Promise<string | null> {
  const { result } = renderHook(() => useMediaUpload());

  await act(async () => {
    await result.current.upload(PHOTO);
  });

  return result.current.error;
}

describe('the sentence a member reads when an upload fails', () => {
  it('names the connection when the upload never completed', async () => {
    outcome = { fire: 'error' };

    const message = await uploadAndRead();

    expect(message).toMatch(/connection/i);
    expect(message).not.toMatch(/please try again/i);
  });

  /**
   * A timeout is the same story from the other side: `uploadOverXhr` reports
   * both as status 0, deliberately, because to the member they are one thing —
   * the photo did not get there.
   */
  it('says the same of a timeout, which is the same failure', async () => {
    outcome = { fire: 'timeout' };

    expect(await uploadAndRead()).toMatch(/connection/i);
  });

  it('says a photo is too large when the platform refuses it for size', async () => {
    outcome = { fire: 'status', status: 413, body: null };

    expect(await uploadAndRead()).toMatch(/too large/i);
  });

  it('says a body arriving too slowly ran out of time', async () => {
    outcome = { fire: 'status', status: 408, body: null };

    expect(await uploadAndRead()).toMatch(/too slow/i);
  });

  /**
   * The platform's own words still win. Everything above is what to say when
   * there is nothing better; a `detail` from the server is better, and a size
   * message invented here would be talking over it.
   */
  it('defers to the platform when the platform explained itself', async () => {
    outcome = {
      fire: 'status',
      status: 413,
      body: { detail: 'Images must be under 10 MB.' },
    };

    expect(await uploadAndRead()).toBe('Images must be under 10 MB.');
  });
});
