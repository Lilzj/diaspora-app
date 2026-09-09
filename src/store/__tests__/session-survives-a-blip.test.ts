// ─────────────────────────────────────────────────────────────────────────────
// A request that never arrived is not a revoked session
//
// ── What this pins ──────────────────────────────────────────────────────────
//
// `runRefresh` ended with a bare `catch`, so **any** failure of the refresh
// call signed the member out and deleted their stored session:
//
//   no signal · aeroplane mode · a tunnel · a 500 · a timeout · DNS
//
// On a phone on a mobile network — which is most of this application's use — a
// blip that happened to coincide with a token refresh made somebody type their
// password in again. It was watched happening twice in one sitting on an
// emulator whose network dropped for a second, in the middle of a walkthrough.
//
// ── Why the bias is deliberate ──────────────────────────────────────────────
//
// Only a *refusal* ends a session. Anything unrecognised is treated as "not
// answered", because the two mistakes are not the same size: keeping a dead
// session costs one failed request, which comes straight back here as a 401
// and ends it properly. Throwing away a live one costs somebody their account
// until they can find their password.
// ─────────────────────────────────────────────────────────────────────────────

import { isRefusal } from '../auth';
import { integrationError } from '@/lib/integrations/errors';

describe('what counts as the server refusing a refresh', () => {
  it.each([
    ['InvalidRequest', 'a 401 on the refresh route, which is an anonymous call'],
    ['PermissionDenied', 'a 403 — the account cannot sign in'],
    ['AuthenticationRequired', 'a 401 mapped by the generic path'],
    ['ExpiredCredential', 'the refresh token is past its life'],
  ] as const)('%s is a refusal (%s)', (kind, _why) => {
    expect(isRefusal(integrationError(kind, {}))).toBe(true);
  });

  it.each([
    ['NetworkFailure', 'the request never left, or never came back'],
    ['BackendUnavailable', 'a 5xx — the server is having a bad time, not saying no'],
    ['ProviderUnavailable', 'same, one layer out'],
    ['RateLimited', 'asked too often; the credential is not in question'],
    ['BackendGap', 'a 404 on the route, which says nothing about the token'],
    ['Conflict', 'not an answer about this credential'],
    ['UnknownError', 'unrecognised, and the safe reading is "not answered"'],
  ] as const)('%s is not a refusal (%s)', (kind, _why) => {
    expect(isRefusal(integrationError(kind, {}))).toBe(false);
  });

  it('does not treat a plain thrown thing as a refusal', () => {
    // A `TypeError` from our own code inside the success path would otherwise
    // sign the member out, which is the bare-catch bug in miniature.
    expect(isRefusal(new Error('boom'))).toBe(false);
    expect(isRefusal(new TypeError('undefined is not a function'))).toBe(false);
    expect(isRefusal(undefined)).toBe(false);
    expect(isRefusal(null)).toBe(false);
    expect(isRefusal('401')).toBe(false);
  });
});

describe('the refresh handler', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };

  const SOURCE = fs
    .readFileSync(path.join(process.cwd(), 'src', 'store', 'auth.ts'), 'utf8')
    .replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), ' ')
    .replace(new RegExp('//[^\\n]*', 'g'), ' ');

  it('does not catch everything and end the session', () => {
    // The literal shape of the defect. A `catch {` with no binding cannot tell
    // a refusal from a blip, so it treated them alike.
    expect(SOURCE).not.toMatch(/catch\s*\{\s*await endSessionLocally/);
  });

  it('ends the session only behind the refusal check', () => {
    expect(SOURCE).toMatch(/isRefusal\(cause\)[\s\S]{0,120}endSessionLocally/);
  });

  it('leaves the member signed in when the question was never answered', () => {
    // Otherwise the store sits in `refreshing` forever and the UI waits on a
    // call that already failed.
    expect(SOURCE).toMatch(/status: 'authenticated',\s*isAuthenticated: true,\s*\}\);\s*return null;/);
  });
});
