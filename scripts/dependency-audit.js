#!/usr/bin/env node
'use strict';

// Dependency audit gate — FSEC-001.
//
// The finding: 35 npm advisories, two of them direct runtime dependencies with
// non-breaking fixes available, and "the frontend CI has no dependency-audit
// gate at all". Its root cause is the part that outlives the two upgrades:
// *nothing in this repository's process would notice the 36th*.
//
// Why this is a script and not the one-liner the audit recommended
// ----------------------------------------------------------------
// The recommended gate was `npm audit --audit-level=high --omit=dev`, with the
// stated verification criterion that it exits 0. Measured on 13 November 2026,
// after the axios and zod upgrades, it exits **1** and reports 1 critical and
// 15 high. `--omit=dev` does not describe what ships, because the build tooling
// does not arrive through devDependencies:
//
//     shell-quote (critical)  <-  react-devtools-core  <-  react-native
//     zod 3.25.76 (high)      <-  @expo/cli            <-  expo
//
// `react-native` and `expo` are runtime dependencies, so their tooling sits in
// the `--omit=dev` tree. Clearing it means `expo-router@58` (a major, which
// moves the Expo SDK) and a 148-package toolchain sweep. Both are planned work,
// not a gate. A gate that cannot pass is not a gate; it gets deleted on the
// first urgent Friday.
//
// So the rule here is the one the root cause actually asks for: **every
// advisory is either fixed or written down.** The build fails when the set
// changes — something new appeared, or something accepted has disappeared and
// the file should shrink. The baseline is not a claim that these advisories are
// harmless. It is a claim that each one was looked at, by someone, on a date.
//
// Three failures, all deliberate:
//   * a new advisory           -> fix it, or add it with a reason
//   * a baselined one is gone  -> remove the line; the file is meant to shrink
//   * an entry with no reason  -> "TODO" is not a decision
//
// And it fails when `npm audit` could not produce a report at all. A gate that
// passes because the registry was unreachable is FSEC-001 in a new costume.

const { execSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const BASELINE_PATH = join(__dirname, '..', 'dependency-audit-baseline.json');
const WRITE_BASELINE = process.argv.includes('--write-baseline');
const ANNOTATE = Boolean(process.env.GITHUB_ACTIONS);

function fail(message) {
  for (const line of String(message).split('\n')) {
    console.error(ANNOTATE ? '::error::' + line : line);
  }
}

function advisoryId(via) {
  const match = String(via.url || '').match(/GHSA-[0-9a-z-]+/i);
  return match ? match[0] : 'npm-' + via.source;
}

function keyOf(entry) {
  return entry.id + ' ' + entry.package;
}

function runAudit() {
  // `execSync` rather than `execFileSync`: on Windows npm is `npm.cmd`, and
  // since the CVE-2024-27980 fix Node refuses to spawn a .cmd without a shell.
  // Passing an args array *with* a shell then raises DEP0190. The command below
  // is a literal constant with nothing interpolated into it, so the warning's
  // concern — unescaped arguments — does not arise.
  let raw = '';
  let spawnFailure = null;

  try {
    raw = execSync('npm audit --json', {
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (failure) {
    // `npm audit` exits non-zero whenever it finds anything. The report is
    // still on stdout, so a non-zero exit is not by itself an error — but a
    // failure to start npm at all is, and it must not be reported as "no JSON".
    raw = typeof failure.stdout === 'string' ? failure.stdout : '';
    spawnFailure = failure;
  }

  let report;
  try {
    report = JSON.parse(raw);
  } catch (parseFailure) {
    throw new Error(
      '`npm audit --json` did not produce JSON. The gate cannot tell "no advisories"\n'
        + 'from "the audit never ran", so it refuses rather than passing.\n'
        + 'npm said: ' + (spawnFailure ? spawnFailure.message : '(nothing)') + '\n'
        + 'First 200 characters of what it printed: ' + JSON.stringify(raw.slice(0, 200))
    );
  }

  if (!report || typeof report.metadata !== 'object' || !report.metadata.vulnerabilities) {
    throw new Error(
      '`npm audit --json` produced a report with no metadata.vulnerabilities.\n'
        + 'Refusing to read that as a clean tree.'
    );
  }

  return report;
}

function currentAdvisories(report) {
  const found = new Map();

  for (const vulnerability of Object.values(report.vulnerabilities || {})) {
    for (const via of vulnerability.via || []) {
      // String entries name a package that is vulnerable *because of* another
      // one. Only the objects are advisories in their own right.
      if (typeof via !== 'object' || !via.title) {
        continue;
      }

      const entry = {
        id: advisoryId(via),
        package: via.name,
        severity: via.severity,
        title: via.title,
      };

      found.set(keyOf(entry), entry);
    }
  }

  return [...found.values()].sort(function (a, b) {
    return keyOf(a).localeCompare(keyOf(b));
  });
}

function writeBaseline(current) {
  let previous = [];
  try {
    previous = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).accepted || [];
  } catch (missing) {
    previous = [];
  }

  const carried = new Map(previous.map(function (entry) {
    return [keyOf(entry), entry];
  }));

  const accepted = current.map(function (entry) {
    const existing = carried.get(keyOf(entry)) || {};
    return {
      id: entry.id,
      package: entry.package,
      severity: entry.severity,
      title: entry.title,
      reachedVia: existing.reachedVia || 'TODO: which dependency pulls it in?',
      accepted: existing.accepted || 'TODO: why is this carried rather than fixed?',
      tracked: existing.tracked || 'FSEC-001',
    };
  });

  const generated = new Date().toISOString().slice(0, 10);
  writeFileSync(BASELINE_PATH, JSON.stringify({ generated, accepted }, null, 2) + '\n');

  console.log('Wrote ' + accepted.length + ' entries to ' + BASELINE_PATH);
  console.log('Every TODO must become a sentence before the gate will pass.');
}

function main() {
  const report = runAudit();
  const current = currentAdvisories(report);
  const counts = report.metadata.vulnerabilities;

  console.log(
    'npm audit: ' + counts.total + ' vulnerable packages ('
      + counts.critical + ' critical, ' + counts.high + ' high, '
      + counts.moderate + ' moderate, ' + counts.low + ' low)'
  );
  console.log(current.length + ' distinct advisories across them.');

  if (WRITE_BASELINE) {
    writeBaseline(current);
    return 0;
  }

  let baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch (failure) {
    fail('Could not read ' + BASELINE_PATH + ': ' + failure.message);
    fail('Generate it with: node scripts/dependency-audit.js --write-baseline');
    return 2;
  }

  const accepted = baseline.accepted || [];
  const acceptedKeys = new Set(accepted.map(keyOf));
  const currentKeys = new Set(current.map(keyOf));

  const appeared = current.filter(function (entry) {
    return !acceptedKeys.has(keyOf(entry));
  });
  const disappeared = accepted.filter(function (entry) {
    return !currentKeys.has(keyOf(entry));
  });
  const unexplained = accepted.filter(function (entry) {
    return /^TODO/.test(String(entry.accepted || 'TODO'));
  });

  for (const entry of appeared) {
    fail(
      'NEW advisory: ' + entry.severity + ' ' + entry.package + ' — ' + entry.title
        + ' (' + entry.id + ')\n'
        + '  Fix it, or record why it is carried in dependency-audit-baseline.json.'
    );
  }

  for (const entry of disappeared) {
    fail(
      'GONE: ' + entry.package + ' ' + entry.id + ' is no longer reported.\n'
        + '  Remove it from dependency-audit-baseline.json; the file is meant to shrink.'
    );
  }

  for (const entry of unexplained) {
    fail('NO REASON: ' + entry.package + ' ' + entry.id + ' is in the baseline with a TODO.');
  }

  if (appeared.length || disappeared.length || unexplained.length) {
    fail('Regenerate with: node scripts/dependency-audit.js --write-baseline');
    return 1;
  }

  console.log('All ' + current.length + ' are accounted for in dependency-audit-baseline.json.');
  return 0;
}

try {
  process.exitCode = main();
} catch (failure) {
  fail(failure.message);
  process.exitCode = 2;
}
