#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — what must not be in the shipped bundle (FARCH-001)
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
// ── The canary ──────────────────────────────────────────────────────────────
//
// A search that finds nothing cannot be told from a search that cannot find
// anything, and this one asserts absence — so every run must first prove it can
// find something. The canary is a string that is in the bundle by construction;
// if it is missing, the export, the path or the searcher is wrong, and that is
// reported as a failure rather than as a clean bill of health.
// ─────────────────────────────────────────────────────────────────────────────

const { readdirSync, readFileSync, statSync } = require('fs');
const { join } = require('path');

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
      if (findIn(buffer, needle)) found.push(`${needle} in ${path}`);
    }
  }

  if (found.length > 0) {
    console.error('FSEC-004 regressed — a development-only module is in the bundle:');
    for (const hit of found) console.error(`  ${hit}`);
    console.error(
      '\n  The register is scripts/production-stubs.js and the swap is in metro.config.js.\n' +
        '  A guard inside the module does not help: Metro collects dependencies from the\n' +
        '  AST before any minifier evaluates `if (false)`.'
    );
    return 1;
  }

  console.log(
    `Checked ${all.length} exported files. The canary is present and none of the ` +
      `${FORBIDDEN.length} development-only markers are.`
  );
  return 0;
}

process.exitCode = main();
