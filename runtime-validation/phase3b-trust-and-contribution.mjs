import { call, makeUser, sql, save } from './harness.mjs';

const results = [];
const rec = (domain, flow, verdict, note) => {
  results.push({ domain, flow, verdict, note });
  console.log(`  ${verdict.padEnd(8)} [${domain}] ${flow} — ${note}`);
};

const RUN = process.env.RUNTIME_RUN ?? '9';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const stamp = `rv${RUN}`;
const FEED_KEY = process.env.RUNTIME_FEED_KEY ?? 'latest';

console.log('\n=== PHASE 3b: ACCESS LADDER, AUTHORISATION, CONTRIBUTION ===\n');

/**
 * Promote a member to the Verified rung.
 *
 * `POST /trust/decisions` is the only route that moves an access state, and it
 * is declared `PermissionAudience.Service` — "held only by the Trust Engine",
 * no tier and no role resolves to it. There is therefore no human credential
 * that can perform this step, so a Verified fixture is seeded in the database
 * and the member signs in again. The token is then minted by the real issuer
 * from the real row, and every authorisation check downstream runs for real
 * against an account that genuinely holds the state.
 */
async function promote(user, password) {
  sql(`UPDATE identity.users SET "AccessState"='Verified' WHERE "Id"='${user.userId}';`);
  const again = await call('POST', '/auth/login', { label: `re-login ${user.name}`, body: { phoneNumber: user.phone, password } });
  return (again.body?.data?.tokens ?? again.body?.data ?? {}).accessToken;
}

// ── The access ladder as the platform enforces it ────────────────────────
const alice = await makeUser({ name: 'Amina Bello', phone: ph(1), password: 'Jq7#vwZm3Pd8' });
rec('access', 'newly registered member authenticates', alice.ok ? 'PASS' : 'FAIL', `userId=${alice.userId}`);

const st = await call('GET', '/access/state', { token: alice.accessToken, label: 'access state' });
rec('access', 'GET /access/state reports the ladder position', st.status === 200 ? 'PASS' : 'FAIL',
  `status=${st.status} state=${st.body?.data?.state} destination=${st.body?.data?.decision?.destination}`);

const feats = await call('GET', '/access/features', { token: alice.accessToken, label: 'access features' });
const fl = feats.body?.data?.features ?? [];
const blockedFeature = fl.find((f) => !f.isEnabled);
rec('access', 'GET /access/features enumerates capability gates', feats.status === 200 && fl.length > 0 ? 'PASS' : 'FAIL',
  `status=${feats.status} features=${fl.length} example blocked: ${blockedFeature?.name}="${blockedFeature?.blockedReason}"`);

const blocked = await call('POST', '/community/posts', {
  token: alice.accessToken, label: 'create post as LimitedAccess',
  body: { body: `Should be refused ${stamp}`, publish: true },
});
rec('access', 'LimitedAccess cannot contribute (documented rung)', blocked.status === 403 ? 'PASS' : 'FAIL',
  `status=${blocked.status} code=${blocked.body?.code ?? ''}`);
rec('access', 'refused contribution never reached the handler',
  sql(`SELECT count(*) FROM community.community_posts WHERE body LIKE '%Should be refused ${stamp}%';`) === '0' ? 'PASS' : 'FAIL',
  'zero rows written');

// ── Authorisation: the service/human audience boundary ───────────────────
const mod = await makeUser({ name: 'Ngozi Eze', phone: ph(2), password: 'Rt6#pkXw2Vb9' });
sql(`UPDATE identity.users SET "Role"='Moderator', "AccessState"='Verified' WHERE "Id"='${mod.userId}';`);
const modLogin = await call('POST', '/auth/login', { label: 'moderator login', body: { phoneNumber: ph(2), password: 'Rt6#pkXw2Vb9' } });
const modTok = (modLogin.body?.data?.tokens ?? modLogin.body?.data ?? {}).accessToken;
rec('authz', 'seeded Moderator/Verified obtains a token from the real issuer', !!modTok ? 'PASS' : 'FAIL',
  `role=${sql(`SELECT "Role" || '/' || "AccessState" FROM identity.users WHERE "Id"='${mod.userId}';`)}`);

const decideAnon = await call('POST', '/trust/decisions', { label: 'trust decision anonymous', body: { userId: alice.userId, outcome: 'Approved' } });
rec('authz', 'anonymous cannot apply a trust decision', decideAnon.status === 401 ? 'PASS' : 'FAIL', `status=${decideAnon.status}`);

const decideAsMember = await call('POST', '/trust/decisions', {
  token: alice.accessToken, label: 'trust decision as ordinary member',
  body: { userId: alice.userId, outcome: 'Approved', reason: 'self-approval attempt' },
});
rec('authz', 'ordinary member cannot apply a trust decision', decideAsMember.status === 403 ? 'PASS' : 'FAIL',
  `status=${decideAsMember.status} code=${decideAsMember.body?.code ?? ''}`);
rec('authz', 'refused trust decision did not mutate the account',
  sql(`SELECT "AccessState" FROM identity.users WHERE "Id"='${alice.userId}';`) === 'LimitedAccess' ? 'PASS' : 'FAIL',
  'AccessState unchanged');

// A Moderator is *also* refused: the permission is declared Service-audience.
const decideAsMod = await call('POST', '/trust/decisions', {
  token: modTok, label: 'trust decision as moderator',
  body: { userId: alice.userId, outcome: 'Approved', reason: 'runtime validation' },
});
rec('authz', 'even Moderator/Verified is refused a Service-audience permission',
  decideAsMod.status === 403 ? 'PASS' : 'FAIL',
  `status=${decideAsMod.status} — IdentityPermissions.ApplyTrustDecision is PermissionAudience.Service, "held only by the Trust Engine"`);
rec('authz', 'refused staff decision did not mutate the account',
  sql(`SELECT "AccessState" FROM identity.users WHERE "Id"='${alice.userId}';`) === 'LimitedAccess' ? 'PASS' : 'FAIL',
  'AccessState still LimitedAccess after a staff attempt');

// ── Contribution, on genuinely Verified accounts ─────────────────────────
const vTok = await promote(alice, 'Jq7#vwZm3Pd8');
rec('access', 'Verified member re-authenticates', !!vTok ? 'PASS' : 'FAIL',
  `AccessState=${sql(`SELECT "AccessState" FROM identity.users WHERE "Id"='${alice.userId}';`)}`);

const postBody = `Runtime validation post ${stamp} — documentation queues in Lagos.`;
const cp = await call('POST', '/community/posts', {
  token: vTok, label: 'create community post as Verified',
  body: { body: postBody, title: `Runtime post ${stamp}`, category: 'Question', countryCode: 'NG', cityName: 'Lagos', publish: true },
});
const postId = cp.body?.data?.id ?? cp.body?.data?.postId ?? cp.body?.data?.post?.id;
rec('community', 'Verified member can create a post', cp.status < 400 && postId ? 'PASS' : 'FAIL',
  `status=${cp.status} id=${postId ?? JSON.stringify(cp.body).slice(0, 240)}`);

if (postId) {
  rec('community', 'post persisted (independent DB read)',
    sql(`SELECT count(*) FROM community.community_posts WHERE "Id"='${postId}';`) === '1' ? 'PASS' : 'FAIL', 'one row');

  const detail = await call('GET', `/community/posts/${postId}`, { token: vTok, label: 'read post back' });
  const gotBody = detail.body?.data?.body ?? detail.body?.data?.post?.body;
  rec('community', 'read back over HTTP matches what was written', detail.status === 200 && gotBody === postBody ? 'PASS' : 'FAIL',
    `status=${detail.status} bodyMatches=${gotBody === postBody}`);

  const feed = await call('GET', `/community/feeds/${FEED_KEY}?limit=50&countryCode=NG`, { token: vTok, label: 'community feed' });
  const items = feed.body?.data?.items ?? [];
  rec('community', 'created post appears in the feed', feed.status === 200 && items.some((i) => (i.id ?? i.postId) === postId) ? 'PASS' : 'FAIL',
    `status=${feed.status} items=${items.length}`);

  const bob = await makeUser({ name: 'Chidi Okeke', phone: ph(3), password: 'Ly4#brNk9Tf6' });
  const bTok = await promote(bob, 'Ly4#brNk9Tf6');

  const comment = await call('POST', `/community/posts/${postId}/comments`, {
    token: bTok, label: 'comment by second member', body: { body: `Reply from Chidi ${stamp}` },
  });
  const commentId = comment.body?.data?.id ?? comment.body?.data?.commentId;
  rec('community', 'comment by a second member', comment.status < 400 ? 'PASS' : 'FAIL',
    `status=${comment.status} ${comment.status >= 400 ? JSON.stringify(comment.body).slice(0, 200) : `id=${commentId}`}`);
  if (commentId) {
    rec('community', 'comment persisted', sql(`SELECT count(*) FROM community.comments WHERE "Id"='${commentId}';`) === '1' ? 'PASS' : 'FAIL', 'independent DB read');
  }

  const react = await call('POST', `/community/posts/${postId}/reactions`, { token: bTok, label: 'react to post', body: { reactionKey: 'like' } });
  rec('community', 'reaction accepted', react.status < 400 ? 'PASS' : 'FAIL',
    `status=${react.status} ${react.status >= 400 ? JSON.stringify(react.body).slice(0, 200) : ''}`);

  const delByBob = await call('DELETE', `/community/posts/${postId}`, { token: bTok, label: 'delete post as non-author' });
  rec('authz', 'non-author cannot delete a post', delByBob.status === 403 || delByBob.status === 404 ? 'PASS' : 'FAIL',
    `status=${delByBob.status} code=${delByBob.body?.code ?? ''}`);
  rec('authz', 'refused delete did not reach the handler',
    sql(`SELECT count(*) FROM community.community_posts WHERE "Id"='${postId}';`) === '1' ? 'PASS' : 'FAIL', 'row still present');

  // ── MARKETPLACE ──────────────────────────────────────────────────────
  const mk = await call('POST', '/marketplace/listings', {
    token: vTok, label: 'create marketplace listing',
    body: {
      title: `Refurbished laptop ${stamp}`, description: `A runtime validation listing ${stamp}.`,
      categoryKey: 'electronics', countryCode: 'NG', cityName: 'Lagos',
      price: 250000, currency: 'NGN', condition: 'Good', listingType: 'Sale', isNegotiable: true,
    },
  });
  const listingId = mk.body?.data?.id ?? mk.body?.data?.listingId;
  rec('marketplace', 'create listing', mk.status < 400 && listingId ? 'PASS' : 'FAIL',
    `status=${mk.status} ${listingId ? `id=${listingId}` : JSON.stringify(mk.body).slice(0, 260)}`);

  if (listingId) {
    const before = sql(`SELECT "Status" FROM marketplace.marketplace_listings WHERE "Id"='${listingId}';`);
    rec('marketplace', 'listing persisted', before && !before.startsWith('SQL_ERROR') ? 'PASS' : 'FAIL', `db Status=${before}`);

    const pub = await call('POST', `/marketplace/listings/${listingId}/publish`, { token: vTok, label: 'publish listing', body: {} });
    const after = sql(`SELECT "Status" FROM marketplace.marketplace_listings WHERE "Id"='${listingId}';`);
    rec('marketplace', 'publish transitions the stored status', pub.status < 400 && after !== before ? 'PASS' : 'FAIL',
      `status=${pub.status} before=${before} after=${after}`);

    const search = await call('POST', '/marketplace/search', {
      token: vTok, label: 'marketplace search (matching)', body: { query: stamp, countryCode: 'NG', limit: 20 },
    });
    const sd = search.body?.data ?? {};
    const sItems = sd.items ?? sd.results ?? [];
    rec('marketplace', 'search finds the published listing', search.status === 200 && sItems.length > 0 ? 'PASS' : 'FAIL',
      `status=${search.status} envelope=[${Object.keys(sd).join(',')}] items=${sItems.length}`);

    const noMatch = await call('POST', '/marketplace/search', {
      token: vTok, label: 'marketplace search (impossible)', body: { query: 'zzz-no-such-listing-9182736', countryCode: 'NG', limit: 20 },
    });
    const nItems = noMatch.body?.data?.items ?? noMatch.body?.data?.results ?? [];
    rec('marketplace', 'impossible query filters rather than returning everything',
      noMatch.status === 200 && nItems.length === 0 && sItems.length > 0 ? 'PASS' : 'FAIL',
      `matching=${sItems.length} impossible=${nItems.length}`);
  }

  // ── HOUSING ──────────────────────────────────────────────────────────
  const hc = await call('POST', '/housing/listings', {
    token: vTok, label: 'create housing listing',
    body: {
      title: `Two-bedroom flat ${stamp}`, summary: `Runtime validation housing listing ${stamp}.`,
      description: 'A flat created by the runtime validation harness.',
      accommodationTypeKey: 'apartment', countryCode: 'NG', cityName: 'Lagos',
      bedrooms: 2, bathrooms: 1, rentAmount: 850000, currencyCode: 'NGN', rentPeriod: 'Monthly',
    },
  });
  rec('housing', 'create housing listing', hc.status < 400 ? 'PASS' : hc.status === 400 ? 'CONTRACT' : 'FAIL',
    `status=${hc.status} ${hc.status >= 400 ? JSON.stringify(hc.body).slice(0, 300) : `id=${hc.body?.data?.id}`}`);

  // ── GUIDES ───────────────────────────────────────────────────────────
  const gc = await call('POST', '/guides', {
    token: vTok, label: 'create guide',
    body: { title: `Runtime guide ${stamp}`, categoryKey: 'housing', language: 'en', countryCode: 'NG', summary: `A guide created by the runtime validation ${stamp}.` },
  });
  rec('guides', 'create guide', gc.status < 400 ? 'PASS' : gc.status === 400 ? 'CONTRACT' : 'FAIL',
    `status=${gc.status} ${gc.status >= 400 ? JSON.stringify(gc.body).slice(0, 300) : `id=${gc.body?.data?.id}`}`);

  // ── BOOKMARKS ────────────────────────────────────────────────────────
  const bm = await call('POST', '/bookmarks', {
    token: bTok, label: 'bookmark the post', body: { targetType: 'CommunityPost', targetId: postId },
  });
  rec('bookmarks', 'bookmark created', bm.status < 400 ? 'PASS' : 'FAIL',
    `status=${bm.status} ${bm.status >= 400 ? JSON.stringify(bm.body).slice(0, 220) : ''}`);
  const bmList = await call('GET', '/bookmarks', { token: bTok, label: 'list bookmarks' });
  const bmItems = bmList.body?.data?.items ?? bmList.body?.data ?? [];
  rec('bookmarks', 'bookmark appears in the saved list',
    bmList.status === 200 && Array.isArray(bmItems) && bmItems.length > 0 ? 'PASS' : 'FAIL',
    `status=${bmList.status} count=${Array.isArray(bmItems) ? bmItems.length : 'n/a'}`);
}

const pass = results.filter((r) => r.verdict === 'PASS').length;
console.log(`\n--- PHASE 3b: ${pass}/${results.length} PASS ---`);
save('C:/Users/User/source/repos/Diaspora/runtime-validation/evidence-phase3b-trust.json');
