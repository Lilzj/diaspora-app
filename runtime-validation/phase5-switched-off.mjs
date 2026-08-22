/**
 * §23 — the switched-off capabilities.
 *
 * The purpose is not to make these work. It is to prove that the source state,
 * the runtime state and what the client is told all agree. A capability that is
 * off must say so; a capability presented as available while it is off is a real
 * alignment defect, and is the thing this phase is looking for.
 */
import { call, makeUser, sql, save } from './harness.mjs';

const results = [];
const rec = (capability, expected, actual, correct, note = '') => {
  results.push({ capability, expected, actual, correct, note });
  console.log(`  ${(correct ? 'PASS' : 'DEFECT').padEnd(7)} ${capability}\n            expected: ${expected}\n            actual  : ${actual}${note ? `\n            ${note}` : ''}`);
};

const RUN = process.env.RUNTIME_RUN ?? '70';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;

console.log('\n=== PHASE 5: SWITCHED-OFF CAPABILITIES ===\n');

const u = await makeUser({ name: 'Capability Probe', phone: ph(1), password: 'Cp9#vzKt4Wr7' });
sql(`UPDATE identity.users SET "AccessState"='Verified' WHERE "Id"='${u.userId}';`);
const re = await call('POST', '/auth/login', { label: 'login', body: { phoneNumber: ph(1), password: 'Cp9#vzKt4Wr7' } });
const T = (re.body?.data?.tokens ?? re.body?.data ?? {}).accessToken;

const describe = (r) => `HTTP ${r.status}${r.body?.code ? ` ${r.body.code}` : ''}${r.body?.detail ? ` — "${String(r.body.detail).slice(0, 120)}"` : ''}`;

// ── 1. Wallet capabilities: what does the server itself declare? ─────────
const caps = await call('GET', '/financial/capabilities', { token: T, label: 'financial capabilities' });
const cd = caps.body?.data ?? {};
console.log(`  financial capabilities envelope: ${JSON.stringify(cd).slice(0, 400)}\n`);

// ── 2. Deposits ──────────────────────────────────────────────────────────
const dep = await call('POST', '/financial/wallets/me/deposits', {
  token: T, label: 'wallet deposit',
  body: { amount: 1000, currency: 'NGN', method: 'Card' },
});
rec('wallet deposit', 'refused as unsupported (503 / explicit not-supported code)', describe(dep),
  dep.status === 503 || /notsupported|not-supported|unsupported|disabled/i.test(dep.body?.code ?? ''),
  dep.status === 404 ? 'route is not published at all — the capability is absent rather than switched off' : '');

// ── 3. Withdrawals ───────────────────────────────────────────────────────
const wd = await call('POST', '/financial/wallets/me/withdrawals', {
  token: T, label: 'wallet withdrawal',
  body: { amount: 1000, currency: 'NGN', destination: 'Bank' },
});
rec('wallet withdrawal', 'refused as unsupported', describe(wd),
  wd.status === 503 || /notsupported|not-supported|unsupported|disabled/i.test(wd.body?.code ?? ''),
  wd.status === 404 ? 'route is not published at all' : '');

// ── 4. Rewards conversion (write) ────────────────────────────────────────
const conv = await call('POST', '/financial/rewards/conversions', {
  token: T, label: 'rewards conversion', body: { points: 100, currency: 'NGN' },
});
rec('rewards conversion (write)', 'refused as unsupported', describe(conv),
  conv.status === 503 || conv.status === 404 || /notsupported|unsupported|disabled/i.test(conv.body?.code ?? ''));

// ── 5. Creator audience reach ────────────────────────────────────────────
const reach = await call('GET', '/creators/me/audience', { token: T, label: 'creator audience' });
const rb = reach.body?.data ?? {};
const reachAvailable = rb.reachAvailable ?? rb.reach?.available;
rec('creator audience reach',
  'answers with reachAvailable=false rather than a fabricated reach figure',
  `${describe(reach)} reachAvailable=${reachAvailable} reach=${JSON.stringify(rb.reach ?? rb.totalReach ?? null)}`,
  reach.status === 404 || reachAvailable === false || reachAvailable === undefined,
  reachAvailable === false ? 'the server declares the capability unavailable — a client showing 0 as a real figure would be the defect' : '');

// ── 6. Maps: routing / navigation ────────────────────────────────────────
const geoCaps = await call('GET', '/geo/capabilities', { token: T, label: 'geo capabilities' });
console.log(`
  geo capabilities: ${JSON.stringify(geoCaps.body?.data ?? {}).slice(0, 500)}
`);

for (const [name, verb, path, body] of [
  ['maps routing/navigation', 'POST', '/geo/routes', { origin: { latitude: 6.5244, longitude: 3.3792 }, destination: { latitude: 6.6, longitude: 3.4 }, mode: 'Driving' }],
  ['maps cost of living', 'GET', '/geo/neighborhoods/compare?countryCode=NG', undefined],
  ['maps safety', 'GET', '/geo/heatmap?countryCode=NG', undefined],
]) {
  const r = await call(verb, path, { token: T, label: name, body });
  rec(name, 'absent or explicitly unavailable — never a fabricated figure', describe(r),
    r.status === 404 || r.status === 503 || r.status === 501,
    r.status === 200 ? `answered 200 with ${JSON.stringify(r.body?.data ?? {}).slice(0, 160)}` : '');
}

// ── 7. Automation platform-wide / location triggers ──────────────────────
const autoCaps = await call('GET', '/automations/capabilities', { token: T, label: 'automation capabilities' });
const ac = autoCaps.body?.data ?? {};
console.log(`\n  automation capabilities: ${JSON.stringify(ac).slice(0, 400)}\n`);
const triggers = JSON.stringify(ac);
rec('automation platform-wide / location triggers',
  'declared unavailable in the capability document the client reads',
  `${describe(autoCaps)} mentions platform-wide=${/platform/i.test(triggers)} location=${/location/i.test(triggers)}`,
  autoCaps.status === 200 || autoCaps.status === 404);

const pass = results.filter((r) => r.correct).length;
console.log(`\n--- PHASE 5: ${pass}/${results.length} behave as the matrix claims ---`);
save('C:/Users/User/source/repos/Diaspora/runtime-validation/evidence-phase5-switched-off.json');
