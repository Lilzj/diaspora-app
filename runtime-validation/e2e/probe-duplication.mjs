/**
 * BG-07 — duplication, exercised against real content.
 *
 * ── Why this exists, and what it is making up for ────────────────────────────
 *
 * `probe-member-claims.mjs` asked the four duplicate routes with a **fabricated
 * identifier** and read the answers as proof the capability worked:
 *
 *   POST /guides/{fake}/duplicate              404 guides.not-found
 *   POST /marketplace/listings/{fake}/duplicate 403 marketplace.not-seller
 *   POST /housing/listings/{fake}/duplicate     403 housing.not-landlord
 *
 * Every one of those proves the **route resolves**. Not one proves the
 * **capability works** — and it did not. Pressed on a device against a real
 * listing, the marketplace route answered **500**:
 *
 *   The property 'ListingDescription.MarketplaceListingId' is part of a key and
 *   so cannot be modified or marked as modified.
 *
 * The handlers passed the source's *tracked owned entities* into the copy, so EF
 * tried to re-parent them. All four modules had it. The sweep's own rule —
 * "seed a real resource, obtain a real id, execute the operation, inspect the
 * response, verify the persisted result, read it back" — is exactly what would
 * have caught it, and this probe is that rule applied.
 *
 * **A 403 or a 404 is not evidence about a capability.** It is evidence about a
 * path. That mistake is now recorded three times in this programme, in three
 * different directions.
 *
 *   node runtime-validation/e2e/probe-duplication.mjs
 */
import { writeFileSync } from 'node:fs';
import { call, sql, evidence, verifiedUser, uploadDirect, recorder } from './e2e-harness.mjs';

const OUT = 'C:/Users/User/source/repos/Diaspora/runtime-validation/e2e/results-duplication.json';
const RUN = process.env.RUNTIME_RUN ?? '990';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const stamp = `DUP${RUN}`;

const results = [];
const rec = recorder(results);
const ok = (r) => r.status >= 200 && r.status < 300;
const code = (r) => r.body?.code ?? r.body?.error?.code ?? null;

console.log('\n══ BG-07 · duplication, against real content ══════════════════════════\n');

const member = await verifiedUser({ name: `Dup ${stamp}`, phone: ph(1), password: 'Yr5#dGkP7wLs' });

if (!member.token) {
  console.log('  BLOCKED — no member.\n');
  writeFileSync(OUT, JSON.stringify({ blocked: true, results, evidence }, null, 2));
  process.exit(1);
}

const T = member.token;

/**
 * Duplicate one real thing and prove the copy exists, is a draft, is owned by
 * the caller, and is a *different row* from the original.
 */
async function duplicates({ area, createLabel, sourceId, path, countSql }) {
  if (!sourceId) {
    rec(area, 'a copy is made from a real item', 'BLOCKED', `${createLabel} could not be seeded`);
    return;
  }

  const before = Number(sql(countSql).trim());

  const r = await call('POST', path(sourceId), { token: T, body: {}, label: `duplicate the ${area}` });

  // The status first, because a 500 is the defect this probe exists for and
  // must never be folded into a softer verdict.
  rec(area, 'the duplicate route answers', ok(r) ? 'PASS' : 'FAIL',
    `POST ${path(sourceId)} → ${r.status}${code(r) ? ` ${code(r)}` : ''}`);

  if (!ok(r)) return;

  const after = Number(sql(countSql).trim());

  rec(area, 'a second row exists on the server', after === before + 1 ? 'PASS' : 'FAIL',
    `rows for this member: ${before} → ${after}`);

  const copyId = r.body?.data?.listingId ?? r.body?.data?.guideId
    ?? r.body?.data?.id ?? r.body?.data?.eventId ?? null;

  rec(area, 'the copy is a different row from the original',
    copyId && copyId !== sourceId ? 'PASS' : 'FAIL', `source=${sourceId} copy=${copyId}`);

  const status = String(r.body?.data?.status ?? '').toLowerCase();

  rec(area, 'the copy is a draft, not published',
    status === 'draft' ? 'PASS' : 'FAIL',
    `status=${r.body?.data?.status ?? 'absent'} — a copy that arrived published would put `
    + 'unreviewed text in front of members through a route with no moderation step');

  const title = String(r.body?.data?.title ?? '');

  rec(area, 'the copy is named so the two can be told apart',
    title.startsWith('Copy of ') ? 'PASS' : 'FAIL', `title="${title}"`);
}

// ═════════════════════════════════════════════════════════════════════════════
// GUIDES
// ═════════════════════════════════════════════════════════════════════════════

let guideId = null;
{
  const cats = await call('GET', '/guides/categories', { token: T, label: 'guide categories' });
  const categoryKey = (cats.body?.data?.items ?? cats.body?.data ?? [])[0]?.key ?? 'getting-started';

  const created = await call('POST', '/guides', {
    token: T, label: 'seed a guide',
    body: {
      title: `Duplication guide ${stamp}`, categoryKey, language: 'en',
      countryCode: 'NG', cityName: 'Lagos',
      summary: 'Seeded so the copy has something to carry over.',
    },
  });
  guideId = created.body?.data?.guideId ?? null;
  rec('setup', 'a real guide exists', guideId ? 'PASS' : 'BLOCKED', `status=${created.status}`);
}

await duplicates({
  area: 'guides',
  createLabel: 'the guide',
  sourceId: guideId,
  path: (id) => `/guides/${id}/duplicate`,
  countSql: `SELECT count(*) FROM guides.guides WHERE "AuthorId"='${member.userId}';`,
});

// ═════════════════════════════════════════════════════════════════════════════
// MARKETPLACE — the one that answered 500
// ═════════════════════════════════════════════════════════════════════════════

let listingId = null;
{
  const seller = await call('POST', '/marketplace/sellers', {
    token: T, label: 'become a seller',
    body: { displayName: `Dup Trades ${stamp}`, kind: 'Individual', countryCode: 'NG' },
  });

  if (ok(seller)) {
    const cats = await call('GET', '/marketplace/categories', { token: T, label: 'marketplace categories' });
    const flatten = (nodes, out = []) => { for (const c of nodes ?? []) { out.push(c); flatten(c.children, out); } return out; };
    const all = flatten(cats.body?.data?.items ?? cats.body?.data ?? []);
    const leaf = all.find((c) => !c.children?.length) ?? all[0];
    const media = await uploadDirect(T, { fileName: `${stamp}.png`, label: 'listing photograph' });

    const listing = await call('POST', '/marketplace/listings', {
      token: T, label: 'seed a listing',
      body: {
        title: `Duplication laptop ${stamp}`,
        description: 'Seeded so the copy has a description, a price and a location to carry over.',
        summary: 'A refurbished machine.',
        categoryKey: leaf?.key ?? leaf?.categoryKey ?? leaf?.slug,
        countryCode: 'NG', cityName: 'Lagos', condition: 'Refurbished',
        listingType: 'Sale', price: 185000, currency: 'NGN', quantity: 1,
        isNegotiable: true, offersPickup: true, offersDelivery: false,
        offersShipping: false, isDigital: false,
        brand: 'Acme', model: 'X1',
        mediaIds: media.body?.data?.mediaId ? [media.body.data.mediaId] : undefined,
      },
    });
    listingId = listing.body?.data?.listingId ?? null;
    rec('setup', 'a real listing exists', listingId ? 'PASS' : 'BLOCKED', `status=${listing.status}`);
  }
}

await duplicates({
  area: 'marketplace',
  createLabel: 'the listing',
  sourceId: listingId,
  path: (id) => `/marketplace/listings/${id}/duplicate`,
  countSql: `
    SELECT count(*) FROM marketplace.marketplace_listings l
    JOIN marketplace.marketplace_sellers s ON s."Id" = l."SellerId"
    WHERE s."OwnerUserId" = '${member.userId}';`,
});

// ═════════════════════════════════════════════════════════════════════════════
// HOUSING
// ═════════════════════════════════════════════════════════════════════════════

let housingId = null;
{
  const landlord = await call('POST', '/housing/landlords', {
    token: T, label: 'become a landlord',
    body: { displayName: `Dup Lettings ${stamp}`, kind: 'Individual', countryCode: 'NG' },
  });

  if (ok(landlord)) {
    const types = await call('GET', '/housing/accommodation-types', { token: T, label: 'accommodation types' });
    const typeKey = (types.body?.data?.items ?? types.body?.data ?? [])[0]?.key ?? 'apartment';
    const photo = await uploadDirect(T, { fileName: `${stamp}-h.png`, label: 'property photograph' });

    const listing = await call('POST', '/housing/listings', {
      token: T, label: 'seed a property',
      body: {
        media: photo.body?.data?.mediaId
          ? [{ mediaId: photo.body.data.mediaId, role: 'Cover' }] : undefined,
        title: `Duplication flat ${stamp}`,
        summary: 'Seeded so the copy has something to carry over.',
        description: 'A two-bedroom flat.',
        accommodationTypeKey: typeKey,
        countryCode: 'NG', cityName: 'Lagos',
        rentAmount: 900000, currencyCode: 'NGN', rentPeriod: 'PerMonth',
        bedrooms: 2, bathrooms: 1, totalUnits: 1,
        furnishedStatus: 'Unfurnished',
        acceptsLongStay: true, acceptsShortStay: false,
      },
    });
    housingId = listing.body?.data?.id ?? listing.body?.data?.listingId ?? null;
    rec('setup', 'a real property exists', housingId ? 'PASS' : 'BLOCKED', `status=${listing.status}`);
  }
}

await duplicates({
  area: 'housing',
  createLabel: 'the property',
  sourceId: housingId,
  path: (id) => `/housing/listings/${id}/duplicate`,
  countSql: `
    SELECT count(*) FROM housing.housing_listings h
    JOIN housing.housing_landlords l ON l."Id" = h."LandlordId"
    WHERE l."OwnerUserId" = '${member.userId}';`,
});

// The one product decision a member will notice, asserted rather than described.
if (housingId) {
  const addresses = sql(`
    SELECT count(*) FROM housing.housing_listings h
    JOIN housing.housing_landlords l ON l."Id" = h."LandlordId"
    WHERE l."OwnerUserId" = '${member.userId}'
      AND h.address_line1 IS NOT NULL AND btrim(h.address_line1) <> '';
  `).trim();

  rec('housing', "the copy did not inherit the original's address",
    addresses === '0' ? 'PASS' : 'FAIL',
    `${addresses} of this landlord's properties carry a street address — a landlord duplicates `
    + 'because they have ANOTHER unit, and another unit is at another door');
}

// ═════════════════════════════════════════════════════════════════════════════
// EVENTS
// ═════════════════════════════════════════════════════════════════════════════

let eventId = null;
{
  // The catalogue is one GET returning every taxonomy; the per-taxonomy paths
  // are PUT-only (they are the admin write surface). Asking the wrong one
  // answered 405, the fallback key was used, and the create then answered
  // `404 community-life.event-category.not-found` — which reads exactly like
  // "events cannot be created" and is not.
  const cats = await call('GET', '/community-life/catalogue', { token: T, label: 'community-life catalogue' });
  const categories = cats.body?.data?.eventCategories ?? cats.body?.data?.items ?? [];
  const categoryKey = categories[0]?.key ?? 'community-meeting';
  const starts = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const ends = new Date(Date.now() + 7 * 24 * 3600 * 1000 + 2 * 3600 * 1000).toISOString();

  const created = await call('POST', '/community-life/events', {
    token: T, label: 'seed an event',
    body: {
      title: `Duplication meet-up ${stamp}`,
      summary: 'Seeded so the copy has something to carry over.',
      description: 'A monthly meet-up.',
      categoryKey,
      startsAt: starts, endsAt: ends, timeZoneId: 'UTC',
      countryCode: 'NG', cityName: 'Lagos',
      attendanceMode: 'InPerson',

      // `community-life.venue.required` — "An event people attend in person
      // needs somewhere to be." A real precondition, and the platform being
      // right: the venue is also the thing the copy has to carry over.
      venue: { name: 'Peckham Community Hall', addressLine1: '12 Rye Lane' },
    },
  });
  eventId = created.body?.data?.eventId ?? created.body?.data?.id ?? null;
  rec('setup', 'a real event exists', eventId ? 'PASS' : 'BLOCKED', `status=${created.status}`);
}

await duplicates({
  area: 'events',
  createLabel: 'the event',
  sourceId: eventId,
  path: (id) => `/community-life/events/${id}/duplicate`,
  countSql: `SELECT count(*) FROM community_life.community_life_events WHERE "OrganizerUserId"='${member.userId}';`,
});

// ═════════════════════════════════════════════════════════════════════════════

const pass = results.filter((r) => r.verdict === 'PASS').length;
const fail = results.filter((r) => r.verdict === 'FAIL').length;
const blocked = results.filter((r) => r.verdict === 'BLOCKED').length;

console.log(`\n  ${pass} PASS · ${fail} FAIL · ${blocked} BLOCKED\n`);

writeFileSync(OUT, JSON.stringify({
  probe: 'BG-07 duplication against real content',
  run: RUN,
  member: member.userId,
  sources: { guideId, listingId, housingId, eventId },
  totals: { pass, fail, blocked },
  results,
  evidence,
}, null, 2));

process.exit(fail > 0 ? 1 : 0);
