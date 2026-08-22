/**
 * Two questions the domain sweep raised:
 *   1. why a created post is absent from the feed that should carry it;
 *   2. why publishing a draft listing is refused.
 */
import { call, makeUser, sql } from './harness.mjs';

const RUN = process.env.RUNTIME_RUN ?? '40';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const stamp = `rv${RUN}`;

const u = await makeUser({ name: 'Probe User', phone: ph(1), password: 'Pw8#kzMr4Vt6' });
sql(`UPDATE identity.users SET "AccessState"='Verified' WHERE "Id"='${u.userId}';`);
const re = await call('POST', '/auth/login', { body: { phoneNumber: ph(1), password: 'Pw8#kzMr4Vt6' } });
const T = (re.body?.data?.tokens ?? re.body?.data ?? {}).accessToken;

// ── 1. Feed membership ───────────────────────────────────────────────────
const cp = await call('POST', '/community/posts', {
  token: T, label: 'probe post',
  body: { body: `Feed probe ${stamp}`, title: `Feed probe ${stamp}`, countryCode: 'NG', cityName: 'Lagos', publish: true },
});
const postId = cp.body?.data?.id;
console.log('post created:', cp.status, postId);
console.log('db row:', sql(`SELECT "Status" || ' | visibility=' || "Visibility" || ' | country=' || COALESCE("AudienceCountryCode",'-') FROM community.community_posts WHERE "Id"='${postId}';`));

for (const key of ['home', 'country', 'profile', 'nearby', 'trending']) {
  const f = await call('GET', `/community/feeds/${key}?limit=50&countryCode=NG`, { token: T, label: `feed ${key}` });
  const items = f.body?.data?.items ?? [];
  console.log(`  feed/${key.padEnd(9)} status=${f.status} items=${items.length} containsProbe=${items.some((i) => (i.id ?? i.postId) === postId)}`);
}

console.log('\ntotal published posts in db:', sql(`SELECT count(*) FROM community.community_posts WHERE "Status"='Published';`));
console.log('all post statuses:', sql(`SELECT string_agg(DISTINCT "Status", ',') FROM community.community_posts;`));
console.log('distinct visibility:', sql(`SELECT string_agg(DISTINCT "Visibility", ',') FROM community.community_posts;`));

// Wait, then re-read: distinguishes an asynchronous projection from an exclusion.
await new Promise((r) => setTimeout(r, 8000));
const later = await call('GET', '/community/feeds/home?limit=50&countryCode=NG', { token: T, label: 'home feed after 8s' });
const lItems = later.body?.data?.items ?? [];
console.log(`\nafter 8s: home items=${lItems.length} containsProbe=${lItems.some((i) => (i.id ?? i.postId) === postId)}`);
if (lItems.length) console.log('sample item keys:', Object.keys(lItems[0]).join(','));

// ── 2. Publish refusal ───────────────────────────────────────────────────
await call('POST', '/marketplace/sellers', { token: T, label: 'seller', body: { displayName: `Probe Trading ${stamp}`, countryCode: 'NG', kind: 'Individual' } });
const mk = await call('POST', '/marketplace/listings', {
  token: T, label: 'listing',
  body: { title: `Probe listing ${stamp}`, description: 'probe', categoryKey: 'electronics', countryCode: 'NG', price: 1000, currency: 'NGN' },
});
const id = mk.body?.data?.id;
console.log('\nlisting created:', mk.status, id);
const pub = await call('POST', `/marketplace/listings/${id}/publish`, { token: T, label: 'publish', body: {} });
console.log('publish status:', pub.status);
console.log('publish body:', JSON.stringify(pub.body).slice(0, 700));
console.log('db after:', sql(`SELECT "Status" FROM marketplace.marketplace_listings WHERE "Id"='${id}';`));
