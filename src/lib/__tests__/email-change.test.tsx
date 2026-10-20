// ─────────────────────────────────────────────────────────────────────────────
// Changing the sign-in address — 20 Oct 2026 (backend 708ff70)
//
// Driven at the network boundary through the served route, `PUT /auth/email`,
// with the answers the backend's own integration tests pin: a 200 that echoes
// `pendingAddress` while `address` stays the old one, a 400 carrying
// `Identity.User.IncorrectCurrentPassword`, a 429 with Retry-After, a 503 when
// email cannot be sent, and no answer at all.
//
// Then the half the server cannot do: `GET /auth/email` never repeats the
// pending address, so the device keeps it, and forgets it once the address
// moves or the link expires.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { apiClient } from '@/lib/apiClient';
import { requestEmailChange, isEmailChangeError, type EmailChangeError } from '@/lib/auth-api';
import {
  clearPendingEmailChange,
  isSettledBy,
  readPendingEmailChange,
  savePendingEmailChange,
} from '@/lib/pending-email-change';
import { useEmailChange, useEmailIdentity } from '@/hooks/integrations';
import { useAuthStore } from '@/store/auth';

const MEMBER = 'member-fixture-1';
const OLD = 'old.address@example.test';
const NEW = 'new.address@example.test';
/** A fixture, never a real credential. */
const PASSWORD = 'fixture-password';

let mock: MockAdapter;
let client: QueryClient;
/** Mounted hooks, unmounted before the client is cleared: a live observer's
 *  staleness timer otherwise keeps a single-file run from exiting. */
const mounted: (() => void)[] = [];

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function identity(overrides: Record<string, unknown> = {}) {
  return {
    address: OLD,
    isVerified: true,
    verificationSentAt: null,
    verificationExpiresAt: null,
    cooldownSeconds: 0,
    deliveryState: 'ok',
    pendingAddress: null,
    ...overrides,
  };
}

/** What `PUT /auth/email` answers: the old address, the new one pending. */
function accepted(expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()) {
  return identity({
    verificationSentAt: new Date().toISOString(),
    verificationExpiresAt: expiresAt,
    cooldownSeconds: 60,
    pendingAddress: NEW,
  });
}

async function refusal(): Promise<EmailChangeError> {
  try {
    await requestEmailChange({ address: NEW, currentPassword: PASSWORD });
  } catch (cause) {
    if (isEmailChangeError(cause)) return cause;
    throw cause;
  }
  throw new Error('expected a refusal');
}

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } } });
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  useAuthStore.setState({ isAuthenticated: true, user: { userId: MEMBER } as never });
  await AsyncStorage.clear();
});

afterEach(() => {
  mounted.splice(0).forEach((unmount) => unmount());
  client.clear();
  mock.restore();
});

describe('requestEmailChange', () => {
  it('sends the address and the current password, and resolves with the pending address', async () => {
    mock.onPut('/auth/email').reply(200, { data: accepted() });

    const state = await requestEmailChange({ address: NEW, currentPassword: PASSWORD });

    expect(JSON.parse(mock.history.put[0].data)).toEqual({ address: NEW, currentPassword: PASSWORD });
    expect(state.address).toBe(OLD);
    expect(state.pendingAddress).toBe(NEW);
  });

  it('names a wrong current password, which is a 400 with its own code', async () => {
    mock.onPut('/auth/email').reply(400, {
      code: 'Identity.User.IncorrectCurrentPassword',
      title: 'Validation failed',
      detail: 'The current password is incorrect.',
    });

    const error = await refusal();

    expect(error.refusal).toBe('wrongPassword');
    expect(error.message).toBe('That is not your current password.');
  });

  it('passes on the server’s sentence for any other refusal of the request', async () => {
    mock.onPut('/auth/email').reply(400, { code: 'Address', title: 'Validation failed', detail: 'Enter a valid email address.' });

    const error = await refusal();

    expect(error.refusal).toBe('invalid');
    expect(error.message).toBe('Enter a valid email address.');
  });

  it('carries the wait a 429 names', async () => {
    mock.onPut('/auth/email').reply(
      429,
      { code: 'platform.rate_limited', detail: 'Please wait 42 seconds before asking for another link.' },
      { 'retry-after': '42' }
    );

    const error = await refusal();

    expect(error.refusal).toBe('rateLimited');
    expect(error.retryAfterSeconds).toBe(42);
  });

  it('reads a 503 as a definite "not sent", not as an unknown outcome', async () => {
    mock.onPut('/auth/email').reply(503, {
      code: 'Identity.Email.NotConfigured',
      detail: 'Email delivery is not available right now.',
    });

    const error = await refusal();

    expect(error.refusal).toBe('emailUnavailable');
    expect(error.isIndeterminate).toBe(false);
  });

  it('reads no answer as unknown: the link may have been sent', async () => {
    mock.onPut('/auth/email').networkError();

    const error = await refusal();

    expect(error.refusal).toBe('unanswered');
    expect(error.isIndeterminate).toBe(true);
  });
});

describe('the pending change kept on the device', () => {
  const pending = {
    from: OLD,
    to: NEW,
    expiresAt: '2026-10-20T14:00:00.000Z',
    requestedAt: '2026-10-20T12:00:00.000Z',
  };

  it('is kept per member', async () => {
    await savePendingEmailChange(MEMBER, pending);

    expect(await readPendingEmailChange(MEMBER, Date.parse('2026-10-20T13:00:00Z'))).toEqual(pending);
    expect(await readPendingEmailChange('another-member', Date.parse('2026-10-20T13:00:00Z'))).toBeNull();
  });

  it('is forgotten once its link has expired', async () => {
    await savePendingEmailChange(MEMBER, pending);

    expect(await readPendingEmailChange(MEMBER, Date.parse('2026-10-20T14:00:01Z'))).toBeNull();
    // And it is gone, not merely hidden.
    expect(await AsyncStorage.getItem(`diaspora.pendingEmailChange.${MEMBER}`)).toBeNull();
  });

  it('is settled by any address other than the one it was asked from', () => {
    expect(isSettledBy(pending, OLD)).toBe(false);
    expect(isSettledBy(pending, OLD.toUpperCase())).toBe(false);
    expect(isSettledBy(pending, NEW)).toBe(true);
    expect(isSettledBy(pending, 'someone.else@example.test')).toBe(true);
  });

  it('can be cleared', async () => {
    await savePendingEmailChange(MEMBER, pending);
    await clearPendingEmailChange(MEMBER);

    expect(await readPendingEmailChange(MEMBER, Date.parse('2026-10-20T13:00:00Z'))).toBeNull();
  });
});

describe('useEmailChange and useEmailIdentity together', () => {
  it('remembers what the PUT answered, because the next read will not say it', async () => {
    mock.onGet('/auth/email').reply(200, { data: identity() });
    mock.onPut('/auth/email').reply(200, { data: accepted() });

    const { result, unmount } = renderHook(
      () => ({ identity: useEmailIdentity(), change: useEmailChange() }),
      { wrapper }
    );
    mounted.push(unmount);

    await waitFor(() => expect(result.current.identity.email?.address).toBe(OLD));
    expect(result.current.identity.pendingChange).toBeNull();

    act(() => {
      void result.current.change.mutateAsync({ address: NEW, currentPassword: PASSWORD });
    });

    await waitFor(() =>
      expect(result.current.identity.pendingChange).toEqual(expect.objectContaining({ from: OLD, to: NEW }))
    );

    // The PUT's answer is not written over the address state: its sent-at is
    // the change link's, and the email screen would read it as a verification
    // link sent to the old address.
    expect(result.current.identity.email?.verificationSentAt).toBeNull();
    expect(await readPendingEmailChange(MEMBER)).toEqual(expect.objectContaining({ to: NEW }));
  });

  it('forgets it once the server reports the new address', async () => {
    await savePendingEmailChange(MEMBER, {
      from: OLD,
      to: NEW,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      requestedAt: new Date().toISOString(),
    });
    mock.onGet('/auth/email').reply(200, { data: identity({ address: NEW }) });

    const { result, unmount } = renderHook(() => useEmailIdentity(), { wrapper });
    mounted.push(unmount);

    await waitFor(() => expect(result.current.email?.address).toBe(NEW));
    await waitFor(async () => expect(await readPendingEmailChange(MEMBER)).toBeNull());
    expect(result.current.pendingChange).toBeNull();
  });

  it('keeps it while the server still reports the old address', async () => {
    await savePendingEmailChange(MEMBER, {
      from: OLD,
      to: NEW,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      requestedAt: new Date().toISOString(),
    });
    mock.onGet('/auth/email').reply(200, { data: identity() });

    const { result, unmount } = renderHook(() => useEmailIdentity(), { wrapper });
    mounted.push(unmount);

    await waitFor(() => expect(result.current.pendingChange?.to).toBe(NEW));
  });
});
