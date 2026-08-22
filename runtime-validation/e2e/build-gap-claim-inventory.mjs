/**
 * Builds the capability-disclosure inventory the sweep works from.
 *
 * ── What counts as a disclosure ──────────────────────────────────────────────
 *
 * A disclosure is a sentence **a member reads** that says the platform cannot do
 * something. That definition is what makes this scan usable: the first attempt
 * matched every line containing `disabled`, `does not` or `yet` and returned
 * 5,924 hits across 598 files, most of them `disabled={!valid}` and comment
 * prose. Neither is shown to anybody.
 *
 * So this extracts **string literals and JSX text**, drops anything inside a
 * comment, drops anything that does not read as prose, and only then matches.
 *
 * ── The three tiers ──────────────────────────────────────────────────────────
 *
 *   DENIAL      "Diaspora cannot X yet" — a flat statement that a capability is
 *               absent. These are the claims the sweep exists to re-check.
 *   PROVENANCE  "these figures come from a development adapter" — not a denial,
 *               but still a capability statement: it says the number on screen
 *               is not the platform's. Stale in exactly the same way.
 *   SOFT        contains a trigger word in a sense that is not a disclosure
 *               ("not yet rated", "we don't recommend"). Kept in the file rather
 *               than dropped, because a scan that silently discards is a scan
 *               nobody can audit — but not counted as a claim.
 *
 * The tier is a *starting* classification from the text alone. Every DENIAL and
 * PROVENANCE row is then given a runtime verdict by `gap-claims-probe.mjs` and a
 * final decision by hand; nothing here is evidence about the backend.
 *
 *     node runtime-validation/e2e/build-gap-claim-inventory.mjs
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const SRC = join(REPO, 'src');
const OUT = join(HERE, 'gap-claim-inventory.json');

// ── Collect sources ──────────────────────────────────────────────────────────
const files = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) {
      if (!/^(__tests__|__mocks__|node_modules)$/.test(e.name)) walk(p);
    } else if (/\.(tsx|ts)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      files.push(p);
    }
  }
})(SRC);

// ── Patterns ─────────────────────────────────────────────────────────────────

/** A flat statement that a capability is absent. */
const DENIAL = [
  /\bcannot\b/i,
  /\bcan['’]t\b/i,
  /\bunavailable\b/i,
  /\bnot (?:yet )?available\b/i,
  /\bnot supported\b/i,
  /\bunsupported\b/i,
  /\bdoesn['’]t support\b/i,
  /\bdoes not support\b/i,
  /\bcoming soon\b/i,
  /\bcoming later\b/i,
  /\bnot implemented\b/i,
  /\bnot possible\b/i,
  /\bnot currently\b/i,
  /\bwe don['’]t (?:have|support|do|offer)\b/i,
  /\b(?:isn['’]t|aren['’]t|is not|are not) (?:available|supported|implemented|possible|wired|ready|something)\b/i,
  /\bnothing to show\b/i,
  /\bswitched off\b/i,
  /\bturned off\b/i,
  /\bnot turned on\b/i,
  /\bnot exposed\b/i,
  /\bno (?:way|backend|endpoint|provider|record|history|data source|record of)\b/i,
  /\bdoes not (?:yet|have|record|track|log|store|support|do|convert|link|assign|know|hold|keep|expose|return)\b/i,
  /\bdo not (?:yet|have|record|track|log|store|support)\b/i,
  /\bhas (?:no|nowhere|nothing)\b/i,
  /\bhave (?:no|nowhere|nothing)\b/i,
  /\bnot (?:be )?(?:track|record|log|stor)(?:ed|ing)?\b/i,
  /\bwill not (?:survive|be|work)\b/i,
  /\bonly .{0,30}(?:is|are) supported\b/i,
];

/** A statement that a figure or record on screen is not the platform's own. */
const PROVENANCE = [
  /\bdevelopment adapter\b/i,
  /\bnot real\b/i,
  /\bsimulated\b/i,
  /\bplaceholder\b/i,
  /\bsample data\b/i,
  /\bfor illustration\b/i,
  /\bpreview only\b/i,
  /\bnot the platform['’]s\b/i,
];

/** Trigger words that are only sometimes a disclosure. */
const SOFT = [
  /\byet\b/i,
  /\bfuture\b/i,
  /\bdisabled\b/i,
  /\bwork in progress\b/i,
  /\bstill being built\b/i,
  /\bnot ready\b/i,
];

// ── Prose filter ─────────────────────────────────────────────────────────────
const isProse = (s) => {
  const t = s.trim();
  if (t.length < 14) return false;
  if (!/\s/.test(t)) return false;
  if (/^[a-z0-9_.\-/[\]{}]+$/i.test(t)) return false;
  if (/^[A-Z0-9_ ]+$/.test(t) && t.length < 30) return false;
  if (/^https?:\/\//.test(t)) return false;
  if (/^[/][\w./{}-]+$/.test(t)) return false;
  if (/^\s*(?:flex|row|column|center|space-|#[0-9a-f]{3,8})/i.test(t)) return false;

  // An apostrophe inside JSX text — "we'll send you a code" — opens a literal the
  // scanner then reads to the next quote, swallowing markup. A real sentence shown
  // to a member contains none of these, so their presence means the span is code.
  if (/className=|<\/|\/>|=\{|=>|<View|<Text|testID=|accessibility[A-Z]/.test(t)) return false;

  return /[a-z]{3}/.test(t) && /\s[a-z]/i.test(t);
};

/**
 * String literals, template literals and JSX text, each with the line it starts on.
 *
 * A **character scanner**, not a regex sweep, and the difference is not stylistic.
 * A regex for `'…'` cannot tell a string from an apostrophe in a comment, so
 * `// the member's own listings` opens a "string" that runs to the next quote —
 * hundreds of characters of *code* — and the first version of this file reported
 * those as member-facing claims. Comments are skipped by the scanner instead, so
 * an apostrophe inside one can never open anything.
 */
function extractStrings(src) {
  const out = [];
  let line = 1;
  const n = src.length;

  for (let i = 0; i < n; i++) {
    const c = src[i];

    if (c === '\n') { line++; continue; }

    // Comments — skipped whole, so nothing inside one can be mistaken for prose.
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      i--;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      i++;
      continue;
    }

    // String and template literals.
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      const startLine = line;
      let value = '';
      i++;
      for (; i < n; i++) {
        const d = src[i];
        if (d === '\\') { value += src[i + 1] === 'n' ? ' ' : src[i + 1]; i++; continue; }
        if (d === quote) break;
        if (d === '\n') { line++; value += ' '; continue; }
        // `${…}` inside a template is code; step over it rather than reading it.
        if (quote === '`' && d === '$' && src[i + 1] === '{') {
          let depth = 1; i += 2;
          for (; i < n && depth > 0; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') depth--;
            else if (src[i] === '\n') line++;
          }
          i--;
          value += ' ';
          continue;
        }
        value += d;
      }
      out.push({
        line: startLine,
        text: value.replace(/\s+/g, ' ').trim(),
        kind: quote === '`' ? 'template' : 'string',
      });
      continue;
    }

    // JSX text: `>text<` on the same line, with no braces or tags between.
    if (c === '>') {
      let j = i + 1;
      let value = '';
      while (j < n && src[j] !== '<' && src[j] !== '>' && src[j] !== '{' && src[j] !== '}') {
        value += src[j] === '\n' ? ' ' : src[j];
        j++;
      }
      if (src[j] === '<' && value.trim().length >= 14) {
        out.push({ line, text: value.replace(/\s+/g, ' ').trim(), kind: 'jsx' });
      }
    }
  }
  return out;
}

/**
 * Where the sentence is read, which decides how much it matters.
 *
 * A claim in `src/app` is on a member's screen. A claim in `src/config/*-gaps.ts`
 * is a *register entry* — a structured statement that the backend lacks a
 * contract, which reaches members only through the notice a screen renders from
 * it. A claim in `src/mocks` is unreachable in production at all. Counting the
 * four together and reporting one number would overstate what a member sees.
 */
function surfaceOf(rel) {
  if (/^src\/mocks\//.test(rel)) return 'fixture';
  if (/^src\/config\/.*gaps?\.ts$/.test(rel)) return 'register';
  if (/^src\/(app|components)\//.test(rel)) return 'member';
  return 'client';
}

/** Which product area a file belongs to — used to order the sweep. */
function areaOf(rel) {
  const m = rel.match(/^src\/(?:app|components|lib|config|hooks|store|types|mocks)\/([^/]+)/);
  const seg = (m?.[1] ?? '').replace(/\.tsx?$/, '');
  if (/^\(tabs\)$/.test(seg)) return 'tabs';
  if (/^\(auth\)$/.test(seg)) return 'auth';
  if (/-gaps?$/.test(seg)) return seg.replace(/-gaps?$/, '');
  if (/-gap-/.test(seg)) return seg.split('-gap-')[0];
  return seg || 'root';
}

/** The screen route a file corresponds to, where it is one. */
function screenOf(rel) {
  const m = rel.match(/^src\/app\/(.+)\.tsx?$/);
  if (!m) return null;
  return '/' + m[1].replace(/\/index$/, '').replace(/^\(tabs\)\//, '').replace(/^\(auth\)\//, '');
}

const rows = [];
let seq = 0;

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const rel = relative(REPO, f).split(sep).join('/');
  const seen = new Set();

  for (const s of extractStrings(src)) {
    if (!isProse(s.text)) continue;

    const tier =
      DENIAL.some((p) => p.test(s.text)) ? 'DENIAL'
        : PROVENANCE.some((p) => p.test(s.text)) ? 'PROVENANCE'
          : SOFT.some((p) => p.test(s.text)) ? 'SOFT'
            : null;
    if (!tier) continue;

    const key = `${s.line}::${s.text.slice(0, 60)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      id: `CLAIM-${String(++seq).padStart(3, '0')}`,
      tier,
      surface: surfaceOf(rel),
      file: rel,
      line: s.line,
      area: areaOf(rel),
      screen: screenOf(rel),
      component: rel.split('/').pop().replace(/\.tsx?$/, ''),
      claim: s.text.length > 220 ? s.text.slice(0, 217) + '…' : s.text,
      capability: null,
      backendRouteCandidates: [],
      backendModule: null,
      frontendImplementation: null,
      runtimeStatus: null,
      classification: null,
      action: null,
      evidence: [],
    });
  }
}

rows.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
rows.forEach((r, i) => { r.id = `CLAIM-${String(i + 1).padStart(3, '0')}`; });

const tiers = rows.reduce((a, r) => ({ ...a, [r.tier]: (a[r.tier] ?? 0) + 1 }), {});
const claims = rows.filter((r) => r.tier !== 'SOFT');
const surfaces = claims.reduce((a, r) => ({ ...a, [r.surface]: (a[r.surface] ?? 0) + 1 }), {});

// The previous inventory is preserved rather than overwritten (§8).
if (existsSync(OUT)) {
  const prev = join(HERE, 'gap-claim-inventory.previous.json');
  if (!existsSync(prev)) copyFileSync(OUT, prev);
}

writeFileSync(OUT, JSON.stringify({
  generatedBy: 'runtime-validation/e2e/build-gap-claim-inventory.mjs',
  scanned: { files: files.length, root: 'src/' },
  totals: {
    rows: rows.length,
    claims: claims.length,
    files: new Set(claims.map((r) => r.file)).size,
    byTier: tiers,
    bySurface: surfaces,
    memberFacing: claims.filter((r) => r.surface === 'member').length,
  },
  rows,
}, null, 1));

console.log(`${rows.length} rows · ${claims.length} claims (DENIAL+PROVENANCE) across `
  + `${new Set(claims.map((r) => r.file)).size} files`);
console.log(Object.entries(tiers).map(([k, v]) => `  ${String(v).padStart(4)} ${k}`).join('\n'));
