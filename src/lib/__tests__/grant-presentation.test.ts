/**
 * Grants read honestly (UAT, 3 Nov 2026, item 7). The Open tab listed every
 * published grant, closed ones included; a closed grant still said "Closes 3
 * weeks ago"; and categories printed as keys ("community").
 */
import { grantCategoryLabel, grantWindowLabel } from '@/lib/creator-economy';
import { creatorGapKeys } from '@/lib/creator-gap-api';

declare const process: { cwd(): string };
const fs: { readFileSync(path: string, encoding: string): string } = require('fs');
const path: { join(...parts: string[]): string } = require('path');

const NOW = new Date('2026-11-04T12:00:00Z');

describe('a grant card says where the grant is in its window', () => {
  it('says Closed for a closed grant, never "Closes" in the past', () => {
    expect(grantWindowLabel({ state: 'Closed', deadlineAt: '2026-10-01T00:00:00Z', opensAt: null }, NOW)).toEqual({
      text: 'Closed',
      tone: 'closed',
    });
  });

  it('says when an upcoming grant opens', () => {
    const label = grantWindowLabel(
      { state: 'Upcoming', opensAt: '2026-11-20T00:00:00Z', deadlineAt: '2026-12-20T00:00:00Z' },
      NOW,
    );
    expect(label?.text).toMatch(/^Opens /);
    expect(label?.tone).toBe('upcoming');
  });

  it('says when an open grant closes, and warns when that is soon', () => {
    expect(
      grantWindowLabel({ state: 'Open', opensAt: null, deadlineAt: '2026-12-20T00:00:00Z' }, NOW)?.text,
    ).toMatch(/^Closes /);
    expect(
      grantWindowLabel({ state: 'ClosingSoon', opensAt: null, deadlineAt: '2026-11-06T00:00:00Z' }, NOW)?.tone,
    ).toBe('soon');
    expect(grantWindowLabel({ state: 'Open', opensAt: null, deadlineAt: null }, NOW)).toBeNull();
  });
});

describe('grant categories', () => {
  it('reads as words, not keys', () => {
    expect(grantCategoryLabel('community')).toBe('Community');
    expect(grantCategoryLabel('creators')).toBe('Creators');
    expect(grantCategoryLabel('small-business')).toBe('Small business');
  });
});

describe('the Open tab', () => {
  it('asks the server for grants taking applications, keyed by that question', () => {
    const screen = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'creator', 'grants', 'index.tsx'), 'utf8');
    expect(screen).toMatch(/state:\s*OPEN_GRANT_STATES/);
    expect(creatorGapKeys.grants('all', 'Open,ClosingSoon')).not.toEqual(creatorGapKeys.grants('all'));
  });
});
