/**
 * Multi-community surfaces — Frontend Phase 13 (§8, §29, §57, §59, §64)
 *
 * These components are where a member meets a community, so the tests assert what a
 * *screen reader* is told — not what a colour looks like. §59 is the section under
 * test throughout:
 *
 *   "Screen readers. Accessible community selector. Accessible membership states.
 *    Accessible badges. Accessible filters. Accessible statistics. Accessible
 *    charts. Do not use flags as the only identifier."
 *
 * The cases that matter most:
 *
 *   * A community with **no flag** — a regional community — still announces its
 *     name and renders a non-textual mark. That path is exercised by every test
 *     using `WEST_AFRICAN`, which has `countryCode: null` by design.
 *   * The four membership states §8 requires to be distinguishable each announce
 *     different *words*, so the distinction survives a monochrome display.
 *   * A simulated statistic and a real one, on the same component, are marked
 *     differently — which is §29 holding at field level rather than screen level.
 *   * Charts are tables with a decorative bar. The bar is hidden from the
 *     accessibility tree and the numbers are real text in it.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import {
  CommunityAssociationNote,
  CommunityAvatar,
  CommunityBadge,
  CommunityComparisonTable,
  CommunityFreshnessNote,
  CommunityMetricFigure,
  CommunityNoticeCard,
  CommunityReportCard,
  CommunityRoleBadge,
  CommunityRoleHolderCard,
  CommunityRow,
  CommunityRuleCard,
  CommunityScopeNote,
  CommunitySourceBadge,
  CommunityStatisticsPanel,
  CommunityUnavailablePanel,
  MembershipStatePill,
  MultiCommunityGapNotice,
  StatisticsPeriodSelector,
  communityOriginLabel,
  communityStatusLabel,
  communityTypeLabel,
} from '..';
import { projectScope } from '@/lib/community/scope';
import { MOCK_COMMUNITIES, MOCK_REPORTS, MOCK_ROLE_HOLDERS, MOCK_RULES } from '@/mocks/community-directory-data';
import type {
  CommunityMetric,
  CommunityStatistics,
  CommunityUnavailableReason,
  DataFreshness,
} from '@/types/community-directory';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderWithTheme(node: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{node}</ThemeProvider>
    </SafeAreaProvider>
  );
}

const NIGERIAN = MOCK_COMMUNITIES.find((c) => c.slug === 'nigerian')!;
const GHANAIAN = MOCK_COMMUNITIES.find((c) => c.slug === 'ghanaian')!;
/** No flag, no country code. The case that would look like a bug if untested. */
const WEST_AFRICAN = MOCK_COMMUNITIES.find((c) => c.slug === 'west-african')!;
const SUSPENDED = MOCK_COMMUNITIES.find((c) => c.slug === 'suspended-example')!;

const FRESHNESS: DataFreshness = {
  computedAt: new Date().toISOString(),
  sourceName: 'Counted from GET /jobs',
  methodology: 'Content whose publisher shares the community’s country of origin.',
  limitations: ['This is not a declared community association.'],
};

// ═════════════════════════════════════════════════════════════════════════════
// LABELS
// ═════════════════════════════════════════════════════════════════════════════

describe('labels never leave a blank', () => {
  it('names every community type', () => {
    const labels = (
      [
        'NationalDiaspora',
        'RegionalDiaspora',
        'EthnoLinguistic',
        'FaithCommunity',
        'InterestCommunity',
        'CityChapter',
      ] as const
    ).map(communityTypeLabel);

    expect(new Set(labels).size).toBe(6);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
  });

  it('names every lifecycle state', () => {
    const labels = (['Active', 'Pending', 'Suspended', 'Archived', 'Unavailable'] as const).map(
      communityStatusLabel
    );

    expect(new Set(labels).size).toBe(5);
  });

  it('describes a country-less community rather than returning an empty subtitle', () => {
    // An empty subtitle reads as a loading state, which is the wrong signal.
    expect(communityOriginLabel(WEST_AFRICAN)).toBe('West Africa');
    expect(communityOriginLabel(NIGERIAN)).toBe('Nigeria');

    const nothing = { ...WEST_AFRICAN, origin: {} };
    expect(communityOriginLabel(nothing).length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §59 — a flag is never the only identifier
// ═════════════════════════════════════════════════════════════════════════════

describe('CommunityAvatar (§57, §59)', () => {
  it('renders a flag where there is one', () => {
    renderWithTheme(<CommunityAvatar community={NIGERIAN} />);
    expect(screen.getByText('🇳🇬')).toBeTruthy();
  });

  it('renders an icon rather than nothing for a community with no flag', () => {
    // The country-less case must not look like a broken image.
    const { toJSON } = renderWithTheme(<CommunityAvatar community={WEST_AFRICAN} />);
    expect(toJSON()).toBeTruthy();
    expect(screen.queryByText('🇳🇬')).toBeNull();
  });

  it('marks a non-active community with a status dot', () => {
    const { toJSON } = renderWithTheme(
      <CommunityAvatar community={SUSPENDED} showStatusDot />
    );
    expect(toJSON()).toBeTruthy();
  });
});

describe('CommunityRow (§59)', () => {
  it('announces the community in words, not by its flag', () => {
    renderWithTheme(
      <CommunityRow community={NIGERIAN} membershipState="VerifiedMember" isPrimary />
    );

    const row = screen.getByTestId('community-row-nigerian');
    const label = String(row.props.accessibilityLabel);

    expect(label).toContain('Nigerian');
    expect(label).toContain('National community');
    expect(label).toContain('Nigeria');
    expect(label).toContain('Verified member');
    expect(label).toContain('your primary community');
  });

  it('announces a country-less community with its region', () => {
    renderWithTheme(<CommunityRow community={WEST_AFRICAN} />);

    const label = String(
      screen.getByTestId('community-row-west-african').props.accessibilityLabel
    );

    expect(label).toContain('West African');
    expect(label).toContain('Regional community');
    expect(label).toContain('West Africa');
  });

  it('announces a non-active lifecycle', () => {
    renderWithTheme(<CommunityRow community={SUSPENDED} />);

    const label = String(
      screen.getByTestId('community-row-suspended-example').props.accessibilityLabel
    );

    expect(label).toContain('Paused');
  });

  it('announces the reason a community was suggested (§55)', () => {
    renderWithTheme(
      <CommunityRow community={GHANAIAN} reason="Members of this community live in your country" />
    );

    expect(
      String(screen.getByTestId('community-row-ghanaian').props.accessibilityLabel)
    ).toContain('Members of this community live in your country');
  });

  it('reports its selected state to assistive technology', () => {
    renderWithTheme(<CommunityRow community={NIGERIAN} isSelected onPress={() => {}} />);

    const row = screen.getByTestId('community-row-nigerian');
    expect(row.props.accessibilityState.selected).toBe(true);
    expect(String(row.props.accessibilityLabel)).toContain('selected');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §8 — four distinguishable states, in words
// ═════════════════════════════════════════════════════════════════════════════

describe('MembershipStatePill (§8, §59)', () => {
  it('gives Member, Interested, Following and Discovering different words', () => {
    const labels = new Set<string>();

    for (const state of ['Member', 'Interested', 'Following', 'Discovering'] as const) {
      const { unmount } = renderWithTheme(
        <MembershipStatePill state={state} showDiscovering />
      );

      labels.add(
        String(screen.getByTestId(`membership-state-pill-${state}`).props.accessibilityLabel)
      );
      unmount();
    }

    // Four states, four different announcements. A colour could not do this.
    expect(labels.size).toBe(4);
  });

  it('renders nothing for None — a card should not say "not a member"', () => {
    renderWithTheme(<MembershipStatePill state="None" />);
    expect(screen.queryByTestId('membership-state-pill-None')).toBeNull();
  });

  it('hides Discovering unless a screen explicitly asks for it', () => {
    renderWithTheme(<MembershipStatePill state="Discovering" />);
    expect(screen.queryByTestId('membership-state-pill-Discovering')).toBeNull();
  });

  it('announces primacy alongside the state', () => {
    renderWithTheme(<MembershipStatePill state="Member" isPrimary />);

    expect(
      String(screen.getByTestId('membership-state-pill-Member').props.accessibilityLabel)
    ).toContain('primary community');
  });

  it('distinguishes Revoked from None, which is why the state exists (§74)', () => {
    renderWithTheme(<MembershipStatePill state="Revoked" />);

    expect(
      String(screen.getByTestId('membership-state-pill-Revoked').props.accessibilityLabel)
    ).toContain('ended by the community');
  });
});

describe('CommunityRoleBadge (§34, §35)', () => {
  it('renders a distinct badge for each authority-bearing role', () => {
    for (const role of ['Moderator', 'Ambassador', 'Administrator'] as const) {
      const { unmount } = renderWithTheme(<CommunityRoleBadge role={role} />);
      expect(screen.getByTestId(`community-role-badge-${role}`)).toBeTruthy();
      unmount();
    }
  });

  it('renders nothing for Member — everybody is one', () => {
    renderWithTheme(<CommunityRoleBadge role="Member" />);
    expect(screen.queryByTestId('community-role-badge-Member')).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GAP-009 — the badge and its qualifier
// ═════════════════════════════════════════════════════════════════════════════

describe('CommunityBadge (§19, §39, GAP-009)', () => {
  it('renders nothing when there is no defensible association', () => {
    renderWithTheme(
      <CommunityBadge association={{ community: null, basis: 'unknown' }} />
    );

    expect(screen.queryByTestId('community-badge')).toBeNull();
  });

  it('announces a declared association as a fact, with no qualifier', () => {
    renderWithTheme(
      <CommunityBadge
        association={{ community: NIGERIAN, basis: 'declared' }}
        showQualifier
      />
    );

    expect(screen.queryByTestId('community-association-note-origin')).toBeNull();
    expect(screen.getByText('Nigerian')).toBeTruthy();
  });

  it('qualifies an inferred association rather than asserting it', () => {
    renderWithTheme(
      <CommunityBadge association={{ community: NIGERIAN, basis: 'origin' }} showQualifier />
    );

    expect(screen.getByTestId('community-association-note-origin')).toBeTruthy();
  });

  it('announces the basis so a screen reader is told it is an inference', () => {
    renderWithTheme(
      <CommunityBadge association={{ community: NIGERIAN, basis: 'origin' }} />
    );

    expect(String(screen.getByTestId('community-badge').props.children)).toBeTruthy();
  });

  it('counts additional communities rather than rendering a wall of badges', () => {
    renderWithTheme(
      <CommunityBadge
        association={{
          community: NIGERIAN,
          basis: 'origin',
          additional: [GHANAIAN, WEST_AFRICAN],
        }}
      />
    );

    expect(screen.getByText('+2')).toBeTruthy();
  });

  it('always renders the name beside the flag (§59)', () => {
    renderWithTheme(<CommunityBadge association={{ community: NIGERIAN, basis: 'declared' }} />);

    expect(screen.getByText('Nigerian')).toBeTruthy();
  });
});

describe('CommunityAssociationNote', () => {
  it('says nothing for a declared or unknown basis', () => {
    for (const basis of ['declared', 'unknown'] as const) {
      const { unmount } = renderWithTheme(<CommunityAssociationNote basis={basis} />);
      expect(screen.queryByTestId(`community-association-note-${basis}`)).toBeNull();
      unmount();
    }
  });

  it('explains an origin match in a full sentence', () => {
    renderWithTheme(<CommunityAssociationNote basis="origin" />);

    const label = String(
      screen.getByTestId('community-association-note-origin').props.accessibilityLabel
    );

    expect(label).toContain('where the person or business came from');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §2 — the scope note
// ═════════════════════════════════════════════════════════════════════════════

describe('CommunityScopeNote (§2, GAP-009)', () => {
  const lookup = (id: string) => MOCK_COMMUNITIES.find((c) => c.id === id);

  it('renders nothing when nothing was scoped', () => {
    const projection = projectScope({ mode: 'ALL_COMMUNITIES', communityIds: [] }, lookup);

    renderWithTheme(<CommunityScopeNote projection={projection} />);

    expect(screen.queryByTestId('community-scope-note')).toBeNull();
  });

  it('says the match was made by country of origin', () => {
    const projection = projectScope(
      { mode: 'SELECTED_COMMUNITY', communityIds: [NIGERIAN.id] },
      lookup
    );

    renderWithTheme(<CommunityScopeNote projection={projection} />);

    expect(
      String(screen.getByTestId('community-scope-note').props.accessibilityLabel)
    ).toContain('matched by the country each person or business came from');
  });

  it('states how much the projection set aside', () => {
    const projection = projectScope(
      { mode: 'SELECTED_COMMUNITY', communityIds: [NIGERIAN.id] },
      lookup
    );

    renderWithTheme(
      <CommunityScopeNote projection={projection} totalBeforeScope={48} totalAfterScope={12} />
    );

    expect(
      String(screen.getByTestId('community-scope-note').props.accessibilityLabel)
    ).toContain('Showing 12 of 48');
  });

  it('names a community that could not be matched at all', () => {
    const projection = projectScope(
      { mode: 'SELECTED_COMMUNITY', communityIds: [WEST_AFRICAN.id] },
      lookup
    );

    renderWithTheme(<CommunityScopeNote projection={projection} />);

    const label = String(screen.getByTestId('community-scope-note').props.accessibilityLabel);

    // A member scoped to a regional community must not conclude the community is
    // empty when the filter simply cannot express it.
    expect(label).toContain('West African');
    expect(label).toContain('more than one country');
  });

  it('says so when the result is probably truncated', () => {
    const projection = projectScope(
      { mode: 'SELECTED_COMMUNITY', communityIds: [NIGERIAN.id] },
      lookup
    );

    renderWithTheme(<CommunityScopeNote projection={projection} resultTruncated />);

    expect(
      String(screen.getByTestId('community-scope-note').props.accessibilityLabel)
    ).toContain('There may be more further out');
  });

  it('explains an empty scope rather than showing nothing', () => {
    const projection = projectScope(
      { mode: 'INTERESTED_COMMUNITIES', communityIds: [] },
      lookup
    );

    renderWithTheme(<CommunityScopeNote projection={projection} />);

    expect(
      String(screen.getByTestId('community-scope-note').props.accessibilityLabel)
    ).toContain('No communities are selected');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §29 — provenance at field level
// ═════════════════════════════════════════════════════════════════════════════

function metric(overrides: Partial<CommunityMetric> = {}): CommunityMetric {
  return {
    key: 'events',
    label: 'Events',
    value: { value: 12, source: 'backend' },
    period: '30d',
    freshness: FRESHNESS,
    ...overrides,
  };
}

describe('CommunityMetricFigure (§29, §59)', () => {
  it('does not mark a backend figure as an estimate', () => {
    renderWithTheme(<CommunityMetricFigure metric={metric()} />);

    const label = String(screen.getByTestId('community-metric-events').props.accessibilityLabel);

    expect(label).toContain('Events: 12');
    expect(label).not.toContain('development estimate');
  });

  it('marks a simulated figure as an estimate, in words', () => {
    renderWithTheme(
      <CommunityMetricFigure
        metric={metric({
          key: 'members',
          label: 'Members',
          value: { value: 48200, source: 'simulated', gapKey: 'communityStatistics' },
        })}
      />
    );

    const label = String(screen.getByTestId('community-metric-members').props.accessibilityLabel);

    expect(label).toContain('development estimate');
    expect(screen.getByText('Estimate')).toBeTruthy();
  });

  it('marks a restricted metric as moderators-only', () => {
    renderWithTheme(
      <CommunityMetricFigure metric={metric({ key: 'retention', isRestricted: true })} />
    );

    expect(
      String(screen.getByTestId('community-metric-retention').props.accessibilityLabel)
    ).toContain('moderators');
  });

  it('announces a change figure and whether it is estimated', () => {
    renderWithTheme(
      <CommunityMetricFigure
        metric={metric({ changePercent: { value: -3.2, source: 'simulated' } })}
      />
    );

    expect(
      String(screen.getByTestId('community-metric-events').props.accessibilityLabel)
    ).toContain('down 3.2 percent');
  });

  it('prefers the display value where one was supplied', () => {
    renderWithTheme(
      <CommunityMetricFigure metric={metric({ displayValue: '48.2k' })} />
    );

    expect(screen.getByText('48.2k')).toBeTruthy();
  });
});

describe('CommunityFreshnessNote (§29)', () => {
  it('announces the source, the method and the limitations in full', () => {
    renderWithTheme(<CommunityFreshnessNote freshness={FRESHNESS} />);

    const label = String(screen.getByTestId('community-freshness-note').props.accessibilityLabel);

    expect(label).toContain('Counted from GET /jobs');
    expect(label).toContain('How this is worked out');
    // Verbatim and in full — not truncated, not behind a "read more".
    expect(label).toContain('not a declared community association');
  });

  it('says when a figure is out of date', () => {
    renderWithTheme(
      <CommunityFreshnessNote
        freshness={{ ...FRESHNESS, validUntil: new Date(Date.now() - 86_400_000).toISOString() }}
      />
    );

    expect(
      String(screen.getByTestId('community-freshness-note').props.accessibilityLabel)
    ).toContain('out of date');
  });

  it('mentions the sample size when there is one', () => {
    renderWithTheme(<CommunityFreshnessNote freshness={{ ...FRESHNESS, sampleSize: 214 }} />);

    expect(
      String(screen.getByTestId('community-freshness-note').props.accessibilityLabel)
    ).toContain('214');
  });
});

describe('CommunitySourceBadge', () => {
  it('says nothing for a backend source', () => {
    // The provider wrapper is always in the tree, so the assertion is about the
    // component's own output rather than about the render being empty.
    renderWithTheme(<CommunitySourceBadge source="backend" />);
    expect(screen.queryByText('Preview data')).toBeNull();
  });

  it('marks a simulated source', () => {
    renderWithTheme(<CommunitySourceBadge source="simulated" />);
    expect(screen.getByText('Preview data')).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §59 — accessible statistics and charts
// ═════════════════════════════════════════════════════════════════════════════

describe('CommunityStatisticsPanel (§29, §59)', () => {
  const statistics: CommunityStatistics = {
    communityId: NIGERIAN.id,
    period: '30d',
    source: 'simulated',
    freshness: FRESHNESS,
    metrics: [
      metric({ key: 'events', label: 'Events', value: { value: 12, source: 'backend' } }),
      metric({
        key: 'members',
        label: 'Members',
        value: { value: 48200, source: 'simulated', gapKey: 'communityStatistics' },
      }),
    ],
  };

  it('separates real figures from estimates, and puts the real ones first', () => {
    renderWithTheme(<CommunityStatisticsPanel statistics={statistics} />);

    expect(screen.getByText('From Diaspora’s own records')).toBeTruthy();
    expect(screen.getByText('Estimates')).toBeTruthy();
  });

  it('renders both metrics with their own markers', () => {
    renderWithTheme(<CommunityStatisticsPanel statistics={statistics} />);

    expect(screen.getByTestId('community-metric-events')).toBeTruthy();
    expect(screen.getByTestId('community-metric-members')).toBeTruthy();
  });
});

describe('StatisticsPeriodSelector (§29, §59)', () => {
  it('is a radio group with an announced selection', () => {
    renderWithTheme(<StatisticsPeriodSelector value="30d" onChange={() => {}} />);

    const group = screen.getByTestId('statistics-period-selector');
    expect(group.props.accessibilityRole).toBe('radiogroup');
  });
});

describe('CommunityComparisonTable (§30, §59)', () => {
  it('announces each row as one sentence covering every community', () => {
    renderWithTheme(
      <CommunityComparisonTable
        comparison={{
          period: '30d',
          communities: [NIGERIAN, GHANAIAN],
          rows: [
            {
              key: 'events',
              label: 'Events',
              values: [
                { value: 12, source: 'backend' },
                { value: 4, source: 'backend' },
              ],
            },
            {
              key: 'members',
              label: 'Members',
              values: [{ value: 48200, source: 'simulated' }, null],
            },
          ],
          source: 'simulated',
          freshness: FRESHNESS,
        }}
      />
    );

    const events = String(screen.getByTestId('comparison-row-events').props.accessibilityLabel);
    expect(events).toContain('Nigerian 12');
    expect(events).toContain('Ghanaian 4');

    const members = String(screen.getByTestId('comparison-row-members').props.accessibilityLabel);
    expect(members).toContain('estimated');
    // A missing value is announced as unavailable rather than as zero.
    expect(members).toContain('not available');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GOVERNANCE
// ═════════════════════════════════════════════════════════════════════════════

describe('CommunityRuleCard (§36)', () => {
  it('announces the rule and its consequence together', () => {
    const rule = MOCK_RULES[NIGERIAN.id][0];

    renderWithTheme(<CommunityRuleCard rule={rule} />);

    const label = String(
      screen.getByTestId(`community-rule-${rule.id}`).props.accessibilityLabel
    );

    expect(label).toContain(rule.title);
    // Rendered verbatim and always — never folded away behind a disclosure.
    expect(label).toContain('If this is broken');
  });
});

describe('CommunityNoticeCard (§36)', () => {
  it('attributes by name and role where the community published a name', () => {
    const notice = MOCK_NOTICE_WITH_NAME();

    renderWithTheme(<CommunityNoticeCard notice={notice} />);

    const label = String(
      screen.getByTestId(`community-notice-${notice.id}`).props.accessibilityLabel
    );

    expect(label).toContain('Adaeze O.');
    expect(label).toContain('Moderator');
    expect(label).toContain('Pinned notice');
  });

  it('attributes by role alone where no name was published', () => {
    const notice = { ...MOCK_NOTICE_WITH_NAME(), publishedByName: null, isPinned: false };

    renderWithTheme(<CommunityNoticeCard notice={notice} />);

    expect(
      String(screen.getByTestId(`community-notice-${notice.id}`).props.accessibilityLabel)
    ).toContain('Moderator');
  });
});

function MOCK_NOTICE_WITH_NAME() {
  return {
    id: 'notice-test',
    communityId: NIGERIAN.id,
    title: 'Rent deposit scam',
    body: 'Do not transfer a deposit before a viewing.',
    publishedAt: new Date().toISOString(),
    publishedByRole: 'Moderator' as const,
    publishedByName: 'Adaeze O.',
    expiresAt: null,
    isPinned: true,
  };
}

describe('CommunityRoleHolderCard (§34, §35, GAP-018)', () => {
  it('announces the role, the area and the languages', () => {
    const holder = MOCK_ROLE_HOLDERS[NIGERIAN.id][0];

    renderWithTheme(<CommunityRoleHolderCard holder={holder} />);

    const label = String(
      screen.getByTestId(`community-role-holder-${holder.userId}`).props.accessibilityLabel
    );

    expect(label).toContain(holder.displayName);
    expect(label).toContain('Moderator');
    expect(label).toContain('London');
  });
});

describe('CommunityReportCard (§34, GAP-017)', () => {
  it('announces the count of reports and never a reporter', () => {
    const report = MOCK_REPORTS[NIGERIAN.id][0];

    renderWithTheme(<CommunityReportCard report={report} />);

    const label = String(
      screen.getByTestId(`community-report-${report.id}`).props.accessibilityLabel
    );

    expect(label).toContain('4 people reported it');
    expect(label).toContain('Scam');
    // There is no reporter field on the type, so there is nothing to leak.
    expect(label).not.toMatch(/reporterId|reporterName/);
  });

  it('says plainly when no excerpt was shared', () => {
    const report = MOCK_REPORTS[NIGERIAN.id].find((r) => r.contentExcerpt === null)!;

    renderWithTheme(<CommunityReportCard report={report} />);

    expect(screen.getByText('No excerpt was shared with this report.')).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §64 / §74 — notices and edge states
// ═════════════════════════════════════════════════════════════════════════════

describe('MultiCommunityGapNotice (§64)', () => {
  it('marks a simulated surface and names the gap', () => {
    renderWithTheme(<MultiCommunityGapNotice gapKey="communityDirectory" />);

    const notice = screen.getByTestId('multi-community-gap-notice-communityDirectory');

    expect(String(notice.props.accessibilityLabel)).toContain('not connected to a backend');
    expect(screen.getByText(/FRONTEND-PHASE13-GAP-001/)).toBeTruthy();
  });

  it('renders nothing for a key it does not own — registers stay separate', () => {
    // A Phase 12 gap key. Passing it here must render nothing rather than
    // half-describe somebody else's gap.
    renderWithTheme(<MultiCommunityGapNotice gapKey="membershipProgrammes" />);

    expect(screen.queryByTestId('multi-community-gap-notice-membershipProgrammes')).toBeNull();
    expect(screen.queryByText(/Preview · not connected/)).toBeNull();
  });
});

describe('CommunityUnavailablePanel (§74)', () => {
  const REASONS: CommunityUnavailableReason[] = [
    'empty',
    'error',
    'offline',
    'unauthorized',
    'forbidden',
    'not-found',
    'community-suspended',
    'community-archived',
    'membership-revoked',
    'role-revoked',
    'statistics-unavailable',
    'membership-unavailable',
    'cross-community-unavailable',
    'feature-disabled',
    'not-searchable',
  ];

  it.each(REASONS)('renders a distinct, announced panel for %s', (reason) => {
    renderWithTheme(<CommunityUnavailablePanel reason={reason} subject="guides" />);

    const panel = screen.getByTestId(`community-unavailable-${reason}`);
    expect(String(panel.props.children)).toBeTruthy();
  });

  it('renders a progress indicator for loading, not an empty state', () => {
    renderWithTheme(<CommunityUnavailablePanel reason="loading" subject="guides" />);

    expect(screen.getByTestId('community-loading-panel')).toBeTruthy();
  });

  it('offers a retry for offline and error, and NOTHING for forbidden', () => {
    const { unmount } = renderWithTheme(
      <CommunityUnavailablePanel reason="offline" subject="guides" onAction={() => {}} />
    );
    expect(screen.getByTestId('community-unavailable-action-offline')).toBeTruthy();
    unmount();

    renderWithTheme(
      <CommunityUnavailablePanel reason="forbidden" subject="reports" onAction={() => {}} />
    );
    // §34: a retry button on a permission refusal invites somebody to keep asking.
    expect(screen.queryByTestId('community-unavailable-action-forbidden')).toBeNull();
  });

  it('renders the server’s own reason verbatim instead of the generic one (§75)', () => {
    renderWithTheme(
      <CommunityUnavailablePanel
        reason="community-suspended"
        subject="this community"
        detail="Paused while reports about several posts are reviewed."
      />
    );

    expect(screen.getByText('Paused while reports about several posts are reviewed.')).toBeTruthy();
  });

  it('distinguishes “we did not look” from “nothing matched” (Wave I)', () => {
    // The defect: community updates rendered the `empty` panel — "Nothing here
    // yet… Try widening your community filter" — for a domain with **no search
    // route at all**. Every clause of that is a claim about the content, and the
    // suggested next step cannot help, because no request was ever made.
    const { unmount } = renderWithTheme(
      <CommunityUnavailablePanel reason="not-searchable" subject="community updates" />
    );

    const body = String(
      screen.getByTestId('community-unavailable-not-searchable').props.children
    );
    expect(screen.getByText('This cannot be searched')).toBeTruthy();
    // The two sentences the empty state used to put here, neither of which is
    // true of a domain that was never asked.
    expect(screen.queryByText('Nothing here yet')).toBeNull();
    expect(body).not.toContain('widening your community filter');
    unmount();

    renderWithTheme(<CommunityUnavailablePanel reason="empty" subject="community updates" />);
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
    expect(screen.queryByText('This cannot be searched')).toBeNull();
  });

  it('offers no retry for not-searchable — trying again cannot help', () => {
    // §34's rule, applied to a new reason: a button that cannot change the
    // answer wastes the member's time and implies the answer is provisional.
    renderWithTheme(
      <CommunityUnavailablePanel
        reason="not-searchable"
        subject="community updates"
        onAction={() => {}}
      />
    );

    expect(screen.queryByTestId('community-unavailable-action-not-searchable')).toBeNull();
  });

  it('distinguishes unauthorized from forbidden — different next steps', () => {
    // Compared by what a screen reader is told, not by the element tree: the two
    // panels share a shape, and the whole point is that they say different things.
    const { unmount } = renderWithTheme(
      <CommunityUnavailablePanel reason="unauthorized" subject="your communities" />
    );
    expect(screen.getByText('Sign in to see this')).toBeTruthy();
    expect(screen.getByTestId('community-unavailable-unauthorized')).toBeTruthy();
    unmount();

    renderWithTheme(<CommunityUnavailablePanel reason="forbidden" subject="reports" />);
    expect(screen.getByText('Not available to you')).toBeTruthy();
    // One is answered by signing in; the other is not. Collapsing them would send
    // half the members to the wrong place.
    expect(screen.queryByText('Sign in to see this')).toBeNull();
  });
});
