// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the production twins of the gap registers (FSEC-003)
//
// `src/config/*-gaps.ts` is the engineering record of what the backend does not
// serve and why: 192 entries, eleven files, ~850 KB of authored prose naming
// absent controls, simulated capabilities and decisions taken against. It is
// also, through the gap notices, load-bearing in production.
//
// Measured on the 13 Nov 2026 Android export: 1,956 of 1,958 long literals from
// those files were in the shipped Hermes bytecode — 424 KB of internal
// engineering narrative inside an APK, which is a zip file anybody can open.
//
// `scripts/generate-production-registers.js` derives a twin of each register
// with the narrative fields emptied, and `metro.config.js` resolves the twin in
// a production bundle. This file is what stops the two drifting apart, and it
// checks three different ways for them to be wrong:
//
//   1. **The twin is stale.** Someone edited a register and did not regenerate.
//      Caught by regenerating in memory and comparing.
//
//   2. **The twin lost something a member sees.** A notice reads an entry's id,
//      title, capability, backendStatus, backendPartialNote, currentBehaviour
//      and the first line of its missing contract. If a twin blanked one of
//      those, a production build would render an empty notice — a worse defect
//      than the one being fixed and a much quieter one. Caught by comparing
//      every field that is not on the blank list for strict equality.
//
//   3. **The twin stopped blanking.** A generator regression that quietly
//      produced a copy would pass (1) and (2) and fix nothing. Caught by
//      requiring the blanked fields to be empty in the twin AND non-empty in
//      the source — the anti-vacuous half, without which this suite would still
//      be green if every register were emptied of prose tomorrow.
// ─────────────────────────────────────────────────────────────────────────────

declare const __dirname: string;
const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const join: (...parts: string[]) => string = require('path').join;

const generator = require('../../../scripts/generate-production-registers') as {
  BLANK_FIELDS: Record<string, string>;
  KEEP_IN: Record<string, string[]>;
  registers: () => { source: string; twin: string }[];
  twinFor: (sourcePath: string) => string;
};

const ROOT = join(__dirname, '..', '..', '..');

/**
 * What this register empties — the blank list, less anything kept for it.
 *
 * Per register rather than global, because `currentBehaviour` and
 * `missingBackendCapability` are narrative in most registers and rendered by a
 * notice in two or three. A flat set would either leave prose in the bundle or
 * blank a line a member reads.
 */
function blankedIn(fileName: string): Set<string> {
  return new Set(
    Object.keys(generator.BLANK_FIELDS).filter(
      (field) => !(generator.KEEP_IN[field] ?? []).includes(fileName)
    )
  );
}

/**
 * Every register and its twin, as loaded modules.
 *
 * Literal `require` calls rather than a loop over paths: jest's module
 * registry resolves `@/` through `moduleNameMapper`, which needs the specifier
 * to be a literal string at transform time.
 */
const PAIRS: { name: string; source: Record<string, unknown>; twin: Record<string, unknown> }[] = [
  { name: 'analytics-gaps', source: require('@/config/analytics-gaps'), twin: require('@/config/analytics-gaps.production') },
  { name: 'automation-gaps', source: require('@/config/automation-gaps'), twin: require('@/config/automation-gaps.production') },
  { name: 'community-gaps', source: require('@/config/community-gaps'), twin: require('@/config/community-gaps.production') },
  { name: 'creator-gaps', source: require('@/config/creator-gaps'), twin: require('@/config/creator-gaps.production') },
  { name: 'financial-gaps', source: require('@/config/financial-gaps'), twin: require('@/config/financial-gaps.production') },
  { name: 'integration-gaps', source: require('@/config/integration-gaps'), twin: require('@/config/integration-gaps.production') },
  { name: 'integration-provider-gaps', source: require('@/config/integration-provider-gaps'), twin: require('@/config/integration-provider-gaps.production') },
  { name: 'map-provider-gaps', source: require('@/config/map-provider-gaps'), twin: require('@/config/map-provider-gaps.production') },
  { name: 'maps-gaps', source: require('@/config/maps-gaps'), twin: require('@/config/maps-gaps.production') },
  { name: 'monetization-gaps', source: require('@/config/monetization-gaps'), twin: require('@/config/monetization-gaps.production') },
  { name: 'multi-community-gaps', source: require('@/config/multi-community-gaps'), twin: require('@/config/multi-community-gaps.production') },
];

type Difference = { at: string; source: unknown; twin: unknown };

/** Walks both values together, collecting every place the twin is wrong. */
function compare(
  sourceValue: unknown,
  twinValue: unknown,
  at: string,
  blankedKey: string | null,
  out: { differences: Difference[]; blanked: string[]; carried: number },
  blanked: Set<string>
): void {
  if (blankedKey) {
    const emptied =
      twinValue === '' || (Array.isArray(twinValue) && twinValue.length === 0);
    const wasThere =
      (typeof sourceValue === 'string' && sourceValue.length > 0) ||
      (Array.isArray(sourceValue) && sourceValue.length > 0);

    if (!emptied) out.differences.push({ at: `${at} (not blanked)`, source: sourceValue, twin: twinValue });
    if (wasThere) out.blanked.push(at);
    return;
  }

  if (Array.isArray(sourceValue)) {
    if (!Array.isArray(twinValue) || twinValue.length !== sourceValue.length) {
      out.differences.push({ at, source: sourceValue, twin: twinValue });
      return;
    }
    sourceValue.forEach((item, index) => {
      compare(item, twinValue[index], `${at}[${index}]`, null, out, blanked);
    });
    return;
  }

  if (sourceValue && typeof sourceValue === 'object') {
    const sourceObject = sourceValue as Record<string, unknown>;
    const twinObject = (twinValue ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(sourceObject)) {
      compare(
        sourceObject[key],
        twinObject[key],
        `${at}.${key}`,
        blanked.has(key) ? key : null,
        out,
        blanked
      );
    }
    return;
  }

  if (sourceValue !== twinValue) {
    out.differences.push({ at, source: sourceValue, twin: twinValue });
    return;
  }

  if (typeof sourceValue === 'string' && sourceValue.length > 0) out.carried += 1;
}

describe('the generated twins are current', () => {
  for (const { source, twin } of generator.registers()) {
    it(`${twin} matches what the generator produces from ${source}`, () => {
      // Run `node scripts/generate-production-registers.js` when this fails.
      const committed = readFileSync(join(ROOT, twin), 'utf8');
      expect(committed).toBe(generator.twinFor(source));
    });
  }
});

describe('a twin keeps everything a member can see', () => {
  for (const { name, source, twin } of PAIRS) {
    it(name, () => {
      const out = { differences: [] as Difference[], blanked: [] as string[], carried: 0 };
      const blanked = blankedIn(`${name}.ts`);

      for (const key of Object.keys(source)) {
        const sourceValue = source[key];
        if (typeof sourceValue === 'function') {
          // A twin's functions come through the transform untouched, so there
          // is nothing to compare but their presence.
          expect(typeof twin[key]).toBe('function');
          continue;
        }
        compare(sourceValue, twin[key], key, blanked.has(key) ? key : null, out, blanked);
      }

      expect(out.differences).toEqual([]);

      // Anti-vacuous. If the registers themselves lost their prose, every
      // assertion above would still pass and this suite would be measuring
      // nothing. Each twin must have emptied real content.
      expect(out.blanked.length).toBeGreaterThan(0);

      // And it must have carried real content through, or a twin that blanked
      // the whole register would look like a success.
      expect(out.carried).toBeGreaterThan(0);
    });
  }
});

describe('the blank list is justified', () => {
  it('names a reader for every field it empties', () => {
    expect(Object.keys(generator.BLANK_FIELDS).length).toBeGreaterThan(0);
    for (const [field, readers] of Object.entries(generator.BLANK_FIELDS)) {
      expect(typeof readers).toBe('string');
      expect(readers.length).toBeGreaterThan(0);
      expect(field).not.toBe('');
    }
  });

  it('does not empty a field a production notice renders', () => {
    // The fields the gap notices read, each taken from the component that
    // renders it, and the registers it is rendered OUT OF. Blanking one of
    // these in a register on its right-hand side is the mistake this assertion
    // exists to stop, because the symptom is a blank line on a member's screen
    // in a release binary and nothing anywhere else.
    const MEMBER_VISIBLE: Record<string, string[]> = {
      id: [],
      title: [],
      capability: [],
      backendStatus: [],
      backendPartialNote: [],
      missingContract: [],
      currentBehaviour: ['map-provider-gaps.ts'],
      missingBackendCapability: ['analytics-gaps.ts', 'multi-community-gaps.ts'],
    };

    for (const [field, renderedIn] of Object.entries(MEMBER_VISIBLE)) {
      if (renderedIn.length === 0) {
        // Rendered everywhere it exists, so it may never be blanked.
        expect({ field, onTheBlankList: field in generator.BLANK_FIELDS }).toEqual({
          field,
          onTheBlankList: false,
        });
        continue;
      }

      // Rendered out of some registers only. It may be blanked, but every
      // register whose notice reads it has to be kept.
      for (const register of renderedIn) {
        expect({ field, register, blanked: blankedIn(register).has(field) }).toEqual({
          field,
          register,
          blanked: false,
        });
      }
    }
  });
});
