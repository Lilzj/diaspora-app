import { call, makeUser, otpFor, sql, save } from './harness.mjs';

const results = [];
const rec = (flow, verdict, note) => {
  results.push({ flow, verdict, note });
  console.log(`  ${verdict.padEnd(7)} ${flow} — ${note}`);
};

// A distinct phone block per run, so a re-run is not a duplicate-registration test.
const RUN = process.env.RUNTIME_RUN ?? '3';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;

console.log('\n=== PHASE 2: AUTHENTICATION & IDENTITY ===\n');

// ── Registration → verification → session ────────────────────────────────
const phone = ph(1);
const u = await makeUser({ name: 'Grace Hopper', phone, password: 'Qv8#zrTm4Kd2' });
rec('register → verify → session', u.ok ? 'PASS' : 'FAIL',
  u.ok ? `userId=${u.userId}, access token acquired` : `stage=${u.stage} reg=${u.reg?.status}`);

// Persistence checked against the database, not the API's own read path.
const dbUser = sql(`SELECT "PhoneNumber" || ' verified_at=' || COALESCE("phone_verified_at"::text,'null') FROM identity.users WHERE "Id"='${u.userId}';`);
rec('registration persisted in identity.users', dbUser.includes(phone) ? 'PASS' : 'FAIL', `db: ${dbUser}`);

// ── /auth/me ─────────────────────────────────────────────────────────────
const me = await call('GET', '/auth/me', { token: u.accessToken, label: 'auth/me' });
const meName = me.body?.data?.fullName ?? me.body?.data?.profile?.fullName;
rec('GET /auth/me', me.status === 200 ? 'PASS' : 'FAIL', `status=${me.status} fullName=${meName}`);

// ── Negative: anonymous and malformed credentials ────────────────────────
const anon = await call('GET', '/auth/me', { label: 'auth/me anonymous' });
rec('GET /auth/me anonymous → 401', anon.status === 401 ? 'PASS' : 'FAIL', `status=${anon.status}`);

const bad = await call('GET', '/auth/me', { token: 'not-a-real-token', label: 'auth/me malformed token' });
rec('GET /auth/me malformed token → 401', bad.status === 401 ? 'PASS' : 'FAIL', `status=${bad.status}`);

// ── OTP negatives, on their own identity ─────────────────────────────────
const phone2 = ph(2);
await call('POST', '/auth/register', {
  label: 'register OTP-negatives identity',
  body: { fullName: 'Alan Turing', phoneNumber: phone2, password: 'Wp3#njBq7Xs5', nationality: 'GB', countryOfResidence: 'NG' },
});

const wrongOtp = await call('POST', '/auth/verify-phone', {
  label: 'verify-phone wrong code', body: { phoneNumber: phone2, code: '000000' },
});
rec('verify-phone wrong code rejected', wrongOtp.status >= 400 ? 'PASS' : 'FAIL',
  `status=${wrongOtp.status} code=${wrongOtp.body?.code ?? ''}`);

const good = otpFor(phone2);
const ver2 = await call('POST', '/auth/verify-phone', { label: 'verify-phone correct code', body: { phoneNumber: phone2, code: good } });
rec('verify-phone correct code', ver2.status === 200 ? 'PASS' : 'FAIL', `status=${ver2.status}`);

const again = await call('POST', '/auth/verify-phone', { label: 'verify-phone already verified', body: { phoneNumber: phone2, code: good } });
rec('verify-phone already-verified refused', again.status >= 400 ? 'PASS' : 'FAIL',
  `status=${again.status} code=${again.body?.code ?? ''}`);

// ── Login negatives ──────────────────────────────────────────────────────
const wrongPw = await call('POST', '/auth/login', { label: 'login wrong password', body: { phoneNumber: phone, password: 'Totally#Wrong99' } });
rec('login wrong password → 401', wrongPw.status === 401 ? 'PASS' : 'FAIL', `status=${wrongPw.status} code=${wrongPw.body?.code ?? ''}`);

const noUser = await call('POST', '/auth/login', { label: 'login unknown phone', body: { phoneNumber: '+2340000000000', password: 'Totally#Wrong99' } });
rec('login unknown phone → 401 (no user enumeration)', noUser.status === 401 ? 'PASS' : 'FAIL', `status=${noUser.status}`);

// ── Refresh, rotation, and the refreshed token's usability ───────────────
// On its own identity: reuse detection revokes the whole session, so running a
// replay test against this identity would invalidate the token under test.
const rotUser = await makeUser({ name: 'Radia Perlman', phone: ph(3), password: 'Hs2#wqNv8Ry4' });
const r1 = await call('POST', '/auth/refresh', { label: 'refresh', body: { refreshToken: rotUser.refreshToken } });
const t1 = r1.body?.data?.tokens ?? r1.body?.data ?? {};
rec('refresh issues a new access token', r1.status === 200 && !!t1.accessToken ? 'PASS' : 'FAIL', `status=${r1.status}`);
rec('refresh rotates the refresh token', t1.refreshToken && t1.refreshToken !== rotUser.refreshToken ? 'PASS' : 'FAIL',
  t1.refreshToken ? 'returned token differs from the presented one' : 'no refresh token returned');

// Use the refreshed token BEFORE any replay test touches this session.
const meFresh = await call('GET', '/auth/me', { token: t1.accessToken, label: 'auth/me with refreshed token' });
rec('refreshed access token is accepted', meFresh.status === 200 ? 'PASS' : 'FAIL', `status=${meFresh.status}`);

// ── Profile update, on the still-live refreshed session ──────────────────
const upd = await call('PUT', '/auth/profile', {
  token: t1.accessToken, label: 'update profile',
  body: { fullName: 'Radia J Perlman', nationality: 'NG', countryOfResidence: 'NG', preferredLanguage: 'en', preferredTimeZone: 'Africa/Lagos' },
});
let profileVerdict = 'FAIL';
let profileNote = `status=${upd.status} ${JSON.stringify(upd.body).slice(0, 240)}`;
if (upd.status < 400) {
  const dbName = sql(`SELECT "FullName" FROM identity.users WHERE "Id"='${rotUser.userId}';`);
  const reread = await call('GET', '/auth/me', { token: t1.accessToken, label: 'auth/me after profile update' });
  const seen = reread.body?.data?.fullName ?? reread.body?.data?.profile?.fullName;
  profileVerdict = dbName.includes('Radia J Perlman') && seen === 'Radia J Perlman' ? 'PASS' : 'FAIL';
  profileNote = `db="${dbName}" read-back="${seen}"`;
}
rec('profile update persists and reads back', profileVerdict, profileNote);

// ── Refresh-token reuse detection, on its own identity ───────────────────
const reuseUser = await makeUser({ name: 'Barbara Liskov', phone: ph(4), password: 'Kd5#tzPw3Mn7' });
await call('POST', '/auth/refresh', { label: 'refresh (reuse-detection setup)', body: { refreshToken: reuseUser.refreshToken } });
const replay = await call('POST', '/auth/refresh', { label: 'refresh replay of rotated-out token', body: { refreshToken: reuseUser.refreshToken } });
rec('rotated-out refresh token refused', replay.status === 401 ? 'PASS' : 'FAIL',
  `status=${replay.status} code=${replay.body?.code ?? ''}`);
rec('refresh-token reuse revokes the session',
  replay.body?.code === 'Identity.Session.RefreshTokenReuseDetected' ? 'PASS' : 'FAIL',
  `code=${replay.body?.code ?? 'n/a'}`);

// ── Logout and revocation, on its own identity ───────────────────────────
const outUser = await makeUser({ name: 'Karen Sparck Jones', phone: ph(5), password: 'Vb9#hqLd6Tz2' });
const out = await call('POST', '/auth/logout', { token: outUser.accessToken, label: 'logout', body: {} });
rec('logout accepted', out.status < 400 ? 'PASS' : 'FAIL', `status=${out.status}`);

const afterOut = await call('POST', '/auth/refresh', { label: 'refresh after logout', body: { refreshToken: outUser.refreshToken } });
rec('logout revokes the refresh token', afterOut.status === 401 ? 'PASS' : 'FAIL',
  `status=${afterOut.status} code=${afterOut.body?.code ?? ''}`);

// ── resend-otp cooldown metadata ─────────────────────────────────────────
// Last, on a fresh identity: the OneTimeCode limiter is a shared 5-per-300s
// window and every registration above draws from it.
const phone6 = ph(6);
await call('POST', '/auth/register', {
  label: 'register resend-otp identity',
  body: { fullName: 'Shafi Goldwasser', phoneNumber: phone6, password: 'Nc4#gxRt8Wq1', nationality: 'US', countryOfResidence: 'NG' },
});
const resend = await call('POST', '/auth/resend-otp', {
  label: 'resend-otp', body: { phoneNumber: phone6, purpose: 'PhoneVerification' },
});
const rd = resend.body?.data ?? {};
const hasCooldown = rd.resendAvailableInSeconds !== undefined || rd.resendsRemaining !== undefined;
rec('resend-otp returns cooldown metadata',
  resend.status < 400 && hasCooldown ? 'PASS' : resend.status === 429 ? 'BLOCKED' : 'FAIL',
  resend.status === 429
    ? 'rate limiter (OneTimeCode, 5 per 300s) consumed by the registrations above — see phase2-resend-otp.mjs for the isolated run'
    : `status=${resend.status} payload=${JSON.stringify(rd).slice(0, 240)}`);

const pass = results.filter((r) => r.verdict === 'PASS').length;
console.log(`\n--- PHASE 2: ${pass}/${results.length} PASS ---`);
save('C:/Users/User/source/repos/Diaspora/runtime-validation/evidence-phase2-auth.json');
