// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the registration flow carries a phone number
//
// ── The defect this test is the memory of ────────────────────────────────────
//
// Registration could not complete. Not for some members — for anybody.
//
// `POST /auth/register` is called from `enable-location.tsx`, the last screen of
// a five-screen flow, and it needs a phone number. `register.tsx` read one from
// its own route params and forwarded it to `choose-origin`, which forwarded it to
// `choose-country`, which forwarded it to `enable-location`. Four files handled
// it carefully.
//
// Nothing ever supplied it. All three screens that navigate *to* `register` do so
// with no params at all, and no screen in the chain had a phone field. So
// `params.phone` was `undefined` from the first step to the last, and every new
// member reached the end to be told *"We are missing your phone number or country
// selection. Please go back and complete the previous steps."* — with nothing
// behind them to complete.
//
// The `eligibility-error` retry path had the same hole independently: it rejoined
// at `enable-location` with a `phone` nothing had set and without
// `residenceCountryCode` at all, so a member who fixed their location and retried
// successfully hit the identical dead end by a second route.
//
// ── Why the test is structural ───────────────────────────────────────────────
//
// TypeScript cannot see this. `useLocalSearchParams<{ phone: string }>()` is a
// declaration of what a screen *hopes* to receive; there is no checked link
// between it and the `router.push` that should have provided it. The flow
// typechecked cleanly the entire time it was broken, and 4,300 passing tests did
// not touch it.
//
// So these assertions are about the shape of the navigation graph: every route
// into the screen that registers must carry what registering requires. That is
// the property that has to survive the next person who adds a step.
// ─────────────────────────────────────────────────────────────────────────────

// `require` rather than an import, and typed by hand: this project's tsconfig
// does not include Node's type definitions, so `node:fs` does not resolve. The
// same shape `mocks/__tests__/production-mock-gate.test.ts` uses for the same
// reason.
const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

const AUTH_DIR = path.join(process.cwd(), 'src', 'app', '(auth)');

/**
 * A screen's code, with its comments removed.
 *
 * Stripping matters because several of these assertions are of the form "this
 * screen no longer does X", and the screens explain what they used to do in
 * their own doc comments. Without this, a comment recording that sign-in used
 * to call `POST /auth/otp/start` reads to the matcher exactly like a screen
 * that still calls it — and the rule this repository already follows is that
 * documenting a removed behaviour must not be indistinguishable from
 * committing it.
 */
function source(screen: string): string {
  return fs
    .readFileSync(path.join(AUTH_DIR, `${screen}.tsx`), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .filter((line: string) => !/^\s*(\/\/|\*)/.test(line))
    .join(String.fromCharCode(10));
}

/**
 * The `params` object literal of every navigation to a given route.
 *
 * Brace-balanced rather than regex-captured: a params block contains nested
 * objects and a lazy match would stop at the first inner brace and report a
 * missing key that is present.
 */
function navigationsTo(screen: string, route: string): string[] {
  const text = source(screen);
  const marker = `pathname: '/(auth)/${route}'`;
  const found: string[] = [];

  let cursor = text.indexOf(marker);

  while (cursor !== -1) {
    const paramsAt = text.indexOf('params:', cursor);

    if (paramsAt !== -1) {
      const open = text.indexOf('{', paramsAt);
      let depth = 0;

      for (let index = open; index < text.length; index += 1) {
        if (text[index] === '{') depth += 1;
        if (text[index] === '}') depth -= 1;

        if (depth === 0) {
          found.push(text.slice(open, index + 1));
          break;
        }
      }
    }

    cursor = text.indexOf(marker, cursor + marker.length);
  }

  return found;
}

/** Every screen in the auth flow that navigates anywhere. */
const AUTH_SCREENS = [
  'index',
  'login',
  'register',
  'choose-language',
  'choose-origin',
  'choose-country',
  'phone',
  'eligibility-error',
  'enable-location',
  'otp',
];

describe('the screen that registers is never reached without what it needs', () => {
  it('exactly one screen leads to registration, and it is the one with the phone field', () => {
    // ── Without this, the sweeps below pass by finding nothing ──
    //
    // Every assertion in this file is of the form "no navigation to X lacks Y",
    // which is vacuously true when there are no navigations to X. This programme
    // has already shipped probe assertions that failed open exactly that way, so
    // the population is pinned before it is filtered.
    const routes = AUTH_SCREENS.flatMap((screen) =>
      navigationsTo(screen, 'enable-location').map(() => screen)
    );

    expect(routes).toEqual(['phone']);
  });

  it('every navigation to enable-location carries a phone number', () => {
    // ── The assertion the defect would have failed ──
    const offenders: string[] = [];

    for (const screen of AUTH_SCREENS) {
      for (const params of navigationsTo(screen, 'enable-location')) {
        // `...params` counts only when the screen it spreads was itself given a
        // phone — which is exactly the reasoning that hid this bug for four
        // files. So a spread is not accepted as evidence here; the key must be
        // named at the call site that knows it exists.
        if (!/\bphone\b/.test(params)) {
          offenders.push(`${screen}.tsx -> enable-location`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('every navigation to enable-location carries the country of residence', () => {
    // The second half of the same guard. `eligibility-error` used to forward
    // `residenceCountryName` and not `residenceCountryCode`, and the name is not
    // what `POST /auth/register` takes.
    const offenders: string[] = [];

    for (const screen of AUTH_SCREENS) {
      for (const params of navigationsTo(screen, 'enable-location')) {
        if (!/residenceCountryCode|\.\.\.params/.test(params)) {
          offenders.push(`${screen}.tsx -> enable-location`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('enable-location still refuses to register without them', () => {
    // The runtime guard is the backstop for whatever this test does not model.
    // It is worth keeping, and worth knowing if somebody removes it.
    const text = source('enable-location');

    expect(text).toMatch(/!params\.phone/);
    expect(text).toMatch(/!params\.residenceCountryCode/);
  });
});

describe('an invitation code travels from sign-up to registration (CS-C3)', () => {
  // The same lesson as the phone number above: a value a later screen needs is
  // only there if something earlier put it there. The code is read on
  // `register`, held in the draft beside the password, and sent by the screen
  // that registers.
  it('the first screen reads the invitation code and keeps it in the draft', () => {
    const text = source('register');

    expect(text).toMatch(/useLocalSearchParams<\{ ref\?: string \}>/);
    expect(text).toMatch(/setRegistrationDraft\(\{[^}]*referralCode/);
  });

  it('the screen that registers sends it', () => {
    expect(source('enable-location')).toMatch(/referralCode: draft\.referralCode/);
  });
});

describe('a phone number is actually collected', () => {
  it('there is a screen with a phone field between choosing a country and registering', () => {
    // The whole defect in one assertion: four screens handled a phone number and
    // none of them ever asked for one.
    const text = source('phone');

    expect(text).toMatch(/<TextInput/);
    expect(text).toMatch(/testID="national-number-input"/);
  });

  it('choose-country leads to it rather than skipping to registration', () => {
    expect(navigationsTo('choose-country', 'phone')).not.toHaveLength(0);
    expect(navigationsTo('choose-country', 'enable-location')).toHaveLength(0);
  });

  it('the eligibility retry rejoins the flow at the same place', () => {
    // Not at `enable-location`. Retrying successfully used to skip the step that
    // collects the number, which is how the second instance of this bug survived
    // the first fix in an earlier phase.
    expect(navigationsTo('eligibility-error', 'phone')).not.toHaveLength(0);
    expect(navigationsTo('eligibility-error', 'enable-location')).toHaveLength(0);
  });
});

describe('the number belongs to the country of residence', () => {
  it('the calling code is derived from the residence country, not chosen', () => {
    // The trust rule. A member from Nigeria living in Britain registers a British
    // number; the Nigerian number they kept proves they hold a Nigerian SIM,
    // which is not what the Trust Centre presents phone verification as.
    const text = source('phone');

    expect(text).toMatch(/callingCodeForCountry\(\s*params\.residenceCountryCode\s*\)/);
  });

  it('the phone screen offers no way to override it', () => {
    // A picker here would let the calling code disagree with the stated country
    // of residence, which is the disagreement the rule exists to prevent.
    const text = source('phone');

    expect(text).not.toMatch(/<Modal/);
    expect(text).not.toMatch(/<FlatList/);
    expect(text).not.toMatch(/setCallingCode/);
  });
});

describe('sign-in is an email address and a password', () => {
  // Sign-in used to take a phone number and call `POST /auth/otp/start`, which
  // sent an SMS on **every single sign-in**. A password costs nothing to
  // deliver. SMS is now spent only on phone verification — the one thing a
  // message actually proves, and a once-per-account event rather than a
  // once-per-session one.
  //
  // The earlier assertions in this block were about the phone field: that its
  // seven-country dropdown was gone, that it did not guess a country from the
  // device timezone, and that the number carried its own country. None of them
  // has a subject any more, because the field is gone.

  it('takes an email address and a password', () => {
    const text = source('login');

    expect(text).toMatch(/loginWithPassword/);
    expect(text).toMatch(/email/);
    expect(text).toMatch(/secureTextEntry/);
  });

  it('sends no SMS to sign somebody in', () => {
    // This is the assertion the whole change exists for.
    const text = source('login');

    expect(text).not.toMatch(/sendOtp/);
    expect(text).not.toMatch(/startOtpSignIn/);
    expect(text).not.toMatch(/otp\/start/);
  });

  it('asks for no country and no phone number at all', () => {
    const text = source('login');

    expect(text).not.toMatch(/<Modal/);
    expect(text).not.toMatch(/COUNTRIES/);
    expect(text).not.toMatch(/resolvedOptions\(\)\.timeZone/);
    expect(text).not.toMatch(/matchCallingCode|splitE164/);
  });

  it('offers a way out for a member who has forgotten their password', () => {
    // Without this the password is write-once: never used to sign in, never
    // changeable, never recoverable — and required to delete the account.
    const text = source('login');

    expect(text).toMatch(/forgot-password/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The residency check measures something
//
// `choose-country.tsx` compared a member's stated country of residence against
// `locationStore.currentLocation.countryName`, which was a hardcoded literal —
// Peckham, London, behind a `setTimeout(800)`. The screen it refused them with
// reads "Diaspora requires matching physical GPS telemetry with your declared
// residence". It was comparing against a constant.
//
// It also posted every prospective member's IP to `ipapi.co` during
// registration — an unvetted third party, which the backend's own
// `CatalogGeocodingProvider` names and objects to.
// ─────────────────────────────────────────────────────────────────────────────

describe('the residency check asks the device', () => {
  it('no screen in the flow posts the member to a third-party IP service', () => {
    // Matches a URL inside quotes — a call — rather than any mention of the
    // host. The first version of this assertion failed on the comment in
    // `choose-country.tsx` that explains why the call was removed, which is a
    // test measuring prose instead of behaviour.
    const CALLS_IP_SERVICE = /['"`]https?:\/\/[^'"`]*(ipapi|ip-api|ipinfo)/i;

    const offenders = AUTH_SCREENS.filter((screen) => CALLS_IP_SERVICE.test(source(screen)));

    expect(offenders).toEqual([]);
  });

  it('and that assertion can still fail', () => {
    // Pins the matcher itself. A regex that matched nothing would make the sweep
    // above pass for ever, which is the fail-open shape this file already guards
    // against once.
    const CALLS_IP_SERVICE = /['"`]https?:\/\/[^'"`]*(ipapi|ip-api|ipinfo)/i;

    expect(CALLS_IP_SERVICE.test(`fetch('https://ipapi.co/json/')`)).toBe(true);
    expect(CALLS_IP_SERVICE.test('// this used to post to ipapi.co')).toBe(false);
  });

  it('choose-country resolves the country from the device, not the location store', () => {
    const text = source('choose-country');

    expect(text).toMatch(/detectCountry\(/);
    // The store holds where the app thinks the member is. It was never evidence.
    expect(text).not.toMatch(/locationStore\.currentLocation/);
  });

  it('it compares ISO codes, not display names', () => {
    // Comparing names meant a device set to French measured "Royaume-Uni"
    // against "United Kingdom" and refused a member standing in London.
    const text = source('choose-country');

    expect(text).toMatch(/detection\.countryCode !== residenceCountry\.code\.toUpperCase\(\)/);
    expect(text).not.toMatch(/countryName\.trim\(\)\.toLowerCase\(\)/);
  });

  it('a device that cannot say is not treated as a mismatch', () => {
    // The property that keeps a declined permission from becoming an
    // accusation. Only `detected` may route a member to the refusal screen.
    const text = source('choose-country');

    expect(text).toMatch(/detection\?\.status === 'detected' &&/);
  });

  it('the eligibility retry asks the same source, the same way', () => {
    // Two screens deciding one question used to read two different things. The
    // retry compared names against the store while choose-country compared
    // names against the same store by a different route.
    const text = source('eligibility-error');

    expect(text).toMatch(/detectCountry\(/);
    expect(text).toMatch(/detection\.countryCode === params\.residenceCountryCode\.toUpperCase\(\)/);
  });

  it('the GPS spoof stays behind a development-only guard', () => {
    // It defeats the residency check. `__DEV__` and nothing else — deliberately
    // stricter than `areSimulatedFeaturesEnabled()`, which also opens on
    // EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1 and so ships in a distributable APK.
    const text = source('eligibility-error');

    expect(text).toMatch(/\{__DEV__ && \(/);
    expect(text).toMatch(/setSimulatedCountry\(/);
    // Writing the location store here would leave the panel looking like it
    // worked while changing nothing the check reads.
    expect(text).not.toMatch(/setCurrentLocation\(/);
  });
});
