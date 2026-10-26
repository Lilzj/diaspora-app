// ─────────────────────────────────────────────────────────────────────────────
// Points history names what the server pays for — 26 Oct 2026 (CS-C2, CS-D)
//
// The history's labels were written for the mock's sources. The server pays
// points under its own: a guide approved, an update confirmed, a referral that
// qualified, a milestone or challenge by key, the welcome bonus. Every one of
// them fell through to the fallback, so a milestone read "Milestone:first-guide".
// ─────────────────────────────────────────────────────────────────────────────

import { describeRewardSource } from '../reward-source';

describe('describeRewardSource', () => {
  it.each([
    ['GuideApproved', 'Guide approved'],
    ['UpdateVerified', 'Update confirmed'],
    ['ReferralQualified', 'Referral qualified'],
    ['SignupBonus', 'Welcome bonus'],
  ])('names the server source %s', (source, label) => {
    expect(describeRewardSource(source).label).toBe(label);
  });

  it('names a milestone or a challenge whatever its key', () => {
    expect(describeRewardSource('Milestone:first-guide').label).toBe('Milestone reached');
    expect(describeRewardSource('Challenge:winter-guides').label).toBe('Challenge completed');
  });

  it('gives every named source its own icon', () => {
    for (const source of ['GuideApproved', 'UpdateVerified', 'ReferralQualified', 'SignupBonus', 'Milestone:x', 'Challenge:y']) {
      expect(describeRewardSource(source).icon).not.toBe('ellipse-outline');
    }
  });

  it('still reads a source it does not know as words', () => {
    expect(describeRewardSource('StaffCorrection')).toEqual({ label: 'Staff Correction', icon: 'ellipse-outline' });
  });

  it('keeps the labels it already had', () => {
    expect(describeRewardSource('GuidePublished').label).toBe('Guide published');
  });
});
