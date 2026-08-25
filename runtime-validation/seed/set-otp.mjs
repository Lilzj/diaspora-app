// ─────────────────────────────────────────────────────────────────────────────
// Set a known verification code on the pending challenge
//
// ── The problem this solves ──────────────────────────────────────────────────
//
// The app's only sign-in path is a one-time code sent by SMS. The hosted
// deployment runs as `Production`, where `IdentityModuleOptionsValidator`
// refuses to let the host start with `LogOtpCodesForDevelopment` enabled — so
// no code is written to the log — and no SMS provider is configured, so no code
// is delivered either.
//
// The code is stored as `HMACSHA256(key, code)` in `identity.otp_challenges`, so
// it cannot be read back. That is the correct design and it is not the thing to
// change.
//
// **Nobody can sign in to the hosted deployment through the app.** Not a member,
// not a tester. That is worth stating plainly rather than working around
// quietly: it means the deployment is unusable by a real member until an SMS
// provider is configured, and this script only makes it testable.
//
// ── Why this does not weaken anything ────────────────────────────────────────
//
// The alternative considered was running the hosted API as `Development` so
// codes appear in the log. That would relax the CORS policy, permit a fallback
// signing key and put live codes into a log — on a publicly reachable host, for
// every account, permanently.
//
// This instead uses a key the operator already holds. The hash key is derived:
//
//     hashKey = SHA256("otp-hmac:" + Identity:Jwt:SigningKey)
//     stored  = HEX(HMACSHA256(hashKey, code))
//
// So anyone who can read `Identity:Jwt:SigningKey` — which is to say, whoever
// deployed this — can already mint a token for any member directly and does not
// need an OTP at all. Writing a known code grants no capability that the signing
// key did not already grant, and it changes one row rather than the deployment's
// security posture.
//
// It still requires database access. Treat it as an operator tool, and note that
// it makes the *device's* sign-in flow exercisable, which is the whole point:
// the screens under test are reached through that flow.
//
// ── Usage ────────────────────────────────────────────────────────────────────
//
//     node runtime-validation/seed/set-otp.mjs +2348100200001 123456
//
// Start the sign-in on the device first, so a challenge exists to overwrite.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [phone, code = '123456'] = process.argv.slice(2);

const NEON_URI = process.env.NEON_URI;
const SIGNING_KEY = process.env.JWT_SIGNING_KEY;
const PSQL = process.env.PSQL ?? 'psql';

if (!phone || !NEON_URI || !SIGNING_KEY) {
  console.error('Usage: set-otp.mjs <phone> [code]   (needs NEON_URI and JWT_SIGNING_KEY)');
  process.exit(2);
}

if (!/^\d{4,8}$/.test(code)) {
  console.error(`"${code}" is not a plausible code. The generator emits digits only.`);
  process.exit(2);
}

/** Exactly what `SecureOtpCodeGenerator.ComputeHash` produces. */
function computeHash(plainCode) {
  const hashKey = createHash('sha256').update(`otp-hmac:${SIGNING_KEY}`, 'utf8').digest();
  // `Convert.ToHexString` is uppercase, and `SecretHash` stores the string
  // verbatim and compares it with a fixed-time equality — so the case matters.
  return createHmac('sha256', hashKey).update(plainCode.trim(), 'utf8').digest('hex').toUpperCase();
}

function sql(query) {
  try {
    return execFileSync(PSQL, [NEON_URI, '-tAc', query], { encoding: 'utf8' }).trim();
  } catch (cause) {
    return `SQL_ERROR: ${cause.stderr ?? cause.message}`;
  }
}

// ── `Pending` matters as much as unexpired ──────────────────────────────────
//
// A challenge that has already been verified keeps its row, stays unexpired, and
// accepts a rewritten `CodeHash` without complaint — and then refuses every code,
// because the server checks the status before it checks the digits.
//
// This cost a run: a `curl` used to confirm the hash computation consumed the
// very challenge the device was about to use, and the next four attempts failed
// with what looked like a hashing error. `AttemptCount` stayed at 0 throughout,
// which was the tell — the code was never being examined at all.
const pending = sql(`
  SELECT "Id" FROM identity.otp_challenges
   WHERE "PhoneNumber" = '${phone}'
     AND "ExpiresAt" > NOW()
     AND "Status" = 'Pending'
   ORDER BY "IssuedAt" DESC
   LIMIT 1;
`);

if (!pending || pending.startsWith('SQL_ERROR') || pending.includes('ERROR:')) {
  const spent = sql(`
    SELECT "Status" FROM identity.otp_challenges
     WHERE "PhoneNumber" = '${phone}'
     ORDER BY "IssuedAt" DESC LIMIT 1;
  `);

  console.error(
    `No pending challenge for ${phone}.` +
      (spent && !spent.startsWith('SQL_ERROR') ? ` The most recent one is "${spent}".` : '') +
      '\nStart the sign-in again on the device — this rewrites a pending challenge,' +
      '\nit does not create one, and a verified challenge cannot be reused.'
  );
  process.exit(1);
}

// `AttemptCount` is reset too: a challenge that has already been guessed at
// several times can lock out before the new code is ever tried, and debugging
// that looks exactly like a wrong hash.
const updated = sql(`
  UPDATE identity.otp_challenges
     SET "CodeHash" = '${computeHash(code)}', "AttemptCount" = 0
   WHERE "Id" = '${pending}'
  RETURNING "Id";
`);

if (updated.startsWith('SQL_ERROR') || !updated.includes(pending)) {
  console.error(`Could not set the code: ${updated.slice(0, 200)}`);
  process.exit(1);
}

console.log(`Challenge ${pending.slice(0, 8)} for ${phone} now accepts ${code}.`);
