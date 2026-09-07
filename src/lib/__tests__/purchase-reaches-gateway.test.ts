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

const fs = require('fs') as {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string): string[];
};
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

// ─────────────────────────────────────────────────────────────────────────────
// ...and so does every other way of giving Diaspora money
//
// The purchase path was fixed and pinned above, and the hole reappeared twice
// more in paths nobody had looked at. A member donated £100 to a published
// campaign; the donation was written, the intent opened in `Draft` with no
// gateway provider, and the screen said "We are confirming this with the
// payment provider" about a request that had never been made. No capture, so no
// ledger transaction, so no creator earning — the whole attribution chain idle
// behind one missing call.
//
// So this stops naming one hook. Every mutation that can open a payment intent
// has to hand it over, and a fourth one added later is caught by being in the
// list rather than by somebody remembering.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every hook that can open a payment intent, and the call that opens it.
 *
 * `useCreateWithdrawal` is deliberately absent: money leaving a wallet is a
 * payout, routed to a settlement provider by the platform, and it opens no
 * payment intent for anybody to authorise.
 */
const MONEY_IN: { hook: string; opens: RegExp }[] = [
  { hook: 'usePurchaseProduct', opens: /await api\.purchaseProduct\(/ },
  { hook: 'useCreateDonation', opens: /await api\.createDonation\(/ },
  { hook: 'useCreateContribution', opens: /await api\.createContribution\(/ },
  { hook: 'useCreateDeposit', opens: /await api\.createDeposit\(/ },
];

describe.each(MONEY_IN)('$hook asks a gateway to take the money', ({ hook, opens }) => {
  const body = hookBody(hook);

  it('reads the hook, and it is the one that opens the intent', () => {
    // Guards the guard twice: an empty slice, and a slice of the wrong hook.
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(opens);
  });

  it('authorises what it opened', () => {
    // Without this the intent stays `Draft`, no provider is asked for anything,
    // and the member waits on a payment that exists nowhere but on their screen.
    expect(body).toMatch(/api\.authorizePayment\(/);
  });

  it('keeps what the authorise returned rather than discarding it', () => {
    // `PaymentSheet` opens `nextAction` from what these hooks return, and a
    // draft carries none — so the sheet sits on "processing" with nothing to
    // open. Calling authorise and then handing back the pre-authorise object
    // looks identical to not calling it at all.
    //
    // Matched by shape rather than by name: the deposit hook binds it as
    // `intent` and the others as `payment`, and both are assignments. The first
    // draft of this asserted the name and failed on the one hook that had been
    // right all along.
    expect(body).toMatch(/[=?]\s*await api\.authorizePayment\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ...wherever the hook happens to live
//
// The list above names hooks in `hooks/financial.ts`. A fourth path was found on
// a device after that list was written: `useDonateToCampaign`, in
// `hooks/community-life.ts`, behind the campaign's own Donate button. It opened
// a donation and authorised nothing, so a member gave £100 to a published
// campaign and no provider was ever asked — while the wallet route, fixed an
// hour earlier, reached Stripe from the same screen's sibling.
//
// The guard could not have caught it: it read one file. So this sweeps every
// hook file instead. A fifth path in a sixth file fails here by being a hook
// that opens a payment intent, not by somebody remembering to add it.
// ─────────────────────────────────────────────────────────────────────────────

/** The calls that open a payment intent the platform then has to hand to a gateway. */
const OPENERS = ['createDonation', 'createContribution', 'purchaseProduct', 'createDeposit'];

/**
 * The alias a file binds to the **certified** financial client, if any.
 *
 * **This is the discriminator, and the filename is not.** `hooks/financial-gaps.ts`
 * opens a deposit too, on `gapApi` against `/financial-gap/v0` — a simulated arm
 * with no gateway behind it, where authorising would be asking nobody for
 * nothing. Keying on the import means a gap hook is skipped because of what it
 * calls, and a certified hook is checked however its file is named or its alias
 * is spelled.
 */
function certifiedAlias(source: string): string | null {
  const match = /import \* as (\w+) from '@\/lib\/financial-api';/.exec(source);
  return match ? match[1] : null;
}

/** Every exported hook in `src/hooks` that opens an intent on the certified client. */
function certifiedOpeners(): { file: string; name: string; body: string }[] {
  const dir = path.join(process.cwd(), 'src', 'hooks');
  const found: { file: string; name: string; body: string }[] = [];

  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.ts') || entry.endsWith('.d.ts')) continue;

    const source = read('src', 'hooks', entry);
    const alias = certifiedAlias(source);
    if (!alias) continue;

    const opens = new RegExp(`${alias}\\.(${OPENERS.join('|')})\\(`);
    const lines = source.split(String.fromCharCode(10));
    const starts: { name: string; at: number }[] = [];

    lines.forEach((line: string, index: number) => {
      const match = /^export (?:async )?function (use[A-Za-z0-9_]*)\s*\(/.exec(line);
      if (match) starts.push({ name: match[1], at: index });
    });

    starts.forEach((start, index) => {
      const body = lines
        .slice(start.at, starts[index + 1]?.at ?? lines.length)
        .join(String.fromCharCode(10));

      if (opens.test(body)) found.push({ file: entry, name: start.name, body });
    });
  }

  return found;
}

describe('every hook that opens a payment intent hands it to a gateway', () => {
  const openers = certifiedOpeners();

  it('finds the hooks that take money', () => {
    // Guards the guard. An empty sweep passes the assertion below by vacuity,
    // which is precisely how the one-file version stayed green while a member
    // was giving money to nobody.
    expect(openers.length).toBeGreaterThanOrEqual(5);

    const names = openers.map((hook) => hook.name);

    // The one this sweep exists for: it lives in `community-life.ts`, behind the
    // campaign's own Donate button, and the file-scoped guard could not see it.
    expect(names).toContain('useDonateToCampaign');
    expect(names).toContain('useCreateDonation');
  });

  it.each(openers.map((hook) => [`${hook.file} \u2192 ${hook.name}`, hook] as const))(
    '%s authorises what it opened',
    (_label, hook) => {
      expect(hook.body).toMatch(/[=?]\s*await \w+\.authorizePayment\(/);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ...and the member is sent to it
// ─────────────────────────────────────────────────────────────────────────────

describe('the payment sheet opens the page the gateway returned', () => {
  const SHEET = read('src', 'components', 'financial', 'PaymentSheet.tsx');

  it('reads the sheet at all', () => {
    expect(SHEET).toMatch(/const payment = await execute\(method\)/);
  });

  it('opens the hosted payment page', () => {
    // -- The defect this exists for ------------------------------------------
    //
    // Authorising a card payment returns a hosted Checkout URL on `nextAction`.
    // The sheet went straight to `watching` and polled a payment nobody had
    // been given the chance to make: the first real purchase sat on "Confirming
    // your payment. We are checking with the payment provider" while a valid
    // `checkout.stripe.com` session went unopened.
    //
    // Third time the purchase path was missing something the deposit path has
    // had all along -- the authorise call, its test, and now this.
    expect(SHEET).toMatch(/parseNextAction\(payment\.nextAction\)/);
    expect(SHEET).toMatch(/Linking\.openURL\(/);
  });

  it('opens only what parseNextAction vouched for', () => {
    // `parseNextAction` returns a URL only when it is plain HTTPS. A payment
    // flow is the highest-value phishing surface in the app, and opening a raw
    // `nextAction` would hand an attacker the one moment a member is expecting
    // to be sent somewhere.
    expect(SHEET).not.toMatch(/Linking\.openURL\(payment\.nextAction/);
    expect(SHEET).toMatch(/action\?\.url/);
  });

  it('still watches the payment after sending them', () => {
    // Opening the page is not the outcome. The backend is what says whether the
    // money arrived, and the sheet must keep asking.
    expect(SHEET).toMatch(/setPhase\(presentPaymentStatus\(payment\.status\)\.isTerminal \? 'done' : 'watching'\)/);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// ...and every screen that takes a payment sends them to it
//
// Authorising returns a hosted payment page on `nextAction`. `PaymentSheet`
// opens it, and the guard above pins that. But a screen does not have to use
// `PaymentSheet` — `community-life/campaign/donate.tsx` rolls its own flow, and
// it dropped the URL: the intent was authorised, Stripe was holding a checkout
// session, and the member sat on "We are confirming this with the payment
// provider" with no way to pay and nothing coming.
//
// One campaign, two donate routes, opposite outcomes: the wallet route rendered
// the sheet and reached Stripe, this one did not. Reported from a device twice
// before the difference between the two routes made it obvious.
//
// So: any screen that starts a payment either renders the sheet, or opens the
// page itself.
// ═════════════════════════════════════════════════════════════════════════════

/** Hooks that start a payment and can come back with a page to open. */
const STARTS_A_PAYMENT =
  /use(DonateToCampaign|CreateDonation|CreateContribution|PurchaseProduct|CreateDeposit)\(/;

/** Every screen file under `src/app`, comments stripped. */
function everyScreen(): { file: string; source: string }[] {
  const found: { file: string; source: string }[] = [];

  const walk = (relative: string[]) => {
    const here = path.join(process.cwd(), ...relative);

    for (const entry of fs.readdirSync(here)) {
      if (entry === '__tests__') continue;

      const next = [...relative, entry];

      if (entry.endsWith('.tsx')) {
        found.push({ file: next.join('/'), source: read(...next) });
        continue;
      }

      // A file with no extension is not a directory either; readdirSync throws
      // on it, and swallowing that is how this sweep would go quietly blind.
      if (!entry.includes('.')) walk(next);
    }
  };

  walk(['src', 'app']);
  return found;
}

describe('every screen that starts a payment sends the member to the gateway', () => {
  const screens = everyScreen().filter((screen) => STARTS_A_PAYMENT.test(screen.source));

  it('finds the screens that take money', () => {
    // Guards the guard: an empty sweep passes the assertion below by vacuity.
    expect(screens.length).toBeGreaterThanOrEqual(3);

    // The one this exists for.
    expect(screens.map((screen) => screen.file)).toContain(
      'src/app/community-life/campaign/donate.tsx'
    );
  });

  it.each(screens.map((screen) => [screen.file, screen] as const))(
    '%s opens the hosted page, or renders the sheet that does',
    (_file, screen) => {
      const rendersTheSheet = /<PaymentSheet/.test(screen.source);

      // **Two helpers, one rule.** `parseNextAction` and `isSafeChallengeUrl`
      // both refuse anything that is not plain HTTPS, which is the guard that
      // matters on the app's highest-value phishing surface — but they are
      // separate implementations of the same sentence and can drift apart.
      // Worth collapsing into one; noted here rather than silently accepted,
      // because the first draft of this assertion knew only about the first and
      // reported the deposit screen — correct since it was written — as broken.
      const opensItItself = /(parseNextAction|isSafeChallengeUrl)\(/.test(screen.source);

      expect(rendersTheSheet || opensItItself).toBe(true);
    }
  );
});
