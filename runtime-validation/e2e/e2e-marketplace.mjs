/**
 * E2E JOURNEY #1 — media → marketplace create → publish → discovery,
 * including second-user visibility.
 *
 * The one remaining hole in the marketplace vertical: a listing cannot publish
 * without a Cover or Gallery image, and no phase before this one uploaded a
 * byte. Everything here runs against the real API, the real database and the
 * real storage path.
 */
import { writeFileSync } from 'node:fs';
import { call, sql, save, uploadDirect, verifiedUser, recorder } from './e2e-harness.mjs';

const EV = 'C:/Users/User/source/repos/Diaspora/runtime-validation/e2e/evidence-marketplace.json';
const results = [];
const rec = recorder(results);
const RUN = process.env.RUNTIME_RUN ?? '201';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const stamp = `e2e${RUN}`;

function finish(code = 0) {
  const pass = results.filter((r) => r.verdict === 'PASS').length;
  const fail = results.filter((r) => r.verdict === 'FAIL').length;
  console.log(`\n  ${pass} PASS · ${fail} FAIL · ${results.length} checks\n`);
  save(EV);
  writeFileSync(EV.replace('evidence-', 'results-'), JSON.stringify({ journey: 'marketplace', run: RUN, stamp, results }, null, 1));
  process.exit(code);
}

console.log('\n=== E2E JOURNEY 1: MEDIA -> MARKETPLACE PUBLISH -> DISCOVERY ===\n');

// -- Identities -----------------------------------------------------------
const seller = await verifiedUser({ name: 'Ngozi Okafor', phone: ph(1), password: 'Sq8#trWm4Pd9' });
rec('setup', 'seller reaches the Verified rung', seller.token ? 'PASS' : 'FAIL', `userId=${seller.userId}`);
const buyer = await verifiedUser({ name: 'Kwame Mensah', phone: ph(2), password: 'Zt5#gpLn7Rk2' });
rec('setup', 'buyer reaches the Verified rung', buyer.token ? 'PASS' : 'FAIL', `userId=${buyer.userId}`);
const S = seller.token;
const B = buyer.token;
if (!S || !B) finish(1);

// -- Media capabilities, read rather than assumed -------------------------
const caps = await call('GET', '/media/capabilities', { token: S, label: 'media capabilities' });
const c = caps.body?.data ?? {};
rec('media', 'capabilities document is served', caps.status === 200 ? 'PASS' : 'FAIL',
  `status=${caps.status} keys=${Object.keys(c).join(',').slice(0, 200)}`);

// -- The upload -----------------------------------------------------------
const up = await uploadDirect(S, { fileName: `${stamp}-cover.png`, label: 'upload cover image' });
const mediaId = up.body?.data?.id ?? up.body?.data?.mediaId;
rec('media', 'direct multipart upload returns an asset', up.status < 400 && mediaId ? 'PASS' : 'FAIL',
  `status=${up.status} mediaId=${mediaId} assetStatus=${up.body?.data?.status} detail=${String(up.body?.detail ?? up.body?.code ?? '-').slice(0, 160)}`);

if (mediaId) {
  const row = sql(`SELECT "Status" || ' | bytes=' || COALESCE(size_bytes::text,'?') || ' | ct=' || COALESCE("ContentType",'?') || ' | scan=' || COALESCE(scan_status,'?') FROM media.media_assets WHERE "Id"='${mediaId}';`);
  rec('media', 'asset is persisted in PostgreSQL', row && !row.startsWith('SQL_ERROR') && row.length > 0 ? 'PASS' : 'FAIL', `db: ${row}`);

  const read = await call('GET', `/media/${mediaId}`, { token: S, label: 'read media asset' });
  rec('media', 'asset is readable and carries a minted url', read.status === 200 && !!read.body?.data?.url ? 'PASS' : 'FAIL',
    `status=${read.status} url=${String(read.body?.data?.url).slice(0, 90)}`);

  const content = await call('GET', `/media/${mediaId}/content`, { token: S, label: 'read media bytes back' });
  rec('media', 'stored bytes are retrievable', content.status === 200 ? 'PASS' : 'FAIL', `status=${content.status}`);
}

// -- Negative: a non-multipart upload must be refused ---------------------
const empty = await call('POST', '/media/uploads/direct', { token: S, label: 'upload with a JSON body (not multipart)', body: { file: 'nonsense' } });
rec('media', 'a non-multipart upload is refused rather than silently accepted',
  empty.status >= 400 || /empty|invalid/i.test(JSON.stringify(empty.body ?? {})) ? 'PASS' : 'FAIL',
  `status=${empty.status} code=${empty.body?.code ?? empty.body?.error?.code ?? '-'}`);

// -- Categories, read rather than guessed ---------------------------------
const cats = await call('GET', '/marketplace/categories', { token: S, label: 'marketplace categories' });
const catList = cats.body?.data?.items ?? cats.body?.data ?? [];
const categoryKey = process.env.E2E_CATEGORY
  ?? (Array.isArray(catList) && catList.length ? (catList[0].key ?? catList[0].categoryKey) : 'general');
rec('marketplace', 'category taxonomy is served', cats.status === 200 ? 'PASS' : 'FAIL',
  `status=${cats.status} count=${Array.isArray(catList) ? catList.length : '?'} using=${categoryKey}`);

// -- The seller profile, which the create route requires ------------------
//
// `MarketplaceAuthorizationService` resolves a `SellerProfile` before any
// listing write and answers `marketplace.not-seller` when there is none. No
// frontend surface calls this route; that finding is DEFECT-008 and is
// recorded in `discovered-defects.md`. The journey creates one here so that
// the rest of the vertical can be exercised at all.
const sellerBefore = await call('POST', '/marketplace/listings', {
  token: S, label: 'create listing BEFORE a seller profile exists (probe)',
  body: { title: `Probe ${stamp}`, description: 'Probe for the seller-profile precondition, deliberately sent before one exists.', categoryKey: 'electronics', countryCode: 'NG' },
});
rec('marketplace', 'listing write without a seller profile is refused',
  sellerBefore.status === 403 && sellerBefore.body?.code === 'marketplace.not-seller' ? 'PASS' : 'INFO',
  `status=${sellerBefore.status} code=${sellerBefore.body?.code ?? '-'} detail="${String(sellerBefore.body?.detail ?? '').slice(0, 90)}"`);

const sellerProfile = await call('POST', '/marketplace/sellers', {
  token: S, label: 'create seller profile',
  body: { displayName: `Ngozi Textiles ${stamp}`, countryCode: 'NG', kind: 'Individual', bio: 'Hand-woven Aso Oke from Iseyin, sold in Lagos.' },
});
rec('marketplace', 'seller profile is created', sellerProfile.status < 400 ? 'PASS' : 'FAIL',
  `status=${sellerProfile.status} id=${sellerProfile.body?.data?.id ?? '-'} db=${sql(`SELECT display_name || '/' || "Status" FROM marketplace.marketplace_sellers WHERE "OwnerUserId"='${seller.userId}';`)}`);

const buyerSeller = await call('POST', '/marketplace/sellers', {
  token: B, label: 'buyer also becomes a seller (for the second-user write path)',
  body: { displayName: `Kwame Goods ${stamp}`, countryCode: 'NG', kind: 'Individual' },
});
rec('marketplace', 'second account can also open a seller profile', buyerSeller.status < 400 ? 'PASS' : 'INFO', `status=${buyerSeller.status}`);

// -- Create the listing ---------------------------------------------------
const create = await call('POST', '/marketplace/listings', {
  token: S, label: 'create marketplace listing',
  body: {
    title: `Hand-woven Aso Oke wrapper ${stamp}`,
    description: 'A full six-yard Aso Oke wrapper woven in Iseyin, sold with the matching gele. Collected in Lagos or delivered within the mainland.',
    categoryKey,
    countryCode: 'NG', cityName: 'Lagos', regionName: 'Lagos',
    price: 45000, currency: 'NGN', isNegotiable: true, quantity: 1,
    condition: 'New', listingType: 'Sale',
    offersPickup: true, offersDelivery: true, deliveryRadiusKm: 25,
    mediaIds: mediaId ? [mediaId] : undefined,
  },
});
const listingId = create.body?.data?.id ?? create.body?.data?.listingId;
rec('marketplace', 'create listing', create.status < 400 && listingId ? 'PASS' : 'FAIL',
  `status=${create.status} id=${listingId} code=${create.body?.code ?? '-'} detail=${String(create.body?.detail ?? '').slice(0, 180)}`);

if (!listingId) finish(0);

const dbAfterCreate = sql(`SELECT "Status" || ' | publishedAt=' || COALESCE("PublishedAt"::text,'null') FROM marketplace.marketplace_listings WHERE "Id"='${listingId}';`);
rec('marketplace', 'create lands the listing in Draft, not a published state',
  /draft/i.test(dbAfterCreate) ? 'PASS' : 'INFO', `db: ${dbAfterCreate}`);

// -- Media association ----------------------------------------------------
if (mediaId) {
  const assoc = sql(`SELECT COALESCE(string_agg("Role", ','),'(none)') FROM marketplace.marketplace_listing_media WHERE listing_id='${listingId}';`);
  rec('media', 'inline mediaIds on create claims the asset for the listing',
    assoc !== '(none)' ? 'PASS' : 'INFO', `db marketplace_listing_media roles=${assoc}`);

  const explicit = await call('POST', `/marketplace/listings/${listingId}/media`, {
    token: S, label: 'attach media to listing (explicit route)',
    body: { mediaId, role: 'Cover', caption: 'Front of the wrapper' },
  });
  rec('media', 'explicit listing-media attach route', explicit.status < 400 ? 'PASS' : 'FAIL',
    `status=${explicit.status} code=${explicit.body?.code ?? '-'} detail=${String(explicit.body?.detail ?? '').slice(0, 140)}`);

  const roleRow = sql(`SELECT COALESCE(string_agg(DISTINCT "Role", ','),'(none)') FROM marketplace.marketplace_listing_media WHERE listing_id='${listingId}';`);
  rec('media', 'attachment carries a Cover/Gallery role', /cover|gallery/i.test(roleRow) ? 'PASS' : 'FAIL', `db roles=${roleRow}`);
}

// -- Publish --------------------------------------------------------------
const pub = await call('POST', `/marketplace/listings/${listingId}/publish`, {
  token: S, label: 'publish listing', body: { activateImmediately: true },
});
rec('marketplace', 'publish', pub.status < 400 ? 'PASS' : 'FAIL',
  `status=${pub.status} code=${pub.body?.code ?? '-'} detail=${String(pub.body?.detail ?? '').slice(0, 240)}`);

const dbAfterPublish = sql(`SELECT "Status" || ' | publishedAt=' || COALESCE("PublishedAt"::text,'null') || ' | firstPublishedAt=' || COALESCE("FirstPublishedAt"::text,'null') FROM marketplace.marketplace_listings WHERE "Id"='${listingId}';`);
rec('marketplace', 'publication is a real state transition in PostgreSQL',
  /active|published/i.test(dbAfterPublish) ? 'PASS' : 'FAIL', `db: ${dbAfterPublish}`);

// -- Seller reads it back -------------------------------------------------
const detail = await call('GET', `/marketplace/listings/${listingId}`, { token: S, label: 'seller reads listing detail' });
const dMedia = detail.body?.data?.media ?? detail.body?.data?.images ?? [];
rec('marketplace', 'listing detail returns the media', detail.status === 200 && dMedia.length > 0 ? 'PASS' : 'FAIL',
  `status=${detail.status} statusField=${detail.body?.data?.status} media=${dMedia.length}`);

const mine = await call('GET', '/marketplace/listings/mine?limit=20', { token: S, label: "seller's own listings" });
const mineItems = mine.body?.data?.items ?? mine.body?.data?.results ?? [];
rec('marketplace', "listing appears in the seller's own list",
  mine.status === 200 && mineItems.some((i) => (i.id ?? i.listingId) === listingId) ? 'PASS' : 'FAIL',
  `status=${mine.status} items=${mineItems.length}`);

// -- Discovery, by the seller and then by a second account ----------------
async function discover(who, token) {
  const search = await call('POST', '/marketplace/search', {
    token, label: `${who} searches the marketplace`,
    body: { text: stamp, countryCode: 'NG', limit: 25 },
  });
  const sd = search.body?.data ?? {};
  const items = sd.items ?? sd.results ?? [];
  const found = items.some((i) => (i.id ?? i.listingId) === listingId);
  rec('discovery', `${who} finds the published listing by text search`, found ? 'PASS' : 'FAIL',
    `status=${search.status} items=${items.length} envelope={${Object.keys(sd).join(',')}}`);

  // `GET /marketplace` is the seller dashboard, not a browse feed — the client
  // documents this in `community-directory-api.ts` and browses through search.
  // Asserted here for what it is, so the row is not read as a missing listing.
  const dash = await call('GET', '/marketplace', { token, label: `${who} opens the seller dashboard` });
  rec('discovery', `${who}: GET /marketplace is a seller dashboard, not a listing feed`,
    dash.status === 200 && !!dash.body?.data?.seller ? 'PASS' : 'INFO',
    `status=${dash.status} keys={${Object.keys(dash.body?.data ?? {}).join(',')}} publishedListings=${dash.body?.data?.seller?.statistics?.publishedListings}`);

  const d = await call('GET', `/marketplace/listings/${listingId}`, { token, label: `${who} opens the listing` });
  const m = d.body?.data?.media ?? d.body?.data?.images ?? [];
  rec('discovery', `${who} opens the detail and sees the media`,
    d.status === 200 && m.length > 0 ? 'PASS' : 'FAIL',
    `status=${d.status} title="${String(d.body?.data?.title ?? '').slice(0, 44)}" media=${m.length}`);

  // -- The shape the client has to read, recorded rather than assumed -----
  //
  // This is the DEFECT-009 evidence at HTTP level. `MarketplaceCard`
  // destructures `id`, `price`, `currency`, `coverImage` and `createdAt`;
  // the server sends `listingId`, a `price` **object**, `coverMediaId` and
  // `publishedAt`. Naming the keys here means the finding is reproducible
  // from the evidence file without reading the client.
  if (items[0]) {
    const it = items[0];
    rec('contract', 'search items are keyed `listingId`, and carry no `id`',
      it.listingId && it.id === undefined ? 'PASS' : 'FAIL',
      `keys={${Object.keys(it).join(',')}}`);
    rec('contract', '`price` is an object, not a number',
      it.price !== null && typeof it.price === 'object' ? 'PASS' : 'FAIL',
      `price=${JSON.stringify(it.price)}`);
    rec('contract', 'the cover is `coverMediaId`; there is no `coverImage`',
      'coverMediaId' in it && !('coverImage' in it) ? 'PASS' : 'FAIL',
      `coverMediaId=${it.coverMediaId} coverImage=${it.coverImage}`);
  }
  return found;
}

await discover('seller', S);
await discover('buyer (second account)', B);

// -- DEFECT-004 regression: the publish refusal names what is missing -----
const bare = await call('POST', '/marketplace/listings', {
  token: S, label: 'create a listing with no photograph',
  body: {
    title: `Unphotographed test item ${stamp}`,
    description: 'A listing deliberately created without any media, to check that the publish refusal names the photograph rather than reciting what is already satisfied.',
    categoryKey, countryCode: 'NG', cityName: 'Lagos',
    price: 1000, currency: 'NGN', offersPickup: true,
  },
});
const bareId = bare.body?.data?.listingId ?? bare.body?.data?.id;
if (bareId) {
  const barePub = await call('POST', `/marketplace/listings/${bareId}/publish`, { token: S, label: 'publish without a photograph', body: {} });
  const msg = JSON.stringify(barePub.body ?? {});
  rec('marketplace', 'DEFECT-004 regression: publish refusal names the unmet prerequisite',
    barePub.status >= 400 && /photo|image|media/i.test(msg) ? 'PASS' : 'FAIL',
    `status=${barePub.status} detail=${String(barePub.body?.detail ?? '').slice(0, 220)}`);
}

finish(0);
