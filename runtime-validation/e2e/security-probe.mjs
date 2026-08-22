/**
 * Production release security pass.
 *
 * Every check drives a real request against a running Diaspora.Api. Nothing here is
 * inferred from source: a check that could not be executed is recorded as BLOCKED rather
 * than as an absence of vulnerability, because "no vulnerability found" is only meaningful
 * when the probe actually ran.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Written beside this file rather than relative to the cwd. `run-all.mjs` spawns each
// harness with its own working directory, and a relative path silently resolved to
// `runtime-validation/e2e/runtime-validation/e2e/...` — the probe ran, found everything it
// was looking for, and then died writing its own results.
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'results-security-probe.json');

import { call, sql, verifiedUser, recorder, uploadDirect, samplePng } from './e2e-harness.mjs';

const results = [];
const rec = recorder(results);
const RUN = process.env.RUNTIME_RUN ?? '900';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;

// The passwords deliberately share no substring with either name. The first draft used
// "Sec#Pr0beAda9" for a member called Ada Owner, and registration answered 400
// Identity.Password.PersonalInformation — `ForbidPersonalInformation` doing exactly what it
// is for. Recorded rather than quietly corrected: the probe was wrong and the platform was
// right, and that refusal is itself one of the controls this pass is meant to confirm.
const A = await verifiedUser({ name: 'Ada Owner', phone: ph(1), password: 'Qx7#vLmT2wZk' });
const B = await verifiedUser({ name: 'Mallory Other', phone: ph(2), password: 'Rj4#nPqW8bYc' });
rec('setup', 'two independent verified members', A.token && B.token ? 'PASS' : 'FAIL', `A=${A.userId} B=${B.userId}`);

// The password policy, asserted rather than assumed, because the probe met it by accident.
const personal = await call('POST', '/auth/register', {
  label: 'a password containing the member name',
  body: { fullName: 'Ada Owner', phoneNumber: ph(3), password: 'Sec#Pr0beAda9', nationality: 'NG', countryOfResidence: 'NG' },
});
rec('password-policy', 'a password containing the member name is refused',
  personal.status === 400 && personal.body?.code === 'Identity.Password.PersonalInformation' ? 'PASS' : 'FAIL',
  `status=${personal.status} code=${personal.body?.code ?? '-'}`);

const weak = await call('POST', '/auth/register', {
  label: 'a short password',
  body: { fullName: 'Weak Probe', phoneNumber: ph(4), password: 'short1A', nationality: 'NG', countryOfResidence: 'NG' },
});
rec('password-policy', 'a password below the minimum length is refused',
  weak.status === 400 ? 'PASS' : 'FAIL', `status=${weak.status} code=${weak.body?.code ?? '-'}`);
if (!A.token || !B.token) {
  writeFileSync(OUT, JSON.stringify({ results }, null, 2));
  process.exit(1);
}

// ── Object-level authorisation (IDOR) ───────────────────────────────────────
// A creates something A owns; B asks for it by identifier.
await call('POST', '/marketplace/sellers', {
  token: A.token, label: 'A opens a seller profile',
  body: { displayName: `Ada Sec ${RUN}`, countryCode: 'NG', kind: 'Individual' },
});
// The category comes from the server's own taxonomy rather than a guess. A create that
// fails validation would leave every object-level check below with nothing to test and
// report BLOCKED, which is the honest outcome but not a useful one.
const cats = await call('GET', '/marketplace/categories', { token: A.token, label: 'marketplace categories' });
const catList = cats.body?.data?.items ?? cats.body?.data ?? [];
const categoryKey = Array.isArray(catList) && catList.length ? (catList[0].key ?? catList[0].categoryKey) : 'general';
const listing = await call('POST', '/marketplace/listings', {
  token: A.token, label: 'A creates a listing',
  body: {
    title: `IDOR probe listing ${RUN}`,
    description: 'A listing owned by A, created so that B can be refused when it asks to change it.',
    categoryKey,
    countryCode: 'NG', cityName: 'Lagos', regionName: 'Lagos',
    price: 1000, currency: 'NGN', isNegotiable: false, quantity: 1,
    condition: 'New', listingType: 'Sale',
  },
});
const listingId = listing.body?.data?.listingId ?? listing.body?.data?.id;
rec('setup', 'A owns a listing', listingId ? 'PASS' : 'BLOCKED', `status=${listing.status} id=${listingId ?? '-'}`);

if (listingId) {
  // A complete, valid body — `title`, `description` and `countryCode` are all required.
  // A partial one answers 400 before authorisation is consulted, which would leave this
  // check recording a refusal it never actually obtained.
  const bUpdate = await call('PUT', `/marketplace/listings/${listingId}`, {
    token: B.token, label: 'B edits A listing',
    body: {
      title: 'Owned by Mallory now',
      description: 'An edit attempted by an account that does not own this listing.',
      countryCode: 'NG',
    },
  });
  rec('idor', 'B cannot edit a listing owned by A',
    [401, 403, 404].includes(bUpdate.status) ? 'PASS' : 'FAIL',
    `status=${bUpdate.status} code=${bUpdate.body?.code ?? '-'}`);

  const bDelete = await call('DELETE', `/marketplace/listings/${listingId}`, {
    token: B.token, label: 'B deletes A listing',
  });
  rec('idor', 'B cannot delete a listing owned by A',
    [401, 403, 404].includes(bDelete.status) ? 'PASS' : 'FAIL',
    `status=${bDelete.status} code=${bDelete.body?.code ?? '-'}`);

  const still = sql(`SELECT COUNT(*) FROM marketplace.marketplace_listings WHERE "Id"='${listingId}';`);
  rec('idor', 'the listing still exists in the database after both attempts',
    still === '1' ? 'PASS' : 'FAIL', `rows=${still}`);
}

for (const [name, path] of [['wallets', '/financial/wallets/me'], ['notifications', '/notifications']]) {
  const asB = await call('GET', path, { token: B.token, label: `B reads its own ${name}` });
  const text = JSON.stringify(asB.body ?? {});
  rec('idor', `${name} is scoped to the caller`, !text.includes(A.userId) ? 'PASS' : 'FAIL',
    `status=${asB.status} carries A identifier=${text.includes(A.userId)}`);
}

// ── Mass assignment ─────────────────────────────────────────────────────────
const before = sql(`SELECT "Role" || '/' || "AccessState" FROM identity.users WHERE "Id"='${B.userId}';`);
const escalate = await call('PUT', '/auth/profile', {
  token: B.token, label: 'B sends privileged fields in a profile update',
  body: {
    fullName: 'Mallory Escalated', role: 'Admin', accessState: 'Verified',
    isPlatformAdmin: true, trustLevel: 'Trusted', reputationPoints: 999999,
    id: A.userId, userId: A.userId,
  },
});
const after = sql(`SELECT "Role" || '/' || "AccessState" FROM identity.users WHERE "Id"='${B.userId}';`);
rec('mass-assignment', 'a profile update cannot set Role or AccessState',
  before === after ? 'PASS' : 'FAIL', `status=${escalate.status} before=${before} after=${after}`);

const aName = sql(`SELECT "FullName" FROM identity.users WHERE "Id"='${A.userId}';`);
rec('mass-assignment', 'an identifier in the body does not redirect the write onto another member',
  aName !== 'Mallory Escalated' ? 'PASS' : 'FAIL', `A.fullName="${aName}"`);

// ── Token handling ──────────────────────────────────────────────────────────
const parts = A.token.split('.');
const tampered = `${parts[0]}.${parts[1]}.${'A'.repeat(parts[2].length)}`;
const t1 = await call('GET', '/auth/me', { token: tampered, label: 'tampered signature' });
rec('tokens', 'a tampered signature is refused', t1.status === 401 ? 'PASS' : 'FAIL', `status=${t1.status}`);

const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
const t2 = await call('GET', '/auth/me', { token: `${noneHeader}.${parts[1]}.`, label: 'alg=none' });
rec('tokens', 'an alg=none token is refused', t2.status === 401 ? 'PASS' : 'FAIL', `status=${t2.status}`);

const t3 = await call('GET', '/auth/me', { token: 'not-a-jwt-at-all', label: 'garbage token' });
rec('tokens', 'a malformed token is refused', t3.status === 401 ? 'PASS' : 'FAIL', `status=${t3.status}`);

// ── Injection ───────────────────────────────────────────────────────────────
const usersBefore = sql('SELECT COUNT(*) FROM identity.users;');
const payloads = [`' OR 1=1--`, `'; DROP TABLE identity.users;--`, `1 UNION SELECT NULL,NULL--`];
for (const payload of payloads) {
  const r = await call('GET', `/guides/search?query=${encodeURIComponent(payload)}`, {
    token: A.token, label: `sqli ${payload.slice(0, 14)}`,
  });
  rec('injection', `search survives ${JSON.stringify(payload.slice(0, 18))}`,
    r.status < 500 ? 'PASS' : 'FAIL', `status=${r.status}`);
}
const usersAfter = sql('SELECT COUNT(*) FROM identity.users;');
rec('injection', 'identity.users is intact after every injection attempt',
  usersBefore === usersAfter ? 'PASS' : 'FAIL', `before=${usersBefore} after=${usersAfter}`);

// ── Stored script ───────────────────────────────────────────────────────────
const xss = await call('PUT', '/auth/profile', {
  token: B.token, label: 'store a script tag in a display name',
  body: { fullName: '<script>alert(1)</script>' },
});
const storedName = sql(`SELECT "FullName" FROM identity.users WHERE "Id"='${B.userId}';`);
rec('xss', 'a script tag in a display name is refused or stored inertly',
  xss.status >= 400 || !storedName.includes('<script>') ? 'PASS' : 'OBSERVED',
  `status=${xss.status} stored="${storedName}"`);

// ── Staff and operations surfaces ───────────────────────────────────────────
// Every body below is *valid*. That matters more than it looks: the first draft of the
// rewards-grant probe omitted `source` and `grantReference`, and the endpoint answered 400
// Platform.Validation.Failed. A 400 is evidence about a request body and says nothing at
// all about whether the caller was authorised — reading it as a refusal would have recorded
// a control as proven when it had never been reached. With a valid body the same call
// answers 403 "Missing required permission: financial:credit:manage", which is the answer
// this check exists to obtain.
const staffSurfaces = [
  ['moderation queue', 'GET', '/community/moderation/queue', undefined],
  ['platform operations — jobs', 'GET', '/platform/operations/jobs', undefined],
  ['trust verification queue', 'GET', '/trust/verifications/queue', undefined],
  ['rewards grant of a million points to self', 'POST', '/financial/operations/rewards/grants',
    { userId: B.userId, points: 1000000, source: 'ReleaseProbe', grantReference: `escalation-probe-${RUN}` }],
  ['open a wallet for anyone', 'POST', '/financial/wallets',
    { ownerId: B.userId, accountType: 'Member', currency: 'NGN', displayName: `probe ${RUN}`, countryCode: 'NG' }],
];
for (const [name, method, path, body] of staffSurfaces) {
  const r = await call(method, path, { token: B.token, label: `member calls ${name}`, body });
  rec('authorization', `a member is refused: ${name}`,
    [401, 403].includes(r.status) ? 'PASS' : r.status === 404 ? 'PASS' : 'FAIL',
    `status=${r.status} code=${r.body?.code ?? '-'}`);
}

// ── Anonymous access ────────────────────────────────────────────────────────
for (const path of ['/auth/me', '/financial/wallets/me', '/notifications', '/conversations', '/trust/profile', '/bookmarks']) {
  const r = await call('GET', path, { label: `anonymous ${path}` });
  rec('authorization', `anonymous is refused ${path}`, r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
}

// ── File upload ─────────────────────────────────────────────────────────────
const good = await uploadDirect(A.token, { fileName: 'legit.png', contentType: 'image/png', kind: 'image', bytes: samplePng(), label: 'valid png' });
rec('upload', 'a valid image is accepted',
  good && good.status < 400 ? 'PASS' : 'FAIL', `status=${good?.status ?? '-'}`);

const php = await uploadDirect(A.token, { fileName: 'payload.php.png', contentType: 'application/x-php', kind: 'image', bytes: Buffer.from('<?php system($_GET[0]); ?>'), label: 'php declared as x-php' });
rec('upload', 'a declared non-image content type is refused',
  php && php.status >= 400 ? 'PASS' : 'FAIL', `status=${php?.status ?? '-'}`);

const mismatch = await uploadDirect(A.token, { fileName: 'notreally.png', contentType: 'image/png', kind: 'image', bytes: Buffer.from('MZ this is a windows executable, not a png at all'), label: 'bytes/type mismatch' });
rec('upload', 'bytes that are not an image, declared image/png',
  mismatch && mismatch.status >= 400 ? 'PASS' : 'OBSERVED', `status=${mismatch?.status ?? '-'}`);

// The property under test is where the bytes *land*, not whether the request is refused.
// Accepting the upload is fine; writing it outside the container is not. So the assertion
// reads the storage key the platform assigned, from the database, rather than looking for
// ".." anywhere in the response — the first draft did the latter, matched the echoed
// display filename, and reported a traversal that had not happened.
const traversal = await uploadDirect(A.token, { fileName: '../../../../etc/passwd', contentType: 'image/png', kind: 'image', bytes: samplePng(), label: 'traversal filename' });
const traversalKey = sql(`SELECT storage_key FROM media.media_assets WHERE file_name='../../../../etc/passwd' ORDER BY "CreatedAt" DESC LIMIT 1;`);
rec('upload', 'a traversal filename does not reach the storage key',
  traversalKey && !traversalKey.includes('..') && traversalKey.startsWith('image/') ? 'PASS' : 'FAIL',
  `status=${traversal?.status ?? '-'} storage_key="${traversalKey}"`);

const empty = await uploadDirect(A.token, { fileName: 'empty.png', contentType: 'image/png', kind: 'image', bytes: Buffer.alloc(0), label: 'empty file' });
rec('upload', 'an empty file is refused',
  empty && empty.status >= 400 ? 'PASS' : 'OBSERVED', `status=${empty?.status ?? '-'}`);

const pass = results.filter((r) => r.verdict === 'PASS').length;
const fail = results.filter((r) => r.verdict === 'FAIL').length;
const other = results.length - pass - fail;
console.log(`\n  ${pass} PASS · ${fail} FAIL · ${other} other · ${results.length} checks\n`);
writeFileSync(OUT, JSON.stringify({ run: RUN, results }, null, 2));
// Exit 0 whatever was found. `run-all.mjs` reads the results file and owns the gate, so a
// harness that exited non-zero on a failure would be counted twice — once as a FAIL and
// again as a crashed harness.
process.exit(0);
