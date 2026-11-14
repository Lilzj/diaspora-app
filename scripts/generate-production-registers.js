// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — production twins of the gap registers (FSEC-003)
//
//     node scripts/generate-production-registers.js
//
// ── What ships today, measured ──────────────────────────────────────────────
//
// `src/config/*-gaps.ts` is eleven files, 192 gap entries, ~850 KB. It is not
// configuration: it is the engineering record of what the backend does not
// serve and why — which controls are absent, which capabilities are simulated,
// which decisions were taken against, with the reasoning. Written next to the
// screens so the notice a member sees and the reason it exists cannot drift,
// which is a good practice and should stay.
//
// It ships. On the 13 Nov 2026 Android export, 1,956 of 1,958 long literals
// from those files were present in the Hermes bytecode — 424 KB of authored
// internal prose in an APK, which is a zip anybody can open. That is FSEC-003,
// and it is a disclosure problem before it is a size one.
//
// ── Why a twin, and not a split ─────────────────────────────────────────────
//
// The audit asks for the prose to move to `docs/`, leaving a minimal runtime
// record. That is the right shape and the wrong cost: 192 entries, 94 import
// sites and some twenty suites read these modules, and a hand-split at
// pre-launch is a large edit over data that several drift tests treat as
// authoritative.
//
// A twin changes nothing anybody writes. The register stays exactly as it is,
// one file per area, prose included; this script derives a sibling with the
// narrative fields emptied, and `metro.config.js` resolves the twin instead of
// the original when the bundle is a production one. Development builds, every
// test and every drift check keep reading the real thing.
//
// Same arrangement the repository already uses for `src/mocks/served-routes.ts`
// — generated, committed, and held current by a drift test rather than by
// memory. `production-registers-drift.test.ts` is this one's.
//
// ── Why these fields and not others ─────────────────────────────────────────
//
// Each field below was checked against every reader outside `src/config`. They
// are read by exactly four screens — `analytics/gaps`, `community/gaps`,
// `creator/gaps` and `map/diagnostics` — which are developer diagnostics that
// return early when `areSimulatedFeaturesEnabled()` is false, and by the
// `__DEV__`-gated note at the foot of `wallet/protection`. Nothing a member can
// reach in a production build renders any of them.
//
// What a member *does* see — a gap's `id`, `title`, `capability`,
// `backendStatus`, `backendPartialNote`, `currentBehaviour` and the first line
// of `missingContract` — is deliberately NOT in the list. The notices must read
// exactly what they read today; a blank where a sentence belongs is a worse
// defect than the one being fixed, and a quieter one.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(ROOT, 'src', 'config');

/**
 * Narrative fields, each with the reader that justifies emptying it.
 *
 * Before adding one: find every reader outside `src/config`, and confirm each
 * is behind `areSimulatedFeaturesEnabled()` or `__DEV__`. A field rendered on
 * any production surface stays.
 */
const BLANK_FIELDS = {
  existingBackendCapability: 'community/gaps only',
  frontendBehaviour: 'analytics/gaps, community/gaps, creator/gaps, map/diagnostics',
  existingSeams: 'creator/gaps only',
  whyNotImplementable:
    'analytics/gaps, community/gaps, creator/gaps, and the __DEV__-gated note in wallet/protection',
  privacyConsiderations: 'analytics/gaps, community/gaps',
  securityConsiderations: 'analytics/gaps, community/gaps',
  caching: 'community/gaps only',
  integrationWork: 'map/diagnostics only',
  considerations: 'no reader outside the registers',
  requiredContracts:
    'analytics/gaps, community/gaps — and emptying it takes the nested request, ' +
    'response, authorization, idempotency, aggregation and retryBehaviour shapes with it',
  currentBehaviour: 'map/diagnostics — and MapsGapNotice, but only out of MAP_PROVIDER_GAPS',
  missingBackendCapability:
    'analytics/gaps, community/gaps — and two notices, but only out of ANALYTICS_GAPS ' +
    'and MULTI_COMMUNITY_GAPS',
};

/**
 * Registers where a blanked field IS rendered, and so must survive.
 *
 * A field is not narrative or member-visible by its name; it is whatever the
 * component that reads it does with it. These two are read from some registers
 * and not others, and the difference is worth the extra mechanism:
 *
 *   `currentBehaviour` exists in `integration-provider-gaps` and
 *   `map-provider-gaps`. `MapsGapNotice` renders it from `MAP_PROVIDER_GAPS`;
 *   `IntegrationNotices` does not read it at all. The integration copy is
 *   therefore seen by nobody in production — and it is the entry FSEC-003
 *   quotes, the one naming the credential-storage decision and what
 *   `AsyncStorage` leaves readable on a rooted device. Blanking it per register
 *   is what makes the audit's own verification phrase absent.
 *
 *   `missingBackendCapability` exists in four registers. `AnalyticsNotices` and
 *   `MultiCommunityGapNotice` render the first line of two of them;
 *   `AutomationNotices` and `IntegrationNotices` read neither.
 */
const KEEP_IN = {
  currentBehaviour: ['map-provider-gaps.ts'],
  missingBackendCapability: ['analytics-gaps.ts', 'multi-community-gaps.ts'],
};

const BANNER = (sourceName) => `// GENERATED FILE — DO NOT EDIT.
//
// The production twin of \`${sourceName}\`, derived by
// \`node scripts/generate-production-registers.js\`. Metro resolves this file in
// place of its source when the bundle is a production one; see
// \`metro.config.js\` and \`scripts/production-stubs.js\`.
//
// Identical to the source except that these fields are emptied, because nothing
// a member can reach in a production build renders them (FSEC-003):
//
${Object.entries(BLANK_FIELDS)
  .map(([field, readers]) => `//   ${field} — ${readers}`)
  .join('\n')}
//
// Edit the source. \`production-registers-drift.test.ts\` fails if this file
// stops matching what this script would produce from it.

`;

/**
 * Empty the configured fields, leaving every other byte where it was.
 *
 * A text transform on purpose: it cannot reorder, reformat or re-infer
 * anything, so the twin differs from its source only where the diff says.
 */
function blankFields(source, fileName) {
  const kept = (field) => (KEEP_IN[field] ?? []).includes(fileName);

  const out = [];
  let i = 0;
  const n = source.length;
  let state = 'code';
  let quote = '';

  while (i < n) {
    const c = source[i];
    const two = source.slice(i, i + 2);

    if (state === 'code') {
      if (two === '//') {
        state = 'line';
        out.push(two);
        i += 2;
        continue;
      }
      if (two === '/*') {
        state = 'block';
        out.push(two);
        i += 2;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        state = 'str';
        quote = c;
        out.push(c);
        i += 1;
        continue;
      }

      const match = /^([A-Za-z_$][A-Za-z0-9_$]*)(\s*):(\s*)/.exec(source.slice(i));
      if (
        match &&
        Object.prototype.hasOwnProperty.call(BLANK_FIELDS, match[1]) &&
        !kept(match[1])
      ) {
        const valueAt = i + match[0].length;
        const first = source[valueAt];

        // A quote or a bracket is a VALUE. A lower- or PascalCase identifier is
        // a TYPE annotation — `frontendBehaviour: string;` in the interface
        // above the data — and blanking that would emit `: '';` into an
        // interface and not compile. `string[]` starts with `s`, so quotes and
        // `[` are exact.
        //
        // SCREAMING_SNAKE_CASE is the third case and the one the first run of
        // `production-registers-drift.test.ts` found: these registers share
        // repeated prose through module constants —
        // `securityConsiderations: SERVER_AUTHORITATIVE` — which is good
        // authoring and meant three entries' worth of narrative stayed. A type
        // is never spelled that way here, so the discriminator stays exact.
        const shared = /^[A-Z][A-Z0-9_]*(?=\s*[,;}\n])/.exec(source.slice(valueAt));

        if (first === "'" || first === '"' || first === '`' || first === '[' || shared) {
          const end = endOfValue(source, valueAt);
          out.push(`${match[1]}${match[2]}:${match[3]}${first === '[' ? '[]' : "''"}`);
          i = end;
          continue;
        }
      }

      out.push(c);
      i += 1;
      continue;
    }

    if (state === 'line') {
      out.push(c);
      i += 1;
      if (c === '\n') state = 'code';
      continue;
    }

    if (state === 'block') {
      if (two === '*/') {
        out.push(two);
        i += 2;
        state = 'code';
        continue;
      }
      out.push(c);
      i += 1;
      continue;
    }

    // inside a string literal
    if (c === '\\') {
      out.push(source.slice(i, i + 2));
      i += 2;
      continue;
    }
    out.push(c);
    i += 1;
    if (c === quote) state = 'code';
  }

  return out.join('');
}

/**
 * Empty a module constant that nothing refers to any more.
 *
 * Blanking a field whose value was `SERVER_AUTHORITATIVE` removes the
 * reference, not the paragraph: the constant still holds it and still ships.
 * This second pass is what finishes the job, and it is exact rather than
 * heuristic — a constant with no remaining reader cannot be read, so emptying
 * it changes nothing. A constant still used by a field that stays is left
 * alone, which is the case this must not get wrong.
 */
function blankOrphanedConstants(code) {
  const withoutComments = code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[^\n]*?\/\/[^\n]*$/gm, (line) => (line.trim().startsWith('//') ? ' ' : line));

  const declaration = /^const ([A-Z][A-Z0-9_]*)\s*=\s*(?=['"`])/gm;
  const orphans = [];
  let match;
  while ((match = declaration.exec(code)) !== null) {
    const name = match[1];
    const references = (withoutComments.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length;
    if (references <= 1) orphans.push({ name, valueAt: match.index + match[0].length });
  }

  // Back to front, so an earlier replacement cannot move a later index.
  let out = code;
  for (const { valueAt } of orphans.reverse()) {
    out = out.slice(0, valueAt) + "''" + out.slice(endOfValue(out, valueAt));
  }
  return out;
}

/** The index just past the value starting at `start`. */
function endOfValue(source, start) {
  let i = start;
  let depth = 0;
  let state = 'code';
  let quote = '';

  while (i < source.length) {
    const c = source[i];
    const two = source.slice(i, i + 2);

    if (state === 'code') {
      if (two === '//') {
        state = 'line';
        i += 2;
        continue;
      }
      if (two === '/*') {
        state = 'block';
        i += 2;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        state = 'str';
        quote = c;
        i += 1;
        continue;
      }
      if (c === '{' || c === '[' || c === '(') {
        depth += 1;
        i += 1;
        continue;
      }
      if (c === '}' || c === ']' || c === ')') {
        if (depth === 0) return i;
        depth -= 1;
        i += 1;
        continue;
      }
      if ((c === ',' || c === ';') && depth === 0) return i;
      i += 1;
      continue;
    }

    if (state === 'line') {
      i += 1;
      if (c === '\n') state = 'code';
      continue;
    }

    if (state === 'block') {
      if (two === '*/') {
        i += 2;
        state = 'code';
        continue;
      }
      i += 1;
      continue;
    }

    if (c === '\\') {
      i += 2;
      continue;
    }
    i += 1;
    if (c === quote) state = 'code';
  }

  return i;
}

/** The registers, and the twin each one produces. */
function registers() {
  return fs
    .readdirSync(CONFIG_DIR)
    .filter((name) => name.endsWith('-gaps.ts') && !name.endsWith('.production.ts'))
    .sort()
    .map((name) => ({
      source: path.join('src', 'config', name),
      twin: path.join('src', 'config', name.replace(/\.ts$/, '.production.ts')),
    }));
}

/**
 * What the twin of `sourcePath` should contain, with LF endings on every
 * platform.
 *
 * The body is copied out of the source file, which git checks out with CRLF on
 * Windows — `core.autocrlf` is true there and this repository has no
 * `.gitattributes` — while `BANNER` is a template literal and is always LF.
 * Unnormalised, this function emitted 26 LF lines and roughly 1,450 CRLF ones:
 * whatever the checkout happened to do rather than a decision. git stores these
 * blobs with LF, so LF is what lands in the repository either way.
 */
function twinFor(sourcePath) {
  const source = fs.readFileSync(path.join(ROOT, sourcePath), 'utf8');
  const fileName = path.basename(sourcePath);
  const twin = BANNER(fileName) + blankOrphanedConstants(blankFields(source, fileName));

  return twin.replace(/\r\n/g, '\n');
}

function main() {
  let written = 0;
  for (const { source, twin } of registers()) {
    const wanted = twinFor(source);
    const target = path.join(ROOT, twin);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (current !== wanted) {
      fs.writeFileSync(target, wanted, 'utf8');
      written += 1;
      const saved = fs.readFileSync(path.join(ROOT, source), 'utf8').length - wanted.length;
      console.log(`  wrote ${twin}  (-${(saved / 1024).toFixed(1)} KB)`);
    }
  }
  console.log(written === 0 ? 'Already current.' : `${written} twin(s) regenerated.`);
}

module.exports = { BLANK_FIELDS, KEEP_IN, blankFields, registers, twinFor };

if (require.main === module) main();
