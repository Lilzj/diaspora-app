// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Idempotency tests (Frontend Phase 5)
//
// §21: "Generate and persist it for the lifecycle of the operation. Do not
// generate a new key on every retry."
//
// The three failure modes this protects against, each asserted directly:
//
//   a fresh key per tap    → two payments
//   a memory-only key      → a second payment after an app restart
//   a key never released   → a genuine second donation refused as a duplicate
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  acquireIdempotencyKey,
  clearIdempotencyKeys,
  newIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '../idempotency';

const scope: OperationScope = { operation: 'payment', subject: 'MarketplaceListing:listing-1' };

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('newIdempotencyKey', () => {
  it('produces an RFC 4122 v4-shaped identifier', () => {
    expect(newIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('does not collide across a burst on one device', () => {
    const keys = new Set(Array.from({ length: 5000 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(5000);
  });
});

describe('the same operation reuses its key', () => {
  it('returns the same key on a second acquire — the double-tap case', () => {
    return (async () => {
      const first = await acquireIdempotencyKey(scope);
      const second = await acquireIdempotencyKey(scope);
      expect(second).toBe(first);
    })();
  });

  it('survives a simulated app restart', async () => {
    // The key is in AsyncStorage, not in module state, so a fresh process that
    // reads the same storage gets the same key — which is what stops a second
    // launch from charging again.
    const first = await acquireIdempotencyKey(scope);

    // `jest.resetModules()` plus a fresh `require` is the CommonJS equivalent of
    // relaunching the app: module state is discarded, storage is not.
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const reloaded = require('../idempotency') as typeof import('../idempotency');
    const second = await reloaded.acquireIdempotencyKey(scope);

    expect(second).toBe(first);
  });

  it('persists under a namespaced key so it can be found and cleared', async () => {
    await acquireIdempotencyKey(scope);
    const names = await AsyncStorage.getAllKeys();

    expect(names.some((name) => name.startsWith('diaspora.financial.idem.'))).toBe(true);
  });
});

describe('different operations get different keys', () => {
  it('separates two subjects', async () => {
    const first = await acquireIdempotencyKey({ operation: 'payment', subject: 'listing-1' });
    const second = await acquireIdempotencyKey({ operation: 'payment', subject: 'listing-2' });
    expect(second).not.toBe(first);
  });

  it('separates two operation kinds on the same subject', async () => {
    const payment = await acquireIdempotencyKey({ operation: 'payment', subject: 'x' });
    const purchase = await acquireIdempotencyKey({ operation: 'purchase', subject: 'x' });
    expect(purchase).not.toBe(payment);
  });

  it('separates two deliberately repeatable operations by discriminator', async () => {
    // Giving £10 twice to the same cause is a thing people do on purpose, and
    // refusing the second as a duplicate would be wrong.
    const tenner = await acquireIdempotencyKey({
      operation: 'donation',
      subject: 'bursary-fund',
      discriminator: '10GBP',
    });
    const twenty = await acquireIdempotencyKey({
      operation: 'donation',
      subject: 'bursary-fund',
      discriminator: '20GBP',
    });

    expect(twenty).not.toBe(tenner);
  });

  it('still collapses two identical donations inside the window — the double tap', async () => {
    const first = await acquireIdempotencyKey({
      operation: 'donation', subject: 'bursary-fund', discriminator: '10GBP',
    });
    const second = await acquireIdempotencyKey({
      operation: 'donation', subject: 'bursary-fund', discriminator: '10GBP',
    });

    expect(second).toBe(first);
  });
});

describe('release', () => {
  it('mints a new key after the operation is over', async () => {
    const first = await acquireIdempotencyKey(scope);
    await releaseIdempotencyKey(scope);
    const second = await acquireIdempotencyKey(scope);

    expect(second).not.toBe(first);
  });

  it('is safe to call for an operation that was never acquired', async () => {
    await expect(releaseIdempotencyKey({ operation: 'payment', subject: 'never' })).resolves.toBeUndefined();
  });
});

describe('expiry', () => {
  it('mints a new key once the stored one is older than its window', async () => {
    const first = await acquireIdempotencyKey(scope);

    // Rewind the stored record past the ten-minute TTL. Somebody who abandons a
    // checkout and returns tomorrow is starting a genuinely new operation.
    const names = await AsyncStorage.getAllKeys();
    const name = names.find((item) => item.startsWith('diaspora.financial.idem.'))!;
    const stored = JSON.parse((await AsyncStorage.getItem(name))!);
    await AsyncStorage.setItem(
      name,
      JSON.stringify({ ...stored, createdAt: Date.now() - 11 * 60 * 1000 })
    );

    expect(await acquireIdempotencyKey(scope)).not.toBe(first);
  });
});

describe('clearIdempotencyKeys', () => {
  it('drops every financial key on sign-out', async () => {
    await acquireIdempotencyKey({ operation: 'payment', subject: 'a' });
    await acquireIdempotencyKey({ operation: 'donation', subject: 'b' });
    await AsyncStorage.setItem('unrelated.setting', 'keep-me');

    await clearIdempotencyKeys();

    const names = await AsyncStorage.getAllKeys();
    expect(names.filter((name) => name.startsWith('diaspora.financial.idem.'))).toHaveLength(0);
    // The next member on this device must not inherit the last one's
    // operations — but nothing else in their storage is theirs to delete.
    expect(names).toContain('unrelated.setting');
  });
});

describe('storage failure', () => {
  it('still returns a usable key when the disk refuses', async () => {
    // Refusing to let somebody pay because their device is out of space would
    // be worse than the duplicate risk a memoryless key carries.
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('QuotaExceeded'));

    const key = await acquireIdempotencyKey(scope);
    expect(key).toMatch(/^[0-9a-f]{8}-/);
  });

  it('mints a fresh key when the stored value is corrupt', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('{not json');

    const key = await acquireIdempotencyKey(scope);
    expect(key).toMatch(/^[0-9a-f]{8}-/);
  });
});
