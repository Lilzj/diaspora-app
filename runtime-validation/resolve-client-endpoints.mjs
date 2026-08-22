/**
 * Resolves the endpoint template behind every client call site, including the
 * eleven modules the previous static sweep could not read.
 *
 * ── Why the previous sweep could not read them ───────────────────────────
 *
 * These modules do not write their routes as literals. They declare
 *
 *     const ROOT = '/community-life';
 *
 * and then call a module-local helper with the *remainder* of the path:
 *
 *     read('/events')            →  apiClient.get(`${ROOT}${path}`)
 *     write('POST', `/events/${id}/rsvp`)
 *
 * A sweep looking for a string literal beginning `/` next to `apiClient.get`
 * finds nothing, and reports the module as consuming no endpoints. That is a
 * property of the measurement, not of the module.
 *
 * ── What this does instead ───────────────────────────────────────────────
 *
 *   1. reads each module's `const NAME = '<literal>'` declarations;
 *   2. finds the module-local helpers that wrap `apiClient.<verb>` and records
 *      the verb and the prefix each one applies;
 *   3. resolves every call to `apiClient.<verb>` and to those helpers,
 *      substituting known constants into template literals;
 *   4. replaces every remaining `${…}` interpolation with `{}` — a path
 *      parameter, whatever the expression computed;
 *   5. normalises to `METHOD /api/v1/<path>` and de-duplicates.
 *
 * De-duplication is by METHOD + normalised path template, never by call site:
 * two screens calling one client function consume one endpoint.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LIB = 'C:/Users/User/source/repos/Diaspora/src/lib';
const CONTRACT = 'C:/Users/User/source/repos/diaspora-backend/contracts/Diaspora.Api.json';

const INVISIBLE = [
  'analytics-api.ts', 'community-directory-api.ts', 'community-life-api.ts',
  'community-programme-api.ts', 'community-social-api.ts', 'country-intelligence-api.ts',
  'creator/certified-client.ts', 'guides-api.ts', 'jobs-hiring-api.ts',
  'providers-api.ts', 'trust-api.ts',
];

const VERBS = ['get', 'post', 'put', 'patch', 'delete'];

/** Every `.ts` under src/lib, so the figure is comparable across all clients. */
function allModules() {
  const out = [];
  const walk = (dir, rel = '') => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name), `${rel}${e.name}/`);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(`${rel}${e.name}`);
    }
  };
  walk(LIB);
  return out.filter((f) => !f.includes('__tests__'));
}

/** `const NAME = '/literal';` — the module's route roots. */
function constants(src) {
  const map = new Map();
  const re = /(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*'([^']*)'\s*;/g;
  let m;
  while ((m = re.exec(src))) map.set(m[1], m[2]);
  return map;
}

/**
 * Module-local helpers that wrap apiClient. Returns name → {verb|null, prefix}.
 * `verb: null` means the helper takes the method as its first argument.
 */
function helpers(src) {
  const found = new Map();
  const re = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    // Bound the body at the next top-level function. A fixed-size window bleeds
    // from one helper into the next, and a module whose helpers are named
    // `get`, `getPage`, `post`, `put` and `del` — as `guides-api.ts` names
    // them — then attributes every verb to the first of them. That is how
    // thirteen GET routes were once read as POSTs and reported as routes the
    // backend does not publish.
    const rest = src.slice(m.index + m[0].length);
    const nextFn = rest.search(/\n(?:async\s+)?function\s/);
    const body = nextFn === -1 ? rest : rest.slice(0, nextFn);

    // The verb is the FIRST apiClient call inside the body, not the first that
    // happens to appear in a fixed vocabulary order.
    const first = body.match(/apiClient\.(get|post|put|patch|delete)\s*[<(]/);
    if (!first) continue;

    const usesRoot = /apiClient\.\w+\s*(?:<[^>]*>)?\s*\(\s*`\$\{ROOT\}/.test(body) || /`\$\{ROOT\}\$\{path\}`/.test(body);
    const takesMethod = /^\s*(?:method|verb)\b/.test(m[2]);
    found.set(name, { verb: takesMethod ? null : first[1], prefixRoot: usesRoot });
  }
  return found;
}

/** `${ROOT}/events/${id}` → `/community-life/events/{}` */
function resolveTemplate(raw, consts) {
  let s = raw;
  for (const [k, v] of consts) s = s.split('${' + k + '}').join(v);
  s = s.replace(/\$\{[^}]*\}/g, '{}');
  return s;
}

function normalise(path) {
  let p = path.trim();
  if (!p.startsWith('/')) return null;
  p = p.replace(/\?.*$/, '').replace(/\/+$/, '') || '/';
  if (!p.startsWith('/api/')) p = `/api/v1${p}`;
  return p.replace(/\{[^}]*\}/g, '{}');
}

const results = [];
function record(file, method, rawPath, consts, via) {
  let resolved = resolveTemplate(rawPath, consts);
  // A helper that already prefixes ROOT, called with a path that also carries
  // it, would otherwise yield `/community-life/community-life{}`. Collapse the
  // duplicated root rather than emitting a route no server could serve.
  const root = consts.get('ROOT');
  if (root && root.length > 1 && resolved.startsWith(root + root)) resolved = resolved.slice(root.length);
  const path = normalise(resolved);
  if (!path || path.includes('${')) return;
  // `${ROOT}` with an empty remainder resolves to the root itself; a bare root
  // with a trailing parameter is a resolution artefact, not a call.
  if (/\{\}$/.test(path) && path.replace(/\{\}$/, '') === normalise(root ?? '')) return;
  results.push({ file, method: method.toUpperCase(), path, via });
}

for (const file of allModules()) {
  let src;
  try { src = readFileSync(join(LIB, file), 'utf8'); } catch { continue; }
  if (!/apiClient\./.test(src)) continue;

  const consts = constants(src);
  const hs = helpers(src);

  // 1. direct apiClient.<verb>('...' | `...`)
  for (const v of VERBS) {
    const re = new RegExp(`apiClient\\.${v}\\s*(?:<[^;]*?>)?\\s*\\(\\s*(\`[^\`]*\`|'[^']*')`, 'g');
    let m;
    while ((m = re.exec(src))) record(file, v, m[1].slice(1, -1), consts, 'apiClient');
  }

  // 2. module-local helper calls
  for (const [name, info] of hs) {
    if (info.verb) {
      const re = new RegExp(`(?<![.\\w])${name}\\s*(?:<[^;]*?>)?\\s*\\(\\s*(\`[^\`]*\`|'[^']*')`, 'g');
      let m;
      while ((m = re.exec(src))) {
        const inner = m[1].slice(1, -1);
        // When the helper supplies ROOT itself, its argument must be a
        // sub-path. Anything else matched a call that is not a route, and
        // joining it to ROOT would invent one. When the helper does not supply
        // ROOT, the caller passes the whole template, which may open with `${`.
        if (info.prefixRoot && inner && !inner.startsWith('/')) continue;
        record(file, info.verb, info.prefixRoot ? '${ROOT}' + inner : inner, consts, `helper:${name}`);
      }
    } else {
      // helper(method, path, …)
      const re = new RegExp(`(?<![.\\w])${name}\\s*(?:<[^;]*?>)?\\s*\\(\\s*'(GET|POST|PUT|PATCH|DELETE)'\\s*,\\s*(\`[^\`]*\`|'[^']*')`, 'g');
      let m;
      while ((m = re.exec(src))) {
        const inner = m[2].slice(1, -1);
        if (info.prefixRoot && inner && !inner.startsWith('/')) continue;
        record(file, m[1], info.prefixRoot ? '${ROOT}' + inner : inner, consts, `helper:${name}`);
      }
    }
  }
}

// ── De-duplicate by METHOD + normalised path ────────────────────────────
const distinct = new Map();
for (const r of results) {
  const key = `${r.method} ${r.path}`;
  if (!distinct.has(key)) distinct.set(key, new Set());
  distinct.get(key).add(r.file);
}

// ── Compare with the published contract ─────────────────────────────────
const doc = JSON.parse(readFileSync(CONTRACT, 'utf8'));
const published = new Set();
for (const p of Object.keys(doc.paths)) {
  for (const m of Object.keys(doc.paths[p])) {
    if (VERBS.includes(m)) published.add(`${m.toUpperCase()} ${p.replace(/\{[^}]*\}/g, '{}')}`);
  }
}

const matched = [...distinct.keys()].filter((k) => published.has(k));
const unmatched = [...distinct.keys()].filter((k) => !published.has(k));

console.log('=== CLIENT ENDPOINT RESOLUTION ===\n');
console.log(`call sites resolved              : ${results.length}`);
console.log(`distinct (METHOD, path) pairs    : ${distinct.size}`);
console.log(`published operations (denominator): ${published.size}`);
console.log(`matched against the contract     : ${matched.length}`);
console.log(`resolved but NOT published       : ${unmatched.length}`);
console.log(`consumption                      : ${matched.length} / ${published.size} = ${((matched.length / published.size) * 100).toFixed(1)}%\n`);

console.log('--- the eleven previously unreadable modules ---');
console.log('| Module | Call sites | Distinct routes | Verbs | Published | Unpublished |');
console.log('|---|---:|---:|---|---:|---:|');
let invisibleTotal = 0;
for (const mod of INVISIBLE) {
  const rows = results.filter((r) => r.file === mod);
  const keys = new Set(rows.map((r) => `${r.method} ${r.path}`));
  const pub = [...keys].filter((k) => published.has(k));
  const unpub = [...keys].filter((k) => !published.has(k));
  invisibleTotal += keys.size;
  const verbs = [...new Set(rows.map((r) => r.method))].sort().join(' ');
  console.log(`| ${mod} | ${rows.length} | ${keys.size} | ${verbs || '—'} | ${pub.length} | ${unpub.length} |`);
}
console.log(`\ndistinct routes contributed by the eleven: ${invisibleTotal}`);

if (unmatched.length) {
  console.log('\n--- resolved but not published (client addresses, contract does not declare) ---');
  for (const k of unmatched.sort()) console.log(`  ${k}   ← ${[...distinct.get(k)].join(', ')}`);
}

writeFileSync('C:/Users/User/source/repos/Diaspora/runtime-validation/client-endpoint-manifest.json', JSON.stringify({
  generated: 'runtime-validation/resolve-client-endpoints.mjs',
  callSites: results.length,
  distinct: distinct.size,
  published: published.size,
  matched: matched.length,
  unmatched,
  routes: [...distinct.entries()].map(([k, files]) => ({ route: k, published: published.has(k), files: [...files] })).sort((a, b) => a.route.localeCompare(b.route)),
}, null, 1));
console.log('\nmanifest written to runtime-validation/client-endpoint-manifest.json');
