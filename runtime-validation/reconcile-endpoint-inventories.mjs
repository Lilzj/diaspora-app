/**
 * Reconciles the three backend endpoint inventories the scorecard could not
 * reconcile: 839 minimal APIs parsed from C#, +61 MVC controller actions = 901,
 * and 885 operations published by the built host over 768 paths.
 *
 * ── Why a naive parse cannot do this ─────────────────────────────────────
 *
 * A minimal-API route is never written down in one place. An endpoint class
 * says only the tail:
 *
 *     group.MapPost("/sellers", …)
 *
 * and the head comes from the contributor that built the group:
 *
 *     endpoints.MapGroup(MarketplaceModuleMetadata.RoutePrefix)   // "/api/v1/marketplace"
 *
 * in a different file, through a constant declared in a third. A sweep that
 * counts `MapPost("…")` occurrences therefore counts `POST /sellers`, and every
 * module's root collapses onto `GET /`. Thirteen modules mapping their own root
 * then look like thirteen duplicate mappings of one route — which is exactly the
 * shape of the scorecard's standing hypothesis, arrived at by an artefact.
 *
 * ── What this does ───────────────────────────────────────────────────────
 *
 *   1. reads every `*ModuleMetadata.cs` for its `/api/v1/...` route constants;
 *   2. attributes each `.MapVerb("…")` to the module project it sits in;
 *   3. resolves the full template as prefix + tail, and — because a module may
 *      nest sub-groups — also accepts a published route that begins with one of
 *      the module's prefixes and ends with the tail;
 *   4. does the same for `[HttpVerb]` actions under their `[Route]`;
 *   5. compares on (VERB, path-with-parameter-names-erased), so `{id}`,
 *      `{id:guid}` and `{listingId}` are one position, not three.
 *
 * Anything that still resolves to nothing is reported individually rather than
 * absorbed into a residual.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const BACKEND = 'C:/Users/User/source/repos/diaspora-backend/src';
const CONTRACT = 'C:/Users/User/source/repos/diaspora-backend/contracts/Diaspora.Api.json';
const VERBS = ['get', 'post', 'put', 'patch', 'delete'];

function csFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (['obj', 'bin', 'Migrations'].includes(e.name)) continue;
      csFiles(p, out);
    } else if (e.name.endsWith('.cs')) out.push(p);
  }
  return out;
}

const norm = (path) => {
  let p = (path || '').trim();
  if (!p.startsWith('/')) p = `/${p}`;
  // `[Route("api/v{version:apiVersion}/auth")]` is one served path, not a
  // parameterised family: Asp.Versioning substitutes the declared version when
  // the route is built. Erasing it like any other parameter would compare
  // `/api/v{}/auth` against a published `/api/v1/auth` and call it a difference.
  p = p.replace(/v\{version[^}]*\}/gi, 'v1');
  return p.replace(/\{[^}]*\}/g, '{}').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
};

const projectOf = (file) => {
  const parts = file.split(/[\\/]/);
  const i = parts.findIndex((p) => p.startsWith('Diaspora.'));
  return i === -1 ? '?' : parts[i];
};

const files = csFiles(BACKEND);

// ── Constants used inside route attributes ───────────────────────────────
// `[Route(ApiEndpoints.BaseUrl + "/auth/sessions")]` cannot be read without
// them, and every MVC action in such a controller resolves to the wrong path.
const routeConstants = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const cls = f.split(/[\\/]/).pop().replace(/\.cs$/, '');
  const re = /public\s+const\s+string\s+(\w+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(src))) {
    routeConstants.set(`${cls}.${m[1]}`, m[2]);
    if (!routeConstants.has(m[1])) routeConstants.set(m[1], m[2]);
  }
}

/** `ApiEndpoints.BaseUrl + "/auth/sessions"` → `/api/v{version:apiVersion}/auth/sessions` */
function expandRouteExpression(expr) {
  return expr
    .split('+')
    .map((part) => {
      const t = part.trim().replace(/,$/, '');
      const lit = t.match(/^"([^"]*)"$/);
      if (lit) return lit[1];
      const named = t.match(/([\w.]+)$/);
      if (named && routeConstants.has(named[1])) return routeConstants.get(named[1]);
      const short = named && named[1].includes('.') ? named[1].split('.').pop() : null;
      if (short && routeConstants.has(short)) return routeConstants.get(short);
      return '';
    })
    .join('')
    .replace('[controller]', '');
}

// ── 1. Route prefixes, per project ───────────────────────────────────────
const prefixesByProject = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const re = /const\s+string\s+\w+\s*=\s*"(\/api\/[^"]*)"/g;
  let m;
  while ((m = re.exec(src))) {
    const proj = projectOf(f);
    if (!prefixesByProject.has(proj)) prefixesByProject.set(proj, new Set());
    prefixesByProject.get(proj).add(m[1].replace(/\/$/, ''));
  }
}

// ── 2. Published operations ──────────────────────────────────────────────
const doc = JSON.parse(readFileSync(CONTRACT, 'utf8'));
const published = new Set();
for (const p of Object.keys(doc.paths)) {
  for (const v of Object.keys(doc.paths[p])) {
    if (VERBS.includes(v)) published.add(`${v.toUpperCase()} ${norm(p)}`);
  }
}
const publishedByVerb = new Map();
for (const k of published) {
  const [v, ...rest] = k.split(' ');
  if (!publishedByVerb.has(v)) publishedByVerb.set(v, []);
  publishedByVerb.get(v).push(rest.join(' '));
}

/** prefix + tail, or a published route under one of the module's prefixes ending in the tail. */
function resolve(verb, tail, project) {
  const prefixes = [...(prefixesByProject.get(project) ?? [])];
  const t = norm(tail);
  for (const p of prefixes) {
    const direct = norm(`${p}${t === '/' ? '' : t}`);
    if (published.has(`${verb} ${direct}`)) return { path: direct, how: 'prefix+tail' };
  }
  const candidates = (publishedByVerb.get(verb) ?? []).filter(
    (p) => prefixes.some((pre) => p.startsWith(pre)) && (t === '/' ? prefixes.includes(p) : p.endsWith(t))
  );
  if (candidates.length === 1) return { path: candidates[0], how: 'nested group' };
  if (candidates.length > 1) return { path: candidates.sort((a, b) => a.length - b.length)[0], how: 'nested group (ambiguous)', ambiguous: candidates.length };
  const fallback = prefixes.length ? norm(`${prefixes[0]}${t === '/' ? '' : t}`) : t;
  return { path: fallback, how: 'unresolved' };
}

// ── 3. Parse ─────────────────────────────────────────────────────────────
const minimal = [];
const mvc = [];
const MAP_RE = /\.Map(Get|Post|Put|Patch|Delete)\s*(?:<[^>]*>)?\s*\(\s*"([^"]*)"/g;

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const proj = projectOf(f);

  let m;
  while ((m = MAP_RE.exec(src))) {
    const verb = m[1].toUpperCase();
    const r = resolve(verb, m[2], proj);
    minimal.push({ verb, tail: m[2], path: r.path, how: r.how, file: f, project: proj });
  }
  MAP_RE.lastIndex = 0;

  if (/:\s*(ApiController|ControllerBase|Controller)\b/.test(src)) {
    // `[Route(ApiEndpoints.BaseUrl + "/auth/sessions")]` — the base is a
    // constant concatenation, not a bare literal, so a regex for a quoted
    // string alone matches nothing and every action in the file resolves under
    // the wrong prefix. Constants are substituted before the literals are joined.
    const cr = src.match(/\[Route\s*\(\s*([^)]+)\)\]/);
    const base = cr ? expandRouteExpression(cr[1]) : '';

    const ACTION_RE = /\[Http(Get|Post|Put|Patch|Delete)(?:\s*\(\s*([^)]*)\))?\]/g;
    let a;
    while ((a = ACTION_RE.exec(src))) {
      const verb = a[1].toUpperCase();
      const sub = a[2] ? expandRouteExpression(a[2]) : '';
      // `~/` on an action escapes the controller route entirely.
      const full = sub.startsWith('~/')
        ? norm(sub.slice(1))
        : norm(`/${base}${sub ? `/${sub}` : ''}`);
      const direct = published.has(`${verb} ${full}`);
      mvc.push({
        verb, tail: sub, path: direct ? full : resolve(verb, sub || '/', proj).path,
        how: direct ? 'route attribute' : 'resolved', file: f, project: proj,
      });
    }
  }
}

const key = (r) => `${r.verb} ${r.path}`;
const dMin = new Set(minimal.map(key));
const dMvc = new Set(mvc.map(key));
const dAll = new Set([...dMin, ...dMvc]);

// ── 4. Duplicate mappings, on RESOLVED templates ─────────────────────────
const counts = new Map();
for (const r of minimal) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1);
const dupes = [...counts.entries()].filter(([, n]) => n > 1);
const surplus = dupes.reduce((s, [, n]) => s + (n - 1), 0);

console.log('=== ENDPOINT INVENTORY RECONCILIATION ===\n');
console.log('| Inventory | Raw occurrences | Distinct (VERB, normalised path) |');
console.log('|---|---:|---:|');
console.log(`| A. minimal APIs parsed from C# | ${minimal.length} | ${dMin.size} |`);
console.log(`| B. MVC controller actions | ${mvc.length} | ${dMvc.size} |`);
console.log(`| A + B | ${minimal.length + mvc.length} | ${dAll.size} |`);
console.log(`| C. published by the built host | ${published.size} | ${published.size} |`);

console.log('\n--- resolution quality ---');
for (const how of ['prefix+tail', 'nested group', 'nested group (ambiguous)', 'unresolved']) {
  const n = minimal.filter((r) => r.how === how).length;
  if (n) console.log(`  minimal APIs resolved by ${how}: ${n}`);
}

console.log('\n--- the duplicate-Map hypothesis, tested on resolved templates ---');
console.log(`  (VERB, path) pairs mapped more than once : ${dupes.length}`);
console.log(`  surplus raw occurrences                  : ${surplus}`);
console.log(`  raw ${minimal.length} − surplus ${surplus} = ${minimal.length - surplus} distinct mappings`);
if (dupes.length && dupes.length <= 40) {
  for (const [k, n] of dupes.sort()) console.log(`    ${n}×  ${k}`);
}

// ── Coverage, rather than one-to-one attribution ─────────────────────────
//
// Several modules serve more than one route prefix from one project — the
// Guides project serves `/guides`, `/knowledge` and `/intelligence`, and each
// declares a `/capabilities` tail. Resolving each Map call to a single path
// makes the resolver pick one of the three and leaves the other two looking
// unmapped, which is an artefact of the choice and not a gap in the source.
//
// The reconciliation question is not "which prefix did this Map call take" but
// "is this published route accounted for by a Map call in the project that owns
// its prefix". A published route is covered when some parsed tail in a project
// holding that prefix matches the remainder.
const tailsByProject = new Map();
for (const r of [...minimal, ...mvc]) {
  if (!tailsByProject.has(r.project)) tailsByProject.set(r.project, new Set());
  tailsByProject.get(r.project).add(`${r.verb} ${norm(r.tail || '/')}`);
}

function covered(k) {
  if (dAll.has(k)) return true;
  const [verb, path] = [k.split(' ')[0], k.split(' ').slice(1).join(' ')];
  for (const [proj, prefs] of prefixesByProject) {
    for (const pre of prefs) {
      if (!path.startsWith(pre)) continue;
      const tail = norm(path.slice(pre.length) || '/');
      if (tailsByProject.get(proj)?.has(`${verb} ${tail}`)) return true;
    }
  }
  return false;
}

const matched = [...dAll].filter((k) => published.has(k));
const coveredPublished = [...published].filter(covered);
const onlyParsed = [...dAll].filter((k) => !published.has(k)).sort();
const onlyPublished = [...published].filter((k) => !covered(k)).sort();

console.log(`\n--- coverage (multi-prefix aware) ---`);
console.log(`  published operations accounted for by a Map call: ${coveredPublished.length} / ${published.size} = ${((coveredPublished.length / published.size) * 100).toFixed(1)}%`);
console.log(`  published operations with no Map call at all    : ${onlyPublished.length}`);

console.log('\n--- element-by-element ---');
console.log(`  parsed ∩ published : ${matched.length}`);
console.log(`  parsed only        : ${onlyParsed.length}`);
console.log(`  published only     : ${onlyPublished.length}`);
console.log(`  coverage of the published surface: ${matched.length} / ${published.size} = ${((matched.length / published.size) * 100).toFixed(1)}%`);

if (onlyParsed.length) {
  console.log('\n  parsed but not published — each one, with the file that maps it:');
  for (const k of onlyParsed) {
    const r = [...minimal, ...mvc].find((x) => key(x) === k);
    console.log(`    ${k}\n        ${r?.how} · ${r?.project} · ${(r?.file ?? '').split(sep).slice(-2).join('/')}`);
  }
}

if (onlyPublished.length) {
  console.log('\n  published but not parsed — the host serves these and no Map call was attributed to them:');
  for (const k of onlyPublished.slice(0, 80)) console.log(`    ${k}`);
  if (onlyPublished.length > 80) console.log(`    … ${onlyPublished.length - 80} more`);
}

writeFileSync('C:/Users/User/source/repos/Diaspora/runtime-validation/endpoint-inventory-reconciliation.json', JSON.stringify({
  minimalRaw: minimal.length, minimalDistinct: dMin.size,
  mvcRaw: mvc.length, mvcDistinct: dMvc.size,
  combinedDistinct: dAll.size,
  published: published.size,
  duplicates: dupes.map(([route, n]) => ({ route, mapped: n })),
  duplicateSurplus: surplus,
  matched: matched.length,
  onlyParsed, onlyPublished,
}, null, 1));
console.log('\nwritten to runtime-validation/endpoint-inventory-reconciliation.json');
