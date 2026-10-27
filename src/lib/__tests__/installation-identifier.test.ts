/**
 * One device identifier per installation — 27 Oct 2026 (D-13).
 *
 * Sign-in sent `Constants.sessionId` as the device identifier, and Expo makes a
 * new one every time the app is opened. The server's shared-device check (a
 * device another account already uses holds points for review) compares those
 * identifiers, so it matched two accounts only when a member switched account
 * without closing the app.
 *
 * The app now makes up one random identifier the first time it runs and keeps
 * it in app storage. It is not read from hardware, so it is not a fingerprint;
 * it is stable, so the privacy notice discloses it.
 *
 * Expo's mock below counts launches: every simulated restart
 * (`jest.resetModules`) is handed a different `sessionId`, as a real launch is.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-constants', () => {
  const g = globalThis as { __expoLaunches?: number };
  g.__expoLaunches = (g.__expoLaunches ?? 0) + 1;
  return {
    __esModule: true,
    default: {
      sessionId: `launch-${g.__expoLaunches}`,
      expoConfig: { version: '1.0.0' },
      deviceName: 'Test phone',
    },
  };
});

type AuthApi = typeof import('../auth-api');

/** Closes and reopens the app: module state goes, storage stays. */
function launchApp(): AuthApi {
  jest.resetModules();
  return require('../auth-api') as AuthApi;
}

function storedValues(): string[] {
  const store = (globalThis as { __asyncStorageStore?: Record<string, string> }).__asyncStorageStore ?? {};
  return Object.values(store);
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('the device identifier', () => {
  it('stays the same when the app is closed and opened again', async () => {
    const first = await launchApp().describeDevice();
    const second = await launchApp().describeDevice();

    expect(first.deviceIdentifier).toBeDefined();
    expect(second.deviceIdentifier).toBe(first.deviceIdentifier);
  });

  it('is not Expo’s per-launch session id', async () => {
    const device = await launchApp().describeDevice();

    expect(device.deviceIdentifier).not.toMatch(/^launch-/);
  });

  it('is random, made on first launch, and kept in the app’s storage', async () => {
    const device = await launchApp().describeDevice();

    expect(device.deviceIdentifier).toMatch(UUID_V4);
    expect(storedValues()).toContain(device.deviceIdentifier);
  });

  it('is new for a new installation', async () => {
    const first = await launchApp().describeDevice();
    await AsyncStorage.clear();
    const reinstalled = await launchApp().describeDevice();

    expect(reinstalled.deviceIdentifier).toMatch(UUID_V4);
    expect(reinstalled.deviceIdentifier).not.toBe(first.deviceIdentifier);
  });

  it('is one value when two requests ask for it at once on a first launch', async () => {
    const api = launchApp();
    const [a, b] = await Promise.all([api.describeDevice(), api.describeDevice()]);

    expect(a.deviceIdentifier).toBe(b.deviceIdentifier);
    expect(storedValues().filter((value) => UUID_V4.test(value))).toHaveLength(1);
  });

  // Each launch has its own module registry, so the storage a test breaks must be
  // the instance that launch's `auth-api` holds, not the one imported above.
  function storageOf(): typeof AsyncStorage {
    return (require('@react-native-async-storage/async-storage') as { default: typeof AsyncStorage }).default;
  }

  it('still lets a member sign in when storage cannot be read', async () => {
    const api = launchApp();
    jest.spyOn(storageOf(), 'getItem').mockRejectedValueOnce(new Error('disk error'));

    const device = await api.describeDevice();

    expect(device.deviceIdentifier).toMatch(UUID_V4);
  });

  it('still lets a member sign in when storage cannot be written', async () => {
    const api = launchApp();
    jest.spyOn(storageOf(), 'setItem').mockRejectedValueOnce(new Error('disk full'));

    const device = await api.describeDevice();

    expect(device.deviceIdentifier).toMatch(UUID_V4);
    expect(storedValues()).not.toContain(device.deviceIdentifier);
  });

  it('never replaces the stored identifier because one read failed', async () => {
    const original = await launchApp().describeDevice();

    const api = launchApp();
    jest.spyOn(storageOf(), 'getItem').mockRejectedValueOnce(new Error('disk error'));
    const thisLaunch = await api.describeDevice();
    const next = await launchApp().describeDevice();

    expect(thisLaunch.deviceIdentifier).not.toBe(original.deviceIdentifier);
    expect(next.deviceIdentifier).toBe(original.deviceIdentifier);
  });
});

describe('the token-issuing calls send it', () => {
  async function bodySentBy(call: (api: AuthApi) => Promise<unknown>) {
    const api = launchApp();
    const post = jest.spyOn(api.authTransport, 'post').mockRejectedValue(new Error('offline'));

    await call(api).catch(() => undefined);

    return { body: post.mock.calls[0]?.[1] as Record<string, unknown>, api };
  }

  it('sign-in sends the installation’s identifier', async () => {
    const { body, api } = await bodySentBy((a) =>
      a.loginWithPassword({ email: 'ama@example.com', password: 'a-long-password' })
    );

    expect(body.deviceIdentifier).toBe((await api.describeDevice()).deviceIdentifier);
    expect(body.deviceIdentifier).toMatch(UUID_V4);
  });

  it('phone verification, which issues the first tokens, sends the same one', async () => {
    const signIn = await bodySentBy((a) =>
      a.loginWithPassword({ email: 'ama@example.com', password: 'a-long-password' })
    );
    const verify = await bodySentBy((a) =>
      a.verifyPhone({ phoneNumber: '+447700900123', code: '123456' })
    );

    expect(verify.body.deviceIdentifier).toBe(signIn.body.deviceIdentifier);
  });
});
