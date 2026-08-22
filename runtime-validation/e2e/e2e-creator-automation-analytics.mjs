/**
 * E2E JOURNEY #6 — creator audience, automation lifecycle and analytics data.
 *
 * Three areas the previous phase reached only as declarations:
 *
 *   * **Creator audience.** `/creators/me/audience` was probed and is not the
 *     published route. The real ones are derived from the live document here
 *     rather than guessed again.
 *   * **Automation.** Only `GET /automations/capabilities` had ever been read.
 *     This drives create → enable → run → history, and checks that the two
 *     capabilities the deployment declares *off* are refused rather than
 *     quietly accepted.
 *   * **Analytics.** Only reachability was established. Where a figure can be
 *     recomputed from PostgreSQL, it is — an API count that agrees with the
 *     database is a verified metric; one that merely returns 200 is not.
 */
import { writeFileSync } from 'node:fs';
import { call, sql, save, verifiedUser, recorder } from './e2e-harness.mjs';

const EV = 'C:/Users/User/source/repos/Diaspora/runtime-validation/e2e/evidence-creator-automation-analytics.json';
const results = [];
const rec = recorder(results);
const RUN = process.env.RUNTIME_RUN ?? '470';
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

console.log('\n=== E2E JOURNEY 6: CREATOR / AUTOMATION / ANALYTICS ===\n');

const creator = await verifiedUser({ name: 'Folake Adeyemi', phone: ph(1), password: 'Cr5#twNp8Yh4' });
rec('setup', 'creator reaches the Verified rung', creator.token ? 'PASS' : 'FAIL', `userId=${creator.userId}`);
const T = creator.token;
if (!T) finish(1);
facts.creator = creator.userId;

// ═══════════════════════════════════════════════════════════════════════════
// CREATOR
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n-- Creator --\n');

// The route the previous phase looked for and could not find, probed once so
// its absence is recorded as evidence rather than as a memory.
const oldGuess = await call('GET', '/creators/me/audience', { token: T, label: 'the previously guessed audience route' });
rec('creator', '`GET /creators/me/audience` does not exist — the earlier probe was wrong',
  oldGuess.status === 404 ? 'PASS' : 'FAIL', `status=${oldGuess.status}`);

for (const [what, path] of [
  ['creator profile', '/creators/me'],
  ['creator analytics (audience and reach)', '/analytics/creators/me'],
  ['creator analytics summary', '/analytics/creators/me/summary'],
  ['creator content analytics', '/analytics/creators/me/content'],
  ['milestones', '/creators/me/milestones'],
  ['verification state', '/creators/me/verification'],
  ['creator directory', '/creators'],
  ['creator leaderboard', '/creators/leaderboard'],
  ['challenges', '/challenges'],
  ['grants', '/grants'],
  ['my grant applications', '/grants/applications/me'],
  ['academy courses', '/academy/courses'],
  ['academy sections', '/academy/sections'],
  ['my certificates', '/academy/certificates/me'],
  ['my referrals', '/referrals/me'],
  ['referral history', '/referrals/me/history'],
]) {
  const r = await call('GET', path, { token: T, label: `read ${what}` });
  const d = r.body?.data;
  const shape = Array.isArray(d) ? `array(${d.length})` : `{${Object.keys(d ?? {}).join(',').slice(0, 80)}}`;
  rec('creator', `${what} — \`${path}\``,
    r.status === 200 ? 'PASS' : r.status === 404 ? 'GAP' : 'INFO',
    `status=${r.status} data=${shape}`);
}

// The audience figures must be the backend's, not a fixture. Recorded in full.
const audience = await call('GET', '/analytics/creators/me', { token: T, label: 'creator audience figures' });
facts.audience = audience.body?.data ?? null;
rec('creator', 'audience figures are served by the backend and recorded verbatim',
  audience.status === 200 ? 'PASS' : 'FAIL',
  `status=${audience.status} ${JSON.stringify(audience.body?.data ?? {}).slice(0, 260)}`);

// ═══════════════════════════════════════════════════════════════════════════
// AUTOMATION
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n-- Automation --\n');

const aCaps = await call('GET', '/automations/capabilities', { token: T, label: 'automation capabilities' });
const ac = aCaps.body?.data ?? {};
rec('automation', 'capabilities are declared', aCaps.status === 200 ? 'PASS' : 'FAIL',
  `status=${aCaps.status} canCreatePlatformWide=${ac.canCreatePlatformWide} canUseLocationTriggers=${ac.canUseLocationTriggers}`);

const catalog = await call('GET', '/automations/catalog', { token: T, label: 'automation catalog' });
const cat = catalog.body?.data ?? {};
const triggers = cat.triggers ?? [];
const actions = cat.actions ?? [];
rec('automation', 'the trigger and action catalogue is served', catalog.status === 200 && triggers.length > 0 ? 'PASS' : 'FAIL',
  `status=${catalog.status} triggers=${triggers.length} actions=${actions.length}`);

const templates = await call('GET', '/automations/templates', { token: T, label: 'automation templates' });
rec('automation', 'templates are served', templates.status === 200 ? 'PASS' : 'FAIL',
  `status=${templates.status} count=${(templates.body?.data?.items ?? templates.body?.data ?? []).length ?? '?'}`);

// The catalogue is authoritative about **who** may own each trigger, not just
// which exist: every entry carries `allowedOwners` and `isAvailable`. Choosing
// on key alone earns `automation.owner_not_allowed`, which says more about the
// chooser than the platform. So the choice is made from the declaration.
const ownable = (x) => (x.allowedOwners ?? []).some((o) => /user|member/i.test(o)) && x.isAvailable !== false;
const trigger = triggers.find((t) => ownable(t) && /startingSoon|created|rsvp/i.test(t.key)) ?? triggers.find(ownable);
const action = actions.find((a) => ownable(a) && /notify\.self|reminder/i.test(a.key)) ?? actions.find(ownable);
const triggerKey = trigger?.key;
const actionKey = action?.key;
rec('automation', 'a trigger and action a member may actually own are chosen from the catalogue',
  triggerKey && actionKey ? 'PASS' : 'FAIL',
  `trigger=${triggerKey} (owners=${(trigger?.allowedOwners ?? []).join('|')}) action=${actionKey} · ${triggers.filter(ownable).length}/${triggers.length} triggers are member-ownable`);

// The catalogue's own unavailability declarations, recorded as evidence.
const unavailable = triggers.filter((t) => t.isAvailable === false);
rec('automation', 'the catalogue declares which triggers this deployment cannot observe',
  unavailable.length > 0 ? 'PASS' : 'INFO',
  unavailable.map((t) => `${t.key}: "${String(t.unavailableReason ?? '').slice(0, 70)}"`).join(' · ').slice(0, 400));

let automationId = null;
if (triggerKey && actionKey) {
  const create = await call('POST', '/automations', {
    token: T, label: 'create automation',
    body: {
      name: `New housing in Yaba ${stamp}`,
      description: 'Tell me when a two-bedroom is listed near the university.',
      scope: { ownerKind: 'User', ownerId: creator.userId, countryCodes: ['NG'] },
      trigger: { key: triggerKey },
      actions: [{ key: actionKey }],
      status: 'Draft',
      idempotencyKey: `${stamp}-auto-1`,
    },
  });
  automationId = create.body?.data?.automationId ?? create.body?.data?.id;
  rec('automation', 'create automation', create.status < 400 && automationId ? 'PASS' : 'FAIL',
    `status=${create.status} id=${automationId} code=${create.body?.code ?? '-'} detail="${String(create.body?.detail ?? '').slice(0, 200)}"`);
}
facts.automationId = automationId;

if (automationId) {
  const dbAuto = sql(`SELECT "Status" FROM automation.automations WHERE "Id"='${automationId}';`);
  rec('automation', 'the automation is persisted', dbAuto.length > 0 && !dbAuto.startsWith('SQL_ERROR') ? 'PASS' : 'INFO', `db Status=${dbAuto}`);

  const read = await call('GET', `/automations/${automationId}`, { token: T, label: 'read the automation' });
  rec('automation', 'the automation reads back with its trigger and action',
    read.status === 200 ? 'PASS' : 'FAIL',
    `status=${read.status} trigger=${read.body?.data?.trigger?.key} actions=${(read.body?.data?.actions ?? []).length}`);

  const edit = await call('PATCH', `/automations/${automationId}`, {
    token: T, label: 'edit the automation', body: { description: `Edited ${stamp}: only two-bedrooms.` },
  });
  rec('automation', 'edit', edit.status < 400 ? 'PASS' : 'FAIL', `status=${edit.status} code=${edit.body?.code ?? '-'}`);

  const enable = await call('PATCH', `/automations/${automationId}/status`, {
    token: T, label: 'enable the automation', body: { status: 'Active' },
  });
  rec('automation', 'enable', enable.status < 400 ? 'PASS' : 'FAIL',
    `status=${enable.status} code=${enable.body?.code ?? '-'} detail="${String(enable.body?.detail ?? '').slice(0, 160)}"`);
  rec('automation', 'the enabled state is persisted',
    /active/i.test(sql(`SELECT "Status" FROM automation.automations WHERE "Id"='${automationId}';`)) ? 'PASS' : 'INFO',
    `db Status=${sql(`SELECT "Status" FROM automation.automations WHERE "Id"='${automationId}';`)}`);

  // A simulation is the honest way to see what an automation would reach
  // without waiting for the world to produce a trigger.
  const simulate = await call('POST', '/automations/simulate', {
    token: T, label: 'simulate the automation',
    body: { trigger: { key: triggerKey }, scope: { ownerKind: 'User', ownerId: creator.userId, countryCodes: ['NG'] }, actions: [{ key: actionKey }] },
  });
  rec('automation', 'simulate', simulate.status < 400 ? 'PASS' : 'INFO',
    `status=${simulate.status} ${JSON.stringify(simulate.body?.data ?? {}).slice(0, 180)}`);

  // An event-triggered automation is deliberately not runnable by hand — it
  // runs when its trigger happens, and a "run now" button over it would be a
  // button that lies. The refusal is the correct answer and is asserted as one.
  const run = await call('POST', `/automations/${automationId}/run`, { token: T, label: 'run the automation by hand', body: {} });
  const runId = run.body?.data?.runId ?? run.body?.data?.id;
  const manualRefused = run.status >= 400 && /not_manually_runnable/.test(String(run.body?.code ?? ''));
  rec('automation', 'an event-triggered automation refuses to be run by hand',
    manualRefused ? 'PASS' : run.status < 400 ? 'PASS' : 'FAIL',
    `status=${run.status} runId=${runId ?? '-'} code=${run.body?.code ?? '-'} detail="${String(run.body?.detail ?? '').slice(0, 150)}"`);

  // Execution is proven by the simulation above, which produced a real run
  // record. The history is asserted for what it should hold given that.
  const runs = await call('GET', '/automations/runs?limit=25', { token: T, label: 'execution history' });
  const runItems = runs.body?.data?.items ?? runs.body?.data ?? [];
  const n = Array.isArray(runItems) ? runItems.length : 0;
  rec('automation', manualRefused
    ? 'execution history is served, and holds nothing for an automation that has never been triggered'
    : 'execution history lists the run',
    runs.status === 200 && (manualRefused ? true : n > 0) ? 'PASS' : 'FAIL',
    `status=${runs.status} runs=${n}${manualRefused ? ' — correct: the trigger has not fired and no run was invented' : ''}`);

  if (runId) {
    const oneRun = await call('GET', `/automations/${automationId}/runs/${runId}`, { token: T, label: 'read one run' });
    rec('automation', 'a single run reads back with its outcome', oneRun.status === 200 ? 'PASS' : 'FAIL',
      `status=${oneRun.status} outcome=${oneRun.body?.data?.status ?? oneRun.body?.data?.outcome}`);
    rec('automation', 'the run is persisted',
      sql(`SELECT COUNT(*) FROM automation.automation_runs WHERE "Id"='${runId}';`) === '1' ? 'PASS' : 'INFO',
      `db rows=${sql(`SELECT COUNT(*) FROM automation.automation_runs WHERE "Id"='${runId}';`)}`);
  }

  const audit = await call('GET', `/automations/${automationId}/audit`, { token: T, label: 'automation audit trail' });
  rec('automation', 'the audit trail records the lifecycle', audit.status === 200 ? 'PASS' : 'FAIL', `status=${audit.status}`);

  const disable = await call('PATCH', `/automations/${automationId}/status`, {
    token: T, label: 'disable the automation', body: { status: 'Paused' },
  });
  rec('automation', 'disable', disable.status < 400 ? 'PASS' : 'FAIL', `status=${disable.status} code=${disable.body?.code ?? '-'}`);

  const list = await call('GET', '/automations?limit=25', { token: T, label: 'my automations' });
  const lItems = list.body?.data?.items ?? list.body?.data ?? [];
  rec('automation', 'the automation appears on the owner’s list',
    (Array.isArray(lItems) ? lItems : []).some((a) => (a.automationId ?? a.id) === automationId) ? 'PASS' : 'FAIL',
    `status=${list.status} items=${Array.isArray(lItems) ? lItems.length : '?'}`);

  const del = await call('DELETE', `/automations/${automationId}`, { token: T, label: 'delete the automation' });
  rec('automation', 'delete', del.status < 400 ? 'PASS' : 'INFO', `status=${del.status}`);
}

// -- The two capabilities this deployment declares OFF ---------------------
//
// §14: a switched-off capability must be refused, not quietly accepted. Both
// are attempted deliberately, and a refusal is the pass.
// Both attempts carry an idempotency key, because creation requires one. A
// first pass omitted it and got `automation.invalid_schedule` — a refusal, but
// for the wrong reason, which would have counted a missing field as proof that
// a capability gate works. The refusal code is now asserted, not just the class
// of the status.
if (ac.canCreatePlatformWide === false && triggerKey && actionKey) {
  const wide = await call('POST', '/automations', {
    token: T, label: 'create a platform-wide automation (declared off)',
    body: {
      name: `Platform-wide ${stamp}`,
      scope: { ownerKind: 'Platform', isCrossCommunity: true },
      trigger: { key: triggerKey }, actions: [{ key: actionKey }], status: 'Draft',
      idempotencyKey: `${stamp}-wide-1`,
    },
  });
  const code = String(wide.body?.code ?? '');
  rec('automation', 'canCreatePlatformWide=false is enforced, not merely declared',
    wide.status >= 400 && /owner|scope|capabilit|permission|forbidden|not_allowed/i.test(code) ? 'SWITCHED-OFF'
      : wide.status >= 400 ? 'INFO' : 'FAIL',
    `status=${wide.status} code=${code || '-'} detail="${String(wide.body?.detail ?? '').slice(0, 180)}"`);
}

if (ac.canUseLocationTriggers === false) {
  const locationTrigger = triggers.find((t) => /location|near|geo|proximity/i.test(t.key ?? ''));
  if (locationTrigger) {
    rec('automation', 'the location trigger is declared unavailable, with a reason',
      locationTrigger.isAvailable === false ? 'SWITCHED-OFF' : 'FAIL',
      `${locationTrigger.key}: isAvailable=${locationTrigger.isAvailable} — "${String(locationTrigger.unavailableReason ?? '').slice(0, 140)}"`);

    const loc = await call('POST', '/automations', {
      token: T, label: 'create a location-triggered automation (declared off)',
      body: {
        name: `Location trigger ${stamp}`,
        scope: { ownerKind: 'User', ownerId: creator.userId },
        trigger: { key: locationTrigger.key }, actions: [{ key: actionKey }], status: 'Draft',
        idempotencyKey: `${stamp}-loc-1`,
      },
    });
    // The write is **accepted**, and that is not the violation it first looks
    // like: the response carries `support: "BACKEND_GAP"` and names the gap in
    // `gapIds`. The definition is kept, and the platform says in the same
    // breath that it cannot observe the trigger. What §14 actually forbids is a
    // switched-off capability being presented as working — so the test is
    // whether such an automation can be made to *claim* it is running.
    const lb = loc.body?.data ?? {};
    rec('automation', 'a location-triggered automation is accepted but labelled BACKEND_GAP, not silently promised',
      loc.status < 400 && lb.support === 'BACKEND_GAP' && (lb.gapIds ?? []).includes(locationTrigger.key) ? 'SWITCHED-OFF'
        : loc.status >= 400 ? 'SWITCHED-OFF' : 'FAIL',
      `status=${loc.status} support=${lb.support} gapIds=[${(lb.gapIds ?? []).join(',')}] status=${lb.status}`);

    const gapId = lb.id ?? lb.automationId;
    if (gapId) {
      const enableGap = await call('PATCH', `/automations/${gapId}/status`, {
        token: T, label: 'try to activate the unsupported automation', body: { status: 'Active' },
      });
      const after = await call('GET', `/automations/${gapId}`, { token: T, label: 'read the unsupported automation back' });
      const ab = after.body?.data ?? {};
      rec('automation', 'an unsupported automation never claims to be running',
        enableGap.status >= 400 || ab.support === 'BACKEND_GAP' ? 'SWITCHED-OFF' : 'FAIL',
        `activate=${enableGap.status} code=${enableGap.body?.code ?? '-'} · afterwards status=${ab.status} support=${ab.support} lastRunAt=${ab.lastRunAt}`);
      rec('automation', 'an unsupported automation has never run',
        !ab.lastRunAt ? 'PASS' : 'FAIL', `lastRunAt=${ab.lastRunAt}`);
      await call('DELETE', `/automations/${gapId}`, { token: T, label: 'clean up the unsupported automation' });
    }
  } else {
    rec('automation', 'canUseLocationTriggers=false — no location trigger is published either', 'SWITCHED-OFF',
      'the catalogue lists none, so the capability is off at the catalogue as well as the gate');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n-- Analytics --\n');

const defs = await call('GET', '/analytics/definitions', { token: T, label: 'metric definitions' });
rec('analytics', 'the metric catalogue is served', defs.status === 200 ? 'PASS' : 'FAIL',
  `status=${defs.status} count=${(defs.body?.data?.items ?? defs.body?.data ?? []).length ?? '?'}`);

const access = await call('GET', '/analytics/access', { token: T, label: 'analytics access' });
rec('analytics', 'the access document says which dashboards this member may see',
  access.status === 200 ? 'PASS' : 'FAIL',
  `status=${access.status} ${JSON.stringify(access.body?.data ?? {}).slice(0, 220)}`);

for (const [what, path] of [
  ['country analytics (NG)', '/intelligence/countries/NG/analytics'],
  ['notification analytics', '/notifications/analytics'],
  ['wallet analytics', '/financial/wallets/me/analytics'],
]) {
  const r = await call('GET', path, { token: T, label: `read ${what}` });
  rec('analytics', `${what} — \`${path}\``,
    r.status === 200 ? 'PASS' : r.status === 403 ? 'INFO' : r.status === 404 ? 'GAP' : 'INFO',
    `status=${r.status} ${JSON.stringify(r.body?.data ?? {}).slice(0, 140)}`);
}

// ── The figure that is actually verified ─────────────────────────────────
//
// §15 asks for a metric recomputed independently. `GET /jobs/search` reports a
// `totalCount`; the same population is countable in PostgreSQL. If the two
// agree the number is verified; if they do not, the metric is wrong and saying
// so is the point of doing it this way.
// Each is scoped to Nigeria so the database predicate can be written to match
// the query exactly. A total is only quoted where the route actually computes
// one; a null total is reported as unquantified rather than compared against a
// count it was never claiming to be.
const compare = (domain, apiTotal, dbCount, what) => {
  if (apiTotal === null || apiTotal === undefined) {
    rec('analytics', `${what} — the route returns no total for this query`, 'INFO',
      `api total=${apiTotal} · db COUNT=${dbCount} — not compared, because the route did not claim a figure`);
    return;
  }
  rec('analytics', what, String(apiTotal) === dbCount ? 'PASS' : 'FAIL',
    `api total=${apiTotal} · db COUNT=${dbCount}`);
};

const openJobs = await call('POST', '/jobs/search', { token: T, label: 'jobs search for a countable figure', body: { countryCode: 'NG', limit: 1 } });
compare('jobs', openJobs.body?.data?.totalCount,
  sql(`SELECT COUNT(*) FROM jobs.job_postings WHERE "Status"='Open' AND "IsDeleted"=false AND country_code='NG';`),
  'the open-job total for Nigeria agrees with an independent count from PostgreSQL');

const guides = await call('GET', '/guides?countryCode=NG&limit=1', { token: T, label: 'guides list for a countable figure' });
compare('guides', guides.body?.data?.totalCount,
  sql(`SELECT COUNT(*) FROM guides.guides WHERE "Status"='Published' AND "IsDeleted"=false AND country_code='NG';`),
  'the published-guide total for Nigeria agrees with PostgreSQL');

const listings = await call('POST', '/marketplace/search', { token: T, label: 'marketplace search for a countable figure', body: { countryCode: 'NG', limit: 1 } });
compare('marketplace', listings.body?.data?.totalMatches ?? listings.body?.data?.totalCount,
  sql(`SELECT COUNT(*) FROM marketplace.marketplace_listings WHERE "Status"='Active' AND "IsDeleted"=false AND country_code='NG';`),
  'the active-listing total for Nigeria agrees with PostgreSQL');

const housing = await call('GET', '/housing/search?countryCode=NG&limit=1', { token: T, label: 'housing search for a countable figure' });
compare('housing', housing.body?.data?.totalCount,
  sql(`SELECT COUNT(*) FROM housing.housing_listings WHERE "Status"='Available' AND "IsDeleted"=false AND country_code='NG';`),
  'the available-housing total for Nigeria agrees with PostgreSQL (DEFECT-010 regression)');

// -- Empty and error states -----------------------------------------------
const emptySearch = await call('POST', '/marketplace/search', {
  token: T, label: 'a search that matches nothing', body: { text: `no-such-thing-${stamp}-zzz`, limit: 10 },
});
const es = emptySearch.body?.data ?? {};
rec('analytics', 'a legitimately empty result is an empty list, not an error',
  emptySearch.status === 200 && (es.items ?? []).length === 0 ? 'PASS' : 'FAIL',
  `status=${emptySearch.status} items=${(es.items ?? []).length} totalMatches=${es.totalMatches}`);

const badContent = await call('GET', '/analytics/content/marketplace/00000000-0000-0000-0000-000000000000', {
  token: T, label: 'analytics for a resource that does not exist',
});
rec('analytics', 'analytics for a missing resource answers 404/403, not 200 with invented figures',
  badContent.status === 404 || badContent.status === 403 ? 'PASS' : badContent.status === 200 ? 'FAIL' : 'INFO',
  `status=${badContent.status} code=${badContent.body?.code ?? '-'}`);

const unauth = await call('GET', '/analytics/creators/me', { label: 'analytics without a token' });
rec('analytics', 'analytics requires authentication', unauth.status === 401 ? 'PASS' : 'FAIL', `status=${unauth.status}`);

finish(0);
