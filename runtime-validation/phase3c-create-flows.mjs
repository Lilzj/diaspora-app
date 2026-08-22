/**
 * The create-and-read-back flows for the domains §9–§12 name, on identities
 * that genuinely hold the Verified rung.
 */
import { call, makeUser, sql, save } from './harness.mjs';

const results = [];
const rec = (domain, flow, verdict, note) => {
  results.push({ domain, flow, verdict, note });
  console.log(`  ${verdict.padEnd(8)} [${domain}] ${flow} — ${note}`);
};

const RUN = process.env.RUNTIME_RUN ?? '30';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const stamp = `rv${RUN}`;

console.log('\n=== PHASE 3c: CREATE / PERSIST / READ-BACK ===\n');

async function verified(name, n, password) {
  const u = await makeUser({ name, phone: ph(n), password });
  if (!u.userId) return { ...u, token: null };
  sql(`UPDATE identity.users SET "AccessState"='Verified' WHERE "Id"='${u.userId}';`);
  const re = await call('POST', '/auth/login', { label: `login ${name}`, body: { phoneNumber: ph(n), password } });
  return { ...u, token: (re.body?.data?.tokens ?? re.body?.data ?? {}).accessToken };
}

const alice = await verified('Amina Bello', 1, 'Jq7#vwZm3Pd8');
rec('setup', 'Verified identity', alice.token ? 'PASS' : 'FAIL', `userId=${alice.userId}`);
const T = alice.token;

// ── Feed keys: what the server declares vs what it serves ────────────────
const caps = await call('GET', '/community/capabilities', { token: T, label: 'community capabilities' });
const feedKeys = (caps.body?.data?.feeds ?? []).map((f) => f.key);
rec('community', 'capabilities enumerates feed keys', feedKeys.length > 0 ? 'PASS' : 'FAIL', `keys=${feedKeys.join(',')}`);

const searchFeed = await call('GET', '/community/feeds/search?limit=5', { token: T, label: 'feeds/search' });
rec('community', "the client's documented 'feeds/search 404s on every deployment' holds",
  searchFeed.status === 404 ? 'PASS' : 'FAIL',
  `status=${searchFeed.status} — declared key with no registered provider`);

// ── Community post → home feed ───────────────────────────────────────────
const postBody = `Runtime validation post ${stamp} — documentation queues in Lagos.`;
const cp = await call('POST', '/community/posts', {
  token: T, label: 'create post',
  body: { body: postBody, title: `Runtime post ${stamp}`, category: 'Question', countryCode: 'NG', cityName: 'Lagos', publish: true },
});
const postId = cp.body?.data?.id ?? cp.body?.data?.postId;
rec('community', 'create post', cp.status < 400 && postId ? 'PASS' : 'FAIL', `status=${cp.status} id=${postId}`);

if (postId) {
  const home = await call('GET', '/community/feeds/home?limit=50&countryCode=NG', { token: T, label: 'home feed' });
  const hItems = home.body?.data?.items ?? [];
  rec('community', 'created post appears in the home feed',
    home.status === 200 && hItems.some((i) => (i.id ?? i.postId) === postId) ? 'PASS' : 'FAIL',
    `status=${home.status} items=${hItems.length}`);

  const country = await call('GET', '/community/feeds/country?limit=50&countryCode=NG', { token: T, label: 'country feed' });
  const cItems = country.body?.data?.items ?? [];
  rec('community', 'created post appears in the country feed',
    country.status === 200 && cItems.some((i) => (i.id ?? i.postId) === postId) ? 'PASS' : 'FAIL',
    `status=${country.status} items=${cItems.length}`);

  // ── Bookmarks ──────────────────────────────────────────────────────
  const bm = await call('POST', '/bookmarks', { token: T, label: 'bookmark post', body: { targetType: 'CommunityPost', targetId: postId } });
  rec('bookmarks', 'bookmark created', bm.status < 400 ? 'PASS' : 'FAIL',
    `status=${bm.status} ${bm.status >= 400 ? JSON.stringify(bm.body).slice(0, 200) : ''}`);
  const bl = await call('GET', '/bookmarks', { token: T, label: 'list bookmarks' });
  const bItems = bl.body?.data?.items ?? bl.body?.data ?? [];
  rec('bookmarks', 'bookmark appears in the saved list',
    bl.status === 200 && Array.isArray(bItems) && bItems.some((b) => (b.targetId ?? b.TargetId) === postId) ? 'PASS' : 'FAIL',
    `status=${bl.status} count=${Array.isArray(bItems) ? bItems.length : 'n/a'}`);
  rec('bookmarks', 'bookmark persisted',
    sql(`SELECT count(*) FROM bookmarks.bookmarks WHERE "TargetId"='${postId}';`) === '1' ? 'PASS' : 'FAIL', 'independent DB read');
}

// ── Marketplace: seller profile is a precondition the platform enforces ──
const noSeller = await call('POST', '/marketplace/listings', {
  token: T, label: 'create listing without a seller profile',
  body: { title: `x ${stamp}`, description: 'x', categoryKey: 'electronics', countryCode: 'NG' },
});
rec('marketplace', 'listing refused before a seller profile exists', noSeller.status === 403 ? 'PASS' : 'FAIL',
  `status=${noSeller.status} code=${noSeller.body?.code ?? ''} detail="${noSeller.body?.detail ?? ''}"`);

const seller = await call('POST', '/marketplace/sellers', {
  token: T, label: 'register seller profile',
  body: { displayName: `Amina Trading ${stamp}`, countryCode: 'NG', kind: 'Individual', bio: 'Runtime validation seller.' },
});
rec('marketplace', 'register seller profile', seller.status < 400 ? 'PASS' : 'FAIL',
  `status=${seller.status} ${seller.status >= 400 ? JSON.stringify(seller.body).slice(0, 240) : ''}`);

const mk = await call('POST', '/marketplace/listings', {
  token: T, label: 'create marketplace listing',
  body: {
    title: `Refurbished laptop ${stamp}`, description: `A runtime validation listing ${stamp}.`,
    categoryKey: 'electronics', countryCode: 'NG', cityName: 'Lagos',
    price: 250000, currency: 'NGN', condition: 'Good', listingType: 'Sale', isNegotiable: true,
  },
});
const listingId = mk.body?.data?.id ?? mk.body?.data?.listingId;
rec('marketplace', 'create listing once a seller profile exists', mk.status < 400 && listingId ? 'PASS' : 'FAIL',
  `status=${mk.status} ${listingId ? `id=${listingId}` : JSON.stringify(mk.body).slice(0, 240)}`);

if (listingId) {
  const before = sql(`SELECT "Status" FROM marketplace.marketplace_listings WHERE "Id"='${listingId}';`);
  rec('marketplace', 'listing persisted', before && !before.startsWith('SQL_ERROR') ? 'PASS' : 'FAIL', `db Status=${before}`);

  // A draft must not be discoverable.
  const preSearch = await call('POST', '/marketplace/search', { token: T, label: 'search before publish', body: { query: stamp, countryCode: 'NG', limit: 20 } });
  const preItems = preSearch.body?.data?.items ?? preSearch.body?.data?.results ?? [];
  rec('marketplace', 'a draft is not returned by search', preItems.length === 0 ? 'PASS' : 'FAIL',
    `items before publish=${preItems.length} (db Status=${before})`);

  const pub = await call('POST', `/marketplace/listings/${listingId}/publish`, { token: T, label: 'publish listing', body: {} });
  const after = sql(`SELECT "Status" FROM marketplace.marketplace_listings WHERE "Id"='${listingId}';`);
  rec('marketplace', 'publish transitions the stored status', pub.status < 400 && after !== before ? 'PASS' : 'FAIL',
    `status=${pub.status} before=${before} after=${after}`);

  const search = await call('POST', '/marketplace/search', { token: T, label: 'search after publish', body: { query: stamp, countryCode: 'NG', limit: 20 } });
  const sd = search.body?.data ?? {};
  const sItems = sd.items ?? sd.results ?? [];
  rec('marketplace', 'published listing is discoverable', search.status === 200 && sItems.length > 0 ? 'PASS' : 'FAIL',
    `status=${search.status} envelope=[${Object.keys(sd).join(',')}] items=${sItems.length}`);
  rec('marketplace', 'search envelope carries a total',
    (sd.totalMatches ?? sd.totalCount ?? sd.totalAvailable) !== undefined ? 'PASS' : 'FAIL',
    `totalMatches=${sd.totalMatches} totalCount=${sd.totalCount} totalAvailable=${sd.totalAvailable}`);

  const noMatch = await call('POST', '/marketplace/search', { token: T, label: 'search impossible', body: { query: 'zzz-no-such-9182736', countryCode: 'NG', limit: 20 } });
  const nItems = noMatch.body?.data?.items ?? noMatch.body?.data?.results ?? [];
  rec('marketplace', 'impossible query filters rather than returning everything',
    noMatch.status === 200 && nItems.length === 0 && sItems.length > 0 ? 'PASS' : 'FAIL',
    `matching=${sItems.length} impossible=${nItems.length}`);

  const mine = await call('GET', '/marketplace/listings/mine', { token: T, label: 'my listings' });
  const mItems = mine.body?.data?.items ?? mine.body?.data ?? [];
  rec('marketplace', 'listing appears under my listings',
    mine.status === 200 && Array.isArray(mItems) && mItems.some((i) => i.id === listingId) ? 'PASS' : 'FAIL',
    `status=${mine.status} count=${Array.isArray(mItems) ? mItems.length : 'n/a'}`);
}

// ── Housing ──────────────────────────────────────────────────────────────
const types = sql(`SELECT string_agg("Key", ',') FROM housing.housing_accommodation_types LIMIT 1;`);
const typeKey = (types || '').split(',')[0] || 'apartment';
const hc = await call('POST', '/housing/listings', {
  token: T, label: 'create housing listing',
  body: {
    title: `Two-bedroom flat ${stamp}`, summary: `Runtime validation housing listing ${stamp}.`,
    description: 'A flat created by the runtime validation harness.',
    accommodationTypeKey: typeKey, countryCode: 'NG', cityName: 'Lagos',
    bedrooms: 2, bathrooms: 1, rentAmount: 850000, currencyCode: 'NGN', rentPeriod: 'Monthly',
  },
});
const houseId = hc.body?.data?.id ?? hc.body?.data?.listingId;
rec('housing', 'create housing listing', hc.status < 400 && houseId ? 'PASS' : 'FAIL',
  `status=${hc.status} typeKey=${typeKey} ${houseId ? `id=${houseId}` : JSON.stringify(hc.body).slice(0, 260)}`);
if (houseId) {
  rec('housing', 'housing listing persisted',
    sql(`SELECT count(*) FROM housing.housing_listings WHERE "Id"='${houseId}';`) === '1' ? 'PASS' : 'FAIL', 'independent DB read');
  const hd = await call('GET', `/housing/listings/${houseId}`, { token: T, label: 'read housing listing' });
  rec('housing', 'housing listing reads back', hd.status === 200 ? 'PASS' : 'FAIL', `status=${hd.status}`);
}

// ── Guides ───────────────────────────────────────────────────────────────
const gcats = sql(`SELECT string_agg("Key", ',') FROM guides.guide_categories LIMIT 1;`);
const gKey = (gcats || '').split(',')[0] || 'housing';
const gc = await call('POST', '/guides', {
  token: T, label: 'create guide',
  body: { title: `Runtime guide ${stamp}`, categoryKey: gKey, language: 'en', countryCode: 'NG', summary: `A guide created by the runtime validation ${stamp}.` },
});
const guideId = gc.body?.data?.id ?? gc.body?.data?.guideId;
rec('guides', 'create guide', gc.status < 400 && guideId ? 'PASS' : 'FAIL',
  `status=${gc.status} categoryKey=${gKey} ${guideId ? `id=${guideId}` : JSON.stringify(gc.body).slice(0, 260)}`);
if (guideId) {
  rec('guides', 'guide persisted', sql(`SELECT count(*) FROM guides.guides WHERE "Id"='${guideId}';`) === '1' ? 'PASS' : 'FAIL', 'independent DB read');
  const gd = await call('GET', `/guides/${guideId}`, { token: T, label: 'read guide' });
  rec('guides', 'guide reads back', gd.status === 200 ? 'PASS' : 'FAIL', `status=${gd.status}`);
}

const pass = results.filter((r) => r.verdict === 'PASS').length;
console.log(`\n--- PHASE 3c: ${pass}/${results.length} PASS ---`);
save('C:/Users/User/source/repos/Diaspora/runtime-validation/evidence-phase3c-create.json');
