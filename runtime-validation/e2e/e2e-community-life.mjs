/**
 * Events and Organizations — create → publish → second-user visibility.
 *
 * The two verticals `second-user-validation.md` recorded as UNTESTED, because
 * neither was created during the E2E completion phase. They are listed there
 * rather than assumed to behave like their neighbours, and this is the test
 * that settles them.
 */
import { writeFileSync } from 'node:fs';
import { call, sql, save, uploadDirect, verifiedUser, recorder } from './e2e-harness.mjs';

const EV = 'C:/Users/User/source/repos/Diaspora/runtime-validation/e2e/evidence-community-life.json';
const results = [];
const rec = recorder(results);
const RUN = process.env.RUNTIME_RUN ?? '500';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const stamp = `e2e${RUN}`;
const facts = {};

function finish(code = 0) {
  const c = {};
  for (const r of results) c[r.verdict] = (c[r.verdict] ?? 0) + 1;
  console.log(`\n  ${Object.entries(c).map(([k, v]) => `${v} ${k}`).join(' · ')} · ${results.length} checks\n`);
  save(EV);
  writeFileSync(EV.replace('evidence-', 'results-'), JSON.stringify({ run: RUN, stamp, facts, results }, null, 1));
  process.exit(code);
}

console.log('\n=== EVENTS AND ORGANIZATIONS: create -> visibility ===\n');

const host = await verifiedUser({ name: 'Ifeoma Balogun', phone: ph(1), password: 'Ev4#kmTr7Bx3' });
const reader = await verifiedUser({ name: 'Sipho Dlamini', phone: ph(2), password: 'Rd9#pqZv2Nk6' });
rec('setup', 'host and reader both reach the Verified rung',
  host.token && reader.token ? 'PASS' : 'FAIL', `host=${host.userId} reader=${reader.userId}`);
const H = host.token;
const R = reader.token;
if (!H || !R) finish(1);

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIZATIONS
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n-- Organizations --\n');

// One document serves both taxonomies. `/catalogue/organization-types` and
// `/catalogue/event-categories` are **PUT only** — administrative writes — and a
// GET against either answers 405. Reading them as though they were list routes
// is the same mistake the stale registers make, so the published read is used.
const catalogue = await call('GET', '/community-life/catalogue', { token: H, label: 'community-life catalogue' });
const cat = catalogue.body?.data ?? {};
const orgTypeList = cat.organizationTypes ?? [];
const orgTypeKey = orgTypeList.length ? (orgTypeList[0].key ?? orgTypeList[0].typeKey) : 'association';
rec('organizations', 'organization type taxonomy is served', catalogue.status === 200 && orgTypeList.length > 0 ? 'PASS' : 'FAIL',
  `status=${catalogue.status} keys={${Object.keys(cat).join(',')}} types=${orgTypeList.length} using=${orgTypeKey}`);

const orgCreate = await call('POST', '/community-life/organizations', {
  token: H, label: 'create organization',
  body: {
    name: `Yaba Nigerian Association ${stamp}`,
    shortName: `YNA ${stamp}`,
    summary: 'A mutual-aid association for Nigerians settling in Lagos and the diaspora returning to it.',
    description: 'We run monthly meetups, a documentation clinic and a hardship fund.',
    organizationTypeKey: orgTypeKey,
    countryCode: 'NG', regionName: 'Lagos', cityName: 'Lagos',
    mission: 'Nobody arrives alone.',
    isMembershipPublic: true,
  },
});
const orgId = orgCreate.body?.data?.organizationId ?? orgCreate.body?.data?.id;
rec('organizations', 'create organization', orgCreate.status < 400 && orgId ? 'PASS' : 'FAIL',
  `status=${orgCreate.status} id=${orgId} code=${orgCreate.body?.code ?? '-'} detail="${String(orgCreate.body?.detail ?? '').slice(0, 180)}"`);
facts.organizationId = orgId;

if (orgId) {
  const dbOrg = sql(`SELECT "Status" FROM community_life.community_life_organizations WHERE "Id"='${orgId}';`);
  rec('organizations', 'create lands the organization in Draft, not a visible state',
    /draft/i.test(dbOrg) ? 'PASS' : 'INFO', `db Status=${dbOrg}`);

  // The same two-step every other vertical uses, and the reason the first run
  // of this journey found the organization invisible and the event refused with
  // `community-life.organization.suspended` — a Draft organization cannot host.
  const orgPub = await call('POST', `/community-life/organizations/${orgId}/publish`, {
    token: H, label: 'publish organization', body: {},
  });
  rec('organizations', 'publish', orgPub.status < 400 ? 'PASS' : 'FAIL',
    `status=${orgPub.status} code=${orgPub.body?.code ?? '-'} detail="${String(orgPub.body?.detail ?? '').slice(0, 180)}"`);

  const dbOrgAfter = sql(`SELECT "Status" FROM community_life.community_life_organizations WHERE "Id"='${orgId}';`);
  rec('organizations', 'publication is a real state transition in PostgreSQL',
    /active|published|open/i.test(dbOrgAfter) ? 'PASS' : 'FAIL', `db Status=${dbOrgAfter}`);

  const orgRead = await call('GET', `/community-life/organizations/${orgId}`, { token: R, label: 'reader opens the organization' });
  rec('organizations', 'a second account can open the organization',
    orgRead.status === 200 ? 'PASS' : 'FAIL',
    `status=${orgRead.status} name="${String(orgRead.body?.data?.name ?? '').slice(0, 44)}"`);

  const orgSearch = await call('GET', `/community-life/organizations?q=${encodeURIComponent(stamp)}&countryCode=NG&limit=25`, {
    token: R, label: 'reader searches organizations',
  });
  const od = orgSearch.body?.data ?? {};
  const oItems = od.items ?? [];
  rec('organizations', 'a second account finds the organization by search',
    oItems.some((i) => (i.organizationId ?? i.id) === orgId) ? 'PASS' : 'FAIL',
    `status=${orgSearch.status} items=${oItems.length} envelope={${Object.keys(od).join(',')}}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n-- Events --\n');

const evCatList = cat.eventCategories ?? [];
const evCatKey = evCatList.length ? (evCatList[0].key ?? evCatList[0].categoryKey) : 'community';
rec('events', 'event category taxonomy is served', evCatList.length > 0 ? 'PASS' : 'FAIL',
  `from the same catalogue document — categories=${evCatList.length} using=${evCatKey}`);

const evMedia = await uploadDirect(H, { fileName: `${stamp}-event.png`, label: 'upload event photograph' });
const evMediaId = evMedia.body?.data?.mediaId ?? evMedia.body?.data?.id;
rec('events', 'event photograph uploads', evMedia.status < 400 && evMediaId ? 'PASS' : 'FAIL',
  `status=${evMedia.status} mediaId=${evMediaId}`);

const starts = new Date(Date.now() + 14 * 86400000);
const ends = new Date(starts.getTime() + 3 * 3600000);

const evCreate = await call('POST', '/community-life/events', {
  token: H, label: 'create event',
  body: {
    title: `Documentation clinic at Yaba ${stamp}`,
    summary: 'Bring your paperwork; volunteers will help you work out what is missing before you queue.',
    description: 'Two hours of one-to-one help with birth registration, NIN enrolment and passport renewal.',
    categoryKey: evCatKey,
    organizationId: orgId ?? undefined,
    startsAt: starts.toISOString(),
    endsAt: ends.toISOString(),
    timeZoneId: 'Africa/Lagos',
    attendanceMode: 'InPerson',
    // `community-life.venue.required` — "An event people attend in person needs
    // somewhere to be." A sound rule, and the message names it precisely.
    venue: {
      name: 'Yaba Community Hall',
      addressLine1: '14 Herbert Macaulay Way',
      landmark: 'Opposite the Yaba bus stop',
    },
    countryCode: 'NG', regionName: 'Lagos', cityName: 'Lagos',
    capacity: 40, requiresRsvp: true, isFamilyFriendly: true, isFree: true,
    media: evMediaId ? [{ mediaId: evMediaId, role: 'Cover', order: 0 }] : undefined,
  },
});
const eventId = evCreate.body?.data?.eventId ?? evCreate.body?.data?.id;
rec('events', 'create event', evCreate.status < 400 && eventId ? 'PASS' : 'FAIL',
  `status=${evCreate.status} id=${eventId} code=${evCreate.body?.code ?? '-'} detail="${String(evCreate.body?.detail ?? '').slice(0, 180)}"`);
facts.eventId = eventId;

if (eventId) {
  const dbEvent = sql(`SELECT "Status" FROM community_life.community_life_events WHERE "Id"='${eventId}';`);
  rec('events', 'event is persisted', dbEvent.length > 0 && !dbEvent.startsWith('SQL_ERROR') ? 'PASS' : 'INFO', `db Status=${dbEvent}`);

  // Publication, if the vertical has a separate step. Recorded either way —
  // three verticals in the previous phase turned out to differ from their
  // neighbours in exactly this, so it is asked rather than assumed.
  const evPub = await call('POST', `/community-life/events/${eventId}/publish`, { token: H, label: 'publish event', body: {} });
  rec('events', 'publish', evPub.status < 400 ? 'PASS' : evPub.status === 404 || evPub.status === 405 ? 'INFO' : 'FAIL',
    `status=${evPub.status} code=${evPub.body?.code ?? '-'} — ${evPub.status === 404 || evPub.status === 405 ? 'no separate publish step on this vertical' : 'published'}`);

  const dbAfter = sql(`SELECT "Status" FROM community_life.community_life_events WHERE "Id"='${eventId}';`);
  rec('events', 'the event reaches a visible state', /published|scheduled|active|open/i.test(dbAfter) ? 'PASS' : 'INFO', `db Status=${dbAfter}`);

  const evRead = await call('GET', `/community-life/events/${eventId}`, { token: R, label: 'reader opens the event' });
  const evMediaBack = evRead.body?.data?.media ?? [];
  rec('events', 'a second account can open the event',
    evRead.status === 200 ? 'PASS' : 'FAIL',
    `status=${evRead.status} title="${String(evRead.body?.data?.title ?? '').slice(0, 40)}" media=${evMediaBack.length}`);

  const evSearch = await call('GET', `/community-life/events?q=${encodeURIComponent(stamp)}&countryCode=NG&limit=25`, {
    token: R, label: 'reader searches events',
  });
  const ed = evSearch.body?.data ?? {};
  const eItems = ed.items ?? [];
  rec('events', 'a second account finds the event by search',
    eItems.some((i) => (i.eventId ?? i.id) === eventId) ? 'PASS' : 'FAIL',
    `status=${evSearch.status} items=${eItems.length} envelope={${Object.keys(ed).join(',')}}`);

  // The country-scope check DEFECT-010 was about, applied to the two verticals
  // the earlier probe could not test because neither had any data.
  const bare = await call('GET', '/community-life/events?limit=50', { token: R, label: 'events unscoped' });
  const scoped = await call('GET', '/community-life/events?countryCode=NG&limit=50', { token: R, label: 'events scoped to NG' });
  // Counted from the items rather than `totalCount`: these routes return a null
  // total for an unfiltered query, and comparing nulls would answer nothing.
  const bareN = (bare.body?.data?.items ?? []).length;
  const scopedN = (scoped.body?.data?.items ?? []).length;
  rec('events', 'DEFECT-010 check: a country-scoped event search does not lose the event',
    scopedN > 0 && scopedN >= bareN ? 'PASS' : scopedN > 0 ? 'PARTIAL' : 'FAIL',
    `unscoped items=${bareN} scopedNG items=${scopedN}`);
}

if (orgId) {
  const bare = await call('GET', '/community-life/organizations?limit=50', { token: R, label: 'organizations unscoped' });
  const scoped = await call('GET', '/community-life/organizations?countryCode=NG&limit=50', { token: R, label: 'organizations scoped to NG' });
  const bareN = (bare.body?.data?.items ?? []).length;
  const scopedN = (scoped.body?.data?.items ?? []).length;
  rec('organizations', 'DEFECT-010 check: a country-scoped organization search does not lose the organization',
    scopedN > 0 && scopedN >= bareN ? 'PASS' : scopedN > 0 ? 'PARTIAL' : 'FAIL',
    `unscoped items=${bareN} scopedNG items=${scopedN}`);
}

finish(0);
