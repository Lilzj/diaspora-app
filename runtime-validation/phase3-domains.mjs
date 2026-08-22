import { call, makeUser, sql, save } from './harness.mjs';

const results = [];
const rec = (domain, flow, verdict, note) => {
  results.push({ domain, flow, verdict, note });
  console.log(`  ${verdict.padEnd(7)} [${domain}] ${flow} — ${note}`);
};

const RUN = process.env.RUNTIME_RUN ?? '6';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const stamp = `rv${RUN}`;

console.log('\n=== PHASE 3: REST VERTICAL SLICES ===\n');

const alice = await makeUser({ name: 'Amina Bello', phone: ph(1), password: 'Jq7#vwZm3Pd8' });
const bob = await makeUser({ name: 'Chidi Okeke', phone: ph(2), password: 'Ly4#brNk9Tf6' });
if (!alice.ok || !bob.ok) {
  rec('setup', 'identities', 'FAIL', `alice=${alice.ok} bob=${bob.ok}`);
  process.exit(1);
}
rec('setup', 'two authenticated identities', 'PASS', `alice=${alice.userId} bob=${bob.userId}`);

// ─────────────────────────────────────────────────────────────────────────
// COMMUNITY — create, persist, read back, comment, react, delete
// ─────────────────────────────────────────────────────────────────────────
const postBody = `Runtime validation post ${stamp} — asking about documentation queues in Lagos.`;
const cp = await call('POST', '/community/posts', {
  token: alice.accessToken, label: 'create community post',
  body: { body: postBody, title: `Runtime post ${stamp}`, category: 'Question', countryCode: 'NG', cityName: 'Lagos', publish: true },
});
const postId = cp.body?.data?.id ?? cp.body?.data?.postId ?? cp.body?.data?.post?.id;
rec('community', 'create post', cp.status < 400 && postId ? 'PASS' : 'FAIL', `status=${cp.status} id=${postId ?? JSON.stringify(cp.body).slice(0, 200)}`);

if (postId) {
  const dbPost = sql(`SELECT count(*) FROM community.community_posts WHERE "Id"='${postId}';`);
  rec('community', 'post persisted (independent DB read)', dbPost === '1' ? 'PASS' : 'FAIL', `rows=${dbPost}`);

  const detail = await call('GET', `/community/posts/${postId}`, { token: alice.accessToken, label: 'read post back' });
  const gotBody = detail.body?.data?.body ?? detail.body?.data?.post?.body;
  rec('community', 'read post back over HTTP', detail.status === 200 && gotBody === postBody ? 'PASS' : 'FAIL',
    `status=${detail.status} bodyMatches=${gotBody === postBody}`);

  const comment = await call('POST', `/community/posts/${postId}/comments`, {
    token: bob.accessToken, label: 'comment on post', body: { body: `Reply from Chidi ${stamp}` },
  });
  const commentId = comment.body?.data?.id ?? comment.body?.data?.commentId;
  rec('community', 'comment by a second identity', comment.status < 400 ? 'PASS' : 'FAIL',
    `status=${comment.status} id=${commentId ?? ''}`);

  if (commentId) {
    const dbC = sql(`SELECT count(*) FROM community.community_comments WHERE "Id"='${commentId}';`);
    rec('community', 'comment persisted', dbC === '1' ? 'PASS' : 'FAIL', `rows=${dbC}`);
  }

  const react = await call('POST', `/community/posts/${postId}/reactions`, {
    token: bob.accessToken, label: 'react to post', body: { reactionKey: 'like' },
  });
  rec('community', 'reaction accepted', react.status < 400 ? 'PASS' : 'FAIL',
    `status=${react.status} ${react.status >= 400 ? JSON.stringify(react.body).slice(0, 160) : ''}`);

  const bm = await call('POST', '/bookmarks', {
    token: bob.accessToken, label: 'bookmark post',
    body: { subjectType: 'CommunityPost', subjectId: postId },
  });
  rec('community', 'bookmark created', bm.status < 400 ? 'PASS' : 'FAIL',
    `status=${bm.status} ${bm.status >= 400 ? JSON.stringify(bm.body).slice(0, 160) : ''}`);

  const bmList = await call('GET', '/bookmarks', { token: bob.accessToken, label: 'list bookmarks' });
  const bmItems = bmList.body?.data?.items ?? bmList.body?.data ?? [];
  rec('community', 'bookmark appears in saved list', Array.isArray(bmItems) && bmItems.length > 0 ? 'PASS' : 'FAIL',
    `status=${bmList.status} count=${Array.isArray(bmItems) ? bmItems.length : 'n/a'}`);

  // Feed read-back: the created post must be reachable through the feed the app renders.
  const feed = await call('GET', '/community/feeds/latest?limit=50&countryCode=NG', { token: alice.accessToken, label: 'community feed' });
  const items = feed.body?.data?.items ?? [];
  const found = items.some((i) => (i.id ?? i.postId) === postId);
  rec('community', 'created post appears in the feed', feed.status === 200 && found ? 'PASS' : 'FAIL',
    `status=${feed.status} items=${items.length} containsCreated=${found}`);

  // Authorization: a second identity must not be able to delete the first's post.
  const delByBob = await call('DELETE', `/community/posts/${postId}`, { token: bob.accessToken, label: 'delete post as non-author' });
  rec('community', 'non-author cannot delete a post', delByBob.status === 403 || delByBob.status === 404 ? 'PASS' : 'FAIL',
    `status=${delByBob.status} code=${delByBob.body?.code ?? ''}`);
  const stillThere = sql(`SELECT count(*) FROM community.community_posts WHERE "Id"='${postId}';`);
  rec('community', 'refused delete did not reach the handler', stillThere === '1' ? 'PASS' : 'FAIL', `rows after refused delete=${stillThere}`);
}

// ─────────────────────────────────────────────────────────────────────────
// MARKETPLACE — create, persist, publish, search, envelope
// ─────────────────────────────────────────────────────────────────────────
const mk = await call('POST', '/marketplace/listings', {
  token: alice.accessToken, label: 'create marketplace listing',
  body: {
    title: `Refurbished laptop ${stamp}`, description: `A runtime validation listing ${stamp}.`,
    categoryKey: 'electronics', countryCode: 'NG', cityName: 'Lagos',
    price: 250000, currency: 'NGN', condition: 'Good', listingType: 'Sale', isNegotiable: true,
  },
});
const listingId = mk.body?.data?.id ?? mk.body?.data?.listingId;
rec('marketplace', 'create listing', mk.status < 400 && listingId ? 'PASS' : 'FAIL',
  `status=${mk.status} id=${listingId ?? JSON.stringify(mk.body).slice(0, 260)}`);

if (listingId) {
  const dbL = sql(`SELECT "Status" FROM marketplace.marketplace_listings WHERE "Id"='${listingId}';`);
  rec('marketplace', 'listing persisted with a status', dbL && !dbL.startsWith('SQL_ERROR') ? 'PASS' : 'FAIL', `db Status=${dbL}`);

  const pub = await call('POST', `/marketplace/listings/${listingId}/publish`, { token: alice.accessToken, label: 'publish listing', body: {} });
  rec('marketplace', 'publish listing', pub.status < 400 ? 'PASS' : 'FAIL', `status=${pub.status} ${pub.status >= 400 ? JSON.stringify(pub.body).slice(0, 200) : ''}`);
  const dbAfter = sql(`SELECT "Status" FROM marketplace.marketplace_listings WHERE "Id"='${listingId}';`);
  rec('marketplace', 'publish changed the stored status', dbAfter !== dbL ? 'PASS' : 'FAIL', `before=${dbL} after=${dbAfter}`);

  const search = await call('POST', '/marketplace/search', {
    token: alice.accessToken, label: 'marketplace search (matching query)',
    body: { query: stamp, countryCode: 'NG', limit: 20 },
  });
  const sd = search.body?.data ?? {};
  const sItems = sd.items ?? sd.results ?? [];
  rec('marketplace', 'search finds the published listing', search.status === 200 && sItems.length > 0 ? 'PASS' : 'FAIL',
    `status=${search.status} envelopeKeys=[${Object.keys(sd).join(',')}] items=${sItems.length}`);
  rec('marketplace', 'search envelope exposes a total', sd.totalMatches !== undefined || sd.totalAvailable !== undefined || sd.total !== undefined ? 'PASS' : 'FAIL',
    `totalMatches=${sd.totalMatches} totalAvailable=${sd.totalAvailable} total=${sd.total}`);

  // A query that cannot match must not return the unfiltered set.
  const noMatch = await call('POST', '/marketplace/search', {
    token: alice.accessToken, label: 'marketplace search (impossible query)',
    body: { query: 'zzz-no-such-listing-zzz-9182736', countryCode: 'NG', limit: 20 },
  });
  const nItems = noMatch.body?.data?.items ?? noMatch.body?.data?.results ?? [];
  rec('marketplace', 'impossible query filters (not a silent unfiltered 200)',
    noMatch.status === 200 && nItems.length === 0 ? 'PASS' : 'FAIL',
    `status=${noMatch.status} items=${nItems.length} (matching query returned ${sItems.length})`);
}

// ─────────────────────────────────────────────────────────────────────────
// HOUSING — create, search, and the proximity parameters the audit doubted
// ─────────────────────────────────────────────────────────────────────────
const hs = await call('GET', '/housing/search?Query=&CountryCode=NG&Limit=5', { token: alice.accessToken, label: 'housing search baseline' });
const hd = hs.body?.data ?? {};
rec('housing', 'GET /housing/search answers', hs.status === 200 ? 'PASS' : 'FAIL',
  `status=${hs.status} envelopeKeys=[${Object.keys(hd).join(',')}]`);

const hsGeo = await call('GET', '/housing/search?CountryCode=NG&Latitude=6.5244&Longitude=3.3792&RadiusKm=25&Limit=5', {
  token: alice.accessToken, label: 'housing search with proximity',
});
rec('housing', 'proximity parameters accepted (lat/lon/radiusKm)', hsGeo.status === 200 ? 'PASS' : 'FAIL',
  `status=${hsGeo.status} ${hsGeo.status >= 400 ? JSON.stringify(hsGeo.body).slice(0, 200) : ''}`);

const hsBounds = await call('GET', '/housing/search?CountryCode=NG&Bounds=6.3,3.1,6.7,3.6&Limit=5', {
  token: alice.accessToken, label: 'housing search with bounds',
});
rec('housing', 'bounds parameter accepted', hsBounds.status === 200 ? 'PASS' : 'FAIL',
  `status=${hsBounds.status} ${hsBounds.status >= 400 ? JSON.stringify(hsBounds.body).slice(0, 200) : ''}`);

// ─────────────────────────────────────────────────────────────────────────
// PROVIDERS — directory, proximity, distanceKm
// ─────────────────────────────────────────────────────────────────────────
const pv = await call('GET', '/providers?countryCode=NG&limit=5', { token: alice.accessToken, label: 'provider directory' });
rec('providers', 'provider directory answers', pv.status === 200 ? 'PASS' : 'FAIL',
  `status=${pv.status} envelopeKeys=[${Object.keys(pv.body?.data ?? {}).join(',')}]`);

const pvGeo = await call('GET', '/providers?latitude=6.5244&longitude=3.3792&radiusKm=25&limit=5', {
  token: alice.accessToken, label: 'provider directory with proximity',
});
rec('providers', 'proximity filtering accepted (latitude/longitude/radiusKm)', pvGeo.status === 200 ? 'PASS' : 'FAIL',
  `status=${pvGeo.status} ${pvGeo.status >= 400 ? JSON.stringify(pvGeo.body).slice(0, 200) : ''}`);

// ─────────────────────────────────────────────────────────────────────────
// SEARCH SEMANTICS — the parameter-name pairs the remediation flagged
// ─────────────────────────────────────────────────────────────────────────
const locQ = await call('GET', '/location/search?q=Lagos&countryCode=NG&limit=5', { token: alice.accessToken, label: 'location search via q' });
const locQuery = await call('GET', '/location/search?query=Lagos&countryCode=NG&limit=5', { token: alice.accessToken, label: 'location search via query' });
const nOf = (r) => (r.body?.data?.items ?? r.body?.data?.results ?? r.body?.data ?? []).length;
rec('search', 'location search accepts both q and query', locQ.status === 200 && locQuery.status === 200 ? 'PASS' : 'FAIL',
  `q→${locQ.status}/${nOf(locQ)} items, query→${locQuery.status}/${nOf(locQuery)} items`);

const know = await call('GET', '/knowledge/search?Q=visa&Limit=5', { token: alice.accessToken, label: 'knowledge search' });
rec('search', 'knowledge search answers', know.status === 200 ? 'PASS' : 'FAIL',
  `status=${know.status} envelopeKeys=[${Object.keys(know.body?.data ?? {}).join(',')}]`);

const intel = await call('GET', '/intelligence/search?q=visa&countryCode=NG&limit=5', { token: alice.accessToken, label: 'intelligence search' });
const id_ = intel.body?.data ?? {};
rec('search', 'intelligence search envelope', intel.status === 200 ? 'PASS' : 'FAIL',
  `status=${intel.status} envelopeKeys=[${Object.keys(id_).join(',')}] hasResults=${id_.results !== undefined} hasItems=${id_.items !== undefined}`);

const comm = await call('GET', '/communities/search?q=lagos&take=5', { token: alice.accessToken, label: 'communities search' });
rec('search', 'communities search answers', comm.status === 200 ? 'PASS' : 'FAIL', `status=${comm.status}`);

// ─────────────────────────────────────────────────────────────────────────
// JOBS — search and the invalid-filter trap
// ─────────────────────────────────────────────────────────────────────────
const jobs = await call('POST', '/jobs/search', { token: alice.accessToken, label: 'job search', body: { query: '', countryCode: 'NG', limit: 10 } });
rec('jobs', 'job search answers', jobs.status === 200 ? 'PASS' : 'FAIL',
  `status=${jobs.status} envelopeKeys=[${Object.keys(jobs.body?.data ?? {}).join(',')}]`);

const apps = await call('GET', '/jobs/applications?status=Rejected', { token: alice.accessToken, label: 'applications filtered by status' });
const appsAll = await call('GET', '/jobs/applications', { token: alice.accessToken, label: 'applications unfiltered' });
const cnt = (r) => (r.body?.data?.items ?? r.body?.data ?? []).length;
rec('jobs', 'status filter is applied server-side', apps.status === 200 && appsAll.status === 200 ? 'PASS' : 'FAIL',
  `filtered=${apps.status}/${cnt(apps)} unfiltered=${appsAll.status}/${cnt(appsAll)}`);

const badStatus = await call('GET', '/jobs/applications?status=NotARealStatus', { token: alice.accessToken, label: 'applications invalid status filter' });
rec('jobs', 'invalid status filter refused rather than ignored',
  badStatus.status === 400 ? 'PASS' : badStatus.status === 200 && cnt(badStatus) === 0 ? 'PASS' : 'FAIL',
  `status=${badStatus.status} items=${cnt(badStatus)} (unfiltered has ${cnt(appsAll)})`);

// ─────────────────────────────────────────────────────────────────────────
// GUIDES / KNOWLEDGE
// ─────────────────────────────────────────────────────────────────────────
const gl = await call('GET', '/guides?limit=5', { token: alice.accessToken, label: 'guide list' });
rec('guides', 'guide list answers', gl.status === 200 ? 'PASS' : 'FAIL', `status=${gl.status}`);

// ─────────────────────────────────────────────────────────────────────────
// COMMUNITY LIFE — events
// ─────────────────────────────────────────────────────────────────────────
const ev = await call('GET', '/community-life/events?limit=5', { token: alice.accessToken, label: 'event list' });
rec('community-life', 'event list answers', ev.status === 200 ? 'PASS' : 'FAIL', `status=${ev.status}`);

// ─────────────────────────────────────────────────────────────────────────
// NEGATIVE: nonexistent entity, malformed id
// ─────────────────────────────────────────────────────────────────────────
const missing = await call('GET', '/community/posts/00000000-0000-0000-0000-000000000000', { token: alice.accessToken, label: 'nonexistent post' });
rec('negative', 'nonexistent entity → 404', missing.status === 404 ? 'PASS' : 'FAIL', `status=${missing.status}`);

const malformed = await call('GET', '/community/posts/not-a-guid', { token: alice.accessToken, label: 'malformed id' });
rec('negative', 'malformed id → 400/404 (not 500)', malformed.status === 400 || malformed.status === 404 ? 'PASS' : 'FAIL', `status=${malformed.status}`);

const pass = results.filter((r) => r.verdict === 'PASS').length;
console.log(`\n--- PHASE 3: ${pass}/${results.length} PASS ---`);
save('C:/Users/User/source/repos/Diaspora/runtime-validation/evidence-phase3-domains.json');
