/**
 * Runtime verification for DEFECT-004 (marketplace publish requirements) and
 * DEFECT-005 (bookmark target validation).
 */
import { call, makeUser, sql, save } from './harness.mjs';

const results = [];
const rec = (defect, flow, verdict, note) => {
  results.push({ defect, flow, verdict, note });
  console.log(`  ${verdict.padEnd(5)} [${defect}] ${flow}\n          ${note}`);
};

const RUN = process.env.RUNTIME_RUN ?? '410';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const stamp = `rv${RUN}`;

const u = await makeUser({ name: 'Defect Probe', phone: ph(1), password: 'Dp7#mzKw4Rt9' });
sql(`UPDATE identity.users SET "AccessState"='Verified' WHERE "Id"='${u.userId}';`);
const re = await call('POST', '/auth/login', { label: 'login', body: { phoneNumber: ph(1), password: 'Dp7#mzKw4Rt9' } });
const T = (re.body?.data?.tokens ?? re.body?.data ?? {}).accessToken;

console.log('\n=== DEFECT-004: marketplace publish requirements ===\n');

await call('POST', '/marketplace/sellers', {
  token: T, label: 'seller', body: { displayName: `Probe Trading ${stamp}`, countryCode: 'NG', kind: 'Individual' },
});

// A listing with everything the OLD message named, and nothing else: title,
// description, category, country, price. Fulfilment and photograph are absent —
// which is exactly the state the old message could not describe.
const mk = await call('POST', '/marketplace/listings', {
  token: T, label: 'listing missing fulfilment and media',
  body: {
    title: `Publish probe ${stamp}`, description: 'Has every field the old error named.',
    categoryKey: 'electronics', countryCode: 'NG', cityName: 'Lagos', price: 1000, currency: 'NGN',
  },
});
const id = mk.body?.data?.listingId ?? mk.body?.data?.id;
rec('004', 'listing created as a draft', mk.status === 201 ? 'PASS' : 'FAIL', `status=${mk.status} id=${id}`);

const pub1 = await call('POST', `/marketplace/listings/${id}/publish`, { token: T, label: 'publish (2 unmet)', body: {} });
const d1 = String(pub1.body?.detail ?? '');
rec('004', 'refusal names the prerequisites that are actually unmet',
  pub1.status === 400 && /photograph/i.test(d1) && /delivery|fulfil/i.test(d1) ? 'PASS' : 'FAIL',
  `status=${pub1.status}\n          detail="${d1}"`);
rec('004', 'refusal carries machine-readable tokens for a UI checklist',
  /\[missing: [a-z,]+\]/.test(d1) ? 'PASS' : 'FAIL',
  `tokens=${d1.match(/\[missing: ([a-z,]+)\]/)?.[1] ?? 'none'}`);
rec('004', 'refusal no longer recites the satisfied fields as if missing',
  !/needs a title, a description, a category, a country and a price/i.test(d1) ? 'PASS' : 'FAIL',
  'the old sentence is gone');

// Add fulfilment only: the message must change, naming just the photograph.
const mk2 = await call('POST', '/marketplace/listings', {
  token: T, label: 'listing with fulfilment, no media',
  body: {
    title: `Publish probe fulfilled ${stamp}`, description: 'Has fulfilment but no photograph.',
    categoryKey: 'electronics', countryCode: 'NG', cityName: 'Lagos', price: 1000, currency: 'NGN',
    offersPickup: true, offersDelivery: true,
  },
});
const id2 = mk2.body?.data?.listingId ?? mk2.body?.data?.id;
const pub2 = await call('POST', `/marketplace/listings/${id2}/publish`, { token: T, label: 'publish (1 unmet)', body: {} });
const d2 = String(pub2.body?.detail ?? '');
rec('004', 'the message narrows as prerequisites are satisfied',
  pub2.status === 400 && /photograph/i.test(d2) && !/delivery option/i.test(d2) ? 'PASS' : 'FAIL',
  `detail="${d2}"`);

console.log('\n=== DEFECT-005: bookmark target validation ===\n');

const bad = await call('POST', '/bookmarks', {
  token: T, label: 'bookmark unknown target type',
  body: { targetType: 'NotAThing', targetId: '00000000-0000-0000-0000-000000000000' },
});
rec('005', 'an unknown target type is refused',
  bad.status === 400 ? 'PASS' : 'FAIL',
  `status=${bad.status} code=${bad.body?.code ?? ''} detail="${String(bad.body?.detail ?? '').slice(0, 150)}"`);
rec('005', 'the refused bookmark was not persisted',
  sql(`SELECT count(*) FROM bookmarks.bookmarks WHERE "TargetType"='notathing';`) === '0' ? 'PASS' : 'FAIL',
  'no notathing rows (the pre-fix row was removed with the database reset, or none was written)');

const good = await call('POST', '/bookmarks', {
  token: T, label: 'bookmark a known target type',
  body: { targetType: 'marketplace-listing', targetId: id, note: 'runtime check' },
});
rec('005', 'a known target type is still accepted (extensibility preserved)',
  good.status === 201 ? 'PASS' : 'FAIL', `status=${good.status}`);

const list = await call('GET', '/bookmarks', { token: T, label: 'list bookmarks' });
const items = list.body?.data?.items ?? list.body?.data ?? [];
rec('005', 'the accepted bookmark reads back',
  list.status === 200 && Array.isArray(items) && items.some((b) => (b.targetId ?? b.TargetId) === id) ? 'PASS' : 'FAIL',
  `status=${list.status} count=${Array.isArray(items) ? items.length : 'n/a'}`);

const pass = results.filter((r) => r.verdict === 'PASS').length;
console.log(`\n--- DEFECT 004/005 VERIFICATION: ${pass}/${results.length} PASS ---`);
save('C:/Users/User/source/repos/Diaspora/runtime-validation/evidence-defects-004-005.json');
