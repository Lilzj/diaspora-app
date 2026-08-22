/**
 * Every runtime harness, in order, as one gate.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * The root cause behind every defect this programme has found is written down in
 * the project's own notes: **the two repositories have thorough test suites and
 * not one test asserts anything about the other.** 4,113 frontend tests and
 * 4,238 backend tests were green throughout, while a member could not list an
 * item for sale, tapping any listing went nowhere, and a country-scoped housing
 * search returned nothing.
 *
 * The harnesses under this directory are the missing assertions. They were built
 * as an audit and run by hand, which means they catch a defect once. Run as a
 * gate they catch it the day it lands:
 *
 *   DEFECT-009  would have failed `search items are keyed listingId`
 *   DEFECT-010  would have failed `probe-country-scope` on housing
 *   DEFECT-008  would have failed `create listing` with 403 not-seller
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *     npm run e2e                    # all harnesses, fresh identity block
 *     npm run e2e -- --run 700       # pin the phone block
 *     npm run e2e -- --only marketplace,verticals
 *
 * Exits **non-zero if any check failed**, which is the whole point — the
 * individual harnesses report and exit 0 so a human can read the whole sweep,
 * and this decides.
 *
 * ── The one thing to know before adding a harness ────────────────────────────
 *
 * `RUNTIME_RUN` seeds the phone number block. Reusing a block turns every
 * registration into a duplicate-account test, so each harness gets its own
 * offset from the base and the base defaults to something derived from the
 * clock rather than a constant.
 */
import { spawnSync } from 'node:child_process';

import { sql } from '../harness.mjs';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Each harness, with the phone-block offset that keeps its identities distinct. */
const HARNESSES = [
  { key: 'marketplace', file: 'e2e-marketplace.mjs', offset: 0 },
  { key: 'verticals', file: 'e2e-verticals.mjs', offset: 1 },
  { key: 'financial', file: 'e2e-financial.mjs', offset: 2 },
  { key: 'creator', file: 'e2e-creator-automation-analytics.mjs', offset: 3 },
  { key: 'community-life', file: 'e2e-community-life.mjs', offset: 4 },
  { key: 'admin-analytics', file: 'e2e-admin-analytics.mjs', offset: 5 },
  { key: 'country-scope', file: 'probe-country-scope.mjs', offset: 6 },
  { key: 'gap-registers', file: 'probe-gap-registers.mjs', offset: 7 },
  { key: 'security', file: 'security-probe.mjs', offset: 8 },
  { key: 'subject-rights', file: 'subject-rights-probe.mjs', offset: 9 },
  { key: 'gap-claims', file: 'gap-claims-probe.mjs', offset: 10 },

  // Added after BG-07 shipped "verified" on the strength of a 403 against a
  // fabricated id and answered 500 on the first real press. This one seeds a
  // real guide, listing, property and event, duplicates each, and checks the
  // SERVER rather than the response. A route resolving is not a capability
  // working, and the gate now asks the second question too.
  { key: 'duplication', file: 'probe-duplication.mjs', offset: 11 },
  { key: 'attribution', file: 'probe-creator-attribution.mjs', offset: 12 },
  { key: 'member-reporting', file: 'probe-member-reporting.mjs', offset: 13 },
];

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};

// A block derived from the clock rather than a constant, because a fixed default
// would collide with itself on the second run of the day.
const base = Number(argOf('run') ?? (700 + (Math.floor(Date.now() / 60000) % 250)));
const only = argOf('only')?.split(',').map((s) => s.trim());

const selected = only ? HARNESSES.filter((h) => only.includes(h.key)) : HARNESSES;

if (!selected.length) {
  console.error(`No harness matched --only ${only?.join(',')}.`);
  console.error(`Known: ${HARNESSES.map((h) => h.key).join(', ')}`);
  process.exit(2);
}

if (!process.env.RUNTIME_API_LOG) {
  console.error(
    'RUNTIME_API_LOG is not set. It must point at the running API\'s log — development OTP\n'
    + 'delivery writes the verification code there, and identities cannot be created without it.\n'
    + 'See runtime-validation/README.md §3.'
  );
  process.exit(2);
}

const origin = process.env.RUNTIME_API_ORIGIN ?? 'http://127.0.0.1:5099';

// Fail fast and legibly rather than after eight harnesses of connection errors.
try {
  const health = await fetch(`${origin}/health/ready`, { signal: AbortSignal.timeout(15_000) });
  console.log(`API at ${origin}: ${health.status}\n`);
} catch (cause) {
  console.error(`The API at ${origin} is not answering: ${cause}`);
  console.error('Start it as described in runtime-validation/README.md §3.');
  process.exit(2);
}

// ── The phone block must be free before anything runs ────────────────────────
//
// `base` comes from the clock, so a run can land on a block a previous run
// already used. Registration then answers 409 and the harness reports its setup
// as **FAIL** — which is indistinguishable, in the summary table, from a real
// regression. That happened once and cost a diagnosis.
//
// A gate that reports "2 FAIL" when the truth is "these phone numbers are
// taken" is worse than one that refuses to start, so this refuses to start.
// `--run` is honoured as given: pinning a block explicitly is a deliberate act,
// and the check still says so rather than quietly moving.
const occupied = (() => {
  const blocks = selected.map((h) => base + h.offset);
  const list = blocks.map((b) => `'+23481000${b}%'`).join(', ');
  const out = sql(
    `SELECT string_agg(DISTINCT substring("PhoneNumber" from 10 for 3), ',')`
    + ` FROM identity.users WHERE "PhoneNumber" LIKE ANY (ARRAY[${list}]);`
  );
  if (out.startsWith('SQL_ERROR')) {
    console.error(`Could not check the phone blocks: ${out}`);
    process.exit(2);
  }
  return out ? out.split(',').filter(Boolean) : [];
})();

if (occupied.length) {
  const free = sql(
    `SELECT b FROM generate_series(100, 989) b WHERE NOT EXISTS (`
    + ` SELECT 1 FROM identity.users u WHERE u."PhoneNumber" LIKE '+23481000' || b::text || '%')`
    + ` ORDER BY b LIMIT 1;`
  );
  console.error(
    `Phone block(s) ${occupied.join(', ')} already hold identities from an earlier run.\n`
    + 'Registration would answer 409 and every harness would report its setup as FAIL,\n'
    + 'which reads exactly like a regression and is not one.\n'
    + (free && !free.startsWith('SQL_ERROR')
      ? `\n    npm run e2e -- --run ${free}\n`
      : '\nPick a block no identity uses yet.\n')
  );
  process.exit(2);
}

const summary = [];

for (const harness of selected) {
  const run = base + harness.offset;
  console.log(`${'─'.repeat(72)}\n▶ ${harness.key}  (RUNTIME_RUN=${run})\n`);

  const started = Date.now();
  const result = spawnSync(process.execPath, [join(here, harness.file)], {
    cwd: here,
    stdio: 'inherit',
    env: { ...process.env, RUNTIME_RUN: String(run) },
  });

  const counts = readCounts(harness.file);
  summary.push({
    key: harness.key,
    exitCode: result.status ?? -1,
    seconds: Math.round((Date.now() - started) / 1000),
    ...counts,
  });
}

// ── The verdict ──────────────────────────────────────────────────────────────
//
// Only FAIL fails. SWITCHED-OFF, GAP, INFO and NO DATA are recorded classifications,
// not failures — a deployment that declares a capability off and then refuses it is
// behaving, and a gap that is named rather than invented is the register working.

console.log(`${'═'.repeat(72)}\n  RUNTIME SWEEP\n`);
console.log(`  ${'harness'.padEnd(18)} ${'pass'.padStart(5)} ${'fail'.padStart(5)} ${'other'.padStart(6)}  time  exit`);

let failures = 0;
let crashed = 0;

for (const row of summary) {
  if (row.fail > 0) failures += row.fail;
  if (row.exitCode !== 0) crashed++;

  console.log(
    `  ${row.key.padEnd(18)} ${String(row.pass).padStart(5)} ${String(row.fail).padStart(5)} `
    + `${String(row.other).padStart(6)}  ${String(row.seconds).padStart(4)}s  ${row.exitCode}`
  );
}

const totals = summary.reduce(
  (a, r) => ({ pass: a.pass + r.pass, fail: a.fail + r.fail, other: a.other + r.other }),
  { pass: 0, fail: 0, other: 0 }
);

// ── The disclosure audit, reported rather than absorbed ──────────────────────
//
// The gap-claims probe's verdicts are not PASS/FAIL and must not be flattened
// into "other": a claim that has gone stale is a screen telling members the
// platform cannot do something it can, and that should be legible in the gate
// output rather than in a JSON file somebody has to know to open.
//
// **UNCLEAR is printed too.** A sweep that quietly rounded uncertainty up to
// "fine" would be the failure this whole programme exists to catch.
if (selected.some((h) => h.key === 'gap-claims')) {
  const file = join(here, 'results-gap-claims-probe.json');
  if (existsSync(file)) {
    const claims = JSON.parse(readFileSync(file, 'utf8')).results ?? [];
    const verdicts = claims.reduce((acc, r) => {
      if (r.verdict === 'PASS' || r.verdict === 'FAIL') return acc;
      acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
      return acc;
    }, {});
    const asked = Object.values(verdicts).reduce((a, b) => a + b, 0);

    console.log('\n  GAP CLAIM AUDIT');
    console.log(`  ${'Claims asked'.padEnd(22)} ${String(asked).padStart(4)}`);
    for (const verdict of ['CLAIM STALE', 'CLAIM TRUE', 'UNCLEAR', 'BLOCKED']) {
      if (verdicts[verdict] === undefined) continue;
      console.log(`  ${verdict.padEnd(22)} ${String(verdicts[verdict]).padStart(4)}`);
    }
    if (verdicts.UNCLEAR || verdicts.BLOCKED) {
      console.log('\n  Unsettled claims — evidence insufficient, not evidence of absence:');
      for (const claim of claims.filter((r) => r.verdict === 'UNCLEAR' || r.verdict === 'BLOCKED')) {
        console.log(`    [${claim.domain}] ${claim.flow} — ${claim.note}`);
      }
    }
  }
}

console.log(`\n  ${totals.pass} PASS · ${totals.fail} FAIL · ${totals.other} other`
  + ` · ${totals.pass + totals.fail + totals.other} checks\n`);

if (crashed) console.error(`  ${crashed} harness(es) exited non-zero.`);
if (failures) console.error(`  ${failures} check(s) failed.`);

console.log(`${'═'.repeat(72)}`);

process.exit(failures || crashed ? 1 : 0);

/**
 * Reads a harness's own results file.
 *
 * The harnesses write `results-*.json` beside themselves and exit 0 whatever
 * they found, so that a person running one by hand sees the whole sweep rather
 * than a truncated one. The gate is here instead.
 */
function readCounts(file) {
  const stem = file.replace(/^(e2e|probe)-/, '').replace(/\.mjs$/, '');
  const candidate = readdirSync(here).find(
    (name) => name.startsWith('results-') && name.includes(stem)
  );

  if (!candidate || !existsSync(join(here, candidate))) {
    return { pass: 0, fail: 0, other: 0 };
  }

  const results = JSON.parse(readFileSync(join(here, candidate), 'utf8')).results ?? [];

  return {
    pass: results.filter((r) => r.verdict === 'PASS').length,
    fail: results.filter((r) => r.verdict === 'FAIL').length,
    other: results.filter((r) => r.verdict !== 'PASS' && r.verdict !== 'FAIL').length,
  };
}
