// ─────────────────────────────────────────────────────────────────────────────
// Adding somewhere to be paid
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// `POST /payout-destinations` was served. `registerPayoutDestination`,
// `removePayoutDestination`, `usePayoutDestinations`,
// `useRegisterPayoutDestination` and `useRemovePayoutDestination` were all
// written and typed. **No screen in the application called any of them.**
//
// The withdraw screen read the list, let you select from it, and rendered "you
// have not added an account to withdraw to yet" — a sentence that was true for
// every member on the platform and had no answer anywhere in the app. A member
// with £1,000 in their wallet reached it and stopped.
//
// It is the seventh instance of one shape: a route served, a client function
// written, a hook written, and nothing rendering it.
//
// ── What these pin ──────────────────────────────────────────────────────────
//
// Two properties, and the first is a security one.
//
//   **The setup screen collects no credential.** Onboarding is a hand-off: the
//   member types their bank details into the provider's own hosted pages and
//   what comes back is an account reference. A sort-code or account-number
//   input on this screen would make the platform handle exactly what its own
//   contract promises it never sees — `registerPayoutDestination` says so in as
//   many words, and a future edit that "helpfully" adds a field would break the
//   promise silently.
//
//   **The dead end leads somewhere.** An empty state that names a thing the
//   member cannot do is worse than no empty state, and this one shipped that
//   way.
// ─────────────────────────────────────────────────────────────────────────────

declare const __dirname: string;
const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const join: (...parts: string[]) => string = require('path').join;

const APP = join(__dirname, '..', '..', 'app');

function read(relative: string): string {
  return readFileSync(join(APP, relative), 'utf8');
}

/** Source with comments removed, so prose about a field is not read as one. */
function code(relative: string): string {
  return read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

describe('the payout account screen exists and is reachable', () => {
  it('renders the destinations the client could already fetch', () => {
    const source = code('wallet/payout-accounts.tsx');

    expect(source).toContain('usePayoutDestinations');
    expect(source).toContain('useStartPayoutOnboarding');
    expect(source).toContain('useRemovePayoutDestination');
  });

  it('is reached from the withdraw screen that used to dead-end', () => {
    // The whole point. Without this the screen exists and nobody arrives at it,
    // which is the same defect one layer along.
    expect(code('wallet/withdraw.tsx')).toContain('/wallet/payout-accounts');
  });
});

describe('what the screen must never collect', () => {
  // The platform's contract states that no payout credential reaches it. These
  // are the field names somebody would reach for when "improving" the flow into
  // a form, and every one of them would break that promise.
  const forbidden = [
    'accountNumber',
    'account_number',
    'sortCode',
    'sort_code',
    'iban',
    'swift',
    'bic',
    'routingNumber',
    'routing_number',
    'cardNumber',
    'card_number',
  ];

  it.each(forbidden)('does not name %s', (field) => {
    const source = code('wallet/payout-accounts.tsx').toLowerCase();

    expect(source).not.toContain(field.toLowerCase());
  });

  it('has exactly one input, and it is the address one', () => {
    // **This used to ban TextInput outright, and that was right until it wasn't.**
    // A Stripe hand-off has nothing to type. A PayPal payout goes to an email or
    // a phone number the member already has — an address, not a credential —
    // and there is no hosted setup to send them to, so it has to be asked for.
    //
    // The ban is narrowed rather than dropped: one field, bound to `identity`,
    // typed as an email address. A second input appearing here is the beginning
    // of the bank form this screen must never become, and the field names above
    // stay banned whatever the count.
    const source = code('wallet/payout-accounts.tsx');
    const inputs = source.match(/<TextInput\b/g) ?? [];

    expect(inputs).toHaveLength(1);
    expect(source).toMatch(/value=\{identity\}/);
    expect(source).toMatch(/keyboardType="email-address"/);
  });

  it('only asks for an address when the server says this country needs one', () => {
    // Never a fallback for a failed hand-off. A provider either has hosted setup
    // or it does not, and guessing would put a field in front of somebody it
    // cannot help — or worse, collect an address for a corridor that does not
    // exist.
    const source = code('wallet/payout-accounts.tsx');

    expect(source).toMatch(/session\.requiresIdentity/);
    expect(source).toMatch(/setIdentityHint\(/);
  });

  it('sends the member to the provider rather than posting a form', () => {
    const source = code('wallet/payout-accounts.tsx');

    expect(source).toContain('Linking.openURL');

    // And only to a URL that passed the check every other hosted hand-off uses.
    expect(source).toContain('isSafeChallengeUrl');
  });
});

describe('what the screen tells a member', () => {
  it('says an account is setting up rather than unverified', () => {
    // A new destination is unverified for an ordinary reason — the provider is
    // checking it — and a member reading a word that sounds like a rejection
    // goes looking for a problem that is not there.
    const source = read('wallet/payout-accounts.tsx');

    expect(source).toContain('Setting up');
    expect(source).not.toContain("label: 'Unverified'");
  });

  it('offers a way to ask the provider again', () => {
    // Without this the member waits on staff for something Stripe already
    // knows, which is what the refresh route was added to end.
    expect(code('wallet/payout-accounts.tsx')).toContain('useRefreshPayoutDestination');
  });
});

describe('adding an account replaces the screen', () => {
  // The first cut rendered the address prompt above everything else and left
  // the rest in place. A member saw a form asking for their PayPal address, an
  // empty state below it saying "No payout account yet", a button that would
  // have restarted the flow they were already in, and a footnote reading "you
  // finish setting up on our provider's own site, Diaspora never sees or
  // stores your account number" — directly beneath a field asking them to type
  // something into Diaspora.
  //
  // Three components describing three different flows on one screen. Found by
  // looking at it.

  it('hides the list, the empty state and the button while the prompt is open', () => {
    const source = code('wallet/payout-accounts.tsx');

    // Both branches are gated on the same condition, so neither can be shown
    // beside the prompt without this failing.
    const gated = source.match(/\{identityHint \? null :/g) ?? [];

    expect(gated.length).toBeGreaterThanOrEqual(2);
  });

  it('does not promise a hosted hand-off it cannot know it is doing', () => {
    // The footer sits under a button whose behaviour depends on the country:
    // a hand-off where the provider onboards, a form where it does not. It can
    // only claim what holds either way.
    const source = read('wallet/payout-accounts.tsx');

    expect(source).not.toContain("You finish setting up on our provider's own site");
    expect(source).toContain('Your bank details never touch Diaspora.');
  });
});
