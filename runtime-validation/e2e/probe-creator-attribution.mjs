/**
 * BG-10 — who a publication is credited to.
 *
 * The defect, stated once: three creator-activity consumers passed a *profile*
 * identifier where a *member* belongs. `ListingPublishedCreatorConsumer` passed
 * `SellerId`, `JobPublishedCreatorConsumer` passed `EmployerId`, and
 * `HousingPublishedCreatorConsumer` passed `LandlordId`. None of the three is a
 * person. `CreatorActivityRecorder` opens a creator record for whatever id it is
 * handed, so every marketplace, job and housing publication both failed to credit
 * the member and minted a creator profile keyed to a business profile.
 *
 * **Why this probe exists rather than a unit test alone.** The unit tests in
 * `CreatorActivityAttributionTests` pin which field each consumer reads. They
 * cannot show that the publisher fills that field, that the outbox carries it,
 * or that `GET /creators/me/activity` returns the row to the right person — the
 * three places between the consumer and the member where this could still fail.
 * That is one path through four modules and only a running deployment has it.
 *
 * **Nothing here is asserted against a fabricated identifier.** A member is
 * registered and verified through the real API, then genuinely becomes a seller,
 * a landlord and an employer, publishes one of each, and asks the platform what
 * it thinks they have done.
 *
 *   node runtime-validation/e2e/probe-creator-attribution.mjs
 */
import { writeFileSync } from 'node:fs';
import { call, sql, evidence, verifiedUser, uploadDirect, recorder } from './e2e-harness.mjs';

const OUT = new URL('./results-creator-attribution.json', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '');

const results = [];
const rec = recorder(results);
const RUN = process.env.RUNTIME_RUN ?? '901';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const stamp = `CA${RUN}`;
const ok = (r) => r.status >= 200 && r.status < 300;

// The publication actions this probe drives, and the subject type each records.
const EXPECTED = [
  { action: 'listing.published', subject: 'listing', vertical: 'marketplace' },
  { action: 'housing.published', subject: 'housing', vertical: 'housing' },
  { action: 'job.published', subject: 'job', vertical: 'jobs' },
];

console.log('\n══ BG-10 · creator activity attribution ═══════════════════════════════\n');

// ═════════════════════════════════════════════════════════════════════════════
// A member, who will become a seller, a landlord and an employer
// ═════════════════════════════════════════════════════════════════════════════

const member = await verifiedUser({
  name: `Attribution Probe ${stamp}`,
  phone: ph(1),
  password: 'Yr5#dGkP7wLs',
});

const T = member.token;
rec('setup', 'a verified member exists', T ? 'PASS' : 'BLOCKED', `userId=${member.userId}`);

if (!T) {
  writeFileSync(OUT, JSON.stringify({ results, evidence }, null, 2));
  console.log('\nBLOCKED — no member, nothing below can be asked.\n');
  process.exit(1);
}

// ═════════════════════════════════════════════════════════════════════════════
// Publish one of each
// ═════════════════════════════════════════════════════════════════════════════

const published = { listingId: null, housingId: null, jobId: null };
const profiles = { sellerId: null, landlordId: null, employerId: null };

// ── Marketplace ──────────────────────────────────────────────────────────────
{
  const seller = await call('POST', '/marketplace/sellers', {
    token: T, label: 'become a seller',
    body: { displayName: `Attribution Trades ${stamp}`, kind: 'Individual', countryCode: 'NG' },
  });
  profiles.sellerId = seller.body?.data?.sellerId ?? seller.body?.data?.id ?? null;
  rec('setup', 'the member is a seller', ok(seller) ? 'PASS' : 'BLOCKED',
    `status=${seller.status} sellerId=${profiles.sellerId}`);

  if (ok(seller)) {
    const cats = await call('GET', '/marketplace/categories', { token: T, label: 'marketplace categories' });
    const flatten = (nodes, out = []) => { for (const c of nodes ?? []) { out.push(c); flatten(c.children, out); } return out; };
    const all = flatten(cats.body?.data?.items ?? cats.body?.data ?? []);
    const leaf = all.find((c) => !c.children?.length) ?? all[0];
    const media = await uploadDirect(T, { fileName: `${stamp}.png`, label: 'listing photograph' });
    const mediaId = media.body?.data?.mediaId ?? media.body?.data?.id;

    const listing = await call('POST', '/marketplace/listings', {
      token: T, label: 'create a listing',
      body: {
        title: `Attribution laptop ${stamp}`,
        description: 'Seeded by the BG-10 probe so the credit has a real subject.',
        categoryKey: leaf?.key ?? leaf?.categoryKey ?? leaf?.slug,
        countryCode: 'NG', cityName: 'Lagos', condition: 'Refurbished',
        listingType: 'Sale', price: 185000, currency: 'NGN', quantity: 1,
        isNegotiable: true, offersPickup: true, offersDelivery: false,
        offersShipping: false, isDigital: false,
        mediaIds: mediaId ? [mediaId] : undefined,
      },
    });
    published.listingId = listing.body?.data?.listingId ?? null;

    if (published.listingId) {
      const pub = await call('POST', `/marketplace/listings/${published.listingId}/publish`, {
        token: T, body: {}, label: 'publish the listing',
      });
      rec('marketplace', 'a listing is published', ok(pub) ? 'PASS' : 'FAIL',
        `status=${pub.status} listingId=${published.listingId}`);
    } else {
      rec('marketplace', 'a listing is published', 'BLOCKED', `create status=${listing.status}`);
    }
  }
}

// ── Housing ──────────────────────────────────────────────────────────────────
{
  const landlord = await call('POST', '/housing/landlords', {
    token: T, label: 'become a landlord',
    body: { displayName: `Attribution Lettings ${stamp}`, kind: 'Individual', countryCode: 'NG' },
  });
  profiles.landlordId = landlord.body?.data?.landlordId ?? landlord.body?.data?.id ?? null;
  rec('setup', 'the member is a landlord', ok(landlord) ? 'PASS' : 'BLOCKED',
    `status=${landlord.status} landlordId=${profiles.landlordId}`);

  if (ok(landlord)) {
    const types = await call('GET', '/housing/accommodation-types', { token: T, label: 'accommodation types' });
    const typeKey = (types.body?.data?.items ?? types.body?.data ?? [])[0]?.key ?? 'apartment';

    // A property with no photograph is not publishable — `HousingListing.IsPublishable`
    // requires at least one media reference, on the reasoning that a member cannot judge a
    // home they cannot see. Creating without one and calling /publish answers
    // `400 housing.listing.not-publishable`, which is the platform being right.
    const photo = await uploadDirect(T, { fileName: `${stamp}-house.png`, label: 'property photograph' });
    const photoId = photo.body?.data?.mediaId ?? photo.body?.data?.id;

    const listing = await call('POST', '/housing/listings', {
      token: T, label: 'create a property',
      body: {
        media: photoId ? [{ mediaId: photoId, role: 'Cover' }] : undefined,
        title: `Attribution flat ${stamp}`,
        summary: 'Seeded by the BG-10 probe so the credit has a real subject.',
        description: 'A two-bedroom flat seeded by the BG-10 attribution probe.',
        accommodationTypeKey: typeKey,
        countryCode: 'NG', cityName: 'Lagos',
        rentAmount: 900000, currencyCode: 'NGN', rentPeriod: 'PerMonth',
        bedrooms: 2, bathrooms: 1, totalUnits: 1,
        furnishedStatus: 'Unfurnished',
        acceptsLongStay: true, acceptsShortStay: false,
      },
    });
    published.housingId = listing.body?.data?.listingId ?? listing.body?.data?.id ?? null;

    if (published.housingId) {
      const pub = await call('POST', `/housing/listings/${published.housingId}/publish`, {
        token: T, body: {}, label: 'publish the property',
      });
      rec('housing', 'a property is published', ok(pub) ? 'PASS' : 'FAIL',
        `status=${pub.status} listingId=${published.housingId}`);
    } else {
      rec('housing', 'a property is published', 'BLOCKED', `create status=${listing.status}`);
    }
  }
}

// ── Jobs ─────────────────────────────────────────────────────────────────────
{
  const employer = await call('POST', '/jobs/employers', {
    token: T, label: 'become an employer',
    body: {
      displayName: `Attribution Works ${stamp}`,
      organizationType: 'Company',
      countryCode: 'NG',
      description: 'Seeded by the BG-10 attribution probe.',
    },
  });
  profiles.employerId = employer.body?.data?.employerId ?? employer.body?.data?.id ?? null;
  rec('setup', 'the member is an employer', ok(employer) ? 'PASS' : 'BLOCKED',
    `status=${employer.status} employerId=${profiles.employerId}`);

  if (profiles.employerId) {
    const cats = await call('GET', '/jobs/categories', { token: T, label: 'job categories' });
    const catKey = (cats.body?.data?.items ?? cats.body?.data ?? [])[0]?.key ?? 'engineering';

    const job = await call('POST', '/jobs', {
      token: T, label: 'create a vacancy',
      body: {
        employerId: profiles.employerId,
        title: `Attribution engineer ${stamp}`,
        description: 'Seeded by the BG-10 probe so the credit has a real subject.',
        categoryKey: catKey,
        jobType: 'FullTime',
        experienceLevel: 'Mid',
        countryCode: 'NG',
        cityName: 'Lagos',
        workplaceType: 'Remote',
      },
    });
    published.jobId = job.body?.data?.jobId ?? job.body?.data?.id ?? null;

    if (published.jobId) {
      const pub = await call('POST', `/jobs/${published.jobId}/publish`, {
        token: T, body: {}, label: 'publish the vacancy',
      });
      rec('jobs', 'a vacancy is published', ok(pub) ? 'PASS' : 'FAIL',
        `status=${pub.status} jobId=${published.jobId}`);
    } else {
      rec('jobs', 'a vacancy is published', 'BLOCKED', `create status=${job.status}`);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Wait for the outbox
//
// Publication is relayed through the transactional outbox, so the consumer runs
// after the producing request returned. Polling the read route is the honest
// wait: it asks the same question the member's screen asks.
// ═════════════════════════════════════════════════════════════════════════════

const deadline = Date.now() + 60_000;
let activity = null;

while (Date.now() < deadline) {
  activity = await call('GET', '/creators/me/activity?limit=50', {
    token: T, label: 'read the creator activity history',
  });
  const items = activity.body?.data?.items ?? [];
  if (EXPECTED.every((e) => items.some((i) => i.actionType === e.action))) break;
  await new Promise((r) => setTimeout(r, 2000));
}

const items = activity?.body?.data?.items ?? [];

/**
 * The member's own creator profile id, read from the database rather than inferred.
 *
 * Read *here* rather than at sign-up: `UserRegisteredCreatorConsumer` opens the record from
 * the outbox, so it does not exist the instant registration returns. Reading it too early
 * answered empty, and an empty id then made every SQL assertion below return an error string
 * — which the `!== 'NotACreator'` check read as a pass. A measurement that fails open is worse
 * than one that fails, so the id is asserted before anything is asked of it.
 */
const creatorId = sql(
  `SELECT "Id" FROM creator.creator_profiles WHERE "UserId"='${member.userId}';`
).trim();

rec('creator', 'the member has exactly one creator profile',
  /^[0-9a-f-]{36}$/i.test(creatorId) ? 'PASS' : 'FAIL', `creatorId=${creatorId || 'none'}`);

rec('creator', 'GET /creators/me/activity answers', ok(activity) ? 'PASS' : 'FAIL',
  `status=${activity?.status} items=${items.length} isCreator=${activity?.body?.data?.isCreator}`);

// ═════════════════════════════════════════════════════════════════════════════
// The three assertions BG-10 is actually about
// ═════════════════════════════════════════════════════════════════════════════

for (const expected of EXPECTED) {
  const entry = items.find((i) => i.actionType === expected.action);
  rec(expected.vertical, `a published ${expected.subject} reaches the member's own history`,
    entry ? 'PASS' : 'FAIL',
    entry
      ? `actionType=${entry.actionType} subjectType=${entry.subjectType}`
      : `absent — ${items.length} entries returned, none with actionType=${expected.action}`);
}

// ── The database half ────────────────────────────────────────────────────────
//
// The read route can only return rows keyed to the caller, so a PASS above
// already proves the key is right. These two ask the questions the route
// cannot: whether anything was *also* written against a profile id, and whether
// a phantom creator was minted alongside the correct one.

{
  const misKeyed = sql(`
    SELECT count(*) FROM creator.creator_activity_entries e
    WHERE e."UserId" IN (
      '${profiles.sellerId ?? '00000000-0000-0000-0000-000000000000'}',
      '${profiles.landlordId ?? '00000000-0000-0000-0000-000000000000'}',
      '${profiles.employerId ?? '00000000-0000-0000-0000-000000000000'}');
  `).trim();

  rec('creator', 'nothing is credited to a seller, landlord or employer profile',
    misKeyed === '0' ? 'PASS' : 'FAIL',
    `${misKeyed} entries keyed to one of this member's three business profiles`);
}

{
  const phantoms = sql(`
    SELECT count(*) FROM creator.creator_profiles c
    WHERE NOT EXISTS (SELECT 1 FROM identity.users u WHERE u."Id" = c."UserId");
  `).trim();

  rec('creator', 'no creator profile exists for a non-member',
    phantoms === '0' ? 'PASS' : 'FAIL',
    `${phantoms} creator profiles whose UserId is not a registered member`);
}

// ── The counters ─────────────────────────────────────────────────────────────
//
// The three publications are what a milestone, a leaderboard and a reward
// balance are computed from. A row in the right place that did not move the
// counters would be half a fix.

{
  const counters = sql(`
    SELECT "RecognisedActions" || '/' || "TotalContentPublished" || '/' || "WeightedContributionScore"
    FROM creator.creator_profiles WHERE "Id" = '${creatorId}';
  `).trim();

  const [actions, publications] = counters.split('/').map(Number);

  rec('creator', "the member's own counters moved",
    Number.isFinite(actions) && Number.isFinite(publications) && actions >= 3 && publications >= 3
      ? 'PASS' : 'FAIL',
    `recognisedActions/totalContentPublished/weightedScore = ${counters} (three publications expected)`);
}

{
  const status = sql(
    `SELECT "Status" FROM creator.creator_profiles WHERE "Id"='${creatorId}';`
  ).trim();

  // Whitelisted rather than `!== 'NotACreator'`: that form read a SQL error string as a pass.
  rec('creator', 'a member who published is no longer NotACreator',
    ['Contributor', 'EmergingCreator', 'EstablishedCreator', 'TopCreator', 'VerifiedCreator']
      .includes(status) ? 'PASS' : 'FAIL', `status=${status}`);
}

// ═════════════════════════════════════════════════════════════════════════════

const pass = results.filter((r) => r.verdict === 'PASS').length;
const fail = results.filter((r) => r.verdict === 'FAIL').length;
const blocked = results.filter((r) => r.verdict === 'BLOCKED').length;

console.log(`\n  ${pass} PASS · ${fail} FAIL · ${blocked} BLOCKED\n`);

writeFileSync(OUT, JSON.stringify({
  probe: 'BG-10 creator activity attribution',
  member: { userId: member.userId, creatorId },
  profiles,
  published,
  totals: { pass, fail, blocked },
  results,
  evidence,
}, null, 2));

process.exit(fail > 0 ? 1 : 0);
