/**
 * Isolates how each endpoint family answers a request body it cannot bind.
 *
 * MVC controllers and minimal APIs are two different binding pipelines in the
 * same host, and a client cannot tell which one it is addressing. If they
 * disagree about the status code for the same class of mistake, one of them is
 * telling the client the wrong thing.
 */
import { call, makeUser, sql, save } from './harness.mjs';

const RUN = process.env.RUNTIME_RUN ?? '20';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;

const u = await makeUser({ name: 'Binding Probe', phone: ph(1), password: 'Bq3#nwXt7Kd5' });
sql(`UPDATE identity.users SET "AccessState"='Verified' WHERE "Id"='${u.userId}';`);
const re = await call('POST', '/auth/login', { label: 'probe login', body: { phoneNumber: ph(1), password: 'Bq3#nwXt7Kd5' } });
const token = (re.body?.data?.tokens ?? re.body?.data ?? {}).accessToken;
console.log('token acquired:', !!token, '\n');

const cases = [
  ['minimal-API', 'POST /bookmarks  — empty object (required missing)', 'POST', '/bookmarks', {}],
  ['minimal-API', 'POST /bookmarks  — type mismatch on required field', 'POST', '/bookmarks', { targetType: 123, targetId: 456 }],
  ['minimal-API', 'POST /bookmarks  — valid shape, unknown enum value', 'POST', '/bookmarks', { targetType: 'NotAThing', targetId: '00000000-0000-0000-0000-000000000000' }],
  ['minimal-API', 'POST /guides     — empty object (required missing)', 'POST', '/guides', {}],
  ['minimal-API', 'POST /housing/listings — empty object', 'POST', '/housing/listings', {}],
  ['MVC        ', 'POST /auth/register — empty object', 'POST', '/auth/register', {}],
  ['MVC        ', 'POST /auth/register — type mismatch', 'POST', '/auth/register', { fullName: 123, phoneNumber: 456, password: 1, nationality: 1, countryOfResidence: 1 }],
  ['MVC        ', 'PUT  /auth/profile  — empty object', 'PUT', '/auth/profile', {}],
];

const rows = [];
for (const [family, label, m, p, b] of cases) {
  const r = await call(m, p, { token, body: b, label });
  const code = r.body?.code ?? r.body?.title ?? '';
  rows.push({ family: family.trim(), label, status: r.status, code });
  console.log(`  ${String(r.status).padEnd(4)} [${family}] ${label} -> ${code}`);
}

console.log('\n--- summary ---');
for (const f of ['minimal-API', 'MVC']) {
  const s = rows.filter((r) => r.family === f);
  console.log(`  ${f.padEnd(12)} statuses: ${[...new Set(s.map((r) => r.status))].join(', ')}`);
}
save('C:/Users/User/source/repos/Diaspora/runtime-validation/evidence-body-binding.json');
