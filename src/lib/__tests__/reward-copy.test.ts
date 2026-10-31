// ─────────────────────────────────────────────────────────────────────────────
// One account of what XP, points and credit are — 22 Oct 2026 (step 2, S2-7)
//
// Each surface described them in its own words, and together they disagreed:
// the FAQ called the wallet "a record, not a balance", the convert screen said
// credit "can be spent on the platform", the withdraw alert said the balance
// "can be spent on the platform", and the FAQ said points are "earned by
// contributing — publishing a guide, writing a review, volunteering", which
// earns XP and no points at all. Nothing anywhere said XP is not points.
//
// The statements live in lib/reward-copy.ts. This checks the screens use them,
// that they stay silent on what credit can be used for (decision D-7), and that
// the contradicting sentences do not come back.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CREDIT_IS_ONE_WAY,
  POINTS_ARE_NOT_XP,
  POINTS_CAN_CONVERT,
  XP_IS_NOT_MONEY,
} from '../reward-copy';

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

/** A file's code with its comments removed, so a comment quoting old copy does not count. */
function code(...segments: string[]): string {
  return fs
    .readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .filter((line: string) => !/^\s*(\/\/|\*|\{\/\*)/.test(line))
    .join(String.fromCharCode(10));
}

const SURFACES = {
  reputation: code('app', 'profile', 'reputation.tsx'),
  points: code('app', 'wallet', 'rewards', 'index.tsx'),
  convert: code('app', 'wallet', 'rewards', 'convert.tsx'),
  faq: code('app', 'settings', 'faq.tsx'),
  wallet: code('app', 'wallet', 'index.tsx'),
  errors: code('lib', 'financial-errors.ts'),
};

describe('each surface says it in the shared words', () => {
  it('the reputation screen says XP is not money', () => {
    expect(SURFACES.reputation).toMatch(/\{XP_IS_NOT_MONEY\}/);
  });

  it('the points screen says points are not XP, and when they convert', () => {
    expect(SURFACES.points).toMatch(/POINTS_ARE_NOT_XP/);
    expect(SURFACES.points).toMatch(/POINTS_CAN_CONVERT/);
  });

  it('the convert screen says credit is one way', () => {
    expect(SURFACES.convert).toMatch(/\{CREDIT_IS_ONE_WAY\}/);
  });

  it('the FAQ uses all four', () => {
    for (const name of ['XP_IS_NOT_MONEY', 'POINTS_ARE_NOT_XP', 'POINTS_CAN_CONVERT', 'CREDIT_IS_ONE_WAY']) {
      expect(SURFACES.faq).toMatch(new RegExp(`\\$\\{${name}\\}`));
    }
  });
});

describe('the statements do not decide D-7', () => {
  // D-7 is a hold whose length the server publishes. A fixed sentence that says
  // what credit can do, or when, goes stale; `creditHoldSentence` reads the terms.
  it.each([
    ['XP_IS_NOT_MONEY', XP_IS_NOT_MONEY],
    ['POINTS_ARE_NOT_XP', POINTS_ARE_NOT_XP],
    ['POINTS_CAN_CONVERT', POINTS_CAN_CONVERT],
    ['CREDIT_IS_ONE_WAY', CREDIT_IS_ONE_WAY],
  ])('%s says nothing about spending or withdrawing', (_name, statement) => {
    expect(statement).not.toMatch(/spen[dt]|withdraw|cash out/i);
  });
});

describe('the sentences that contradicted each other are gone', () => {
  it('no surface says wallet money can be spent on the platform', () => {
    for (const source of Object.values(SURFACES)) {
      expect(source).not.toMatch(/can be spent on the platform/);
    }
  });

  it('the FAQ no longer calls the wallet "a record, not a balance"', () => {
    expect(SURFACES.faq).not.toMatch(/a record, not a balance/);
  });

  it('nothing says points are earned by contributing', () => {
    // Content activity earns XP. Points come from the programmes (audit §4.2).
    expect(SURFACES.faq).not.toMatch(/earned by contributing/);
    expect(SURFACES.points).not.toMatch(/Contribution points/);
  });
});
