// The reputation panel prints what the server composed and nothing else: the
// level, a score only when served, the counts, badges with their source, and
// every `unavailable` item with the server's reason (20 Oct 2026).

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/design-system';
import { ReputationPanel } from '../ReputationPanel';
import { toBadgeItem } from '@/config/badges';
import type { CreatorReputation } from '@/types/creator-economy';

jest.mock('@/hooks/creator-economy', () => ({
  useCreatorReputation: jest.fn(),
  usePublicCreatorReputation: jest.fn(),
}));

function renderWithTheme(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

const publicReputation: CreatorReputation = {
  creatorId: 'cr1',
  userId: 'u1',
  isSelf: false,
  score: null,
  tier: 'TrustedContributor',
  tierLabel: 'Trusted contributor',
  dimensions: [
    { key: 'contribution', label: 'Contribution', score: 40, maxScore: null },
    { key: 'verification', label: 'Verification', score: 25, maxScore: null },
  ],
  badges: [
    {
      badgeId: 'trust:PhoneVerified',
      key: 'PhoneVerified',
      label: 'Phone verified',
      isEarned: true,
      earnedAt: '2026-10-01T00:00:00Z',
      source: 'trust',
    },
    {
      badgeId: 'm-1',
      key: 'knowledge',
      label: 'Knowledge',
      icon: '📚',
      isEarned: true,
      earnedAt: '2026-10-02T00:00:00Z',
      source: 'milestone',
    },
  ],
  pointsToNextTier: null,
  nextTier: 'CommunityExpert',
  nextTierLabel: 'Community expert',
  signals: [
    { key: 'followers', label: 'Followers', value: 12, source: 'community' },
    { key: 'guide_views', label: 'Guide views', value: 0, source: 'guides' },
  ],
  unavailable: [
    {
      key: 'reach',
      label: 'Reach beyond guides',
      reason: 'Views are recorded for guides only.',
    },
    { key: 'trust', label: 'Trust', reason: 'Shown only to the creator.' },
    { key: 'score', label: 'Combined score', reason: 'Withheld on a public read.' },
  ],
  updatedAt: '2026-10-20T00:00:00Z',
};

describe('ReputationPanel', () => {
  it('lists everything the server could not answer, with its reason', () => {
    renderWithTheme(<ReputationPanel reputation={publicReputation} showBadges />);

    expect(screen.getByText('Not available')).toBeTruthy();
    for (const item of publicReputation.unavailable) {
      expect(screen.getByText(item.label)).toBeTruthy();
      expect(screen.getByText(item.reason)).toBeTruthy();
    }
  });

  it('prints no score when the server withheld one — never a zero', () => {
    renderWithTheme(<ReputationPanel reputation={publicReputation} />);

    expect(screen.getByText('Trusted contributor')).toBeTruthy();
    expect(screen.queryByText(/points$/)).toBeNull();
    expect(screen.queryByText(/points to/)).toBeNull();
  });

  it('prints the served score and the distance to the next level on the own read', () => {
    renderWithTheme(
      <ReputationPanel
        reputation={{ ...publicReputation, isSelf: true, score: 120, pointsToNextTier: 80, unavailable: [] }}
      />
    );

    expect(screen.getByText('120 points')).toBeTruthy();
    expect(screen.getByText('80 points to Community expert')).toBeTruthy();
    expect(screen.queryByText('Not available')).toBeNull();
  });

  it('shows the served counts, a served zero included', () => {
    renderWithTheme(<ReputationPanel reputation={publicReputation} />);

    expect(screen.getByTestId('reputation-signal-followers')).toBeTruthy();
    expect(screen.getByText('Followers')).toBeTruthy();
    expect(screen.getByText('Guide views')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('names each badge’s source', () => {
    renderWithTheme(<ReputationPanel reputation={publicReputation} showBadges />);

    expect(screen.getByText('Phone verified')).toBeTruthy();
    expect(screen.getByText('Knowledge')).toBeTruthy();
    expect(screen.getByText('· Trust & verification')).toBeTruthy();
    expect(screen.getByText('· Creator milestones')).toBeTruthy();
  });
});

describe('toBadgeItem', () => {
  it('keeps the server’s earned state and progress, and invents no description', () => {
    const item = toBadgeItem({
      badgeId: 'm-2',
      key: 'trusted_voice',
      label: 'Trusted voice',
      isEarned: false,
      progress: { current: 3, target: 10, percentage: 30, unit: 'guides' },
      source: 'milestone',
    });

    expect(item.isEarned).toBe(false);
    expect(item.progress).toBe('3 of 10 guides · 30%');
    expect(item.description).toBeNull();
    expect(item.source).toBe('milestone');
  });

  it('labels a country-scoped Trust award with its country', () => {
    const item = toBadgeItem({
      badgeId: 'trust:CountryVerified:MU',
      key: 'CountryVerified',
      label: 'Country verified',
      isEarned: true,
      source: 'trust',
      countryCode: 'MU',
    });

    expect(item.title).toBe('Country verified (MU)');
    expect(item.icon).toBe('🏠');
  });
});
