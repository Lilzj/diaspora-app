/**
 * The simulated-feature switch — shared by Phases 5, 6, 7 and 12
 *
 * `src/config/gap-preview.ts` decides whether this build may reach any
 * development adapter. It is the single most security-relevant boolean in the
 * app, so these tests pin down all four inputs and, more importantly, the
 * things that must **not** turn it on.
 *
 * Note on how the flag is read: `areSimulatedFeaturesEnabled` accesses
 * `process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW` as a static member so Babel can
 * inline it at build time. Under Jest that inlining does not happen, so these
 * tests can mutate `process.env` directly — which is exactly what makes the
 * behaviour testable at all.
 */

import {
  GAP_PREVIEW_ENV_VAR,
  areSimulatedFeaturesEnabled,
  isGapPreviewBuild,
} from '@/config/gap-preview';
import { areCommunityGapsEnabled } from '@/config/community-gaps';
import { areCreatorGapsEnabled } from '@/config/creator-gaps';
import { areMonetizationGapsEnabled } from '@/config/monetization-gaps';
import { areGapFeaturesEnabled } from '@/config/financial-gaps';

const originalDev = global.__DEV__;
const originalFlag = process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;

function setFlag(value: string | undefined) {
  if (value === undefined) {
    delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
  } else {
    process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = value;
  }
}

afterEach(() => {
  global.__DEV__ = originalDev;
  setFlag(originalFlag);
});

describe('the development path', () => {
  it('is on under Metro and in a debug binary, with no flag set', () => {
    global.__DEV__ = true;
    setFlag(undefined);
    expect(areSimulatedFeaturesEnabled()).toBe(true);
  });

  it('short-circuits, so development does not depend on an env var', () => {
    // If the `__DEV__` check did not short-circuit, an explicitly-disabled flag
    // would break every developer's app.
    global.__DEV__ = true;
    setFlag('0');
    expect(areSimulatedFeaturesEnabled()).toBe(true);
  });

  it('is not reported as a preview build', () => {
    global.__DEV__ = true;
    setFlag('1');
    // A developer running Metro does not need telling. Somebody handed an APK
    // does — that is the whole distinction this function exists for.
    expect(isGapPreviewBuild()).toBe(false);
  });
});

describe('a release build with no opt-in — the default', () => {
  beforeEach(() => {
    global.__DEV__ = false;
  });

  it('is off when the flag is absent', () => {
    setFlag(undefined);
    expect(areSimulatedFeaturesEnabled()).toBe(false);
    expect(isGapPreviewBuild()).toBe(false);
  });

  it('turns every phase switch off together', () => {
    setFlag(undefined);
    expect(areGapFeaturesEnabled()).toBe(false);
    expect(areMonetizationGapsEnabled()).toBe(false);
    expect(areCreatorGapsEnabled()).toBe(false);
    expect(areCommunityGapsEnabled()).toBe(false);
  });
});

describe('a release build that explicitly opted in', () => {
  beforeEach(() => {
    global.__DEV__ = false;
    setFlag('1');
  });

  it('is on', () => {
    expect(areSimulatedFeaturesEnabled()).toBe(true);
  });

  it('is reported as a preview build, so it can announce itself', () => {
    expect(isGapPreviewBuild()).toBe(true);
  });

  it('turns every phase switch on together', () => {
    // One switch, four phases. Four separate answers would be four things to
    // get wrong.
    expect(areGapFeaturesEnabled()).toBe(true);
    expect(areMonetizationGapsEnabled()).toBe(true);
    expect(areCreatorGapsEnabled()).toBe(true);
    expect(areCommunityGapsEnabled()).toBe(true);
  });
});

describe('what must NOT turn it on', () => {
  beforeEach(() => {
    global.__DEV__ = false;
  });

  /**
   * Only the exact string `'1'`.
   *
   * Truthiness would be the wrong test in both directions: a stray
   * `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=` yields `''`, and somebody writing
   * `=false` yields the string `"false"` — truthy, and catastrophically so.
   */
  it.each([
    ['an empty string', ''],
    ['the word false', 'false'],
    ['the word true', 'true'],
    ['zero', '0'],
    ['the word yes', 'yes'],
    ['a leading space', ' 1'],
    ['a trailing space', '1 '],
    ['uppercase Y', 'Y'],
    ['a number other than one', '2'],
  ])('%s does not enable it', (_label, value) => {
    setFlag(value);
    expect(areSimulatedFeaturesEnabled()).toBe(false);
  });

  it('an absent variable does not enable it', () => {
    setFlag(undefined);
    expect(areSimulatedFeaturesEnabled()).toBe(false);
  });
});

describe('the environment variable name', () => {
  it('is exported so tooling and tests do not re-type it', () => {
    expect(GAP_PREVIEW_ENV_VAR).toBe('EXPO_PUBLIC_ENABLE_GAP_PREVIEW');
  });

  it('carries the EXPO_PUBLIC_ prefix, without which Babel would not inline it', () => {
    // A variable without this prefix is not exposed to the bundle at all, and
    // the flag would silently never work in a real build.
    expect(GAP_PREVIEW_ENV_VAR.startsWith('EXPO_PUBLIC_')).toBe(true);
  });
});

describe('the eas.json contract', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const easJson = require('../../../eas.json') as {
    build: Record<string, { env?: Record<string, string> }>;
  };

  // Not on the test profile either, since 20 Oct 2026: testers saw simulated
  // figures and reported them as bugs. Simulations stay a development-only tool.
  it('does not set the flag on the test (preview) profile', () => {
    expect(easJson.build.preview.env?.EXPO_PUBLIC_ENABLE_GAP_PREVIEW).toBeUndefined();
  });

  it('does NOT set it on the production profile', () => {
    // The assertion that keeps the narrowed guarantee true. If somebody adds
    // the flag to `production`, this fails and says why.
    expect(easJson.build.production.env ?? {}).not.toHaveProperty(
      'EXPO_PUBLIC_ENABLE_GAP_PREVIEW'
    );
  });

  it('does not set it on the development profile either, which does not need it', () => {
    expect(easJson.build.development.env ?? {}).not.toHaveProperty(
      'EXPO_PUBLIC_ENABLE_GAP_PREVIEW'
    );
  });
});
