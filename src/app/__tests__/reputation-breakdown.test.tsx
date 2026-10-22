/**
 * The reputation cards show what the server paid — 22 Oct 2026.
 *
 * Each card's rows were the profile's counters multiplied by figures written
 * into the screen: thirty a phone where the server pays twenty, forty a country
 * where it pays thirty, minus twenty a violation where it costs seventy-five.
 * Content removed by moderation has no counter, so it moved the trust score
 * with no row at all. The rows now come from the server's `breakdown`, and a
 * server that does not send one gets no rows rather than invented ones.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import type { WireReputationDimensionBreakdown, WireReputationProfile } from '@/types/trust';

const mockReputation = jest.fn();
const mockRules = jest.fn(() => ({ rules: [] as unknown[], isLoading: false, error: null }));

jest.mock('@/hooks/trust', () => ({
  useMyReputation: () => mockReputation(),
  useReputationRules: () => mockRules(),
  useMyReputationEvents: () => ({
    events: [],
    totalCount: 0,
    isLoading: false,
    isEmpty: true,
    error: null,
  }),
}));

jest.mock('@/components/ScrollEndNavigationMenu', () => ({
  ScrollEndScrollView: jest.requireActual('react-native').ScrollView,
}));

// eslint-disable-next-line import/first
import ReputationDashboard from '../profile/reputation';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function dimension(
  name: WireReputationDimensionBreakdown['dimension'],
  score: number,
  lines: Array<[actionType: string, label: string, count: number, points: number]> = [],
  adjustment = 0
): WireReputationDimensionBreakdown {
  return {
    dimension: name,
    score,
    lines: lines.map(([actionType, label, count, points]) => ({ actionType, label, count, points })),
    adjustment,
  };
}

/**
 * A profile whose counters would, under the old multipliers, have produced
 * rows of their own — so a test that finds none of those rows knows the
 * multipliers are gone rather than merely fed zeros.
 */
function profile(overrides: Partial<WireReputationProfile> = {}): WireReputationProfile {
  return {
    userId: 'member',
    contributionScore: 0,
    verificationScore: 50,
    trustScore: 0,
    combinedScore: 50,
    level: 'Member',
    nextLevel: { name: 'VerifiedResident', minScore: 100, pointsNeeded: 50 },
    guidesPublished: 3,
    guidesApproved: 0,
    updatesPublished: 0,
    updatesVerified: 0,
    commentsWritten: 0,
    guidesUpdated: 0,
    phoneVerified: true,
    emailVerified: false,
    governmentIdVerified: false,
    profilePhotoAdded: false,
    profileCompleted: false,
    providerVerified: false,
    countryVerificationsCount: 1,
    helpfulVotesReceived: 0,
    communityConfirmationsReceived: 1,
    violationCount: 1,
    reportsResolved: 0,
    noViolationStreakDays: 0,
    badges: [],
    levelBenefits: {
      canPublishImmediately: false,
      canModerate: false,
      isFeaturedEligible: false,
      isRewardsEligible: false,
      hasBetaAccess: false,
      hasExclusiveBadge: false,
      searchBoostFactor: 1,
    },
    lastCalculatedAt: '2026-10-22T10:00:00Z',
    levelChangedAt: null,
    ...overrides,
  };
}

function renderScreen(reputation: WireReputationProfile) {
  mockReputation.mockReturnValue({ reputation, isLoading: false, error: null, refresh: jest.fn() });

  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ReputationDashboard />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

describe('the reputation cards', () => {
  it('show the points the server recorded, and none of their own', () => {
    renderScreen(
      profile({
        breakdown: [
          dimension('contribution', 0),
          dimension('verification', 50, [
            ['CountryVerified', 'Countries verified', 1, 30],
            ['PhoneVerified', 'Phone verified', 1, 20],
          ]),
          dimension('trust', 0),
        ],
      })
    );

    expect(screen.getByText('Countries verified')).toBeTruthy();
    expect(screen.getByText('+30')).toBeTruthy();
    expect(screen.getByText('Phone verified')).toBeTruthy();
    expect(screen.getByText('+20')).toBeTruthy();

    // The multiplied rows: a phone at thirty, a country at forty, three guides
    // at thirty each, a violation at minus twenty.
    expect(screen.queryByText('Phone Verified')).toBeNull();
    expect(screen.queryByText('+40')).toBeNull();
    expect(screen.queryByText('Published Guides')).toBeNull();
    expect(screen.queryByText('-20')).toBeNull();
  });

  it('show a penalty that went below zero as its own row, so the rows add up', () => {
    renderScreen(
      profile({
        verificationScore: 0,
        combinedScore: 0,
        breakdown: [
          dimension('contribution', 0),
          dimension('verification', 0),
          dimension(
            'trust',
            0,
            [
              ['CommunityConfirmation', 'Community confirmations', 1, 5],
              ['ViolationRecorded', 'Policy violations', 1, -75],
            ],
            70
          ),
        ],
      })
    );

    expect(screen.getByText('Policy violations')).toBeTruthy();
    expect(screen.getByText('-75')).toBeTruthy();
    expect(screen.getByText('Held at zero (a penalty was larger than the score)')).toBeTruthy();
    expect(screen.getByText('+70')).toBeTruthy();
  });

  it('give content removed by moderation a row, which no counter ever did', () => {
    renderScreen(
      profile({
        verificationScore: 0,
        trustScore: 35,
        combinedScore: 35,
        breakdown: [
          dimension('contribution', 0),
          dimension('verification', 0),
          dimension('trust', 35, [
            ['HelpfulVoteReceived', 'Helpful votes received', 30, 60],
            ['ContentRemoved', 'Content removed by moderation', 1, -25],
          ]),
        ],
      })
    );

    expect(screen.getByText('Content removed by moderation')).toBeTruthy();
    expect(screen.getByText('-25')).toBeTruthy();
    expect(screen.getByText('Helpful votes received ×30')).toBeTruthy();
  });

  it('show no rows at all for a server that sends no breakdown, rather than invent them', () => {
    renderScreen(profile());

    expect(screen.queryByText('Phone Verified')).toBeNull();
    expect(screen.queryByText('Published Guides')).toBeNull();
    expect(screen.queryByText('Violations')).toBeNull();
    expect(screen.queryByText(/Held at zero/)).toBeNull();
  });
});

/**
 * "How to earn XP" was a sentence typed into the screen: guides +50,
 * confirming alerts +15, residency documents +100, helpful votes +10. Only the
 * first was right, and confirming pays the author, not the confirmer. It is
 * built from `GET /trust/reputation/rules` now.
 */
describe('how to earn XP', () => {
  afterEach(() => {
    mockRules.mockImplementation(() => ({ rules: [], isLoading: false, error: null }));
  });

  it('quotes the rules the server pays, and what lowers the score', () => {
    mockRules.mockImplementation(() => ({
      rules: [
        { actionType: 'GuidePublished', label: 'Guides published', dimension: 'contribution', points: 50, maxOccurrences: null, cooldownHours: 1, isCountryScoped: true },
        { actionType: 'CountryVerified', label: 'Countries verified', dimension: 'verification', points: 30, maxOccurrences: 1, cooldownHours: null, isCountryScoped: true },
        { actionType: 'HelpfulVoteReceived', label: 'Helpful votes received', dimension: 'trust', points: 2, maxOccurrences: null, cooldownHours: null, isCountryScoped: true },
        { actionType: 'ViolationRecorded', label: 'Policy violations', dimension: 'trust', points: -75, maxOccurrences: null, cooldownHours: null, isCountryScoped: false },
      ],
      isLoading: false,
      error: null,
    }));

    renderScreen(profile());

    expect(screen.getByText('+50 XP')).toBeTruthy();
    expect(screen.getByText('Countries verified (once per country)')).toBeTruthy();
    expect(screen.getByText('+30 XP')).toBeTruthy();
    expect(screen.getByText('+2 XP')).toBeTruthy();
    expect(screen.getByText('What lowers it')).toBeTruthy();
    expect(screen.getByText('−75 XP')).toBeTruthy();

    expect(screen.queryByText(/confirm alerts \(\+15 XP\)/)).toBeNull();
    expect(screen.queryByText(/\+100 XP/)).toBeNull();
  });

  it('says what earns XP without any figure when there are no rules to quote', () => {
    renderScreen(profile());

    expect(screen.getByText(/all earn XP\.$/)).toBeTruthy();
    expect(screen.queryByText(/\+\d+ XP/)).toBeNull();
    expect(screen.queryByText('What lowers it')).toBeNull();
  });
});
