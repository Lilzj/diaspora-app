// ─────────────────────────────────────────────────────────────────────────────
// Every purchase reaches a gateway, or nobody is asked to take the money.
//
// ── The defect this exists for ──────────────────────────────────────────────
//
// `POST /catalog/purchases` answers with a payment intent in `Draft` and no
// gateway provider. Nothing has been asked of Stripe or Flutterwave at that
// point. `POST /payment-intents/{id}/authorize` is what hands it over.
//
// `usePurchaseProduct` did only the first call. The first purchase ever made on
// the deployment is what showed it: the campaign reached `PendingPayment`, the
// purchase row reached `Pending`, and the payment intent sat in `Draft` with
// `GatewayProvider` null, while the app showed "Confirming your payment. We are
// checking with the payment provider" for as long as anyone cared to watch.
//
// Nothing errored, because nothing failed. The gateway was never asked. That is
// the worst shape a payment bug can take: a member is told their money is in
// flight, and no system anywhere is acting on it.
//
// `useCreateDeposit` has made both calls since it was written and explains why
// in its own comment — `deposit-real-api.test.ts` pins it. The purchase path
// simply never got the second call, or a test that would have noticed.
//
// ── Why this reads source rather than mocking ───────────────────────────────
//
// Same reason as its sibling: the property is "this hook makes two calls in this
// order", and a mocked round trip that asserted the second call would pass
// against a hook that made it on a branch never taken. Reading the source is
// blunt and it fails when the call is deleted, which is the failure that
// happened.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

/** A file's code with its comments removed. See `password-auth.test.ts`. */
function read(...segments: string[]): string {
  return fs
    .readFileSync(path.join(process.cwd(), ...segments), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .filter((line: string) => !/^\s*(\/\/|\*|\{\/\*)/.test(line))
    .join(String.fromCharCode(10));
}

const HOOKS = read('src', 'hooks', 'financial.ts');

/** The body of one exported hook, from its declaration to the next one. */
function hookBody(name: string): string {
  const start = HOOKS.indexOf(`export function ${name}`);
  expect(start).toBeGreaterThan(-1);

  const next = HOOKS.indexOf('\nexport function ', start + 1);
  return HOOKS.slice(start, next === -1 ? undefined : next);
}

describe('buying a product asks a gateway to take the money', () => {
  const purchase = hookBody('usePurchaseProduct');

  it('reads the hook at all', () => {
    // Guards the guard. Every assertion below is a `toMatch` against this
    // string, and an empty one would fail them loudly rather than silently —
    // but a *wrong* slice would still pass the negative assertions, so pin the
    // one call that has always been there.
    expect(purchase).toMatch(/await api\.purchaseProduct\(/);
    expect(purchase.length).toBeGreaterThan(200);
  });

  it('authorises the intent the purchase opened', () => {
    // The missing line. Without it the intent stays in `Draft`, no provider is
    // asked for anything, and the member waits on a payment that does not exist
    // anywhere but on their screen.
    expect(purchase).toMatch(/await api\.authorizePayment\(/);
  });

  it('authorises only a payment that is not already finished', () => {
    // A product settled from the wallet, or granted outright, completes with no
    // intent to hand over. Authorising a settled one would be a second write
    // for nothing, and on a `Failed` intent it would be a retry nobody asked
    // for.
    expect(purchase).toMatch(/isPaymentSettled\(/);
  });

  it('returns the authorised payment rather than the draft', () => {
    // The caller shows `nextAction` from this. Handing back the pre-authorise
    // payment would put the member on a screen with nothing to do — the exact
    // failure the deposit hook's comment describes.
    expect(purchase).toMatch(/payment: payment \?\? null/);
  });

  it('releases the idempotency key only at a terminal state', () => {
    // So a retry after a failed authorise replays to the same intent rather
    // than opening a second one against the same money.
    expect(purchase).toMatch(/releaseIdempotencyKey\(scope\)/);
    expect(purchase).toMatch(/'Completed' \|\| settled\.status === 'Failed'/);
  });
});
