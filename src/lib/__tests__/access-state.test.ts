// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the access-state vocabulary, against the server's (FBL-003)
//
// ── DEFECT-007, and why these tests exist at all ────────────────────────────
//
// The client and the backend hold two different vocabularies for the same idea,
// and the store used to bridge them with `as AccountState`. A cast asserts
// rather than checks, so the backend's `"Verified"` was stored as though it were
// a valid `AccountState`, the compiler had nothing to object to, and
// `FeatureGate` — which opens only for `'DiasporaVerified'` — never matched.
// **The gate never opened for any member, however verified**, and every screen
// it wraps was permanently locked.
//
// The regression guarded here is not "Verified maps to DiasporaVerified". It is
// that **the mapping covers the backend's enumeration exactly**.
//
// ── What was wrong with this file until 18 Nov 2026 ─────────────────────────
//
// It already made that assertion, in both directions, against a list named
// `BACKEND_ACCESS_STATES` — written out here by hand, with a comment explaining
// that there was nothing to import because the backend is another repository in
// another language.
//
// That comment was true about imports and wrong about the conclusion. **Both
// sides of the comparison were maintained in this repository, by the same
// person, in the same commit.** A backend state added tomorrow changes neither,
// so the test passed and would have gone on passing — it asserted that the
// mapping agrees with a copy of the answer, which is the same defect as the
// cast wearing a test's clothes.
//
// Eleven suites here already read the sibling checkout for exactly this
// purpose, through `support/backend-checkout`, whose whole subject is that a
// cross-repository check which does not run has not passed (FBL-001). This file
// now uses it: the backend's own `AccessState.cs` is the list.
//
// ── Why the source and not the published contract ───────────────────────────
//
// The audit recommended the contract — `contracts/Diaspora.Api.json`, which
// `EnumValuesSchemaTransformer` populates — on the grounds that the values are
// "already generated and committed". They are not. That transformer is opt-in
// per property through `[OpenApiEnumValues(typeof(T))]`, which is applied to two
// properties in a document of 562 schemas, and `AccessStateResponse.State` is
// published as a bare `{"type": "string"}`.
//
// It could not be applied here even if somebody wanted to: the attribute's
// constructor throws unless `T.IsEnum`, and `AccessState` is not a C# enum — it
// is an `Enumeration` subclass, nine `static readonly` fields. Teaching the
// transformer to read those is a backend change worth making, and until it is
// made the server's source is the only place the nine values exist.
// ─────────────────────────────────────────────────────────────────────────────

import {
  DEFAULT_ACCOUNT_STATE,
  KNOWN_ACCESS_STATES,
  confinesToGateway,
  grantsCommunityAccess,
  requiresAccessGateway,
  toAccountState,
} from '@/lib/domain/access-state';
import type { AccountState } from '@/types/trust';

import { backendSourceRoot } from './support/backend-checkout';

// Node's globals are declared locally rather than by adding `"node"` to the
// project's `types`: that change surfaces pre-existing errors in roughly twenty
// assertions across other suites, because `@types/node` shadows the ambient
// React Native declaration the boundary suites rely on.
declare const __dirname: string;

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
}

const { readFileSync, readdirSync, existsSync }: {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string, options: { withFileTypes: true }): DirectoryEntry[];
  existsSync(path: string): boolean;
} = require('fs');
const { join }: { join(...parts: string[]): string } = require('path');

describe('access state translation', () => {
  it('opens the gate for a verified member — the defect itself', () => {
    // `AccessState.Verified` is documented server-side as "Trust Engine granted
    // verification. Full contributor access." If this ever stops opening the
    // gate, the whole contributor surface is locked again.
    expect(grantsCommunityAccess(toAccountState('Verified'))).toBe(true);
  });

  it.each([
    ['RegistrationStarted', 'RegistrationStarted'],
    ['PhoneVerificationPending', 'PhoneVerified'],
    ['LimitedAccess', 'LimitedAccess'],
    ['VerificationPending', 'DiasporaVerificationPending'],
    ['VerificationUnderReview', 'VerificationUnderReview'],
    ['Verified', 'DiasporaVerified'],
    ['Suspended', 'Suspended'],
    ['Locked', 'Restricted'],
    ['Disabled', 'Restricted'],
  ])('maps %s to %s', (backend, expected) => {
    expect(toAccountState(backend)).toBe(expected as AccountState);
  });

  it.each([
    'LimitedAccess',
    'PhoneVerificationPending',
    'VerificationPending',
    'VerificationUnderReview',
    'Suspended',
    'Locked',
    'Disabled',
  ])('does not open the gate for %s', (backend) => {
    expect(grantsCommunityAccess(toAccountState(backend))).toBe(false);
  });

  it.each([[null], [undefined], [''], ['NotAState'], ['DiasporaVerified']])(
    'falls back to the least-privileged state for %p',
    (value) => {
      // Note `'DiasporaVerified'` is in this list on purpose: it is a *client*
      // value, not something the backend sends, so receiving it would mean
      // something upstream is echoing our vocabulary back at us. Falling back
      // is the safe reading — an unknown state must never grant.
      expect(toAccountState(value)).toBe(DEFAULT_ACCOUNT_STATE);
      expect(grantsCommunityAccess(toAccountState(value))).toBe(false);
    }
  );

  it('never grants access by accident', () => {
    // Whatever arrives, the only route to an open gate is an explicit mapping.
    const granting = KNOWN_ACCESS_STATES.filter((s) => grantsCommunityAccess(toAccountState(s)));
    expect(granting).toEqual(['Verified']);
  });

  it('gates every state except the one that grants', () => {
    // The routing predicate and the feature gate are two readings of one
    // question, so a state that does not grant must send the member to the
    // gateway. Including states the server has never sent: unknown gates.
    for (const state of [...KNOWN_ACCESS_STATES, 'NotAState', '']) {
      expect(requiresAccessGateway(state)).toBe(!grantsCommunityAccess(toAccountState(state)));
    }
    expect(requiresAccessGateway('Verified')).toBe(false);
    expect(requiresAccessGateway(null)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The cross-repository half
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_SOURCE_ROOT = backendSourceRoot();

/** `AccessState.cs` — nine `static readonly` fields on an `Enumeration`. */
const ACCESS_STATE_SOURCE =
  BACKEND_SOURCE_ROOT === null
    ? null
    : join(BACKEND_SOURCE_ROOT, 'Diaspora.Domain', 'Identity', 'AccessStates', 'AccessState.cs');

const describeAgainstBackend = ACCESS_STATE_SOURCE === null ? describe.skip : describe;

/**
 * The one declaration form this file reads:
 *
 * ```csharp
 * public static readonly AccessState Verified = new(6, nameof(Verified));
 * ```
 *
 * Narrow on purpose. A parser that accepts more shapes than the file uses is a
 * parser nobody can reason about, and the floor assertions below turn any
 * failure to match into a red test rather than a short list.
 */
const DECLARATION = /^\s*public static readonly AccessState (\w+)\s*=/gm;

describeAgainstBackend("the client's access states against the server's", () => {
  let serverStates: string[] = [];

  // Read here, never in the describe body: Jest executes a skipped describe's
  // body to collect its tests, so a read there runs with no checkout.
  beforeAll(() => {
    const path = ACCESS_STATE_SOURCE as string;

    if (!existsSync(path)) {
      // The support module's rule, applied to this file: a checkout that exists
      // and does not contain the server's access states is a broken tree, not a
      // developer without the sibling repository. Skipping would hide it.
      throw new Error(
        `The backend checkout has no ${path}. That file is where the nine access states are ` +
          'declared, and this suite is the only automated check that the two vocabularies agree.',
      );
    }

    const source = readFileSync(path, 'utf8');

    expect(source).toContain('class AccessState : Enumeration');

    serverStates = [...source.matchAll(DECLARATION)].map((match) => match[1]);
  });

  it('read the server file it meant to read', () => {
    // The canary. A check that compares two lists cannot tell an agreement from
    // a parser that found nothing, so the parse is asserted before it is used:
    // the enumeration has had nine members since it was written, and `Verified`
    // is the one whose absence caused the original lockout.
    expect(serverStates.length).toBeGreaterThanOrEqual(9);
    expect(serverStates).toContain('Verified');
    expect(serverStates).toContain('Disabled');
    expect(new Set(serverStates).size).toBe(serverStates.length);
  });

  it('translates every state the server can send', () => {
    // The assertion that matters, and the one the hand-written list could not
    // make. A state added on the server and not taught to the mapping fails
    // here, in this repository, on the next run after the backend merges.
    for (const state of serverStates) {
      expect(KNOWN_ACCESS_STATES).toContain(state);
    }
  });

  it('does not claim to translate states the server cannot send', () => {
    for (const known of KNOWN_ACCESS_STATES) {
      expect(serverStates).toContain(known);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Every member of the union, against everything that can produce one
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Union members nothing produces, and why each is still here.
 *
 * `FullCommunityAccess` was on this list in prose, in `access-state.ts`, for as
 * long as it existed: *"nothing will ever produce it"*, kept because screens
 * branched on it. It is gone (FSOLID-007), and the two below are a different
 * case — the server reports a refused or incomplete verification through the
 * Trust verification status, not through `AccessState`, so nothing sets them
 * here. Deleting them would delete this client's only handling of a refusal.
 * They are unwired, not redundant.
 *
 * The test below fails in **both** directions: a new unreachable member is red,
 * and so is an entry here that something has started producing. An exemption
 * that cannot retire itself is a comment with a config file's syntax.
 */
const UNWIRED: Readonly<Record<string, string>> = {
  VerificationRejected:
    'The server reports a refusal through the Trust verification status, not through AccessState. ' +
    'Closes when the store sets it from the verification decision.',
  RequiresMoreInformation:
    'As above, for RequiresAdditionalDocuments. Note isAwaitingDecision already treats it as live.',
};

/** `src/`, from `src/lib/__tests__`. */
const SOURCE_ROOT = join(__dirname, '..', '..');

function* sourceFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      // Tests state what they are testing and mocks answer as a server would;
      // neither is a producer of this app's account state.
      if (entry.name === '__tests__' || entry.name === 'mocks') continue;
      yield* sourceFiles(path);
      continue;
    }

    if (/\.tsx?$/.test(entry.name)) yield path;
  }
}

describe('every account state is reachable', () => {
  /** `setAccountState('X')` — the imperative half, alongside the mapping. */
  const SET_CALL = /setAccountState\(\s*'([A-Za-z]+)'/g;

  /** The union, read from where it is declared rather than copied here. */
  const UNION = /export type AccountState =([^;]+);/;

  let declared: string[] = [];
  let produced: Set<string> = new Set();
  let setCallSites = 0;

  beforeAll(() => {
    const types = readFileSync(join(SOURCE_ROOT, 'types', 'trust.ts'), 'utf8');
    const union = UNION.exec(types);

    if (union === null) throw new Error('AccountState is no longer declared as a union in types/trust.ts.');

    declared = [...union[1].matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]);

    // Everything the mapping can return, plus everything a screen sets by hand.
    produced = new Set<string>(KNOWN_ACCESS_STATES.map((state) => toAccountState(state)));

    for (const file of sourceFiles(SOURCE_ROOT)) {
      for (const match of readFileSync(file, 'utf8').matchAll(SET_CALL)) {
        produced.add(match[1]);
        setCallSites += 1;
      }
    }
  });

  it('found the union and the writers', () => {
    // Canary again, and the same reason: were either sweep to stop matching,
    // the comparison below would report a clean codebase. `AppealPending` is
    // the proof the second sweep works — the mapping cannot produce it, so it
    // is in `produced` only if a `setAccountState` call was found.
    expect(declared.length).toBeGreaterThanOrEqual(11);
    expect(declared).toContain('DiasporaVerified');
    expect(setCallSites).toBeGreaterThanOrEqual(3);
    expect([...produced]).toContain('AppealPending');
  });

  it('names every member nothing can produce, with the reason it stays', () => {
    const unreachable = declared.filter((state) => !produced.has(state)).sort();

    expect(unreachable).toEqual(Object.keys(UNWIRED).sort());
  });

  it('keeps a reason with every exemption', () => {
    for (const [state, reason] of Object.entries(UNWIRED)) {
      expect(declared).toContain(state);
      expect(reason.length).toBeGreaterThan(40);
    }
  });
});

describe('who is held at the gateway (FARCH-006)', () => {
  /** The union, read from where it is declared rather than copied here. */
  const UNION = /export type AccountState =([^;]+);/;

  let declared: AccountState[] = [];

  beforeAll(() => {
    const union = UNION.exec(readFileSync(join(SOURCE_ROOT, 'types', 'trust.ts'), 'utf8'));

    if (union === null) throw new Error('AccountState is no longer declared as a union in types/trust.ts.');

    declared = [...union[1].matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1] as AccountState);
  });

  it('holds the seven states the root layout held when it kept its own list', () => {
    // The list moved here from the root layout's gateway effect unchanged, so
    // every member-only group could withhold itself on the same terms. Changing
    // who is held is a decision, and this is where it shows.
    expect(declared.filter(confinesToGateway).sort()).toEqual(
      [
        'AppealPending',
        'DiasporaVerificationPending',
        'RequiresMoreInformation',
        'Restricted',
        'Suspended',
        'VerificationRejected',
        'VerificationUnderReview',
      ].sort()
    );
  });

  it('never holds a member the feature gate admits', () => {
    for (const state of declared.filter(confinesToGateway)) {
      expect(grantsCommunityAccess(state)).toBe(false);
    }
  });

  it('holds nobody whose state is not known yet', () => {
    // A session whose profile read failed has no account state. The root layout
    // has always let it be, and its tokens are good.
    expect(confinesToGateway(undefined)).toBe(false);
    expect(confinesToGateway(null)).toBe(false);
  });
});
