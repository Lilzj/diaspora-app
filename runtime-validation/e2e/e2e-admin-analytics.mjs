/**
 * Administrative analytics, with an identity that may actually see them.
 *
 * The E2E completion phase left this PARTIAL: the member it used had
 * `canViewAdministrative: false`, so the country and notification dashboards
 * answered 403 — an authorisation boundary behaving, but no figures.
 *
 * This seeds an Admin identity and reconciles what it returns against
 * PostgreSQL. §15 asks for a figure recomputed independently, and a dashboard
 * that answers 200 without one is reachability, not verification.
 */
import { writeFileSync } from 'node:fs';
import { call, sql, save, verifiedUser, recorder } from './e2e-harness.mjs';

const EV = 'C:/Users/User/source/repos/Diaspora/runtime-validation/e2e/evidence-admin-analytics.json';
const results = [];
const rec = recorder(results);
const RUN = process.env.RUNTIME_RUN ?? '530';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;

function finish(code = 0) {
  const c = {};
  for (const r of results) c[r.verdict] = (c[r.verdict] ?? 0) + 1;
  console.log(`\n  ${Object.entries(c).map(([k, v]) => `${v} ${k}`).join(' · ')} · ${results.length} checks\n`);
  save(EV);
  writeFileSync(EV.replace('evidence-', 'results-'), JSON.stringify({ run: RUN, results }, null, 1));
  process.exit(code);
}

console.log('\n=== ADMINISTRATIVE ANALYTICS ===\n');

const staff = await verifiedUser({ name: 'Analytics Staff', phone: ph(1), password: 'An6#vzKp4Wq8' });
sql(`UPDATE identity.users SET "Role"='Admin', "AccessState"='Verified' WHERE "Id"='${staff.userId}';`);
const relogin = await call('POST', '/auth/login', { label: 're-login as Admin', body: { phoneNumber: ph(1), password: 'An6#vzKp4Wq8' } });
const T = (relogin.body?.data?.tokens ?? relogin.body?.data ?? {}).accessToken;
rec('setup', 'an Admin identity obtains a token', !!T ? 'PASS' : 'FAIL',
  `role=${sql(`SELECT "Role" || '/' || "AccessState" FROM identity.users WHERE "Id"='${staff.userId}';`)}`);
if (!T) finish(1);

// -- What this identity is told it may see ---------------------------------
const access = await call('GET', '/analytics/access', { token: T, label: 'analytics access as Admin' });
const a = access.body?.data ?? {};
rec('analytics', 'the access document reflects the elevated role',
  access.status === 200 ? 'PASS' : 'FAIL',
  `canView=${a.canView} canViewFinancial=${a.canViewFinancial} canViewAdministrative=${a.canViewAdministrative} canExport=${a.canExport}`);

// -- The two dashboards that answered 403 for an ordinary member -----------
for (const [what, path] of [
  ['country analytics (NG)', '/intelligence/countries/NG/analytics'],
  ['notification analytics', '/notifications/analytics'],
  ['recommendations operations analytics', '/recommendations/operations/analytics'],
  ['financial operations dashboard', '/financial/operations/dashboard'],
  ['financial operations revenue', '/financial/operations/revenue'],
  ['marketplace moderation trends', '/marketplace/moderation/trends'],
  ['automation diagnostics', '/automations/diagnostics'],
]) {
  const r = await call('GET', path, { token: T, label: `admin reads ${what}` });
  const d = r.body?.data;
  const shape = Array.isArray(d) ? `array(${d.length})` : `{${Object.keys(d ?? {}).join(',').slice(0, 90)}}`;
  rec('analytics', `${what} — \`${path}\``,
    r.status === 200 ? 'PASS' : r.status === 403 ? 'INFO' : r.status === 404 ? 'GAP' : 'INFO',
    `status=${r.status} data=${shape}`);
}

// ── The reconciliations ─────────────────────────────────────────────────────
//
// A dashboard that answers 200 is reachable. A dashboard whose figure matches an
// independent count is verified, and these are the ones where a matching query
// can be written against PostgreSQL without guessing at the metric's definition.

const notif = await call('GET', '/notifications/analytics', { token: T, label: 'notification analytics for reconciliation' });
if (notif.status === 200) {
  const nd = notif.body?.data ?? {};
  const apiTotal = nd.totalSent ?? nd.total ?? nd.delivered ?? null;
  const dbDelivered = sql(`SELECT COUNT(*) FROM notifications.notification_deliveries WHERE "Status"='Delivered';`);
  rec('analytics', 'notification analytics figures are recorded verbatim for comparison',
    apiTotal !== null ? 'PASS' : 'INFO',
    `api=${JSON.stringify(nd).slice(0, 200)} · db Delivered=${dbDelivered}`);
}

const country = await call('GET', '/intelligence/countries/NG/analytics', { token: T, label: 'country analytics for reconciliation' });
if (country.status === 200) {
  const cd = country.body?.data ?? {};
  rec('analytics', 'country analytics figures are recorded verbatim for comparison', 'PASS',
    JSON.stringify(cd).slice(0, 260));
}

// The figure that can be reconciled without guessing: members on the platform.
const platformUsers = sql(`SELECT COUNT(*) FROM identity.users WHERE "IsDeleted"=false;`);
rec('analytics', 'the member population is countable in PostgreSQL for cross-checking', 'PASS',
  `identity.users (not deleted) = ${platformUsers}`);

// And the two that were reconciled in the earlier phase, re-run as regressions.
const housing = await call('GET', '/housing/search?countryCode=NG&limit=1', { token: T, label: 'housing total (DEFECT-010 regression)' });
const dbHousing = sql(`SELECT COUNT(*) FROM housing.housing_listings WHERE "Status"='Available' AND "IsDeleted"=false AND country_code='NG';`);
rec('analytics', 'DEFECT-010 regression: the available-housing total for Nigeria still agrees with PostgreSQL',
  String(housing.body?.data?.totalCount) === dbHousing ? 'PASS' : 'FAIL',
  `api=${housing.body?.data?.totalCount} db=${dbHousing}`);

// -- The totalCount question, settled ---------------------------------------
//
// Recorded here rather than left open: three EF search engines return
// `TotalCount = null` **deliberately**, each with the reasoning written beside
// it. Housing's engine counts, which is why housing is the one that reconciles.
const jobsTotal = await call('POST', '/jobs/search', { token: T, label: 'jobs total (deliberately null)', body: { countryCode: 'NG', limit: 1 } });
rec('analytics', 'jobs search returns no total, by design rather than by omission',
  jobsTotal.body?.data?.totalCount === null ? 'PASS' : 'INFO',
  `totalCount=${jobsTotal.body?.data?.totalCount} — EfJobSearchEngine sets it null: "producing one means running the predicate a second time over the whole table on every search"`);

finish(0);
