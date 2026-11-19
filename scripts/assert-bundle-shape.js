#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — what must not be in the shipped bundle (FARCH-001, FARCH-005)
//
// `production-bundle-shape.test.ts` checks the register and the import graph.
// This checks the artefact, which is the only thing a member actually runs.
//
// ── Why this is a script and not two lines of grep ──────────────────────────
//
// It was two lines of grep, and they would have passed forever.
//
// `expo export --platform android` emits Hermes bytecode, and Hermes stores
// string literals as UTF-16. An ASCII `grep` therefore misses any string the
// bundler stored that way, so the obvious fix is to search for both encodings:
//
//     grep -rqa "$(printf '%s' "$needle" | iconv -f utf-8 -t utf-16le)" dist
//
// That does nothing. Command substitution in POSIX shells drops NUL bytes —
// bash says so out loud, `warning: command substitution: ignored null byte in
// input` — and UTF-16LE of ASCII text is every other byte NUL. The pattern
// collapses back to the ASCII one, the second grep duplicates the first, and a
// marker stored as UTF-16 is reported absent. Measured on the 18 Nov 2026
// export before this file existed.
//
// Buffers do not have that problem, which is the whole reason for Node here.
//
// ── Two markers were a spot check (FARCH-005, 19 Nov 2026) ──────────────────
//
// FARCH-005 is the architecture half of FSEC-003 and FSEC-004: *"44,125 lines
// of fixtures and about 940 KB of engineering prose are in the production
// module graph"*, and *"there is no boundary between the application and its
// development scaffolding"*. The boundary now exists — Metro resolves each
// dev-only module to a stub or a generated twin — and until today this file
// checked two strings of it.
//
// Two strings is a spot check on thirteen swaps. It covers the mock tree
// (FSEC-004) and says nothing at all about the eleven gap registers (FSEC-003),
// whose twins drop ~405 KB of engineering record between them. A twin that
// stopped blanking would have shipped the prose back with every test green.
//
// So the markers are now **derived, one per register**: a long string literal
// that is in the development register and is not in its generated twin. By
// construction that is prose the twin removes, so finding it in the bundle
// means the twin did not take effect.
//
// ── Why a derived marker needs its own check ────────────────────────────────
//
// A marker only proves a leak if the dev module is the **only** place it could
// have come from. Measured while writing this: `"Food & Restaurants"` is in
// `src/mocks/data.ts`, and it is also in `src/lib/reference/provider-categories.ts`,
// which is production reference data that FBL-002 moved out of the mock tree on
// purpose. As a marker it reports a leak on every clean build.
//
// Each candidate is therefore rejected unless it is absent from everything that
// can ship — all of `src/` except the mock tree, the dev registers themselves
// (they are swapped) and the tests (they are not bundled). A register that
// offers no qualifying candidate is reported as a failure rather than quietly
// contributing nothing, because a marker set that shrinks in silence is the
// same defect as a grep that cannot match.
//
// ── The canary ──────────────────────────────────────────────────────────────
//
// A search that finds nothing cannot be told from a search that cannot find
// anything, and this one asserts absence — so every run must first prove it can
// find something. The canary is a string that is in the bundle by construction;
// if it is missing, the export, the path or the searcher is wrong, and that is
// reported as a failure rather than as a clean bill of health.
// ─────────────────────────────────────────────────────────────────────────────

const { readdirSync, readFileSync, statSync } = require('fs');
const { join, relative, basename, sep } = require('path');

const { registers } = require('./generate-production-registers.js');

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

/** Must NOT appear. Each names a development-only module FSEC-004 resolves away. */
const FORBIDDEN = [
  // The mock HTTP adapter — a devDependency that reached the shipped bytecode
  // until FSEC-004, because Metro collects dependencies before any guard runs.
  'axios-mock-adapter',
  // A fixture from `src/mocks/data.ts`, reached only through the mock tree.
  'mockListings',
];

/**
 * Must appear. Reference data the registration funnel needs, which moved out of
 * `src/mocks` on 18 Nov 2026 (FBL-002) precisely so that it could ship while
 * the mock tree does not.
 */
const CANARY = 'allCountries';

function files(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files(full, found);
    else found.push(full);
  }
  return found;
}

/** The needle as the two encodings a Hermes bundle may hold it in. */
function encodings(needle) {
  return [Buffer.from(needle, 'utf8'), Buffer.from(needle, 'utf16le')];
}

function findIn(buffer, needle) {
  return encodings(needle).some((pattern) => buffer.includes(pattern));
}

// ─────────────────────────────────────────────────────────────────────────────
// Deriving a marker for each register twin
// ─────────────────────────────────────────────────────────────────────────────

/** A single-quoted literal long enough to be unmistakable in a 11 MB bundle. */
const LITERAL = /'((?:[^'\\]|\\.){120,400})'/g;

/**
 * Everything that can reach the bundle, as one string.
 *
 * Excludes the mock tree and the development registers, because those are
 * exactly what Metro swaps away; excludes tests, which are not bundled. What is
 * left is the body of source a marker must NOT appear in for it to prove
 * anything.
 */
function shippableSource(registerSources) {
  const excluded = new Set(registerSources.map((path) => join(ROOT, path)));
  const parts = [];

  for (const file of files(SRC)) {
    if (!/\.tsx?$/.test(file)) continue;
    if (excluded.has(file)) continue;

    const rel = relative(SRC, file);
    if (rel.startsWith(`mocks${sep}`) || rel.split(sep).includes('__tests__')) continue;

    parts.push(readFileSync(file, 'utf8'));
  }

  return parts.join('\n');
}

function derivedMarkers() {
  const pairs = registers();
  const shippable = shippableSource(pairs.map(({ source }) => source));

  const markers = [];
  const barren = [];

  for (const { source, twin } of pairs) {
    const devSource = readFileSync(join(ROOT, source), 'utf8');
    const twinSource = readFileSync(join(ROOT, twin), 'utf8');

    const candidate = [...devSource.matchAll(LITERAL)]
      .map((match) => match[1].replace(/\\'/g, "'"))
      // In the register, dropped by the twin, and nowhere else that ships.
      .find((text) => !twinSource.includes(text) && !shippable.includes(text));

    if (candidate) markers.push({ needle: candidate, from: basename(source) });
    else barren.push(basename(source));
  }

  return { markers, barren, registerCount: pairs.length };
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: assert-bundle-shape.js <export-directory>');
    return 2;
  }

  const all = files(dir);
  if (all.length === 0) {
    console.error(`No files under ${dir}. The export did not run, or ran elsewhere.`);
    return 2;
  }

  const { markers, barren, registerCount } = derivedMarkers();

  if (barren.length > 0) {
    console.error(
      'No usable marker could be derived for ' +
        `${barren.length} of ${registerCount} gap registers:`
    );
    for (const name of barren) console.error(`  ${name}`);
    console.error(
      '\n  A marker is a long string the development register holds and its generated\n' +
        '  twin drops, which also appears nowhere that ships. None was found here, so\n' +
        '  this run would check that register for nothing. Either the twin stopped\n' +
        '  dropping prose, or the register stopped carrying any.'
    );
    return 1;
  }

  const buffers = all.map((path) => ({ path, buffer: readFileSync(path) }));

  if (!buffers.some(({ buffer }) => findIn(buffer, CANARY))) {
    console.error(
      `The canary '${CANARY}' is not in the export.\n` +
        '  This check asserts that things are ABSENT, so it has to prove it can find\n' +
        '  something first. Either the export is wrong, or this searcher is — and a\n' +
        '  searcher that finds nothing would otherwise report every marker as absent.'
    );
    return 1;
  }

  const found = [];

  for (const needle of FORBIDDEN) {
    for (const { path, buffer } of buffers) {
      if (findIn(buffer, needle)) found.push(`FSEC-004: ${needle} in ${path}`);
    }
  }

  for (const { needle, from } of markers) {
    for (const { path, buffer } of buffers) {
      if (findIn(buffer, needle)) {
        found.push(`FSEC-003: prose from ${from} in ${path}`);
      }
    }
  }

  if (found.length > 0) {
    console.error('A development-only module is in the bundle:');
    for (const hit of found) console.error(`  ${hit}`);
    console.error(
      '\n  The register is scripts/production-stubs.js and the swap is in metro.config.js.\n' +
        '  A guard inside the module does not help: Metro collects dependencies from the\n' +
        '  AST before any minifier evaluates `if (false)`.\n' +
        '  A FSEC-003 hit means a generated twin did not take effect: regenerate with\n' +
        '  `node scripts/generate-production-registers.js` and check metro.config.js.'
    );
    return 1;
  }

  console.log(
    `Checked ${all.length} exported files. The canary is present, none of the ` +
      `${FORBIDDEN.length} development-only markers are, and none of the ` +
      `${markers.length} gap registers' prose is.`
  );
  return 0;
}

process.exitCode = main();
