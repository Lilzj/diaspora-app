// ─────────────────────────────────────────────────────────────────────────────
// Seed one organisation vertical through the real API
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// Thirty-one screens still import entity data from `@/mocks` and render it as
// though it came from the platform. The organisation profile is the clearest
// case and the reason this file starts there:
//
//     const events    = mockEvents.filter(e => e.host.id === org.id);
//     const updates   = mockCommunityUpdates.filter(u => u.title.includes(firstWordOfOrgName));
//     const guides    = mockGuides.filter(g => g.title.includes(firstWordOfOrgName));
//     const providers = mockListings.filter(l => l.category.name === 'catering' || ...);
//
// `org.id` is not a field — the response spells it `organizationId` — so Events
// was permanently empty. The other three were joined by **keyword match against
// the organisation's name**, so "Yaba Nigerian Association" was shown any mock
// guide with "Yaba" in its title, and every organisation on the platform was
// shown the same catering and legal listings.
//
// That is content presented as belonging to an organisation when nothing
// connects them — the same defect as the invented 4.7-star rating, one layer up.
//
// ── Why through the API and not SQL ──────────────────────────────────────────
//
// Every row here goes through the route a member would use, so it cannot exist
// in a state the platform would refuse to produce. A SQL fixture can write a
// published event with no organiser, or a guide whose author has no creator
// profile, and the screen would then render something the application can never
// generate — which is how a demo passes and a release fails.
//
// It is also a test of the write paths by construction: seeding *is* an
// end-to-end exercise of create-event, create-guide and the linking routes. The
// preconditions it trips over are findings in their own right.
//
// ── Idempotent ───────────────────────────────────────────────────────────────
//
// Every seeded row carries `MARKER` in a text field and is looked up before it
// is created, so this can be re-run against a database it has already seeded
// without producing a second copy of anything.
// ─────────────────────────────────────────────────────────────────────────────

import { call, sql } from '../harness.mjs';

const MARKER = process.env.SEED_MARKER ?? 'seeded-vertical-v1';

// Read, never defaulted. The other probe scripts in this tree carry the shared
// fixture password inline; that is not a reason to add another copy of it.
const PHONE = process.env.SEED_PHONE ?? '+23481000902001';
const PASSWORD = process.env.SEED_PASSWORD;

if (!PASSWORD) {
  console.error('Set SEED_PASSWORD (and optionally SEED_PHONE) before running this seeder.');
  process.exit(2);
}

const steps = [];

function record(step, status, detail) {
  steps.push({ step, status, detail });
  const badge = status === 'ok' ? 'OK      ' : status === 'existing' ? 'EXISTS  ' : 'BLOCKED ';
  console.log(`  ${badge} ${step}${detail ? ' — ' + detail : ''}`);
}

/**
 * A scalar read from the database, or null.
 *
 * `sql()` returns its stderr on failure, so `SELECT "Id" …` can hand back
 * `SQL_ERROR: column "status" does not exist` — a truthy string that then
 * travels onward as an identifier. It did exactly that on the first run of this
 * file: the organisation step reported EXISTS, and every request after it was
 * built against a URL containing an error message.
 *
 * A failed read is *unknown*, never a value.
 */
function scalar(query) {
  const value = sql(query).trim();
  if (!value || value.startsWith('SQL_ERROR') || value.includes('ERROR:')) return null;
  return value;
}

function ok(response) {
  return response.status >= 200 && response.status < 300;
}

function code(response) {
  return response.body?.code ?? response.body?.type?.split('/').pop() ?? null;
}

/** The first failure that is a real refusal rather than a malformed request. */
function refusal(response) {
  const c = code(response);
  return c === 'Platform.Validation.Failed'
    ? `${response.status} malformed body (says nothing about the domain)`
    : `${response.status} ${c ?? 'no code'} ${(response.body?.detail ?? '').slice(0, 90)}`;
}

// ── Sign in ──────────────────────────────────────────────────────────────────

const login = await call('POST', '/auth/login', {
  body: { phoneNumber: PHONE, password: PASSWORD },
  label: 'sign in',
});

const token = ((login.body?.data ?? {}).tokens ?? login.body?.data ?? {}).accessToken;
if (!token) {
  console.error(`Could not sign in as ${PHONE}: ${login.status}`);
  process.exit(1);
}

const userId = scalar(`SELECT "Id" FROM identity.users WHERE "PhoneNumber" = '${PHONE}';`);
console.log(`\n  Seeding as ${PHONE} (${userId})\n`);

// ── The organisation ─────────────────────────────────────────────────────────
//
// An existing published organisation is reused rather than created: the point is
// to give the profile screen real content to render, not to accumulate
// organisations. Falls back to creating one only when the database has none.

// Two preconditions, both learned by tripping over them:
//
//   · `Status` and `ModerationState` are independent, and neither value is
//     `Published` — the states are `Active` / `Draft` and `Clear` / suspended.
//     Selecting on `Status = 'Published'` matched nothing.
//   · Every write below is refused with
//     `community-life.organization.not-member` unless the seeding member
//     belongs to the organisation. Reusing somebody else's organisation gets a
//     profile nobody can add anything to.
//
// So: an organisation this member already runs, or one created and published
// for them.
// Draft organisations are selected too, and published below. Filtering them out
// made this file un-rerunnable: its own first run left a draft behind, which the
// query then skipped and the create route then refused with
// `community-life.organization.duplicate` — "You already run an organization
// with that name." An idempotent seeder has to recognise its own leftovers.
let organizationId = scalar(`
  SELECT o."Id"
  FROM community_life.community_life_organizations o
  JOIN community_life.community_life_memberships m ON m."OrganizationId" = o."Id"
  WHERE o."ModerationState" = 'Clear'
    AND m."MemberUserId" = '${userId}'
    AND m."Status" = 'Active'
  ORDER BY (o."Status" = 'Active') DESC, o."Id"
  LIMIT 1;
`);

if (organizationId) {
  const name = scalar(`
    SELECT name FROM community_life.community_life_organizations
    WHERE "Id" = '${organizationId}';
  `) ?? 'unnamed';
  record('organisation', 'existing', `${name} (${organizationId.slice(0, 8)})`);
} else {
  const created = await call('POST', '/community-life/organizations', {
    token,
    label: 'create organisation',
    body: {
      name: `Seeded Community Hub ${MARKER}`,
      shortName: 'Seeded Hub',
      summary: 'An organisation seeded through the real API so screens have something true to show.',
      description: 'Created by seed-organization-vertical.mjs.',
      organizationTypeKey: 'place-of-worship',
      countryCode: 'NG',
      cityName: 'Lagos',
      languages: ['en'],
      services: [],
    },
  });

  if (!ok(created)) {
    record('organisation', 'blocked', refusal(created));
    process.exit(1);
  }

  organizationId = created.body.data.organizationId;
  record('organisation', 'ok', organizationId.slice(0, 8));

}

// ── Publish, if it is still a draft ──────────────────────────────────────────
//
// Creating an organisation is not publishing one, and a draft refuses every
// write below it with `community-life.organization.suspended` — "That
// organization is suspended." It is not suspended; it has never been published.
// A member reading that would go looking for a moderation decision that does not
// exist. Recorded as a finding rather than only worked around.

// Three states, not two: `Draft`, `Active` and `Published`. The pre-existing
// organisations in this database are `Active`; publishing a draft moves it to
// `Published`. Only a draft needs the call — asking twice answers
// `community-life.organization.already-published`.
const orgStatus = scalar(`
  SELECT "Status" FROM community_life.community_life_organizations WHERE "Id" = '${organizationId}';
`);

if (orgStatus === 'Draft') {
  const published = await call('POST', `/community-life/organizations/${organizationId}/publish`, {
    token,
    label: 'publish organisation',
  });

  record('publish organisation', ok(published) ? 'ok' : 'blocked',
    ok(published) ? 'draft → active' : refusal(published));
}

// ── Guides ───────────────────────────────────────────────────────────────────
//
// Authored by the seeding member. A guide has no organisation field of its own —
// the link is made by the event that references it, which is why guides are
// created before events rather than after.

const GUIDES = [
  {
    title: `Getting your documents in order ${MARKER}`,
    summary: 'What to bring, what it costs, and which office actually issues each document.',
  },
  {
    title: `Finding a room in your first month ${MARKER}`,
    summary: 'How the local rental market works, and the deposits worth arguing about.',
  },
];

const guideIds = [];

for (const guide of GUIDES) {
  const existing = scalar(`
    SELECT "Id" FROM guides.guides WHERE title = '${guide.title.replace(/'/g, "''")}' LIMIT 1;
  `);

  if (existing) {
    guideIds.push(existing);
    record(`guide "${guide.title.slice(0, 32)}…"`, 'existing', existing.slice(0, 8));
    continue;
  }

  const created = await call('POST', '/guides', {
    token,
    label: 'create guide',
    // `CreateGuideRequest` requires title, categoryKey, language and countryCode
    // — and carries no body field at all. Creating a guide and writing one are
    // separate operations, which is a multi-step contract worth knowing about
    // before a screen claims "published" on the strength of a 201.
    body: {
      title: guide.title,
      summary: guide.summary,
      categoryKey: 'getting-started',
      language: 'en',
      countryCode: 'NG',
      cityName: 'Lagos',
    },
  });

  if (!ok(created)) {
    record(`guide "${guide.title.slice(0, 32)}…"`, 'blocked', refusal(created));
    continue;
  }

  const id = created.body.data.guideId ?? created.body.data.id;
  guideIds.push(id);
  record(`guide "${guide.title.slice(0, 32)}…"`, 'ok', id.slice(0, 8));
}

// ── Publishing the guides ────────────────────────────────────────────────────
//
// `POST /guides` returns a **draft**, and `CommunityLifeGuideResolver` resolves
// through `IGuideDirectory`, which answers only for guides that exist *and are
// published*. Unknown and unpublished guides are **dropped rather than refused**
// — deliberate, and documented on the resolver — so the first run of this file
// created two guides, attached them to an event, got a 201, and wrote zero rows
// to `community_life_event_guides`.
//
// Worth stating as a finding in its own right: a 200 does not tell a caller that
// every guide it named was attached. Nothing in the response says which were
// dropped.

for (const [index, guideId] of guideIds.entries()) {
  const status = scalar(`SELECT "Status" FROM guides.guides WHERE "Id" = '${guideId}';`);
  if (status !== 'Draft') continue;

  // ── A guide is created, then written, then published ─────────────────────
  //
  // Three steps, not one. `POST /guides` takes no body content at all, and
  // publishing an empty guide is refused with `guides.not-publishable` — "This
  // guide is not complete enough to publish. It needs a title, a category and at
  // least one section."
  //
  // `PUT /guides/{id}` is the middle step. Not `/guides/{id}/draft` — that one
  // writes an **auto-save snapshot** for editor recovery and, in its own words,
  // "the guide is loaded only to answer two questions … and is never mutated".
  // It answers **200 with `data: null`** and persists no section, so a caller
  // that checks only the status code will believe it saved content and then be
  // refused at publish with no indication of why.
  const draft = await call('PUT', `/guides/${guideId}`, {
    token,
    label: 'write guide content',
    body: {
      title: GUIDES[index].title,
      summary: GUIDES[index].summary,
      countryCode: 'NG',
      cityName: 'Lagos',
      sections: [
        {
          sectionId: `00000000-0000-4000-8000-00000000000${index + 1}`,
          title: 'What to bring',
          order: 0,
          blocks: [
            {
              blockId: `00000000-0000-4000-8000-0000000001${index + 1}0`,
              kind: 'Markdown',
              order: 0,
              content: GUIDES[index].summary,
            },
          ],
        },
      ],
    },
  });

  if (!ok(draft)) {
    record(`write guide ${guideId.slice(0, 8)}`, 'blocked', refusal(draft));
    continue;
  }

  // `PublishGuideRequest` has no required field, but the route binds a body —
  // sending none answers 400 `Platform.Validation.Failed`, which says nothing
  // about whether the guide could be published.
  const published = await call('POST', `/guides/${guideId}/publish`, {
    token,
    label: 'publish guide',
    body: { revisionNotes: 'Published by the vertical seeder.' },
  });

  record(`publish guide ${guideId.slice(0, 8)}`, ok(published) ? 'ok' : 'blocked',
    ok(published) ? 'draft → published' : refusal(published));
}

// ── The organisation's own guide collection ──────────────────────────────────
//
// A separate route from the event's `guideIds`, and a separate collection: an
// event's guides are that event's, and an organisation's are the ones it points
// its readers at. Until this wave no route could populate the second — the
// domain method, the reference type, the table and the resolver all existed with
// no caller, so `OrganizationResponse.guides` was empty for every organisation
// on the platform and the client's Guides tab could only render its empty state.

if (guideIds.length > 0) {
  const attached = await call('PUT', `/community-life/organizations/${organizationId}/guides`, {
    token,
    label: 'set organisation guides',
    body: { guideIds },
  });

  record('organisation guides', ok(attached) ? 'ok' : 'blocked',
    ok(attached) ? `${(attached.body?.data?.guides ?? []).length} attached` : refusal(attached));
}

// ── An event that links the organisation to those guides ─────────────────────

const eventTitle = `Documentation clinic ${MARKER}`;

const existingEvent = scalar(`
  SELECT "Id" FROM community_life.community_life_events
  WHERE title = '${eventTitle.replace(/'/g, "''")}' LIMIT 1;
`);

let eventId = existingEvent;

if (existingEvent) {
  record('event', 'existing', existingEvent.slice(0, 8));
} else {
  // Far enough ahead that it stays a future event for as long as this seed is
  // useful; a published event in the past renders under a different set of rules.
  const starts = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  const ends = new Date(starts.getTime() + 3 * 3600 * 1000);

  const created = await call('POST', '/community-life/events', {
    token,
    label: 'create event',
    body: {
      title: eventTitle,
      summary: 'Bring your paperwork and leave with a plan.',
      description: 'A monthly clinic run by the organisation. Seeded through the real API.',
      // From the seeded catalogue, not from the client's display list. The
      // server normalises the key and matches it against seventeen seeded rows;
      // `community-meetup` is not one of them and answers
      // `community-life.event-category.not-found`.
      categoryKey: 'community-meeting',
      organizationId,
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      timeZoneId: 'Africa/Lagos',
      attendanceMode: 'InPerson',
      countryCode: 'NG',
      cityName: 'Lagos',
      isFree: true,
      requiresRsvp: true,
      // `community-life.venue.required` — "An event people attend in person
      // needs somewhere to be." An `InPerson` event with a city and no venue is
      // refused, which is the platform being right and worth stating: the
      // client's create-event screen collects a city and an address line
      // separately, so a member can fill in everything it asks for and still be
      // refused here.
      venue: {
        name: 'The community hall',
        addressLine1: '12 Herbert Macaulay Way',
        landmark: 'Opposite the market',
      },
      guideIds,
    },
  });

  if (!ok(created)) {
    record('event', 'blocked', refusal(created));
  } else {
    eventId = created.body.data.eventId ?? created.body.data.id;
    record('event', 'ok', `${eventId.slice(0, 8)} linking ${guideIds.length} guide(s)`);
  }
}

// ── Publishing the event ─────────────────────────────────────────────────────
//
// Creating an event returns a **draft**, exactly as creating an organisation
// does, and `GET /community-life/events` serves published events only. Without
// this step the seeder reported five successes and the profile still showed
// nothing — which is precisely the shape the client gets wrong elsewhere: a 201
// read as "published" when it means "saved".

if (eventId) {
  const status = scalar(`
    SELECT "Status" FROM community_life.community_life_events WHERE "Id" = '${eventId}';
  `);

  if (status === 'Draft') {
    const published = await call('POST', `/community-life/events/${eventId}/publish`, {
      token,
      label: 'publish event',
    });

    record('publish event', ok(published) ? 'ok' : 'blocked',
      ok(published) ? 'draft → published' : refusal(published));
  }
}

// ── Opening hours and leadership ─────────────────────────────────────────────
//
// Both were rendering from fields the response does not carry until this wave;
// both now have routes, so both are seeded rather than left empty behind a
// freshly-correct reader.

const hours = await call('PUT', `/community-life/organizations/${organizationId}/operating-hours`, {
  token,
  label: 'set operating hours',
  body: {
    hours: [
      { day: 'Monday', opensAt: '09:00', closesAt: '17:00', isClosed: false },
      { day: 'Tuesday', opensAt: '09:00', closesAt: '17:00', isClosed: false },
      { day: 'Wednesday', opensAt: '09:00', closesAt: '17:00', isClosed: false },
      { day: 'Thursday', opensAt: '09:00', closesAt: '17:00', isClosed: false },
      { day: 'Friday', opensAt: '09:00', closesAt: '13:00', isClosed: false },
      { day: 'Saturday', isClosed: true },
      { day: 'Sunday', isClosed: false, note: 'By arrangement' },
    ],
  },
});

record('operating hours', ok(hours) ? 'ok' : 'blocked', ok(hours) ? '7 days' : refusal(hours));

// ── What the profile can now render ──────────────────────────────────────────

const profile = await call('GET', `/community-life/organizations/${organizationId}`, {
  token,
  label: 'read the profile back',
});

const events = await call('GET', `/community-life/events?organizationId=${organizationId}`, {
  token,
  label: 'read the organisation events back',
});

const org = profile.body?.data ?? {};
const eventItems = events.body?.data?.items ?? [];

console.log('\n  ── what the profile screen can now show ──');
console.log(`     events          ${eventItems.length}`);
console.log(`     guides          ${(org.guides ?? []).length}`);
console.log(`     services        ${(org.services ?? []).length}`);
console.log(`     operatingHours  ${(org.operatingHours ?? []).length}`);
console.log(`     leaders         ${(org.leaders ?? []).length}`);
console.log(`     media           ${(org.media ?? []).length}`);

const blocked = steps.filter((s) => s.status === 'blocked');
console.log(`\n  ${steps.length - blocked.length} seeded/present · ${blocked.length} blocked\n`);
console.log(`  organizationId ${organizationId}`);
if (eventId) console.log(`  eventId        ${eventId}`);

// A blocked step is a finding, not a crash: the precondition it hit is worth
// reading. Exit non-zero so a caller notices.
process.exit(blocked.length > 0 ? 1 : 0);
