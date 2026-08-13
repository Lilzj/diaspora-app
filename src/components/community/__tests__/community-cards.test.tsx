/**
 * Community Life cards and the screen shell — Frontend Phase 12
 *
 * The cards are where a member meets a figure, so these tests assert what a
 * screen reader is told about one — and, for a campaign card, that a real B15
 * total and a simulated one are marked differently on the same component.
 *
 * The shell tests assert the two refusals it exists to make impossible to
 * forget: a release build that cannot reach a gap, and a member the platform
 * ladder does not permit.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import {
  CampaignCard,
  Card,
  CommunityScreen,
  MembershipCard,
  MembershipProgrammeCard,
  MembershipTierCard,
  OccurrenceRow,
  OpportunityCard,
  PollCard,
  RecommendationCard,
  SeriesCard,
  readableDate,
} from '..';
import { money } from '@/mocks/financial-data';
import {
  MOCK_CAMPAIGNS_SEED,
  MOCK_MEMBERSHIPS,
  MOCK_OPPORTUNITIES,
  MOCK_POLLS,
  MOCK_PROGRAMMES,
  MOCK_RECOMMENDATIONS,
  MOCK_SERIES,
} from '@/mocks/community-gap-data';
import type { EventOccurrence, FundraisingCampaign } from '@/types/community-advanced';

/**
 * Fixed safe-area metrics.
 *
 * `<CommunityScreen>` reads `useSafeAreaInsets()` to keep its footer clear of
 * the home indicator. Without a provider that throws, so the metrics are
 * supplied rather than the hook being mocked — mocking it would stop the test
 * noticing if the shell started ignoring the inset.
 */
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

describe('readableDate', () => {
  it('turns a date into something a member can read', () => {
    expect(readableDate('2026-07-13')).toMatch(/13/);
    expect(readableDate('2026-07-13T18:30:00.000Z')).toMatch(/13/);
  });

  it('returns an empty string rather than "Invalid Date"', () => {
    expect(readableDate(null)).toBe('');
    expect(readableDate(undefined)).toBe('');
  });

  it('passes an unparseable value through rather than mangling it', () => {
    expect(readableDate('not a date')).toBe('not a date');
  });
});

describe('MembershipProgrammeCard', () => {
  it('speaks the programme as a sentence', () => {
    renderWithTheme(
      <MembershipProgrammeCard programme={MOCK_PROGRAMMES[0]} onPress={() => {}} />
    );

    expect(
      screen.getByLabelText(/Nigerian Community Association UK.*Associations.*members/s)
    ).toBeTruthy();
  });

  it('says a free programme is free rather than showing £0.00', () => {
    // §6: the absence of a price is the meaning, not a zero.
    renderWithTheme(
      <MembershipProgrammeCard programme={MOCK_PROGRAMMES[1]} onPress={() => {}} />
    );
    expect(screen.getByText('Free to join')).toBeTruthy();
  });

  it('opens on press', () => {
    const onPress = jest.fn();
    renderWithTheme(<MembershipProgrammeCard programme={MOCK_PROGRAMMES[0]} onPress={onPress} />);

    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('MembershipTierCard', () => {
  const tier = MOCK_PROGRAMMES[0].tiers[0];
  const fullTier = MOCK_PROGRAMMES[0].tiers[2];
  const ineligibleTier = MOCK_PROGRAMMES[0].tiers[1];

  it('is a radio, so a reader hears it is one of a set', () => {
    renderWithTheme(<MembershipTierCard tier={tier} isSelected={false} onSelect={() => {}} />);
    expect(screen.getByRole('radio')).toBeTruthy();
  });

  it('reports selection', () => {
    renderWithTheme(<MembershipTierCard tier={tier} isSelected onSelect={() => {}} />);
    expect(screen.getByRole('radio').props.accessibilityState.checked).toBe(true);
  });

  it('disables a full tier and says why', () => {
    renderWithTheme(<MembershipTierCard tier={fullTier} isSelected={false} onSelect={() => {}} />);

    expect(screen.getByRole('radio').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('This tier is full.')).toBeTruthy();
  });

  it('disables a tier whose requirements are unmet and names them', () => {
    renderWithTheme(
      <MembershipTierCard tier={ineligibleTier} isSelected={false} onSelect={() => {}} />
    );

    expect(screen.getByRole('radio').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/Proof of student enrolment/)).toBeTruthy();
  });

  it('does not fire for a tier nobody can join', () => {
    const onSelect = jest.fn();
    renderWithTheme(<MembershipTierCard tier={fullTier} isSelected={false} onSelect={onSelect} />);

    fireEvent.press(screen.getByRole('radio'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks a benefit that is advertised but not live', () => {
    renderWithTheme(<MembershipTierCard tier={fullTier} isSelected={false} onSelect={() => {}} />);
    // The Patron tier's scholarship nomination is `isActive: false` in the seed.
    expect(screen.getByText(/coming soon/)).toBeTruthy();
  });
});

describe('MembershipCard', () => {
  it('speaks the state and what it means', () => {
    renderWithTheme(<MembershipCard membership={MOCK_MEMBERSHIPS[1]} onPress={() => {}} />);
    expect(screen.getByLabelText(/Renewal due.*needs renewing/s)).toBeTruthy();
  });
});

describe('CampaignCard', () => {
  const realCampaign: FundraisingCampaign = {
    ...MOCK_CAMPAIGNS_SEED[0],
    progress: {
      ...MOCK_CAMPAIGNS_SEED[0].progress,
      target: { value: money(400000, 'GBP'), source: 'backend' },
      raised: { value: money(215000, 'GBP'), source: 'backend' },
      percentage: { value: 54, source: 'backend' },
      supporterCount: { value: 67, source: 'backend' },
    },
  };

  it('speaks the money as a sentence a reader can follow', () => {
    renderWithTheme(<CampaignCard campaign={realCampaign} onPress={() => {}} />);
    expect(
      screen.getByLabelText(/£2,150 of £4,000 raised, 54 per cent\. 67 supporters/s)
    ).toBeTruthy();
  });

  it('marks a real B15 total as live rather than simulated', () => {
    renderWithTheme(<CampaignCard campaign={realCampaign} onPress={() => {}} />);
    expect(screen.getByLabelText(/Live from Diaspora giving/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Simulated total.*not from the Diaspora backend/i)).toBeNull();
  });

  it('marks a simulated total as simulated on the same component', () => {
    // The property that makes §17 hold: the *same* card renders both honestly.
    renderWithTheme(<CampaignCard campaign={MOCK_CAMPAIGNS_SEED[3]} onPress={() => {}} />);
    expect(screen.getByLabelText(/Simulated total.*not from the Diaspora backend/i)).toBeTruthy();
  });

  it('exposes the progress bar with the figure a reader needs', () => {
    renderWithTheme(<CampaignCard campaign={realCampaign} onPress={() => {}} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.props.accessibilityValue.now).toBe(54);
  });
});

describe('SeriesCard and OccurrenceRow', () => {
  it('says a series is a repeating event, not a single date', () => {
    renderWithTheme(<SeriesCard series={MOCK_SERIES[0]} onPress={() => {}} />);
    expect(screen.getByText('Series')).toBeTruthy();
    expect(screen.getByLabelText(/Every Tuesday/)).toBeTruthy();
  });

  it('says how full an occurrence is, using the server’s decision', () => {
    const occurrence: EventOccurrence = {
      occurrenceId: 'occ-1',
      seriesId: 'ser-1',
      title: 'Bible study',
      date: '2026-07-21',
      time: '18:30',
      endTime: '20:00',
      timezone: 'BST',
      location: { cityName: 'London', areaName: 'Peckham', addressLine: '88 Queens Road' },
      status: 'Scheduled',
      originalDate: null,
      cancellationReason: null,
      capacity: 20,
      registeredCount: 6,
      isFull: false,
      myRegistration: 'NotRegistered',
      isNext: true,
    };

    renderWithTheme(<OccurrenceRow occurrence={occurrence} onPress={() => {}} />);
    expect(screen.getByLabelText(/6 of 20 places taken/)).toBeTruthy();
  });

  it('says a rescheduled occurrence moved, and from when', () => {
    const moved: EventOccurrence = {
      occurrenceId: 'occ-2',
      seriesId: 'ser-1',
      title: 'Bible study',
      date: '2026-08-04',
      time: '18:30',
      endTime: '20:00',
      timezone: 'BST',
      location: { cityName: 'London', areaName: 'Peckham', addressLine: '88 Queens Road' },
      status: 'Rescheduled',
      originalDate: '2026-07-28',
      cancellationReason: null,
      capacity: null,
      registeredCount: 4,
      isFull: false,
      myRegistration: 'NotRegistered',
      isNext: false,
    };

    renderWithTheme(<OccurrenceRow occurrence={moved} onPress={() => {}} />);
    expect(screen.getByLabelText(/Moved from/)).toBeTruthy();
  });
});

describe('OpportunityCard', () => {
  it('says how many places are left', () => {
    renderWithTheme(<OpportunityCard opportunity={MOCK_OPPORTUNITIES[0]} onPress={() => {}} />);
    expect(screen.getByLabelText(/2 places left/)).toBeTruthy();
  });

  it('says an opportunity is full rather than showing a count nobody can use', () => {
    renderWithTheme(<OpportunityCard opportunity={MOCK_OPPORTUNITIES[2]} onPress={() => {}} />);
    expect(screen.getByLabelText(/Full/)).toBeTruthy();
  });

  it('surfaces the member’s own application state', () => {
    renderWithTheme(<OpportunityCard opportunity={MOCK_OPPORTUNITIES[1]} onPress={() => {}} />);
    expect(screen.getByLabelText(/Your application: Pending/)).toBeTruthy();
  });
});

describe('PollCard', () => {
  it('says how people answer and how many have', () => {
    renderWithTheme(<PollCard poll={MOCK_POLLS[0]} onPress={() => {}} />);
    expect(screen.getByLabelText(/Choose one\. 87 responses so far/)).toBeTruthy();
  });

  it('says a multiple-choice poll takes several', () => {
    renderWithTheme(<PollCard poll={MOCK_POLLS[1]} onPress={() => {}} />);
    expect(screen.getByLabelText(/Choose up to 2/)).toBeTruthy();
  });

  it('says the member has already voted', () => {
    renderWithTheme(<PollCard poll={MOCK_POLLS[1]} onPress={() => {}} />);
    expect(screen.getByLabelText(/You have voted/)).toBeTruthy();
  });

  it('marks an anonymous poll', () => {
    renderWithTheme(<PollCard poll={MOCK_POLLS[1]} onPress={() => {}} />);
    expect(screen.getByText('Anonymous')).toBeTruthy();
  });
});

describe('RecommendationCard', () => {
  it('prints the server’s reason verbatim rather than composing one', () => {
    renderWithTheme(
      <RecommendationCard recommendation={MOCK_RECOMMENDATIONS[0]} onPress={() => {}} />
    );
    expect(screen.getByText('You have saved four events hosted by this association')).toBeTruthy();
  });

  it('offers a dismissal that reaches the server', () => {
    const onDismiss = jest.fn();
    renderWithTheme(
      <RecommendationCard
        recommendation={MOCK_RECOMMENDATIONS[0]}
        onPress={() => {}}
        onDismiss={onDismiss}
      />
    );

    fireEvent.press(screen.getByLabelText(/Dismiss the suggestion/));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// The shell — the two refusals it exists to make impossible to forget
// ═════════════════════════════════════════════════════════════════════════════

describe('CommunityScreen', () => {
  it('renders its content in the ordinary case', () => {
    renderWithTheme(
      <CommunityScreen title="Community Life">
        <Text>Body</Text>
      </CommunityScreen>
    );

    expect(screen.getByRole('header', { name: 'Community Life' })).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('puts the gap notice above the content it describes', () => {
    renderWithTheme(
      <CommunityScreen title="Membership" gapKey="membershipCatalogue">
        <Text>Body</Text>
      </CommunityScreen>
    );

    expect(screen.getByText(/COMMUNITY-LIFE-GAP-001/)).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('replaces the content with a statement when the build cannot reach the data', () => {
    // The release-build case. Not an error, and not a spinner that never
    // resolves — a screen that says the capability does not exist yet.
    renderWithTheme(
      <CommunityScreen title="Membership" gapKey="membershipCatalogue" isEnabled={false}>
        <Text>Body</Text>
      </CommunityScreen>
    );

    expect(screen.queryByText('Body')).toBeNull();
    expect(screen.getByText(/Community membership tiers and benefits/)).toBeTruthy();
  });

  it('replaces the content with an explanation when the member is refused', () => {
    renderWithTheme(
      <CommunityScreen
        title="Donate"
        refusal={{
          allowed: false,
          reason: 'restricted',
          message: 'Your account is restricted.',
          action: 'appeal',
        }}
      >
        <Text>Body</Text>
      </CommunityScreen>
    );

    expect(screen.queryByText('Body')).toBeNull();
    expect(screen.getByText(/Your account is restricted/)).toBeTruthy();
  });

  it('shows a loading state instead of the content, keeping the header', () => {
    renderWithTheme(
      <CommunityScreen title="Polls" isLoading>
        <Text>Body</Text>
      </CommunityScreen>
    );

    expect(screen.queryByText('Body')).toBeNull();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Polls' })).toBeTruthy();
  });

  it('renders a footer outside the scroll view so an action stays reachable', () => {
    renderWithTheme(
      <CommunityScreen title="Donate" footer={<Text>Give £25</Text>}>
        <Text>Body</Text>
      </CommunityScreen>
    );

    expect(screen.getByText('Give £25')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });
});

/**
 * A pressable `Card` is two elements: the `Pressable` a parent's layout sees,
 * and the `View` that draws the surface. The caller passes one `style`, and
 * which element each property lands on decides whether the card has a size at
 * all.
 *
 * This was reported from a screenshot of the community-life hub: a two-column
 * grid of `width: '48%'` tiles rendered as slivers, every label wrapping one
 * character per line down the screen. The width was going to the inner View
 * while the `Pressable` around it stayed sized to its content, so the
 * percentage resolved against a box that was itself waiting on the content to
 * decide.
 *
 * Fixed widths hid the bug — a 240-wide inner View makes a content-sized
 * wrapper 240 wide, so the number reached the parent by a route that happened
 * to agree. Only a percentage exposes it, which is why one screen looked
 * broken and the others did not.
 */
describe('Card — layout style reaches the element the parent lays out', () => {
  function styleOf(node: { props: { style?: unknown } }) {
    return Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
  }

  /** The element drawing the card itself — the one with its border on it. */
  function findSurface(node: unknown): Record<string, unknown> | null {
    if (!node || typeof node !== 'object') return null;
    const el = node as { props?: { style?: unknown }; children?: unknown[] };
    if (el.props) {
      const flat = styleOf(el as { props: { style?: unknown } });
      if (flat.borderColor) return flat;
    }
    for (const child of el.children ?? []) {
      const hit = findSurface(child);
      if (hit) return hit;
    }
    return null;
  }

  it('puts a percentage width on the pressable, not on the surface inside it', () => {
    renderWithTheme(
      <Card onPress={() => {}} accessibilityLabel="Tile" style={{ width: '48%' }}>
        <Text>Membership</Text>
      </Card>
    );

    // The element a parent's flex-wrap measures is the one with the role.
    expect(styleOf(screen.getByLabelText('Tile')).width).toBe('48%');
  });

  it('keeps margins outside the card rather than inside its border', () => {
    renderWithTheme(
      <Card onPress={() => {}} accessibilityLabel="Tile" style={{ marginBottom: 12 }}>
        <Text>Events</Text>
      </Card>
    );

    // Inside the border it would be padding wearing the wrong name: the gap
    // would appear within the card instead of between it and the next one.
    expect(styleOf(screen.getByLabelText('Tile')).marginBottom).toBe(12);
  });

  it('leaves surface properties on the surface', () => {
    renderWithTheme(
      <Card onPress={() => {}} accessibilityLabel="Tile" style={{ opacity: 0.6, width: 240 }}>
        <Text>Recurring</Text>
      </Card>
    );

    const pressable = styleOf(screen.getByLabelText('Tile'));
    expect(pressable.width).toBe(240);
    // `opacity` describes the card, not its position, so it stays inside —
    // splitting on layout must not sweep everything out with it.
    expect(pressable.opacity).toBe(1);
  });

  it('still applies layout directly when there is nothing to press', () => {
    // With no `onPress` there is no wrapper, so the single View has to take
    // both halves or a static card loses its width entirely.
    renderWithTheme(
      <Card style={{ width: '48%' }}>
        <Text>Polls</Text>
      </Card>
    );

    // Located by the border the card draws rather than by walking up from the
    // text: `.parent` is whatever the renderer happened to nest, which is not a
    // property worth asserting.
    const surface = findSurface(screen.toJSON());
    expect(surface).toBeTruthy();
    expect(surface!.width).toBe('48%');
  });
});
