/**
 * The Earn tab shows what actually pays reward points — 25 Oct 2026 (CS-C4, RWD-02).
 *
 * It listed Creator's per-action rules as "Earns 50 points" for a guide, "+30"
 * for an event. Nothing paid those: they are leaderboard and milestone
 * weights. A confirmed outcome pays points, priced by Trust's rules, and the
 * programme's milestones and challenges pay what each says.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '@/design-system';
import type { WireReputationRule } from '@/types/trust';
import { CONFIRMED_OUTCOME_NOTE, EarnPointsList } from '../EarnPointsList';

function rule(actionType: string, label: string, points: number, creditPoints?: number | null): WireReputationRule {
  return { actionType, label, dimension: 'contribution', points, isCountryScoped: false, creditPoints };
}

const RULES: WireReputationRule[] = [
  rule('GuidePublished', 'Guides published', 50, null),
  rule('GuideApproved', 'Guides approved', 25, 250),
  rule('UpdateVerified', 'Updates confirmed by the community', 15, 200),
  rule('ReferralQualified', 'Referrals qualified', 25, 250),
  rule('CommentWritten', 'Comments written', 2),
];

function renderList(rules: WireReputationRule[] = RULES) {
  return render(
    <ThemeProvider>
      <EarnPointsList rules={rules} />
    </ThemeProvider>
  );
}

describe('EarnPointsList', () => {
  it('lists the confirmed outcomes that pay points, with what they pay', () => {
    renderList();

    expect(screen.getByText('Guides approved')).toBeTruthy();
    expect(screen.getByText('Updates confirmed by the community')).toBeTruthy();
    expect(screen.getByText('Referrals qualified')).toBeTruthy();
    expect(screen.getAllByText('+250')).toHaveLength(2);
    expect(screen.getByText('+200')).toBeTruthy();
    expect(screen.getAllByText(CONFIRMED_OUTCOME_NOTE)).toHaveLength(3);
  });

  it('does not list an action that pays XP alone', () => {
    renderList();

    expect(screen.queryByText('Guides published')).toBeNull();
    expect(screen.queryByText('Comments written')).toBeNull();
    expect(screen.queryByText('+50')).toBeNull();
  });

  it('points to milestones and challenges, which say what they pay', () => {
    renderList();

    fireEvent.press(screen.getByText('Milestones'));
    expect(router.push).toHaveBeenCalledWith('/creator/milestones');

    fireEvent.press(screen.getByText('Challenges'));
    expect(router.push).toHaveBeenCalledWith('/creator/challenges');
  });

  it('says nothing pays points yet when no rule does, and still offers milestones', () => {
    renderList([rule('GuidePublished', 'Guides published', 50)]);

    expect(screen.getByText('Nothing pays points yet')).toBeTruthy();
    expect(screen.getByText('Milestones')).toBeTruthy();
  });
});
