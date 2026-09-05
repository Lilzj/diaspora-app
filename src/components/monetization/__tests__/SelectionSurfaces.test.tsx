// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Selection surface tests (Frontend Phase 6)
//
// §29 names plan selection, promotion package selection, audience selection and
// campaign creation as things that must be tested. These are those, plus the
// two panels that render simulated figures — because the assertion that matters
// there is that they are marked, not that the numbers are pretty.
//
// The recurring theme: a selectable thing has to be *announced* as selectable
// and as selected. `accessibilityRole="radio"` with `accessibilityState` is what
// makes a package selector usable without sight, and it is exactly the sort of
// thing that quietly disappears in a styling refactor.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import MockAdapter from 'axios-mock-adapter';
import { ThemeProvider } from '@/design-system';
import { PricingProvider } from '@/providers/pricing-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { PromotionPackageSelector, PromotionDurationSelector } from '../PromotionPackageSelector';
import { PlanCard, AudiencePicker } from '../PlanCard';
import { PlanComparisonTable } from '../PlanComparison';
import { PerformancePanel, LockedPerformancePreview } from '../PerformancePanel';
import { CampaignRow, CampaignBudgetPanel } from '../CampaignCard';
import {
  AudienceBuilder,
  CampaignCreativePreview,
  ObjectiveSelector,
  PlacementSelector,
  describeObjective,
  describePlacements,
} from '../CampaignBuilder';
import { MonetizationEmpty, MonetizationRow, MonetizationSection } from '../MonetizationLayout';
import { PromoteEntry } from '../PromoteEntry';
import { groupIntoPackages } from '@/lib/monetization-catalog';
import { buildPlanComparison } from '@/lib/entitlements';
import { fromMinorUnits } from '@/lib/money';
import {
  MOCK_CAMPAIGNS,
  MOCK_TARGETING_OPTIONS,
  mockCampaignPerformance,
} from '@/mocks/monetization-gap-data';
import { SUBSCRIPTION_AUDIENCES } from '@/types/monetization';
import type { MonetizationProduct, SubscriptionPlan } from '@/types/financial';
import type { CampaignAudience } from '@/types/monetization-gaps';

const gbp = (minor: number) => fromMinorUnits(minor, 'GBP', 2, '£');

let mock: MockAdapter;

beforeAll(() => {
  mock = new MockAdapter(apiClient);
  mock.onGet('/financial/currencies').reply(200, {
    data: [{ code: 'GBP', name: 'Pound Sterling', symbol: '£', exponent: 2, isActive: true }],
  });
  mock.onGet('/financial/capabilities').reply(200, {
    data: {
      gateways: ['Simulator'],
      supportedMethods: ['Card', 'Wallet'],
      currencies: [],
      currencyConversionEnabled: false,
      payoutsEnabled: false,
      fraudAssessmentEnabled: false,
      searchProjectionEnabled: true,
    },
  });
  mock.onGet('/financial/wallets/me').reply(200, { data: [] });
  mock.onAny().reply(404, { title: 'No handler', status: 404 });
});

afterAll(() => {
  mock.restore();
});

function renderMonetization(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  return render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <PricingProvider>{node}</PricingProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function product(overrides: Partial<MonetizationProduct> = {}): MonetizationProduct {
  return {
    productId: 'p1',
    code: 'mp-boost-7',
    name: 'Boost for 7 days',
    description: 'Higher search priority and more local reach for a week.',
    category: 'BoostedListing',
    subjectType: 'MarketplaceListing',
    status: 'Active',
    price: gbp(999),
    durationDays: 7,
    placementKind: 'Boost',
    priorityWeight: 1.6,
    isRenewable: true,
    isAvailable: true,
    unavailableReasonCode: null,
    unavailableReason: null,
    sortOrder: 10,
    ...overrides,
  };
}

function plan(overrides: Partial<SubscriptionPlan> = {}): SubscriptionPlan {
  return {
    planId: 'plan-1',
    code: 'plus',
    name: 'Diaspora Plus',
    description: 'More reach for people who post regularly.',
    tier: 'Premium',
    interval: 'Monthly',
    price: gbp(499),
    isFree: false,
    trialDays: 14,
    audienceType: 'Member',
    countryCode: null,
    entitlements: [
      { key: 'listings.concurrent', value: '15' },
      { key: 'analytics.advanced', value: null },
    ],
    sortOrder: 20,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Promotion package selection
// ─────────────────────────────────────────────────────────────────────────────

describe('the promotion package selector', () => {
  const packages = groupIntoPackages([
    product(),
    product({ code: 'mp-boost-30', durationDays: 30, price: gbp(2999), sortOrder: 11 }),
    product({
      code: 'mp-feature-14',
      name: 'Feature for 14 days',
      category: 'FeaturedListing',
      placementKind: 'Featured',
      durationDays: 14,
      price: gbp(2499),
      priorityWeight: 2,
      sortOrder: 20,
    }),
  ]);

  it('announces each package as a selectable option with its price and reach', () => {
    renderMonetization(
      <PromotionPackageSelector packages={packages} selectedId={null} onSelect={() => undefined} />
    );

    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(2);
    expect(screen.getByLabelText(/Boost.*2 durations available/is)).toBeTruthy();
  });

  it('announces which one is selected', () => {
    renderMonetization(
      <PromotionPackageSelector packages={packages} selectedId="Boost" onSelect={() => undefined} />
    );

    const selected = screen.getAllByRole('radio').filter(
      (node) => node.props.accessibilityState?.selected === true
    );
    expect(selected).toHaveLength(1);
  });

  it('selects on press', () => {
    const onSelect = jest.fn();
    renderMonetization(
      <PromotionPackageSelector packages={packages} selectedId={null} onSelect={onSelect} />
    );

    fireEvent.press(screen.getAllByRole('radio')[0]);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'Boost' }));
  });

  it('shows an unavailable package greyed out with its reason, rather than hiding it', () => {
    const blocked = groupIntoPackages([
      product({
        isAvailable: false,
        unavailableReason: 'Premium placement is available to sellers with at least three completed sales.',
      }),
    ]);

    const onSelect = jest.fn();
    renderMonetization(
      <PromotionPackageSelector packages={blocked} selectedId={null} onSelect={onSelect} />
    );

    const option = screen.getAllByRole('radio')[0];
    expect(option.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText(/three completed sales/)).toBeTruthy();

    // And pressing it does nothing, rather than advancing to a step that will
    // be refused at the payment.
    fireEvent.press(option);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders a loading state that is announced rather than blank', () => {
    renderMonetization(
      <PromotionPackageSelector packages={[]} selectedId={null} onSelect={() => undefined} isLoading />
    );

    expect(screen.getByLabelText('Loading the promotion options.')).toBeTruthy();
  });
});

describe('the duration selector', () => {
  const options = groupIntoPackages([
    product(),
    product({ code: 'mp-boost-30', durationDays: 30, price: gbp(2999), sortOrder: 11 }),
  ])[0].options;

  it('offers the per-day comparison somebody is actually making', () => {
    renderMonetization(
      <PromotionDurationSelector options={options} selectedCode={null} onSelect={() => undefined} />
    );

    // 999 ÷ 7 = £1.42; 2999 ÷ 30 = £0.99. The longer option is better value and
    // the screen says so without the member doing arithmetic.
    expect(screen.getByText('about £1.42 a day')).toBeTruthy();
    expect(screen.getByText('about £0.99 a day')).toBeTruthy();
  });

  it('announces the duration and price together', () => {
    renderMonetization(
      <PromotionDurationSelector options={options} selectedCode="mp-boost-7" onSelect={() => undefined} />
    );

    expect(screen.getByLabelText(/7 days.*9\.99.*about £1\.42 a day/is)).toBeTruthy();
  });

  it('selects on press', () => {
    const onSelect = jest.fn();
    renderMonetization(
      <PromotionDurationSelector options={options} selectedCode={null} onSelect={onSelect} />
    );

    fireEvent.press(screen.getAllByRole('radio')[1]);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ code: 'mp-boost-30' }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Plan selection
// ─────────────────────────────────────────────────────────────────────────────

describe('a plan card', () => {
  const view = {
    plan: plan(),
    audience: SUBSCRIPTION_AUDIENCES.member,
    isCurrent: false,
    canStartTrial: true,
    relativeToCurrent: 'upgrade' as const,
    gainedEntitlements: [{ key: 'analytics.advanced', value: null }],
    lostEntitlements: [],
  };

  it('renders capabilities rather than a hard-coded feature list', () => {
    // The property B15 designed `entitlements[]` to have: a plan an operator
    // adds tomorrow renders without a client release. Asserted through the
    // card's accessibility label, which is where the whole card is described —
    // and which has to *name* the entitlements rather than count them, because
    // "includes 2 features" tells somebody choosing a plan nothing.
    renderMonetization(<PlanCard view={view} isSelected={false} onSelect={() => undefined} />);

    expect(screen.getByLabelText(/Includes Live listings · 15, Advanced analytics/)).toBeTruthy();
  });

  it('states what happens after a trial, not only that there is one', () => {
    renderMonetization(<PlanCard view={view} isSelected={false} onSelect={() => undefined} />);

    expect(screen.getByText('14 days free')).toBeTruthy();
    expect(screen.getByText(/Then £4\.99 every month/)).toBeTruthy();
  });

  it('offers no trial where the member would be refused one', () => {
    renderMonetization(
      <PlanCard view={{ ...view, canStartTrial: false }} isSelected={false} onSelect={() => undefined} />
    );

    expect(screen.queryByText('14 days free')).toBeNull();
  });

  it('warns what a downgrade takes away, before it is chosen', () => {
    renderMonetization(
      <PlanCard
        view={{
          ...view,
          relativeToCurrent: 'downgrade',
          gainedEntitlements: [],
          lostEntitlements: [{ key: 'analytics.advanced', value: null }],
        }}
        isSelected={false}
        onSelect={() => undefined}
      />
    );

    expect(screen.getByText('You would lose')).toBeTruthy();
    expect(screen.getByText('Advanced analytics')).toBeTruthy();
  });

  it('marks the current plan', () => {
    renderMonetization(
      <PlanCard view={{ ...view, isCurrent: true }} isSelected={false} onSelect={() => undefined} />
    );

    expect(screen.getByText('Current')).toBeTruthy();
    expect(screen.getByLabelText(/your current plan/i)).toBeTruthy();
  });

  it('shows a yearly plan per month as well as per year', () => {
    renderMonetization(
      <PlanCard
        view={{ ...view, plan: plan({ interval: 'Yearly', price: gbp(4900) }) }}
        isSelected={false}
        onSelect={() => undefined}
      />
    );

    expect(screen.getByText(/about £4\.08 a month, billed every year/)).toBeTruthy();
  });

  it('selects on press', () => {
    const onSelect = jest.fn();
    renderMonetization(<PlanCard view={view} isSelected={false} onSelect={onSelect} />);

    fireEvent.press(screen.getByRole('radio'));
    expect(onSelect).toHaveBeenCalled();
  });
});

describe('the audience picker', () => {
  const audiences = [
    SUBSCRIPTION_AUDIENCES.business,
    SUBSCRIPTION_AUDIENCES.creator,
    SUBSCRIPTION_AUDIENCES.landlord,
  ];

  it('announces each audience with who it is for', () => {
    renderMonetization(
      <AudiencePicker audiences={audiences} selected="business" onSelect={() => undefined} />
    );

    expect(
      screen.getByLabelText('Business. For providers and businesses serving the community.')
    ).toBeTruthy();
  });

  it('selects on press', () => {
    const onSelect = jest.fn();
    renderMonetization(
      <AudiencePicker audiences={audiences} selected="business" onSelect={onSelect} />
    );

    fireEvent.press(screen.getByLabelText(/^Creator\./));
    expect(onSelect).toHaveBeenCalledWith('creator');
  });
});

describe('the plan comparison table', () => {
  // `messaging.basic` is on all three: the shared row the table collapses.
  // Everything else differs, which is what a comparison table exists to show.
  const free = plan({
    code: 'free',
    name: 'Free',
    isFree: true,
    price: gbp(0),
    entitlements: [{ key: 'messaging.basic', value: null }],
  });
  const plus = plan({
    entitlements: [
      { key: 'listings.concurrent', value: '15' },
      { key: 'analytics.advanced', value: null },
      { key: 'messaging.basic', value: null },
    ],
  });
  const pro = plan({
    code: 'pro',
    name: 'Pro',
    price: gbp(1499),
    entitlements: [
      { key: 'listings.concurrent', value: 'unlimited' },
      { key: 'analytics.advanced', value: null },
      { key: 'messaging.basic', value: null },
    ],
  });

  const plans = [free, plus, pro];
  const rows = buildPlanComparison(plans);

  it('reads each row as one sentence rather than a grid of dashes', () => {
    renderMonetization(<PlanComparisonTable plans={plans} rows={rows} />);

    expect(
      screen.getByLabelText(/Advanced analytics\. Free: not included\. Diaspora Plus: included\./)
    ).toBeTruthy();
  });

  it('renders a value where there is one and a checkmark where there is not', () => {
    renderMonetization(<PlanComparisonTable plans={plans} rows={rows} />);

    expect(screen.getByLabelText(/Live listings\. Free: not included\. Diaspora Plus: 15\. Pro: Unlimited\./)).toBeTruthy();
  });

  it('collapses the rows every plan shares, and can expand them', () => {
    // A comparison table's job is to show a difference; eleven identical
    // checkmarks push the two rows that matter below the fold.
    renderMonetization(<PlanComparisonTable plans={plans} rows={rows} />);

    const toggle = screen.getByLabelText(/Show the \d+ features every plan includes/i);
    expect(toggle.props.accessibilityState?.expanded).toBe(false);

    fireEvent.press(toggle);
    expect(screen.getByLabelText(/Hide the features every plan includes/i)).toBeTruthy();
  });

  it('marks the current plan column', () => {
    renderMonetization(<PlanComparisonTable plans={plans} rows={rows} currentPlanCode="plus" />);
    expect(screen.getByLabelText(/Diaspora Plus\. your current plan\./)).toBeTruthy();
  });

  it('renders nothing at all when there are no plans', () => {
    const { toJSON } = renderMonetization(<PlanComparisonTable plans={[]} rows={[]} />);
    expect(toJSON()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Campaign creation
// ─────────────────────────────────────────────────────────────────────────────

describe('the objective selector', () => {
  it('says which metric each objective is judged by', () => {
    // An objective that does not change the number an advertiser is judged on is
    // an objective that does nothing.
    renderMonetization(<ObjectiveSelector selected={null} onSelect={() => undefined} />);

    expect(screen.getByLabelText(/Be seen\..*Measured by impressions\./is)).toBeTruthy();
    expect(screen.getByLabelText(/Get messages\..*Measured by enquiries\./is)).toBeTruthy();
  });

  it('selects on press', () => {
    const onSelect = jest.fn();
    renderMonetization(<ObjectiveSelector selected={null} onSelect={onSelect} />);

    fireEvent.press(screen.getByLabelText(/^Get messages\./));

    // `Leads`, not `Enquiries`. The label is what a member reads; the value is
    // the server's `AdCampaignObjective` member, sent unmapped. It said
    // `Enquiries` until 5 Sep 2026, which the server refused outright.
    expect(onSelect).toHaveBeenCalledWith('Leads');
  });

  it('describes an objective for a review row', () => {
    expect(describeObjective('Leads')).toEqual({ label: 'Get messages', leadMetric: 'Enquiries' });
    // An unknown objective renders from its own value rather than throwing.
    expect(describeObjective('Something' as never).label).toBe('Something');
  });
});

describe('the placement selector', () => {
  it('offers placements as checkboxes, because more than one is normal', () => {
    renderMonetization(<PlacementSelector selected={['HomeFeed']} onToggle={() => undefined} />);

    const checked = screen
      .getAllByRole('checkbox')
      .filter((node) => node.props.accessibilityState?.checked === true);
    expect(checked).toHaveLength(1);
  });

  it('warns how a notification placement is used, because it is the intrusive one', () => {
    renderMonetization(<PlacementSelector selected={[]} onToggle={() => undefined} />);

    expect(screen.getByLabelText(/Notifications\..*never more than once a week\./is)).toBeTruthy();
  });

  it('toggles on press', () => {
    const onToggle = jest.fn();
    renderMonetization(<PlacementSelector selected={[]} onToggle={onToggle} />);

    fireEvent.press(screen.getByLabelText(/^Search results\./));
    expect(onToggle).toHaveBeenCalledWith('SearchResults');
  });

  it('describes a placement set for a review row', () => {
    expect(describePlacements(['HomeFeed', 'SearchResults'])).toBe('Home feed, Search results');

    // Empty is the normal case: the backend records no placement on any
    // campaign, so this string is what the detail screen actually shows. It read
    // "no placements chosen yet", describing a decision that never arrives — a
    // member cannot choose, and nothing chooses on their behalf either.
    expect(describePlacements([])).toBe('Wherever Diaspora recommends it');
  });
});

describe('the audience builder', () => {
  const empty: CampaignAudience = {
    countries: [],
    communities: [],
    neighbourhoods: [],
    audienceTypes: [],
    interests: [],
    categories: [],
    minMonthsInCountry: null,
  };

  it('waits for the backend’s own option list rather than shipping a geography table', () => {
    renderMonetization(
      <AudienceBuilder
        audience={empty}
        options={null}
        estimate={null}
        isEstimating={false}
        onChange={() => undefined}
      />
    );

    expect(screen.getByText('Loading targeting options…')).toBeTruthy();
  });

  it('offers every dimension once the options arrive', () => {
    renderMonetization(
      <AudienceBuilder
        audience={empty}
        options={MOCK_TARGETING_OPTIONS}
        estimate={null}
        isEstimating={false}
        onChange={() => undefined}
      />
    );

    expect(screen.getByText('Countries')).toBeTruthy();
    expect(screen.getByText('Communities')).toBeTruthy();
    expect(screen.getByText('Neighbourhoods')).toBeTruthy();
    expect(screen.getByText('Who they are')).toBeTruthy();
    expect(screen.getByText('Interests')).toBeTruthy();
    expect(screen.getByText('Categories')).toBeTruthy();
  });

  it('says an empty dimension means everybody, not nobody', () => {
    renderMonetization(
      <AudienceBuilder
        audience={empty}
        options={MOCK_TARGETING_OPTIONS}
        estimate={null}
        isEstimating={false}
        onChange={() => undefined}
      />
    );

    expect(screen.getByText(/Leave empty for everywhere/)).toBeTruthy();
  });

  it('reports reach as a range, never as an exact count', () => {
    // An exact count of a fine selection is a privacy leak: narrow until the
    // number is one and the advertiser has learned about an individual.
    renderMonetization(
      <AudienceBuilder
        audience={{ ...empty, countries: ['GB'] }}
        options={MOCK_TARGETING_OPTIONS}
        estimate={{ reachLower: 1200, reachUpper: 3400, isDeliverable: true }}
        isEstimating={false}
        onChange={() => undefined}
      />
    );

    expect(screen.getByText('About 1,200 to 3,400 people.')).toBeTruthy();
  });

  it('separates a counted zero from a selection it cannot size', () => {
    // ── The defect this exists for ───────────────────────────────────────
    //
    // Both arrive as `0 to 0` and mean opposite things, and the old panel said
    // "This is too narrow to deliver. Try removing a filter." for the first —
    // advice with no remedy behind it. Every seeded community counted zero
    // because `community_memberships` was empty, so every selection was refused
    // and no filter change would have helped.
    //
    // This test previously asserted the refusal, on a fixture only the
    // development adapter could produce: B16 has no minimum-reach rule.
    renderMonetization(
      <AudienceBuilder
        audience={empty}
        options={MOCK_TARGETING_OPTIONS}
        estimate={{
          reachLower: 0,
          reachUpper: 0,
          isCounted: true,
          isDeliverable: false,
          basis: 'Estimated from current membership.',
        }}
        isEstimating={false}
        onChange={() => undefined}
      />
    );

    expect(screen.getByText(/Nobody has joined this selection yet/i)).toBeTruthy();
    expect(screen.queryByText(/too narrow/i)).toBeNull();
  });

  it('shows the server\u2019s own sentence when nothing could be counted', () => {
    renderMonetization(
      <AudienceBuilder
        audience={empty}
        options={MOCK_TARGETING_OPTIONS}
        estimate={{
          reachLower: 0,
          reachUpper: 0,
          isCounted: false,
          isDeliverable: true,
          basis:
            'This campaign is narrowed, but Diaspora cannot count how many people that reaches.',
        }}
        isEstimating={false}
        onChange={() => undefined}
      />
    );

    expect(
      screen.getByText(/Diaspora cannot count how many people that reaches/i)
    ).toBeTruthy();
  });

  it('adds a value on press', () => {
    const onChange = jest.fn();
    renderMonetization(
      <AudienceBuilder
        audience={empty}
        options={MOCK_TARGETING_OPTIONS}
        estimate={null}
        isEstimating={false}
        onChange={onChange}
      />
    );

    fireEvent.press(screen.getByLabelText('United Kingdom, Europe'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ countries: ['GB'] }));
  });

  it('removes a value already selected, rather than adding it twice', () => {
    const onChange = jest.fn();
    renderMonetization(
      <AudienceBuilder
        audience={{ ...empty, countries: ['GB'] }}
        options={MOCK_TARGETING_OPTIONS}
        estimate={null}
        isEstimating={false}
        onChange={onChange}
      />
    );

    const chip = screen.getByLabelText('United Kingdom, Europe');
    expect(chip.props.accessibilityState?.checked).toBe(true);

    fireEvent.press(chip);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ countries: [] }));
  });
});

describe('the creative preview', () => {
  it('shows placeholders rather than an empty card before anything is typed', () => {
    renderMonetization(
      <CampaignCreativePreview
        creative={{ headline: '', body: '', callToActionLabel: '' }}
        placementLabel="Home feed"
      />
    );

    expect(screen.getByText('Your headline')).toBeTruthy();
    expect(screen.getByText('Your description appears here.')).toBeTruthy();
  });

  it('is labelled as an advertisement, because it will be', () => {
    renderMonetization(
      <CampaignCreativePreview
        creative={{ headline: 'Rooms in Croydon', body: 'Bills included.', callToActionLabel: 'See them' }}
        placementLabel="Home feed"
      />
    );

    expect(screen.getByText('Ad')).toBeTruthy();
    expect(screen.getByLabelText(/Rooms in Croydon.*Bills included.*Button: See them/is)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Campaign management surfaces
// ─────────────────────────────────────────────────────────────────────────────

describe('a campaign row', () => {
  const active = MOCK_CAMPAIGNS.find((campaign) => campaign.status === 'Active')!;
  const rejected = MOCK_CAMPAIGNS.find((campaign) => campaign.status === 'Rejected')!;

  it('states the status in words as well as showing a badge', () => {
    renderMonetization(<CampaignRow campaign={active} onPress={() => undefined} />);

    // Two nodes carry the sentence, and that is deliberate: the badge describes
    // itself for somebody who lands on it, and the row repeats it for somebody
    // swiping past. §32 — never colour alone.
    const described = screen.getAllByLabelText(
      /Running\. The campaign is being shown to people now\./
    );
    expect(described.length).toBeGreaterThanOrEqual(2);

    expect(screen.getByLabelText(/spent of/)).toBeTruthy();
  });

  it('carries a rejection reason on the row itself', () => {
    // Sending somebody into a detail screen to find out why is the worst moment
    // to make them tap again.
    renderMonetization(<CampaignRow campaign={rejected} onPress={() => undefined} />);

    expect(screen.getByText(/guarantee to be the cheapest/)).toBeTruthy();
  });

  it('opens on press', () => {
    const onPress = jest.fn();
    renderMonetization(<CampaignRow campaign={active} onPress={onPress} />);

    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('the campaign budget panel', () => {
  it('shows what is left, not only what is spent of what', () => {
    // "£82 of £150" makes somebody do the subtraction, and the figure they came
    // for is the third one.
    const active = MOCK_CAMPAIGNS.find((campaign) => campaign.status === 'Active')!;
    renderMonetization(<CampaignBudgetPanel campaign={active} />);

    expect(
      screen.getByLabelText(/Budget .+\. Spent .+\. Left .+\./s)
    ).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Performance
// ─────────────────────────────────────────────────────────────────────────────

describe('the performance panel', () => {
  const report = mockCampaignPerformance('cam-0001');

  it('no longer marks the figures as disconnected, because they are not', () => {
    // This asserted the opposite until B16 shipped. The figures are counted by
    // the backend now, and a panel that still called them a preview would be
    // telling members their real numbers are made up.
    renderMonetization(<PerformancePanel report={report} />);
    expect(screen.queryByText(/Preview · not connected/i)).toBeNull();
  });

  it('carries each metric’s definition into its spoken label', () => {
    // §20: metric semantics are not invented, and the definition travels with
    // the number rather than living in a client constant.
    renderMonetization(<PerformancePanel report={report} />);

    expect(
      screen.getByLabelText(/Shown:.*How many times the advertisement appeared on somebody’s screen/is)
    ).toBeTruthy();
  });

  it('says how far behind live the figures are', () => {
    renderMonetization(<PerformancePanel report={report} />);
    expect(screen.getByText(/Figures update about every 4 hours/)).toBeTruthy();
  });

  it('replaces the chart with one summary sentence for a screen reader', () => {
    // Reading out fourteen bar heights is worse than useless.
    renderMonetization(<PerformancePanel report={report} />);

    expect(screen.getByLabelText(/Trend over 10 days\..*impressions in total/is)).toBeTruthy();
  });

  it('shows an empty state when there is no report at all', () => {
    // ── The defect this exists for ──────────────────────────────────────
    //
    // This test used to assert `MON-GAP-002` appeared here, because the gap
    // notice *was* the empty state. Connecting the gap silenced the notice and
    // left the branch rendering nothing — a section heading over blank space for
    // any campaign that had not been delivered yet.
    //
    // Asserting real copy rather than a gap id is the point: an empty state
    // outlives the gap that first paid for it.
    renderMonetization(<PerformancePanel report={null} />);

    expect(screen.getByText('No figures yet')).toBeTruthy();
    expect(screen.getByText(/once this campaign starts being shown/i)).toBeTruthy();
  });

  it('still shows the empty state where the screen supplies its own notice', () => {
    // `hideNotice` suppresses the disclosure, not the no-data rendering. The
    // campaign detail screen passes it, so under the old code that screen drew
    // a "Performance" heading and nothing underneath — before B16, and after.
    renderMonetization(<PerformancePanel report={null} hideNotice />);

    expect(screen.getByText('No figures yet')).toBeTruthy();
  });

  it('announces the loading state', () => {
    renderMonetization(<PerformancePanel report={null} isLoading />);
    expect(screen.getByLabelText('Loading performance figures.')).toBeTruthy();
  });

  it('reveals no figures at all in the locked preview', () => {
    // §12: the preview shows shape and labels; premium data the member has not
    // bought is never on the device to be obscured.
    const { toJSON } = renderMonetization(<LockedPerformancePreview />);
    const rendered = JSON.stringify(toJSON());

    expect(screen.getByText('Views')).toBeTruthy();
    expect(screen.getByText('Enquiries')).toBeTruthy();
    // No digits anywhere except in style values.
    expect(rendered).not.toMatch(/"children":\s*"[\d,]+"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The contextual entry point
// ─────────────────────────────────────────────────────────────────────────────

describe('the promote entry on a vertical screen', () => {
  it('renders nothing at all for somebody who does not own the thing', async () => {
    // The assertion that matters most here. A promote button on a stranger's
    // listing is an invitation to pay to promote somebody else's item, and
    // ownership is something only the vertical knows — which is why it is a
    // required prop rather than something this component infers.
    const { toJSON } = renderMonetization(
      <PromoteEntry target="marketplace" subjectId="listing-1" title="Armchair" isOwner={false} />
    );

    expect(toJSON()).toBeNull();
  });

  it('renders nothing without a subject', () => {
    const { toJSON } = renderMonetization(
      <PromoteEntry target="marketplace" subjectId={undefined} isOwner />
    );

    expect(toJSON()).toBeNull();
  });

  it('offers the promotion to the owner, in that vertical’s own words', async () => {
    renderMonetization(
      <PromoteEntry target="job" subjectId="job-1" title="Kitchen porter" isOwner />
    );

    // "Boost this job", not "Boost this listing" — the verb and the noun come
    // from `PROMOTION_TARGETS`, which is the one place the eight verticals'
    // vocabulary lives.
    const offer = await screen.findByLabelText(/Boost this job\./);
    expect(offer).toBeTruthy();
    expect(screen.getByText('Boost this job')).toBeTruthy();
  });

  it('uses the provider vocabulary for a provider', async () => {
    renderMonetization(
      <PromoteEntry target="provider" subjectId="provider-1" isOwner />
    );

    expect(await screen.findByLabelText(/Feature this service\./)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layout primitives
// ─────────────────────────────────────────────────────────────────────────────

describe('the layout primitives', () => {
  it('renders a section with a header and an action', () => {
    const onPress = jest.fn();
    renderMonetization(
      <MonetizationSection
        title="Your promotions"
        subtitle="Two running right now."
        action={{ label: 'See all', onPress }}
      >
        <></>
      </MonetizationSection>
    );

    expect(screen.getByRole('header', { name: 'Your promotions' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'See all' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('marks a row whose destination has no backend behind it', () => {
    renderMonetization(
      <MonetizationRow
        icon="albums-outline"
        label="Advertising"
        hint="Campaigns across the platform."
        marker="Preview"
        onPress={() => undefined}
      />
    );

    expect(screen.getByText('Preview')).toBeTruthy();
    expect(screen.getByLabelText(/Advertising\..*Preview/s)).toBeTruthy();
  });

  it('gives an empty state a way out of itself', () => {
    const onPress = jest.fn();
    renderMonetization(
      <MonetizationEmpty
        icon="megaphone-outline"
        title="No promotions yet"
        message="Promote something and it appears here."
        action={{ label: 'See what you can promote', onPress }}
      />
    );

    fireEvent.press(screen.getByRole('button', { name: 'See what you can promote' }));
    expect(onPress).toHaveBeenCalled();
  });
});
