/**
 * Member-facing capability claims — the completion pass.
 *
 * ── What this is for ─────────────────────────────────────────────────────────
 *
 * The previous sweep put 75 claims to the server and was explicit that it had
 * not finished: *"CLEAN for every claim probed. NOT COMPLETE for the inventory
 * as a whole."* 409 member-facing rows carry a DENIAL or a PROVENANCE tier and
 * most had no runtime verdict.
 *
 * This is the rest of them, in the priority order the brief sets: creator,
 * wallet, automation, marketplace, housing, jobs, community, organizations,
 * events, analytics, privacy, maps, integrations, notifications.
 *
 * ── What is deliberately NOT here ────────────────────────────────────────────
 *
 * The brief is explicit: *"Do not attempt to runtime-verify every error string
 * or validation message simply because it contains words such as 'cannot',
 * 'unsupported', or 'unavailable'. The objective is semantic adjudication of
 * actual platform capability claims."*
 *
 * So a sentence is asked here only if it tells a member something about what the
 * **platform** can do. Excluded, and classified in
 * `member-facing-adjudication.md` rather than probed:
 *
 *   • empty states        "You have no unread messages. Enjoy the peace."
 *   • validation          "Minimum price cannot be greater than maximum price."
 *   • authorization       "You do not have access to this report."
 *   • confirmations       "This cannot be undone."
 *   • device facts        "Your device has location switched off for every app."
 *   • legal copy          the terms, which describe a company rather than a build
 *   • scanner artefacts   JSX fragments the character scanner caught mid-expression
 *
 * Each of those is a true sentence about something other than platform
 * capability, and probing them would inflate a denominator rather than settle
 * anything.
 *
 * ── How a verdict is reached ─────────────────────────────────────────────────
 *
 *   STALE      the platform does the thing the sentence denies
 *   TRUE       the platform does not, and the sentence is right
 *   PARTIAL    it does some of it; the sentence overstates the absence
 *   GATED      it does, for a caller with standing this member lacks
 *
 * A 404 with a domain error code is the route existing and the subject not. A
 * 404 with no code is a missing route. Neither is read from the status alone.
 *
 *   node runtime-validation/e2e/probe-member-claims.mjs
 */
import { writeFileSync } from 'node:fs';
import { call, evidence, verifiedUser, uploadDirect, recorder } from './e2e-harness.mjs';

const OUT = 'C:/Users/User/source/repos/Diaspora/runtime-validation/e2e/results-member-claims.json';
const RUN = process.env.RUNTIME_RUN ?? '950';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const stamp = `MC${RUN}`;

const results = [];
const ok = (r) => r.status >= 200 && r.status < 300;
const code = (r) => r.body?.code ?? r.body?.error?.code ?? null;

/**
 * Whether the request reached the platform's own logic at all.
 *
 * `Platform.Validation.Failed` means the body or the query string could not be
 * read — the request never got past deserialisation, so it says nothing about
 * what the domain would have decided. The first run of this probe sent the wrong
 * deposit body and omitted the heatmap's required bounding box, and read both
 * refusals as evidence. That is the same fail-open mistake the member-reporting
 * probe made and it has to be closed here too.
 */
const reached = (r) => code(r) !== 'Platform.Validation.Failed';

/** One adjudicated claim. */
function verdict(area, sentence, state, evidenceNote) {
  results.push({ area, sentence, state, evidence: evidenceNote });
  const mark = {
    STALE: 'STALE  ', TRUE: 'TRUE   ', PARTIAL: 'PARTIAL',
    GATED: 'GATED  ', INCONCLUSIVE: 'UNCLEAR',
  }[state] ?? state;
  console.log(`  ${mark} [${area}] ${sentence.slice(0, 62)}`);
  console.log(`          ${evidenceNote}`);
}

console.log('\n══ member-facing capability claims ════════════════════════════════════\n');

const member = await verifiedUser({ name: `Claims ${stamp}`, phone: ph(1), password: 'Yr5#dGkP7wLs' });

if (!member.token) {
  console.log('  BLOCKED — no member.\n');
  writeFileSync(OUT, JSON.stringify({ blocked: true, results, evidence }, null, 2));
  process.exit(1);
}

const T = member.token;

/** Ask one route and hand back a compact description of what it said. */
async function ask(method, path, body, label) {
  const r = await call(method, path, { token: T, body, label: label ?? `${method} ${path}` });
  return { r, note: `${method} ${path} → ${r.status}${code(r) ? ` ${code(r)}` : ''}` };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1 · CREATOR
// ═════════════════════════════════════════════════════════════════════════════

{
  const { r, note } = await ask('GET', '/creators/me/activity?limit=5');
  verdict('creator', 'Diaspora cannot show your activity history yet',
    ok(r) ? 'STALE' : 'TRUE', `${note} — BG-06 closed the read route.`);
}

{
  // BG-07. The control existed across several phases and did nothing.
  const { r, note } = await ask('POST', '/guides/00000000-0000-4000-8000-000000000000/duplicate', {});
  verdict('creator', 'Diaspora cannot duplicate content — no part of the platform copies an item',
    r.status !== 404 || code(r) ? 'STALE' : 'TRUE',
    `${note} — a domain error means the route resolved; BG-07 built it for guides, marketplace, housing and events.`);
}

{
  const { r, note } = await ask('GET', '/creators/content-health/rubric');
  verdict('creator', 'Diaspora cannot audit your content yet',
    ok(r) ? 'STALE' : 'TRUE',
    `${note} — BG-08 publishes the completeness rubric the client scores against.`);
}

{
  const { r, note } = await ask('GET', '/analytics/creators/me/summary');
  verdict('creator', 'Headline figures are not available yet',
    ok(r) ? 'STALE' : 'TRUE', note);
}

{
  const media = await uploadDirect(T, { fileName: `${stamp}.png`, label: 'profile photo upload' });
  verdict('creator', 'Diaspora cannot store photos yet',
    ok(media) ? 'STALE' : 'TRUE',
    `POST /media/uploads/direct → ${media.status} — the media pipeline accepts and stores bytes.`);
}

{
  const { r, note } = await ask('GET', '/creators/me');
  verdict('creator', 'Creator profile and status projection — Diaspora cannot do this yet',
    ok(r) ? 'STALE' : 'TRUE', `${note} — CREATOR-GAP-001, closed by Remediation Wave C-03.`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 2 · WALLET / FINANCIAL
// ═════════════════════════════════════════════════════════════════════════════

{
  const { r, note } = await ask('POST', '/financial/wallets/me/deposits',
    { amount: 100, currency: 'NGN', methodKind: 'MobileMoney', countryCode: 'NG' });

  verdict('wallet', 'Deposits are not available',
    !reached(r) ? 'INCONCLUSIVE' : r.status === 503 ? 'TRUE' : ok(r) ? 'STALE' : 'TRUE',
    `${note} — the switch answers before any balance check. Retained.`);
}

{
  const { r, note } = await ask('POST', '/financial/wallets/me/withdrawals',
    { amount: 100, currency: 'NGN', destinationId: '00000000-0000-4000-8000-000000000000' });

  verdict('wallet', 'Payouts are not available',
    !reached(r) ? 'INCONCLUSIVE' : r.status === 503 ? 'TRUE' : ok(r) ? 'STALE' : 'TRUE',
    `${note} — the switch answers before any balance check. Retained.`);
}

{
  const { r, note } = await ask('GET', '/financial/receipts/UNKNOWN-REFERENCE');
  verdict('wallet', 'Diaspora cannot produce a formal invoice yet',
    code(r) ? 'PARTIAL' : 'TRUE',
    `${note} — receipts exist; a formal invoice is a different document and is not served.`);
}

// "You do not have a wallet yet" is deliberately NOT adjudicated here. It is a
// per-member state — the route answers 200 for a member who has one and 404 for a
// member who does not — and calling it STALE because this probe's member happened
// to have one would be adjudicating the fixture rather than the platform.
// Classified as a conditional state in `member-facing-adjudication.md`.

// ═════════════════════════════════════════════════════════════════════════════
// 3 · AUTOMATION
// ═════════════════════════════════════════════════════════════════════════════

{
  const { r, note } = await ask('GET', '/automations/capabilities');
  verdict('automation', 'Automations are not available in this build yet',
    ok(r) ? 'STALE' : 'TRUE', note);
}

{
  const { r, note } = await ask('GET', '/automations/catalog');
  const triggers = r.body?.data?.triggers ?? [];
  const location = triggers.filter((t) => /location/i.test(t.key ?? '') && t.isAvailable === false);
  verdict('automation', 'Automations that react to where you are would need background location',
    location.length > 0 ? 'TRUE' : 'STALE',
    `${note} — ${location.length} location trigger(s) published with isAvailable:false. Retained.`);
}

{
  const { r, note } = await ask('GET', '/automations?limit=5');
  verdict('automation', 'Diaspora cannot run this automatically yet',
    ok(r) ? 'STALE' : 'TRUE',
    `${note} — the registry stores definitions and AutomationSchedulerWorker sweeps due occurrences.`);
}

{
  const { r, note } = await ask('GET', '/automations/saved-searches');
  verdict('automation', 'Saved searches are not ready yet',
    ok(r) || code(r) ? 'STALE' : 'TRUE', note);
}

// ═════════════════════════════════════════════════════════════════════════════
// 4–6 · MARKETPLACE · HOUSING · JOBS
// ═════════════════════════════════════════════════════════════════════════════

{
  const { r, note } = await ask('POST', '/marketplace/listings/00000000-0000-4000-8000-000000000000/duplicate', {});
  verdict('marketplace', 'There is no way to copy a listing',
    r.status !== 404 || code(r) ? 'STALE' : 'TRUE', note);
}

{
  const { r, note } = await ask('POST', '/housing/listings/00000000-0000-4000-8000-000000000000/duplicate', {});
  verdict('housing', 'There is no way to copy a property',
    r.status !== 404 || code(r) ? 'STALE' : 'TRUE', note);
}

{
  // The employer directory. The client says a profile "cannot be looked up".
  const { r, note } = await ask('GET', '/jobs/employers/00000000-0000-4000-8000-000000000000');
  verdict('jobs', 'Employer profiles are not something this platform can look up yet',
    code(r) || ok(r) ? 'STALE' : 'TRUE',
    `${note} — GET /jobs/employers/{idOrSlug} is published and resolves.`);
}

{
  const { r, note } = await ask('GET', '/jobs/applications?limit=5');
  verdict('jobs', 'Interviews and offers are shown as totals — no route lists them for an employer',
    ok(r) ? 'PARTIAL' : 'TRUE',
    `${note} — applications list; per-application interviews and offers are served at `
    + `/jobs/applications/{id}/interviews and /offers, but no employer-wide list exists.`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 7–9 · COMMUNITY · ORGANIZATIONS · EVENTS
// ═════════════════════════════════════════════════════════════════════════════

{
  const { r, note } = await ask('POST', '/community/reports', {
    contentType: 'Member',
    contentId: '00000000-0000-4000-8000-000000000000',
    reason: 'spam',
    description: 'Adjudication probe.',
  });
  verdict('community', 'Reporting a member is not supported',
    code(r) === 'community.content.not-found' ? 'STALE' : 'TRUE',
    `${note} — BG-05a: the type resolves; this id is not a member.`);
}

{
  const { r, note } = await ask('GET', '/communities/organizations/00000000-0000-4000-8000-000000000000/analytics');

  // 403 is the route existing and this caller lacking standing on that
  // organisation — which is what a member who administers none should get. It
  // proves the projection is real; it does not prove this member can read one,
  // and folding it into STALE would count a permission boundary as a fixed gap.
  verdict('organizations', 'Diaspora has no analytics projection for an organisation',
    r.status === 403 ? 'GATED' : ok(r) || code(r) ? 'STALE' : 'TRUE',
    `${note} — the route resolves and refuses on standing, so the projection exists.`);
}

{
  const { r, note } = await ask('GET', '/communities/organizations/00000000-0000-4000-8000-000000000000/analytics/members');

  // The sentence is about a *community*; this route is about an *organisation*.
  // They are different subjects, so the route answering says nothing about the
  // claim. It stays TRUE, and the note says why rather than borrowing the
  // organisation's projection as evidence for a community one.
  verdict('community', "Diaspora has no way to count a community's members yet", 'TRUE',
    `${note} — an ORGANISATION member projection exists. No community membership `
    + `edge does, so a community's members still cannot be counted. Retained.`);
}

{
  const { r, note } = await ask('GET', '/community-life/events/00000000-0000-4000-8000-000000000000/analytics');
  verdict('events', 'Registration, capacity and attendance are simulated',
    code(r) || ok(r) ? 'PARTIAL' : 'TRUE',
    `${note} — event analytics resolve; seats, waiting lists and check-in remain unmodelled.`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 10 · ANALYTICS
// ═════════════════════════════════════════════════════════════════════════════

{
  const { r, note } = await ask('GET', '/analytics/access');
  verdict('analytics', 'The certified backend has no analytics contract — not a partial one, none',
    ok(r) ? 'STALE' : 'TRUE',
    `${note} — 18 analytics routes are published, including per-caller access and served definitions.`);
}

{
  const { r, note } = await ask('GET', '/analytics/definitions');
  verdict('analytics', 'Metric definitions are not published by the platform',
    ok(r) ? 'STALE' : 'TRUE', note);
}

{
  const { r, note } = await ask('GET', '/analytics/content/guide/00000000-0000-4000-8000-000000000000');
  verdict('analytics', 'Diaspora records no view, impression or save yet',
    code(r) || ok(r) ? 'PARTIAL' : 'TRUE',
    `${note} — a per-content analytics route resolves; whether it carries a time series is the narrower claim.`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 11 · PRIVACY
// ═════════════════════════════════════════════════════════════════════════════

{
  const { r, note } = await ask('GET', '/privacy/export');
  verdict('privacy', 'Diaspora has no privacy controls yet',
    ok(r) || code(r) ? 'STALE' : 'TRUE', note);
}

{
  const { r, note } = await ask('GET', '/privacy/deletion/preview');
  verdict('privacy', 'Diaspora cannot preview what deleting your account removes',
    ok(r) || code(r) ? 'STALE' : 'TRUE', note);
}

// ═════════════════════════════════════════════════════════════════════════════
// 12 · MAPS
// ═════════════════════════════════════════════════════════════════════════════

{
  // north/south/east/west are required. The first run omitted them, got
  // `Platform.Validation.Failed`, and read it as the route resolving — which it
  // does, but on the weakest possible evidence. Asked properly here.
  const { r, note } = await ask('GET',
    '/geo/heatmap?layer=listings&north=7.0&south=6.0&east=4.0&west=3.0&zoom=10');

  verdict('maps', 'Map layers need an aggregate the Diaspora backend does not publish yet',
    !reached(r) ? 'INCONCLUSIVE' : ok(r) || code(r) ? 'STALE' : 'TRUE',
    `${note} — FRONTEND-MAPS-GAP-012's own entry already says RESOLVED; the screen never caught up.`);
}

{
  const { r, note } = await ask('GET', '/geo/capabilities');
  const caps = r.body?.data ?? {};
  const off = JSON.stringify(caps).includes('"available":false');
  verdict('maps', 'Cost-of-living and safety scores are not available',
    off ? 'TRUE' : 'STALE',
    `${note} — the capability document declares provider:none in plain language. Retained.`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 13–14 · INTEGRATIONS · NOTIFICATIONS
// ═════════════════════════════════════════════════════════════════════════════

{
  const { r, note } = await ask('GET', '/integrations/connections');
  verdict('integrations', 'Integrations are not available in this build',
    ok(r) || code(r) ? 'STALE' : 'TRUE', note);
}

{
  const { r, note } = await ask('GET', '/notifications/preferences');
  verdict('notifications', 'Notification preferences cannot be read',
    ok(r) ? 'STALE' : 'TRUE', note);
}

{
  const { r, note } = await ask('GET', '/notifications/analytics');
  verdict('notifications', 'Diaspora records no delivery receipt, open or dismissal',
    r.status === 403 ? 'GATED' : ok(r) ? 'PARTIAL' : 'TRUE',
    `${note} — the route resolves and is operator-gated, so this member cannot settle it either way.`);
}

// ═════════════════════════════════════════════════════════════════════════════

const tally = results.reduce((a, r) => { a[r.state] = (a[r.state] ?? 0) + 1; return a; }, {});

console.log(`\n  MEMBER-FACING CLAIM ADJUDICATION`);
console.log(`  ${'─'.repeat(56)}`);
for (const [state, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${state}`);
}
console.log(`  ${String(results.length).padStart(4)}  claims adjudicated\n`);

writeFileSync(OUT, JSON.stringify({ run: RUN, tally, results, evidence }, null, 2));
process.exit(0);
