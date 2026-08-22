/**
 * DEFECT-010 isolation — does a country-only scope hide records that carry no
 * neighbourhood area?
 *
 * `GeographicScopeResolver` step 5 sets **both** `CountryCode` and
 * `Path = HierarchyPath.ForRoot(country)` for a country-only request. A module
 * whose adapter then narrows on the path, and whose repository matches it as
 * `AreaPath != null && AreaPath.StartsWith(prefix)`, drops every record filed
 * without an area — which is every record created through the client, because
 * no create screen sends `neighborhoodAreaId`.
 *
 * This probe does not read that reasoning back; it asks each vertical the same
 * question twice, once unscoped and once scoped to the country the records are
 * actually in, and reports the pair.
 */
import { writeFileSync } from 'node:fs';
import { call, save, verifiedUser, recorder } from './e2e-harness.mjs';

const EV = 'C:/Users/User/source/repos/Diaspora/runtime-validation/e2e/evidence-country-scope.json';
const results = [];
const rec = recorder(results);
const RUN = process.env.RUNTIME_RUN ?? '450';

const u = await verifiedUser({ name: 'Scope Probe', phone: `+23481000${RUN}001`, password: 'Sc7#pbQd4Vx9' });
const T = u.token;
if (!T) { console.log('could not obtain a token'); process.exit(1); }

console.log('\n=== country-scope probe: unscoped vs countryCode=NG ===\n');

const count = (r) => {
  const d = r.body?.data ?? {};
  return d.totalCount ?? d.totalMatches ?? (d.items?.length ?? null);
};

const cases = [
  { vertical: 'housing', method: 'GET', bare: '/housing/search?limit=50', scoped: '/housing/search?countryCode=NG&limit=50' },
  { vertical: 'jobs', method: 'POST', bare: ['/jobs/search', { limit: 50 }], scoped: ['/jobs/search', { countryCode: 'NG', limit: 50 }] },
  { vertical: 'marketplace', method: 'POST', bare: ['/marketplace/search', { limit: 50 }], scoped: ['/marketplace/search', { countryCode: 'NG', limit: 50 }] },
  { vertical: 'guides', method: 'GET', bare: '/guides?limit=50', scoped: '/guides?countryCode=NG&limit=50' },
  { vertical: 'community-life events', method: 'GET', bare: '/community-life/events?limit=50', scoped: '/community-life/events?countryCode=NG&limit=50' },
  { vertical: 'community-life organizations', method: 'GET', bare: '/community-life/organizations?limit=50', scoped: '/community-life/organizations?countryCode=NG&limit=50' },
];

const table = [];
for (const c of cases) {
  const run = async (which, spec) =>
    Array.isArray(spec)
      ? call(c.method, spec[0], { token: T, label: `${c.vertical} ${which}`, body: spec[1] })
      : call(c.method, spec, { token: T, label: `${c.vertical} ${which}` });

  const bare = await run('unscoped', c.bare);
  const scoped = await run('countryCode=NG', c.scoped);
  const b = count(bare);
  const s = count(scoped);

  // A vertical with nothing in it proves nothing either way; say so rather than
  // counting it as a pass.
  const verdict = b === 0 || b === null ? 'NO DATA' : s === 0 ? 'FAIL' : s < b ? 'PARTIAL' : 'PASS';
  table.push({ vertical: c.vertical, unscoped: b, scopedToNG: s, verdict });
  rec('country-scope', `${c.vertical}: unscoped ${b} → countryCode=NG ${s}`, verdict,
    `bare=${bare.status} scoped=${scoped.status}`);
}

console.log('\n  vertical                        unscoped   NG   verdict');
for (const r of table) {
  console.log(`  ${r.vertical.padEnd(30)} ${String(r.unscoped).padStart(6)} ${String(r.scopedToNG).padStart(6)}   ${r.verdict}`);
}
console.log();

save(EV);
writeFileSync(EV.replace('evidence-', 'results-'), JSON.stringify({ run: RUN, table, results }, null, 1));
