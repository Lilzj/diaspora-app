/**
 * The join between B6's corroboration count and Trust's reputation.
 *
 * The platform had two confirmation systems that could not see each other. A
 * `confirmed` reaction moved `CommunityPost.ConfirmationCount` — the number every
 * card renders — and paid the author nothing. `POST /trust/contributions/
 * confirmations` paid the author and moved no count. The client posted the
 * second and displayed the first, so the number never moved.
 *
 * `CommunityCorroborationConsumer` joins them. This drives a real reaction and
 * watches both halves land, checking the database rather than the API's own
 * read path.
 *
 *   RUNTIME_DB=diaspora_rc RUNTIME_API_LOG=<api.log> node probe-corroboration-bridge.mjs
 */
import { call, makeUser, sql, pollFor, save, evidence } from './harness.mjs';

const stamp = Date.now().toString().slice(-9);
const phone = (n) => `+2348${String(stamp).slice(0, 8)}${n}`;

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const author = await makeUser({ name: 'Bridge Author', phone: phone('3'), password: 'Str0ng!Pass3' });
const confirmer = await makeUser({ name: 'Bridge Confirmer', phone: phone('4'), password: 'Str0ng!Pass4' });

if (!author.ok || !confirmer.ok) {
  console.error('SETUP FAILED', { author: author.stage, confirmer: confirmer.stage });
  process.exit(2);
}

// LimitedAccess cannot contribute; only the Trust Engine can promote, and its
// permission is service-audience. Seed the state and sign in again.
for (const member of [author, confirmer]) {
  const moved = sql(`UPDATE identity.users SET "AccessState" = 'Verified' WHERE "Id" = '${member.userId}';`);
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

// ── The catalogue declares which reaction corroborates ───────────────────────
const caps = await call('GET', '/community/capabilities', {
  token: confirmer.accessToken,
  label: 'capabilities',
});

const corroborating = (caps.body?.data?.reactions ?? []).filter(
  (reaction) => reaction.sentiment === 'corroborating'
);

check(
  'the catalogue publishes a corroborating reaction, and its sentiment with it',
  corroborating.length > 0,
  corroborating.map((r) => `${r.key}/${r.sentiment}`).join(', ') || 'none'
);

if (!corroborating.length) {
  save('evidence-corroboration-bridge.json');
  process.exit(1);
}

const reactionKey = corroborating[0].key;

// ── A real post ──────────────────────────────────────────────────────────────
const created = await call('POST', '/community/posts', {
  token: author.accessToken,
  label: 'create post',
  body: {
    title: `Bridge probe ${stamp}`,
    body: `Bridge probe ${stamp}`,
    countryCode: 'NG',
    cityName: 'Lagos',
    urgency: 'urgent',
    publish: true,
  },
});

const postId = created.body?.data?.id ?? created.body?.data?.postId;
check('a post to corroborate', Boolean(postId), `status ${created.status} id ${postId}`);

if (!postId) {
  save('evidence-corroboration-bridge.json');
  process.exit(1);
}

const trustBefore = Number(
  sql(`SELECT COALESCE(MAX("TrustScore"), 0) FROM trust.reputation_profiles WHERE "UserId" = '${author.userId}';`)
) || 0;

// ── The corroborating reaction ───────────────────────────────────────────────
const reacted = await call('POST', `/community/posts/${postId}/reactions`, {
  token: confirmer.accessToken,
  label: 'corroborate',
  body: { reactionKey },
});

check('the reaction is accepted', reacted.status < 400, `status ${reacted.status}`);

// ── Half one: B6's own count moves, synchronously ────────────────────────────
const confirmationCount = sql(
  `SELECT "ConfirmationCount" FROM community.community_posts WHERE "Id"='${postId}';`
);

check('B6 counts the corroboration', confirmationCount === '1', `ConfirmationCount ${confirmationCount}`);

// ── Half two: Trust pays the author, out of band ─────────────────────────────
// Delivery is at-least-once and asynchronous — the consumer runs in its own
// scope after the producer committed, so this waits rather than reading once.
const contribution = await pollFor(
  () => {
    const rows = sql(
      `SELECT count(*) FROM trust.community_contributions ` +
      `WHERE "TargetId" = '${postId}' AND "AuthorUserId" = '${author.userId}';`
    );
    return rows === '1' ? rows : null;
  },
  { attempts: 40, everyMs: 250 }
);

check(
  'Trust records the confirmation against the post',
  contribution === '1',
  `rows ${contribution ?? sql(`SELECT count(*) FROM trust.community_contributions WHERE "TargetId" = '${postId}';`)}`
);

const trustAfter = await pollFor(
  () => {
    const score = Number(
      sql(`SELECT COALESCE(MAX("TrustScore"), 0) FROM trust.reputation_profiles WHERE "UserId" = '${author.userId}';`)
    );
    return score > trustBefore ? score : null;
  },
  { attempts: 40, everyMs: 250 }
);

check(
  'the author is paid for being corroborated',
  trustAfter !== null && trustAfter > trustBefore,
  `TrustScore ${trustBefore} -> ${trustAfter ?? 'unchanged'}`
);

check(
  'and the country came from the post, not from the reactor',
  sql(`SELECT COALESCE("CountryCode",'-') FROM trust.community_contributions WHERE "TargetId" = '${postId}';`) === 'NG',
  sql(`SELECT COALESCE("CountryCode",'-') FROM trust.community_contributions WHERE "TargetId" = '${postId}';`)
);

// ── Withdrawing and re-reacting must not pay twice ───────────────────────────
await call('DELETE', `/community/posts/${postId}/reactions/${reactionKey}`, {
  token: confirmer.accessToken,
  label: 'withdraw',
});
await call('POST', `/community/posts/${postId}/reactions`, {
  token: confirmer.accessToken,
  label: 're-corroborate',
  body: { reactionKey },
});

// Give any second delivery the same chance to land as the first one had.
await new Promise((resolve) => setTimeout(resolve, 3000));

const finalScore = Number(
  sql(`SELECT COALESCE(MAX("TrustScore"), 0) FROM trust.reputation_profiles WHERE "UserId" = '${author.userId}';`)
);
const finalRows = sql(
  `SELECT count(*) FROM trust.community_contributions WHERE "TargetId" = '${postId}';`
);

check(
  'toggling the reaction is not a points faucet',
  finalScore === trustAfter && finalRows === '1',
  `TrustScore ${finalScore} (was ${trustAfter}), rows ${finalRows}`
);

save('evidence-corroboration-bridge.json');

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed, ${evidence.length} calls recorded`);
process.exit(failed.length === 0 ? 0 : 1);
