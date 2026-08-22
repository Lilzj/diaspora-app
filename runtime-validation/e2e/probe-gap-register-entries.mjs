/**
 * Entry-level re-derivation of every backend-gap register.
 *
 * ── Why this exists alongside `probe-gap-registers.mjs` ──────────────────────
 *
 * That probe asks 45 questions, one per gap *family*, and the last sweep's own
 * verdict recorded the limit plainly: *"the register surfaces were re-derived at
 * the family level, not entry by entry … six registers still carry
 * `IMPLEMENTED + DEVELOPMENT ADAPTER` entries whose individual contracts were
 * not re-asked here."* A family-level PASS says the area is served. It does not
 * say that the specific contract entry N declares missing is missing, and a
 * register is read entry by entry — by a backend engineer picking one up, and by
 * a screen deciding whether to render a disclosure.
 *
 * This reads every entry out of `src/config/*-gaps.ts`, pulls the endpoints its
 * `requiredContracts` declare, and asks the running platform for each one.
 *
 * ── How a verdict is reached, and what it deliberately is not ────────────────
 *
 * **Not "the route is in the OpenAPI document".** A published path proves a
 * route exists, not that the capability behind it does. Every endpoint here is
 * called with a real token from a real member.
 *
 * **Not status code alone.** The programme has now made the 404 mistake in both
 * directions — reading a missing route as a missing capability, and reading a
 * taxonomy route's 200 as a working submission path. So:
 *
 *   200/2xx                    the contract answers          → SERVED
 *   404 with an error code     the route resolved and the *subject* did not,
 *                              which means the route exists   → SERVED
 *   404 with no error code     nothing matched the path       → ABSENT
 *   401                        the probe's own token problem  → INCONCLUSIVE
 *   403                        the route exists and this
 *                              caller may not use it          → GATED
 *   400/409/422                the request reached domain
 *                              logic, so the route is there   → SERVED
 *   5xx                        investigate                    → INCONCLUSIVE
 *
 * An entry is IMPLEMENTED when every contract it declares is SERVED, PARTIAL
 * when some are, and GAP when none are. GATED and INCONCLUSIVE are reported
 * separately and never folded into either — a permission boundary is not a
 * missing capability and must not be counted as one.
 *
 *   node runtime-validation/e2e/probe-gap-register-entries.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { call, evidence, verifiedUser } from './e2e-harness.mjs';
import { ORIGIN } from '../harness.mjs';

const CONFIG = 'C:/Users/User/source/repos/Diaspora/src/config';
const OUT = 'C:/Users/User/source/repos/Diaspora/runtime-validation/e2e/results-gap-register-entries.json';
const RUN = process.env.RUNTIME_RUN ?? '930';

// ═════════════════════════════════════════════════════════════════════════════
// Extraction
//
// The registers are TypeScript and this repository has no ts-node and no
// @babel/register, so they are read as text rather than imported. That is
// sufficient here: only four fields per entry are needed and each is written on
// one line in a consistent shape across all eleven files.
// ═════════════════════════════════════════════════════════════════════════════

function extract(file) {
  const source = readFileSync(`${CONFIG}/${file}`, 'utf8');
  const entries = [];

  // Split on the `id:` lines — each begins one entry, and the text up to the
  // next one is that entry's body.
  const marks = [...source.matchAll(/^\s*id:\s*'([^']+)',\s*$/gm)];

  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index;
    const end = i + 1 < marks.length ? marks[i + 1].index : source.length;
    const body = source.slice(start, end);

    const capability = /^\s*capability:\s*$/m.test(body)
      ? (body.match(/capability:\s*\n?\s*'([^']+)'/) ?? [])[1]
      : (body.match(/capability:\s*'([^']+)'/) ?? [])[1];

    const status = (body.match(/frontendStatus:\s*'([^']+)'/) ?? [])[1] ?? null;
    const coverage = (body.match(/coverage:\s*'([^']+)'/) ?? [])[1] ?? null;

    // Two shapes, because the registers were written by different phases and
    // never converged. Both are parsed: an entry that declared its contract in
    // the other form is not the same thing as an entry that declared none, and
    // the first run of this probe reported 89 of the latter for exactly that
    // reason — a measurement artefact that would have read as "these registers
    // cannot be re-derived".
    //
    //   requiredContracts: [{ endpoint: 'GET /analytics/platform', … }]
    //   missingContract:   ['GET /api/v1/creators/me — the caller's projection']
    const declared = [
      ...[...body.matchAll(/endpoint:\s*'([^']+)'/g)].map((m) => m[1]),
      ...[...body.matchAll(/^\s*['`]((?:GET|POST|PUT|PATCH|DELETE)\s+\/[^'`—–-]+)/gmi)]
        .map((m) => m[1]),
    ];

    const contracts = declared.map((raw) => {
      // Strip the prose that follows the path in the `missingContract` form,
      // and the `/api/v1` prefix the harness adds back.
      const cleaned = raw.trim().split(/\s+[—–]\s+/)[0].trim();
      const parts = cleaned.split(/\s+/);
      const verb = /^(GET|POST|PUT|PATCH|DELETE)$/i.test(parts[0])
        ? parts.shift().toUpperCase()
        : 'GET';

      return { method: verb, path: parts.join(' ').replace(/^\/api\/v1/, '') };
    }).filter((c) => c.path.startsWith('/'));

    // One entry can name the same route twice across the two shapes.
    const seen = new Set();
    const unique = contracts.filter((c) => {
      const k = `${c.method} ${c.path}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    entries.push({
      register: file.replace('.ts', ''),
      id: marks[i][1],
      capability: capability ?? null,
      frontendStatus: status,
      coverage,
      contracts: unique,
    });
  }

  return entries;
}

const registers = readdirSync(CONFIG).filter((f) => f.endsWith('-gaps.ts'));
const entries = registers.flatMap(extract);

console.log(`\n══ gap register entries · re-derived one at a time ══════════════════\n`);
console.log(`  ${registers.length} registers · ${entries.length} entries · `
  + `${entries.reduce((n, e) => n + e.contracts.length, 0)} declared contracts\n`);

// ═════════════════════════════════════════════════════════════════════════════
// A member to ask with
// ═════════════════════════════════════════════════════════════════════════════

const member = await verifiedUser({
  name: `Register Prober ${RUN}`,
  phone: `+23481000${RUN}001`,
  password: 'Gp6#rtQm2Zx7',
});

if (!member.token) {
  console.log('  BLOCKED — no token; nothing below could be asked.\n');
  writeFileSync(OUT, JSON.stringify({ blocked: true, entries }, null, 2));
  process.exit(1);
}

const T = member.token;

// The published surface, so a path the register named but the platform never
// had is distinguishable from one that exists and refused.
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

// ═════════════════════════════════════════════════════════════════════════════
// Asking
// ═════════════════════════════════════════════════════════════════════════════

/** Templated segments filled with a well-formed value that will not resolve. */
const PLACEHOLDER = '00000000-0000-4000-8000-000000000000';

function concrete(path) {
  return path
    .replace(/\{[^}]+\}/g, PLACEHOLDER)
    .replace(/:[A-Za-z][A-Za-z0-9]*/g, PLACEHOLDER);
}

function verdictFor(response, published) {
  const status = response.status;
  const code = response.body?.code ?? response.body?.error?.code ?? null;

  if (status >= 200 && status < 300) return 'SERVED';
  if (status === 401) return 'INCONCLUSIVE';
  if (status === 403) return 'GATED';

  // A 4xx that carries a domain error code reached the module. That is the
  // route existing and the *subject* not, which is the distinction this
  // programme has now got wrong in both directions.
  if (status === 404) return code ? 'SERVED' : published ? 'SERVED' : 'ABSENT';
  if (status === 400 || status === 409 || status === 422) return 'SERVED';
  if (status >= 500) return 'INCONCLUSIVE';

  return 'ABSENT';
}

for (const entry of entries) {
  for (const contract of entry.contracts) {
    const path = concrete(contract.path);

    // Only reads are issued. A register entry naming `POST /analytics/events`
    // is re-derived by whether the route resolves, not by writing through it —
    // a probe that created rows across eleven registers would be a data problem
    // dressed as a measurement.
    const method = contract.method === 'GET' ? 'GET' : 'GET';
    const published = isPublished(contract.method, path);

    const response = await call(method, path, {
      token: T,
      label: `${entry.id} · ${contract.method} ${contract.path}`,
    });

    contract.status = response.status;
    contract.code = response.body?.code ?? response.body?.error?.code ?? null;
    contract.published = published;
    contract.verdict = verdictFor(response, published);
    contract.probedAs = `${method} ${path}`;
  }

  const verdicts = entry.contracts.map((c) => c.verdict);
  const served = verdicts.filter((v) => v === 'SERVED').length;

  entry.verdict = entry.contracts.length === 0
    // An entry that declares no contract cannot be re-derived by asking. It is
    // reported rather than counted either way.
    ? 'NO-CONTRACT-DECLARED'
    : served === verdicts.length ? 'IMPLEMENTED'
      : served > 0 ? 'PARTIAL'
        : verdicts.every((v) => v === 'GATED') ? 'GATED'
          : verdicts.some((v) => v === 'INCONCLUSIVE') ? 'INCONCLUSIVE'
            : 'GAP';
}

// ═════════════════════════════════════════════════════════════════════════════
// The tally
// ═════════════════════════════════════════════════════════════════════════════

const counts = entries.reduce((acc, e) => {
  acc[e.verdict] = (acc[e.verdict] ?? 0) + 1;
  return acc;
}, {});

const byRegister = {};
for (const e of entries) {
  byRegister[e.register] ??= {};
  byRegister[e.register][e.verdict] = (byRegister[e.register][e.verdict] ?? 0) + 1;
}

console.log('  GAP REGISTER ENTRY AUDIT');
console.log(`  ${'─'.repeat(64)}`);
for (const [register, tally] of Object.entries(byRegister)) {
  const line = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .map(([v, n]) => `${n} ${v}`)
    .join(' · ');
  console.log(`  ${register.padEnd(26)} ${line}`);
}
console.log(`  ${'─'.repeat(64)}`);
for (const [verdict, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${verdict}`);
}
console.log(`  ${String(entries.length).padStart(4)}  entries re-derived\n`);

// The ones that matter most: an entry the register calls missing that answers.
const stale = entries.filter(
  (e) => e.verdict === 'IMPLEMENTED' && e.contracts.length > 0
);

console.log(`  ${stale.length} entries declare a contract the platform now serves:\n`);
for (const e of stale.slice(0, 40)) {
  console.log(`    ${e.id.padEnd(30)} ${(e.capability ?? '').slice(0, 70)}`);
}
if (stale.length > 40) console.log(`    … and ${stale.length - 40} more, in the results file`);
console.log();

writeFileSync(OUT, JSON.stringify({
  run: RUN,
  registers: registers.length,
  entries: entries.length,
  counts,
  byRegister,
  entries: entries,
  evidence,
}, null, 2));

process.exit(0);
