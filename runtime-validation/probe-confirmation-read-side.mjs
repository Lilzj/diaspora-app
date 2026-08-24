/**
 * The confirmation read side, against a running platform.
 *
 * `POST /trust/contributions/confirmations` has recorded confirmations since the
 * Trust module shipped and nothing could read them back — `CountForTargetAsync`
 * was written and never called. This drives the write and then the new
 * `GET /trust/contributions/confirmations`, and checks the answer against the
 * database directly rather than against the API's own read path.
 *
 *   RUNTIME_DB=diaspora_rc RUNTIME_API_LOG=<api.log> node probe-confirmation-read-side.mjs
 */
import { call, makeUser, sql, save, evidence } from './harness.mjs';

const stamp = Date.now().toString().slice(-9);
const phone = (n) => `+2348${String(stamp).slice(0, 8)}${n}`;

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const author = await makeUser({ name: 'Read Side Author', phone: phone('1'), password: 'Str0ng!Pass1' });
const confirmer = await makeUser({ name: 'Read Side Confirmer', phone: phone('2'), password: 'Str0ng!Pass2' });

if (!author.ok || !confirmer.ok) {
  console.error('SETUP FAILED', { author: author.stage, confirmer: confirmer.stage });
  save('evidence-confirmation-read-side.json');
  process.exit(2);
}

// A newly phone-verified member is `LimitedAccess` and every contribution
// answers 403. Only the Trust Engine can promote — `ApplyTrustDecision` is a
// service-audience permission, so no human role can call it — which leaves
// seeding the state and signing in again.
for (const member of [author, confirmer]) {
  const moved = sql(
    `UPDATE identity.users SET "AccessState" = 'Verified' WHERE "Id" = '${member.userId}';`
  );
  if (!String(moved).startsWith('UPDATE 1')) {
    console.error(`PROMOTION FAILED for ${member.name}: ${moved}`);
    process.exit(2);
  }

  const again = await call('POST', '/auth/login', {
    label: `re-login ${member.name}`,
    body: { phoneNumber: member.phone, password: member.password },
  });

  const tokens = again.body?.data?.tokens ?? again.body?.data ?? {};
  if (!tokens.accessToken) {
    console.error(`RE-LOGIN FAILED for ${member.name}: ${again.status}`);
    process.exit(2);
  }
  member.accessToken = tokens.accessToken;
}

const targetType = 'guide';
const targetId = `probe-${stamp}`;
const query = `/trust/contributions/confirmations?targetType=${targetType}&targetId=${targetId}`;

// ── 1. A target nobody has confirmed ─────────────────────────────────────────
const before = await call('GET', query, { token: confirmer.accessToken, label: 'read before' });

check(
  'a target with no confirmations answers 200, not 404',
  before.status === 200,
  `status ${before.status}`
);
check(
  'it reads as zero rather than absent',
  before.body?.data?.confirmationCount === 0 && before.body?.data?.confirmedByViewer === false,
  JSON.stringify(before.body?.data)
);

// ── 2. Record one ────────────────────────────────────────────────────────────
const write = await call('POST', '/trust/contributions/confirmations', {
  token: confirmer.accessToken,
  label: 'confirm',
  body: { targetType, targetId, authorUserId: author.userId, countryCode: 'NG' },
});

check('the write side still answers', write.status === 201, `status ${write.status}`);

// ── 3. The count moves, and the viewer's own state with it ───────────────────
const after = await call('GET', query, { token: confirmer.accessToken, label: 'read after' });

check(
  'the confirmation is now readable',
  after.body?.data?.confirmationCount === 1,
  `count ${after.body?.data?.confirmationCount}`
);
check(
  'the confirmer sees their own confirmation',
  after.body?.data?.confirmedByViewer === true,
  `confirmedByViewer ${after.body?.data?.confirmedByViewer}`
);

// ── 4. A different member sees the count but not a confirmation of their own ─
const asAuthor = await call('GET', query, { token: author.accessToken, label: 'read as author' });

check(
  'another member sees the same count',
  asAuthor.body?.data?.confirmationCount === 1,
  `count ${asAuthor.body?.data?.confirmationCount}`
);
check(
  'but is not told they confirmed it',
  asAuthor.body?.data?.confirmedByViewer === false,
  `confirmedByViewer ${asAuthor.body?.data?.confirmedByViewer}`
);

// ── 5. The database, not the API's own read path ─────────────────────────────
const rows = sql(
  `SELECT count(*) FROM trust.community_contributions ` +
  `WHERE "TargetType" = '${targetType}' AND "TargetId" = '${targetId}';`
);

check('the row is really there', rows === '1', `rows ${rows}`);

// ── 6. The one-per-member invariant still holds through the read ─────────────
const duplicate = await call('POST', '/trust/contributions/confirmations', {
  token: confirmer.accessToken,
  label: 'confirm again',
  body: { targetType, targetId, authorUserId: author.userId, countryCode: 'NG' },
});

const afterDuplicate = await call('GET', query, {
  token: confirmer.accessToken,
  label: 'read after duplicate',
});

check('a second confirmation is refused', duplicate.status >= 400, `status ${duplicate.status}`);
check(
  'and the count did not move',
  afterDuplicate.body?.data?.confirmationCount === 1,
  `count ${afterDuplicate.body?.data?.confirmationCount}`
);

// ── 7. Casing: the aggregate lower-cases on write ────────────────────────────
const cased = await call(
  'GET',
  `/trust/contributions/confirmations?targetType=GUIDE&targetId=${targetId}`,
  { token: confirmer.accessToken, label: 'read with different casing' }
);

check(
  'a differently-cased target type finds the same confirmations',
  cased.body?.data?.confirmationCount === 1,
  `count ${cased.body?.data?.confirmationCount}`
);

save('evidence-confirmation-read-side.json');

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed, ${evidence.length} calls recorded`);
process.exit(failed.length === 0 ? 0 : 1);
