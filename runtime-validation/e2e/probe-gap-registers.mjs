/**
 * §23 — re-derive every historical backend-gap family against the live backend.
 *
 * The registers under `src/config/*-gaps.ts` are the client's record of what
 * the backend does not serve. They are known to drift: the 17 August audit
 * found 164 of 305 declared-missing routes already implemented, and the last
 * phase reached seven `/financial/*` endpoints it had classified as absent.
 *
 * This does not read the registers and believe them, and it does not read the
 * backend source either. It asks the running API, with a real token, and
 * records the status. A 200 is not automatically "implemented" — a route can
 * answer and still not carry the capability the client needs — so the response
 * shape is recorded alongside, and the judgement is made in
 * `re-derived-backend-gaps.md` rather than by this script.
 */
import { writeFileSync } from 'node:fs';
import { call, save, verifiedUser, recorder } from './e2e-harness.mjs';
import { ORIGIN } from '../harness.mjs';

const EV = 'C:/Users/User/source/repos/Diaspora/runtime-validation/e2e/evidence-gap-registers.json';
const results = [];
const rec = recorder(results);
const RUN = process.env.RUNTIME_RUN ?? '480';

const member = await verifiedUser({ name: 'Gap Prober', phone: `+23481000${RUN}001`, password: 'Gp6#rtQm2Zx7' });
const T = member.token;
if (!T) { console.log('no token'); process.exit(1); }

console.log('\n=== re-deriving the historical backend-gap families ===\n');

// ── The published surface, fetched once ──────────────────────────────────────
//
// `/openapi/v1.json` — note the path: this deployment publishes no `/swagger/*`.
// Templated segments are matched by shape, so a probe issued against a concrete
// identifier resolves to the `{param}` path the document declares.
const document = await (await fetch(`${ORIGIN}/openapi/v1.json`)).json();
const templates = Object.keys(document.paths ?? {});

function isPublished(method, path) {
  const concrete = `/api/v1${path.split('?')[0]}`.split('/').filter(Boolean);

  for (const template of templates) {
    const parts = template.split('/').filter(Boolean);
    if (parts.length !== concrete.length) continue;

    const matches = parts.every(
      (part, i) => (part.startsWith('{') && part.endsWith('}')) || part === concrete[i]
    );

    if (matches && document.paths[template][method.toLowerCase()]) return true;
  }

  return false;
}

/**
 * Each family names the capability the register says is missing, and the route
 * the client would need. Where the register named no route, the published one
 * is used — because "the client looked in the wrong place" is itself a finding.
 */
const FAMILIES = [
  // ── Monetization ────────────────────────────────────────────────────────
  ['monetization', 'subscription plans', 'GET', '/financial/subscriptions/plans'],
  ['monetization', 'my subscriptions', 'GET', '/financial/subscriptions/me'],
  ['monetization', 'upcoming invoice', 'GET', '/financial/subscriptions/me/upcoming'],
  ['monetization', 'entitlements and usage counters', 'GET', '/financial/entitlements/me'],
  ['monetization', 'purchases', 'GET', '/financial/purchases'],
  ['monetization', 'receipts', 'GET', '/financial/receipts/UNKNOWN-REF'],  // a 404 here is a missing *receipt*, not a missing route
  ['monetization', 'featured placements (mine)', 'GET', '/financial/placements/me'],
  ['monetization', 'promotions redemption', 'POST', '/financial/promotions/redeem'],
  ['monetization', 'donation causes', 'GET', '/financial/donations/causes'],
  ['monetization', 'contribution funds', 'GET', '/financial/contributions/funds'],
  ['monetization', 'operations revenue', 'GET', '/financial/operations/revenue'],
  ['monetization', 'catalog', 'GET', '/financial/catalog'],

  // ── Creator economy ─────────────────────────────────────────────────────
  ['creator', 'creator status', 'GET', '/creators/me'],
  ['creator', 'verification', 'GET', '/creators/me/verification'],
  ['creator', 'milestones', 'GET', '/creators/me/milestones'],
  ['creator', 'challenges', 'GET', '/challenges'],
  ['creator', 'grants', 'GET', '/grants'],
  ['creator', 'academy', 'GET', '/academy/courses'],
  ['creator', 'creator analytics', 'GET', '/analytics/creators/me'],
  ['creator', 'referrals', 'GET', '/referrals/me'],
  ['creator', 'leaderboard', 'GET', '/creators/leaderboard'],
  ['creator', 'directory', 'GET', '/creators'],

  // ── Community ───────────────────────────────────────────────────────────
  ['community', 'organizations', 'GET', '/community-life/organizations?limit=5'],
  ['community', 'events', 'GET', '/community-life/events?limit=5'],
  ['community', 'campaigns', 'GET', '/communities/campaigns?limit=5'],
  ['community', 'volunteer opportunities', 'GET', '/communities/volunteer/opportunities?limit=5'],
  ['community', 'polls', 'GET', '/communities/polls?limit=5'],
  ['community', 'community analytics', 'GET', '/communities/organizations/00000000-0000-0000-0000-000000000000/analytics'],
  ['community', 'announcements', 'GET', '/communities/announcements?limit=5'],

  // ── Maps / geographic intelligence ──────────────────────────────────────
  ['maps', 'geo capabilities', 'GET', '/geo/capabilities'],
  ['maps', 'neighbourhood insights', 'GET', '/housing/neighborhoods/insights?limit=5'],
  ['maps', 'cost of living', 'GET', '/geo/neighborhoods/lagos/cost-of-living'],
  ['maps', 'safety scores', 'GET', '/geo/neighborhoods/lagos/safety'],
  ['maps', 'country analytics', 'GET', '/intelligence/countries/NG/analytics'],

  // ── Jobs — the family the register says is genuinely missing ────────────
  // Closed by the E2E completion phase (G-1 ... G-5). These probe the routes
  // that exist rather than the paths the register guessed: a 404 for an
  // employer that does not exist is the route working, so an unpublished-path
  // control sits alongside to keep the distinction visible.
  ['jobs', 'employer public profile', 'GET', '/jobs/employers/00000000-0000-0000-0000-000000000000'],
  ['jobs', 'employer profile - unpublished path (control)', 'GET', '/employers/00000000-0000-0000-0000-000000000000'],
  ['jobs', 'interview list', 'GET', '/jobs/applications/00000000-0000-0000-0000-000000000000/interviews'],
  ['jobs', 'offer list', 'GET', '/jobs/applications/00000000-0000-0000-0000-000000000000/offers'],
  ['jobs', 'candidate profile read', 'GET', '/jobs/candidate/profile'],

  // ── Automation / analytics ──────────────────────────────────────────────
  ['automation', 'catalog', 'GET', '/automations/catalog'],
  ['automation', 'saved searches', 'GET', '/automations/saved-searches'],
  ['automation', 'reminders', 'GET', '/automations/reminders'],
  ['automation', 'diagnostics', 'GET', '/automations/diagnostics'],
  ['analytics', 'definitions', 'GET', '/analytics/definitions'],
  ['analytics', 'access', 'GET', '/analytics/access'],
];

for (const [family, capability, method, path] of FAMILIES) {
  const r = await call(method, path, { token: T, label: `${family}: ${capability}`, body: method === 'POST' ? {} : undefined });

  // ── The verdict rule, and the correction that produced it ─────────────────
  //
  // A status alone cannot answer this. **A 404 is evidence about a request, not
  // about a capability**: it is returned both by a path the platform does not
  // publish and by a published path asked for a resource that does not exist.
  // Reading the first meaning into the second is exactly how the registers this
  // script re-derives went stale — and this script made that mistake twice
  // before the rule below existed. Once against five guessed paths, and once
  // against four routes that had *just been implemented*, whose 404s for a
  // deliberately non-existent identifier read as absence.
  //
  // So the published document decides whether the path exists, and the status
  // decides what happened when it was called.
  const published = isPublished(method, path);

  const verdict =
    !published ? 'GAP'
    : r.status === 403 ? 'IMPLEMENTED (permission-gated)'
    : r.status === 404 ? 'IMPLEMENTED (no such resource)'
    : r.status < 500 ? 'IMPLEMENTED'
    : 'ERROR';

  const d = r.body?.data;
  const shape = Array.isArray(d) ? `array(${d.length})` : d ? `{${Object.keys(d).join(',').slice(0, 60)}}` : '-';
  rec(family, `${capability} — \`${method} ${path.split('?')[0]}\``, verdict,
    `published=${published} status=${r.status} data=${shape}`);
}

const c = {};
for (const r of results) c[r.verdict] = (c[r.verdict] ?? 0) + 1;
console.log(`\n  ${Object.entries(c).map(([k, v]) => `${v} ${k}`).join(' · ')} · ${results.length} probes\n`);

save(EV);
writeFileSync(EV.replace('evidence-', 'results-'), JSON.stringify({ run: RUN, results }, null, 1));
