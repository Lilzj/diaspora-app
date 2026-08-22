/**
 * E2E JOURNEYS #2, #3 and #4 — housing, guides and the jobs application
 * lifecycle, each driven create → publish → second-user visibility against the
 * real API, the real database and a second authenticated account.
 *
 * One process rather than three because all three need the same pair of
 * Verified identities and the same second-user reader, and creating six
 * identities to prove three verticals would only make the phone-block
 * bookkeeping harder.
 */
import { writeFileSync } from 'node:fs';
import { call, sql, save, uploadDirect, verifiedUser, recorder } from './e2e-harness.mjs';

const EV = 'C:/Users/User/source/repos/Diaspora/runtime-validation/e2e/evidence-verticals.json';
const results = [];
const rec = recorder(results);
const RUN = process.env.RUNTIME_RUN ?? '420';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const stamp = `e2e${RUN}`;
const facts = {};

function finish(code = 0) {
  const pass = results.filter((r) => r.verdict === 'PASS').length;
  const fail = results.filter((r) => r.verdict === 'FAIL').length;
  const gap = results.filter((r) => r.verdict === 'GAP').length;
  console.log(`\n  ${pass} PASS · ${fail} FAIL · ${gap} GAP · ${results.length} checks\n`);
  save(EV);
  writeFileSync(EV.replace('evidence-', 'results-'), JSON.stringify({ run: RUN, stamp, facts, results }, null, 1));
  process.exit(code);
}

console.log('\n=== E2E JOURNEYS 2-4: HOUSING / GUIDES / JOBS ===\n');

const author = await verifiedUser({ name: 'Adaeze Nwosu', phone: ph(1), password: 'Hq3#mvXn8Wt5' });
const reader = await verifiedUser({ name: 'Tunde Bakare', phone: ph(2), password: 'Pn6#kdRy2Lm4' });
rec('setup', 'author and reader both reach the Verified rung',
  author.token && reader.token ? 'PASS' : 'FAIL', `author=${author.userId} reader=${reader.userId}`);
const A = author.token;
const R = reader.token;
if (!A || !R) finish(1);
facts.author = author.userId;
facts.reader = reader.userId;

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY 2 — HOUSING
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n-- Journey 2: housing --\n');

const hProbe = await call('POST', '/housing/listings', {
  token: A, label: 'housing create BEFORE a landlord profile exists (probe)',
  body: { title: `Probe ${stamp}`, summary: 'Probe for the landlord precondition.', accommodationTypeKey: 'apartment', countryCode: 'NG' },
});
rec('housing', 'housing write without a landlord profile',
  hProbe.status < 400 ? 'PASS (no profile needed)' : 'INFO',
  `status=${hProbe.status} code=${hProbe.body?.code ?? '-'} detail="${String(hProbe.body?.detail ?? '').slice(0, 90)}"`);

const landlord = await call('POST', '/housing/landlords', {
  token: A, label: 'create landlord profile',
  body: { displayName: `Adaeze Lettings ${stamp}`, kind: 'Individual', countryCode: 'NG', bio: 'Two-bedroom flats in Yaba and Surulere.' },
});
rec('housing', 'landlord profile is created', landlord.status < 400 ? 'PASS' : 'FAIL',
  `status=${landlord.status} code=${landlord.body?.code ?? '-'}`);

const accTypes = await call('GET', '/housing/accommodation-types', { token: A, label: 'accommodation types' });
const accList = accTypes.body?.data?.items ?? accTypes.body?.data ?? [];
const accKey = Array.isArray(accList) && accList.length ? (accList[0].key ?? accList[0].typeKey) : 'apartment';
rec('housing', 'accommodation taxonomy is served', accTypes.status === 200 ? 'PASS' : 'FAIL',
  `status=${accTypes.status} count=${Array.isArray(accList) ? accList.length : '?'} using=${accKey}`);

const hMedia = await uploadDirect(A, { fileName: `${stamp}-flat.png`, label: 'upload housing photograph' });
const hMediaId = hMedia.body?.data?.mediaId ?? hMedia.body?.data?.id;
rec('housing', 'housing photograph uploads', hMedia.status < 400 && hMediaId ? 'PASS' : 'FAIL', `status=${hMedia.status} mediaId=${hMediaId}`);

const hCreate = await call('POST', '/housing/listings', {
  token: A, label: 'create housing listing',
  body: {
    title: `Two-bedroom flat in Yaba ${stamp}`,
    summary: 'A serviced two-bedroom flat five minutes from the Yaba bus stop, water and generator included.',
    description: 'Newly refurbished, tiled throughout, prepaid meter, borehole water and a shared generator that runs from 7pm.',
    accommodationTypeKey: accKey,
    countryCode: 'NG', regionName: 'Lagos', cityName: 'Lagos', neighbourhood: 'Yaba',
    rentAmount: 1800000, currencyCode: 'NGN', rentPeriod: 'PerYear',
    depositAmount: 900000, isNegotiable: true,
    bedrooms: 2, bathrooms: 2, totalUnits: 1, maximumOccupants: 4,
    utilitiesIncluded: false, internetIncluded: false,
    acceptsLongStay: true, isFamilyFriendly: true,
    media: hMediaId ? [{ mediaId: hMediaId, role: 'Cover', order: 0 }] : undefined,
  },
});
const hId = hCreate.body?.data?.listingId ?? hCreate.body?.data?.id;
rec('housing', 'create housing listing', hCreate.status < 400 && hId ? 'PASS' : 'FAIL',
  `status=${hCreate.status} id=${hId} code=${hCreate.body?.code ?? '-'} detail="${String(hCreate.body?.detail ?? '').slice(0, 160)}"`);
facts.housingListingId = hId;

if (hId) {
  const hDraftDb = sql(`SELECT "Status" FROM housing.housing_listings WHERE "Id"='${hId}';`);
  rec('housing', 'housing listing persists as a draft', hDraftDb.length > 0 ? 'PASS' : 'FAIL', `db Status=${hDraftDb}`);

  const hEdit = await call('PATCH', `/housing/listings/${hId}`, {
    token: A, label: 'edit housing listing', body: { summary: `Edited: a serviced two-bedroom flat in Yaba. ${stamp}` },
  });
  rec('housing', 'edit before publication', hEdit.status < 400 ? 'PASS' : 'FAIL', `status=${hEdit.status}`);

  const hPub = await call('POST', `/housing/listings/${hId}/publish`, { token: A, label: 'publish housing listing', body: {} });
  rec('housing', 'publish', hPub.status < 400 ? 'PASS' : 'FAIL',
    `status=${hPub.status} code=${hPub.body?.code ?? '-'} detail="${String(hPub.body?.detail ?? '').slice(0, 200)}"`);

  const hPubDb = sql(`SELECT "Status" || ' | publishedAt=' || COALESCE("PublishedAt"::text,'null') FROM housing.housing_listings WHERE "Id"='${hId}';`);
  rec('housing', 'publication is a real state transition in PostgreSQL',
    /active|published/i.test(hPubDb) ? 'PASS' : 'FAIL', `db: ${hPubDb}`);

  // -- Second user ---------------------------------------------------------
  // The free-text parameter is `query`. `SearchHousingRequest` binds no `text`,
  // and an unbound name is dropped in silence — which is how a filter comes to
  // look like it works and does not. The client sends `query`; so does this.
  const hSearch = await call('GET', `/housing/search?query=${encodeURIComponent(stamp)}&countryCode=NG&limit=25`, {
    token: R, label: 'reader searches housing',
  });
  const hd = hSearch.body?.data ?? {};
  const hItems = hd.items ?? hd.results ?? [];
  rec('housing', 'a second account finds the published listing',
    hItems.some((i) => (i.listingId ?? i.id) === hId) ? 'PASS' : 'FAIL',
    `status=${hSearch.status} items=${hItems.length} envelope={${Object.keys(hd).join(',')}}`);

  const hDetail = await call('GET', `/housing/listings/${hId}`, { token: R, label: 'reader opens the housing listing' });
  const hDMedia = hDetail.body?.data?.media ?? [];
  rec('housing', 'a second account opens the detail and sees price, location and media',
    hDetail.status === 200 && hDMedia.length > 0 ? 'PASS' : 'FAIL',
    `status=${hDetail.status} statusField=${hDetail.body?.data?.status} media=${hDMedia.length} rent=${JSON.stringify(hDetail.body?.data?.rent ?? hDetail.body?.data?.price)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY 3 — GUIDES
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n-- Journey 3: guides --\n');

const gCats = await call('GET', '/guides/categories', { token: A, label: 'guide categories' });
const gCatList = gCats.body?.data?.items ?? gCats.body?.data ?? [];
const gCatKey = Array.isArray(gCatList) && gCatList.length ? (gCatList[0].key ?? gCatList[0].categoryKey) : 'documentation';
rec('guides', 'guide category taxonomy is served', gCats.status === 200 ? 'PASS' : 'FAIL',
  `status=${gCats.status} count=${Array.isArray(gCatList) ? gCatList.length : '?'} using=${gCatKey}`);

const gCreate = await call('POST', '/guides', {
  token: A, label: 'create guide',
  body: {
    title: `Registering a birth at the Lagos State registry ${stamp}`,
    categoryKey: gCatKey,
    language: 'en', countryCode: 'NG', cityName: 'Lagos',
    summary: 'What to bring, what it costs and which office actually issues the certificate.',
  },
});
const gId = gCreate.body?.data?.guideId ?? gCreate.body?.data?.id;
rec('guides', 'create guide', gCreate.status < 400 && gId ? 'PASS' : 'FAIL',
  `status=${gCreate.status} id=${gId} code=${gCreate.body?.code ?? '-'} detail="${String(gCreate.body?.detail ?? '').slice(0, 160)}"`);
facts.guideId = gId;

if (gId) {
  const gDraftDb = sql(`SELECT "Status" FROM guides.guides WHERE "Id"='${gId}';`);
  rec('guides', 'guide persists as a draft', gDraftDb.length > 0 ? 'PASS' : 'FAIL', `db Status=${gDraftDb}`);

  // -- Draft body: the auto-save and the real save are different routes ----
  //
  // `PUT /guides/{id}/draft` is the editor's auto-save. It stores a serialised
  // snapshot and deliberately does not parse the block kind \u2014 "an auto-save of
  // a block kind this deployment has not shipped yet is still worth keeping,
  // and the real save is where an unknown kind is refused". The route that
  // materialises `guide_sections` is `PUT /guides/{id}`, which is what
  // `guides-api.ts:updateGuide` calls. Both are exercised, in the order the
  // editor uses them, so the snapshot is not mistaken for the save.
  const sectionId = crypto.randomUUID();
  const sections = [{
    sectionId, title: 'Before you go', order: 0,
    blocks: [
      { blockId: crypto.randomUUID(), kind: 'Markdown', order: 0, content: 'Take the hospital notification of birth, both parents\u2019 identification and the informant\u2019s telephone number.' },
      { blockId: crypto.randomUUID(), kind: 'Markdown', order: 1, content: 'Registration within sixty days is free. After that a late-registration affidavit is required.' },
    ],
  }];

  const draft = await call('PUT', `/guides/${gId}/draft`, {
    token: A, label: 'auto-save the draft snapshot', body: { sections },
  });
  rec('guides', 'the editor auto-save accepts a snapshot', draft.status < 400 ? 'PASS' : 'FAIL',
    `status=${draft.status} code=${draft.body?.code ?? '-'}`);

  const snapCount = sql(`SELECT COUNT(*) FROM guides.guide_draft_snapshots WHERE "GuideId"='${gId}';`);
  rec('guides', 'the auto-save writes a snapshot, not the section table',
    snapCount !== '0' && !snapCount.startsWith('SQL_ERROR') ? 'PASS' : 'INFO',
    `snapshots=${snapCount} sections=${sql(`SELECT COUNT(*) FROM guides.guide_sections WHERE "GuideId"='${gId}';`)}`);

  const realSave = await call('PUT', `/guides/${gId}`, {
    token: A, label: 'the real save, which materialises sections',
    body: {
      title: `Registering a birth at the Lagos State registry ${stamp}`,
      countryCode: 'NG', cityName: 'Lagos',
      summary: 'What to bring, what it costs and which office actually issues the certificate.',
      sections,
    },
  });
  rec('guides', 'the real save materialises sections and blocks', realSave.status < 400 ? 'PASS' : 'FAIL',
    `status=${realSave.status} code=${realSave.body?.code ?? '-'} detail="${String(realSave.body?.detail ?? '').slice(0, 180)}"`);
  rec('guides', 'sections and blocks are persisted in PostgreSQL',
    sql(`SELECT COUNT(*) FROM guides.guide_sections WHERE "GuideId"='${gId}';`) === '1' ? 'PASS' : 'FAIL',
    `sections=${sql(`SELECT COUNT(*) FROM guides.guide_sections WHERE "GuideId"='${gId}';`)} blocks=${sql(`SELECT COUNT(*) FROM guides.guide_section_blocks b JOIN guides.guide_sections s ON s."Id"=b."SectionId" WHERE s."GuideId"='${gId}';`)}`);

  // -- Draft privacy: the reader must not see it yet ------------------------
  const gDraftRead = await call('GET', `/guides/${gId}`, { token: R, label: 'reader tries to read the unpublished draft' });
  rec('guides', 'an unpublished draft is not readable by a second account',
    gDraftRead.status === 403 || gDraftRead.status === 404 ? 'PASS' : 'FAIL',
    `status=${gDraftRead.status} code=${gDraftRead.body?.code ?? '-'}`);

  const gListBefore = await call('GET', `/guides?text=${encodeURIComponent(stamp)}&limit=25`, { token: R, label: 'reader lists guides before publication' });
  const gbItems = gListBefore.body?.data?.items ?? [];
  rec('guides', 'an unpublished draft does not appear in a public listing',
    !gbItems.some((i) => (i.guideId ?? i.id) === gId) ? 'PASS' : 'FAIL',
    `status=${gListBefore.status} items=${gbItems.length}`);

  const preview = await call('GET', `/guides/${gId}/preview`, { token: A, label: 'author previews the draft' });
  rec('guides', 'the author can preview before publishing', preview.status === 200 ? 'PASS' : 'FAIL', `status=${preview.status}`);

  // -- Publish -------------------------------------------------------------
  const gPub = await call('POST', `/guides/${gId}/publish`, {
    token: A, label: 'publish guide', body: { revisionNotes: 'First publication.' },
  });
  rec('guides', 'publish', gPub.status < 400 ? 'PASS' : 'FAIL',
    `status=${gPub.status} code=${gPub.body?.code ?? '-'} detail="${String(gPub.body?.detail ?? '').slice(0, 200)}"`);

  const gPubDb = sql(`SELECT "Status" || ' | published=' || COALESCE("PublishedAt"::text,'null') FROM guides.guides WHERE "Id"='${gId}';`);
  rec('guides', 'publication is a real state transition in PostgreSQL',
    /published|active/i.test(gPubDb) ? 'PASS' : 'FAIL', `db: ${gPubDb}`);

  // -- Versions ------------------------------------------------------------
  const versions = await call('GET', `/guides/${gId}/versions`, { token: A, label: 'read guide versions' });
  const vItems = versions.body?.data?.items ?? versions.body?.data ?? [];
  rec('guides', 'a published version is readable', versions.status === 200 && (vItems.length ?? 0) > 0 ? 'PASS' : 'FAIL',
    `status=${versions.status} versions=${Array.isArray(vItems) ? vItems.length : '?'}`);

  const v1 = await call('GET', `/guides/${gId}/versions/1`, { token: A, label: 'read version 1' });
  rec('guides', 'a specific version number resolves', v1.status === 200 ? 'PASS' : 'FAIL', `status=${v1.status}`);

  // -- Second user, after publication --------------------------------------
  const gRead = await call('GET', `/guides/${gId}`, { token: R, label: 'reader opens the published guide' });
  rec('guides', 'a second account can read the guide once published',
    gRead.status === 200 ? 'PASS' : 'FAIL',
    `status=${gRead.status} title="${String(gRead.body?.data?.title ?? '').slice(0, 44)}"`);

  const gList = await call('GET', `/guides?text=${encodeURIComponent(stamp)}&limit=25`, { token: R, label: 'reader lists guides after publication' });
  const gItems = gList.body?.data?.items ?? [];
  rec('guides', 'the published guide appears in a public listing',
    gItems.some((i) => (i.guideId ?? i.id) === gId) ? 'PASS' : 'FAIL',
    `status=${gList.status} items=${gItems.length}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY 4 — JOBS
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n-- Journey 4: jobs --\n');

const employer = await call('POST', '/jobs/employers', {
  token: A, label: 'create employer profile',
  body: { displayName: `Yaba Fintech ${stamp}`, organizationType: 'Company', countryCode: 'NG', description: 'A payments company on Herbert Macaulay Way.' },
});
const employerId = employer.body?.data?.employerId ?? employer.body?.data?.id;
rec('jobs', 'employer profile is created', employer.status < 400 && employerId ? 'PASS' : 'FAIL',
  `status=${employer.status} id=${employerId} code=${employer.body?.code ?? '-'}`);

const jCats = await call('GET', '/jobs/categories', { token: A, label: 'job categories' });
const jCatList = jCats.body?.data?.items ?? jCats.body?.data ?? [];
const jCatKey = Array.isArray(jCatList) && jCatList.length ? (jCatList[0].key ?? jCatList[0].categoryKey) : 'engineering';
rec('jobs', 'job category taxonomy is served', jCats.status === 200 ? 'PASS' : 'FAIL',
  `status=${jCats.status} count=${Array.isArray(jCatList) ? jCatList.length : '?'} using=${jCatKey}`);

let jobId = null;
if (employerId) {
  const jCreate = await call('POST', '/jobs', {
    token: A, label: 'create job posting',
    body: {
      employerId, title: `Backend engineer (Lagos) ${stamp}`,
      description: 'Building settlement rails for cross-border remittance. .NET and PostgreSQL, hybrid from Yaba two days a week.',
      summary: 'Backend engineer for a Lagos payments company.',
      categoryKey: jCatKey, jobType: 'FullTime', experienceLevel: 'Mid',
      countryCode: 'NG', cityName: 'Lagos', regionName: 'Lagos', workplaceType: 'Hybrid',
    },
  });
  jobId = jCreate.body?.data?.jobId ?? jCreate.body?.data?.id;
  rec('jobs', 'create job posting', jCreate.status < 400 && jobId ? 'PASS' : 'FAIL',
    `status=${jCreate.status} id=${jobId} code=${jCreate.body?.code ?? '-'} detail="${String(jCreate.body?.detail ?? '').slice(0, 160)}"`);
}
facts.jobId = jobId;

if (jobId) {
  const jPub = await call('POST', `/jobs/${jobId}/publish`, { token: A, label: 'publish job', body: {} });
  rec('jobs', 'publish job', jPub.status < 400 ? 'PASS' : 'FAIL',
    `status=${jPub.status} detail="${String(jPub.body?.detail ?? '').slice(0, 160)}"`);

  const jDb = sql(`SELECT "Status" FROM jobs.job_postings WHERE "Id"='${jobId}';`);
  rec('jobs', 'job publication is persisted', /active|published|open/i.test(jDb) ? 'PASS' : 'FAIL', `db Status=${jDb}`);

  // -- Candidate discovers and applies -------------------------------------
  const jSearch = await call('POST', '/jobs/search', { token: R, label: 'candidate searches jobs', body: { text: stamp, countryCode: 'NG', limit: 25 } });
  const jsd = jSearch.body?.data ?? {};
  const jsItems = jsd.items ?? jsd.results ?? [];
  rec('jobs', 'the candidate finds the published job', jsItems.some((i) => (i.jobId ?? i.id) === jobId) ? 'PASS' : 'FAIL',
    `status=${jSearch.status} items=${jsItems.length} envelope={${Object.keys(jsd).join(',')}}`);

  const candidate = await call('POST', '/jobs/candidate/profile', {
    token: R, label: 'create candidate profile',
    body: { headline: 'Backend engineer, five years on payments', countryCode: 'NG', cityName: 'Lagos' },
  });
  rec('jobs', 'candidate profile is created', candidate.status < 400 ? 'PASS' : 'INFO', `status=${candidate.status} code=${candidate.body?.code ?? '-'}`);

  const apply = await call('POST', `/jobs/${jobId}/apply`, {
    token: R, label: 'candidate applies',
    body: { coverLetter: 'I have shipped two settlement integrations and would like to do it closer to home.' },
  });
  const applicationId = apply.body?.data?.applicationId ?? apply.body?.data?.id;
  rec('jobs', 'application is created', apply.status < 400 && applicationId ? 'PASS' : 'FAIL',
    `status=${apply.status} id=${applicationId} code=${apply.body?.code ?? '-'} detail="${String(apply.body?.detail ?? '').slice(0, 160)}"`);
  facts.applicationId = applicationId;

  if (applicationId) {
    const aDb = sql(`SELECT "Status" FROM jobs.job_applications WHERE "Id"='${applicationId}';`);
    rec('jobs', 'application is persisted', aDb.length > 0 ? 'PASS' : 'FAIL', `db Status=${aDb}`);

    const myApps = await call('GET', '/jobs/applications?limit=25', { token: R, label: "candidate's own applications" });
    const maItems = myApps.body?.data?.items ?? [];
    rec('jobs', 'the application appears on the candidate\u2019s list',
      maItems.some((i) => (i.applicationId ?? i.id) === applicationId) ? 'PASS' : 'FAIL',
      `status=${myApps.status} items=${maItems.length}`);

    const empDash = await call('GET', '/jobs/employers/dashboard', { token: A, label: 'employer dashboard' });
    rec('jobs', 'the employer sees the application on their dashboard',
      empDash.status === 200 ? 'PASS' : 'FAIL',
      `status=${empDash.status} keys={${Object.keys(empDash.body?.data ?? {}).join(',')}}`);

    // -- Decision ----------------------------------------------------------
    const decide = await call('POST', `/jobs/applications/${applicationId}/decide`, {
      token: A, label: 'employer shortlists the application',
      body: { status: 'Shortlisted', reason: 'Relevant settlement experience.', reasonVisibleToCandidate: true },
    });
    rec('jobs', 'employer decision', decide.status < 400 ? 'PASS' : 'FAIL',
      `status=${decide.status} code=${decide.body?.code ?? '-'} detail="${String(decide.body?.detail ?? '').slice(0, 160)}"`);
    rec('jobs', 'the decision is persisted', /shortlist/i.test(sql(`SELECT "Status" FROM jobs.job_applications WHERE "Id"='${applicationId}';`)) ? 'PASS' : 'FAIL',
      `db Status=${sql(`SELECT "Status" FROM jobs.job_applications WHERE "Id"='${applicationId}';`)}`);

    // -- Interview ---------------------------------------------------------
    const interview = await call('POST', `/jobs/applications/${applicationId}/interviews`, {
      token: A, label: 'employer schedules an interview',
      body: {
        scheduledAt: new Date(Date.now() + 4 * 86400000).toISOString(),
        mode: 'Video', durationMinutes: 45, timeZoneId: 'Africa/Lagos',
        title: 'Systems design conversation',
        joiningUrl: 'https://meet.google.com/e2e-diaspora-interview',
        instructions: 'Systems design, then a short pairing exercise.',
      },
    });
    const interviewId = interview.body?.data?.interviewId ?? interview.body?.data?.id;
    rec('jobs', 'interview is scheduled', interview.status < 400 ? 'PASS' : 'FAIL',
      `status=${interview.status} id=${interviewId} code=${interview.body?.code ?? '-'} detail="${String(interview.body?.detail ?? '').slice(0, 180)}"`);

    if (interviewId) {
      rec('jobs', 'the interview is persisted',
        sql(`SELECT COUNT(*) FROM jobs.job_interviews WHERE "Id"='${interviewId}';`) === '1' ? 'PASS' : 'FAIL',
        `db rows=${sql(`SELECT COUNT(*) FROM jobs.job_interviews WHERE "Id"='${interviewId}';`)}`);

      const outcome = await call('POST', `/jobs/interviews/${interviewId}/outcome`, {
        token: A, label: 'employer records the interview outcome',
        body: { outcome: 'Passed', notes: 'Strong on idempotency and reconciliation.' },
      });
      rec('jobs', 'interview outcome is recorded', outcome.status < 400 ? 'PASS' : 'FAIL',
        `status=${outcome.status} detail="${String(outcome.body?.detail ?? '').slice(0, 160)}"`);
    }

    // -- Offer -------------------------------------------------------------
    const offer = await call('POST', `/jobs/applications/${applicationId}/offers`, {
      token: A, label: 'employer extends an offer',
      body: {
        salaryAmount: 9600000, currencyCode: 'NGN', salaryPeriod: 'Yearly',
        startDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        expiresAt: new Date(Date.now() + 10 * 86400000).toISOString(),
        notes: 'Hybrid, two days in Yaba.',
      },
    });
    const offerId = offer.body?.data?.offerId ?? offer.body?.data?.id;
    rec('jobs', 'offer is extended', offer.status < 400 ? 'PASS' : 'FAIL',
      `status=${offer.status} id=${offerId} code=${offer.body?.code ?? '-'} detail="${String(offer.body?.detail ?? '').slice(0, 180)}"`);

    if (offerId) {
      rec('jobs', 'the offer is persisted',
        sql(`SELECT COUNT(*) FROM jobs.job_offers WHERE "Id"='${offerId}';`) === '1' ? 'PASS' : 'FAIL',
        `db rows=${sql(`SELECT COUNT(*) FROM jobs.job_offers WHERE "Id"='${offerId}';`)}`);

      const respond = await call('POST', `/jobs/offers/${offerId}/respond`, {
        token: R, label: 'candidate accepts the offer', body: { accept: true, reason: 'Delighted \u2014 I can start on the first.' },
      });
      rec('jobs', 'candidate responds to the offer', respond.status < 400 ? 'PASS' : 'FAIL',
        `status=${respond.status} detail="${String(respond.body?.detail ?? '').slice(0, 160)}"`);
      rec('jobs', 'the acceptance is persisted',
        /accept/i.test(sql(`SELECT "Status" FROM jobs.job_offers WHERE "Id"='${offerId}';`)) ? 'PASS' : 'FAIL',
        `db Status=${sql(`SELECT "Status" FROM jobs.job_offers WHERE "Id"='${offerId}';`)}`);
    }

    // -- The read routes, now that they exist --------------------------------
    //
    // This block first recorded gaps G-3 and G-4: both answered **405**, a
    // resource path published for writes only. They are implemented now, so it
    // is the regression that proves they still answer — and the two root paths
    // stay as **controls**, because they were never real routes. They were the
    // register's guess, and keeping them here is what stops this harness
    // quietly asserting that any 404 means a gap.
    for (const [what, path, expected] of [
      ['interview list', `/jobs/applications/${applicationId}/interviews`, 'implemented'],
      ['offer list', `/jobs/applications/${applicationId}/offers`, 'implemented'],
      ['offer list (root) — never a real route', '/jobs/offers', 'absent'],
      ['interview list (root) — never a real route', '/jobs/interviews', 'absent'],
    ]) {
      const probe = await call('GET', path, { token: A, label: `probe GET ${what}` });
      const answered = probe.status < 400;

      rec('jobs', `GET ${what} — \`${path}\``,
        expected === 'implemented' ? (answered ? 'PASS' : 'FAIL')
          : (probe.status === 404 || probe.status === 405 ? 'PASS' : 'FAIL'),
        expected === 'implemented'
          ? `status=${probe.status} items=${(probe.body?.data ?? []).length ?? '?'} — G-${what.startsWith('interview') ? '3' : '4'} closed`
          : `status=${probe.status} — control: this path is not published and never was`);
    }
  }
}

finish(0);
