import { call, sql, verifiedUser } from './e2e-harness.mjs';
const RUN = process.env.RUNTIME_RUN;
const u = await verifiedUser({ name: 'Feed Reader', phone: `+23481000${RUN}001`, password: 'Fr8#kdLp3Mw5' });
const T = u.token;
const id = '8ccf6e1b-8b4f-453b-8318-950e3bfa0dc4';
const one = await call('GET', `/community/posts/${id}`, { token: T, label: 'second user reads the device-created post' });
console.log('detail:', one.status, JSON.stringify(one.body?.data ?? one.body).slice(0, 260));
for (const f of ['home', 'country']) {
  const r = await call('GET', `/community/feeds/${f}?limit=50&countryCode=GB`, { token: T, label: `${f} feed` });
  const items = r.body?.data?.items ?? [];
  console.log(`${f} feed:`, r.status, 'items=' + items.length,
    'contains=' + items.some(i => (i.id ?? i.postId ?? i.contentId) === id));
}
console.log('db author:', sql(`SELECT "AuthorUserId" FROM community.community_posts WHERE "Id"='${id}';`));
console.log('db status:', sql(`SELECT "Status" FROM community.community_posts WHERE "Id"='${id}';`));
