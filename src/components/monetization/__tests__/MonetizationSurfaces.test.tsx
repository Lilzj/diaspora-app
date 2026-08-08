// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Monetization component tests (Frontend Phase 6)
//
// The assertions concentrate on the four rules the phase brief is written about,
// because they are the ones a well-meaning refactor breaks:
//
//   §7  No price is rendered except through a `PriceView` — and every one of the
//       six states produces a sentence rather than a blank.
//   §12 A locked feature shows what it is, what it costs and how to get it, and
//       never a pay button to somebody paying would not help.
//   §26 Anything with no backend behind it says so on the screen.
//   §32 No state is carried by colour alone, and every price, status and meter
//       has a spoken form.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import MockAdapter from 'axios-mock-adapter';
import { ThemeProvider } from '@/design-system';
import { PricingProvider } from '@/providers/pricing-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { PriceTag, LabelledPrice } from '../PriceTag';
import { MonetizationGapNotice, SimulatedFigureBadge } from '../MonetizationGapNotice';
import { LockedFeature, UpgradeNudge } from '../LockedFeature';
import { UsageMeter, EntitlementList } from '../UsageMeter';
import { PromotionRow, ExpiringPromotionCard, describeTiming } from '../PromotionCard';
import { PromotionPreview, promotionReviewDetails } from '../PromotionPreview';
import { resolvePrice, type PricingContextValue } from '@/lib/pricing';
import { fromMinorUnits } from '@/lib/money';
import { toPromotion } from '@/lib/monetization-catalog';
import { PROMOTION_TARGETS, type EntitlementDecision, type UsageLimit } from '@/types/monetization';
import type { Placement, SubscriptionPlan } from '@/types/financial';

const gbp = (minor: number) => fromMinorUnits(minor, 'GBP', 2, '£');

const context: PricingContextValue = {
  locale: 'en-GB',
  conversionEnabled: false,
  preferredCurrency: 'GBP',
};

/**
 * The transport.
 *
 * `PricingProvider` reads the currency catalogue, the deployment's capabilities
 * and the member's wallet through TanStack Query. Without an adapter those
 * calls reach the real network, fail, and retry on a backoff timer that outlives
 * the test — which is a leaked handle rather than a passing test, and the kind
 * that only shows up when the suite runs in parallel.
 */
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

/** The full provider stack, as the app composes it. */
function renderMonetization(node: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <PricingProvider>{node}</PricingProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function plan(overrides: Partial<SubscriptionPlan> = {}): SubscriptionPlan {
  return {
    planId: 'plan-1',
    code: 'plus',
    name: 'Diaspora Plus',
    description: 'More reach.',
    tier: 'Premium',
    interval: 'Monthly',
    price: gbp(499),
    isFree: false,
    trialDays: 14,
    audienceType: 'Member',
    countryCode: null,
    entitlements: [{ key: 'analytics.advanced', value: null }],
    sortOrder: 20,
    ...overrides,
  };
}

function placement(overrides: Partial<Placement> = {}): Placement {
  return {
    placementId: 'pl-1',
    subjectType: 'MarketplaceListing',
    subjectId: 'listing-1',
    kind: 'Boost',
    status: 'Active',
    isActive: true,
    priorityWeight: 1.6,
    productCode: 'mp-boost-7',
    countryCode: 'GB',
    policyVersion: null,
    startsAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    endsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 — prices
// ─────────────────────────────────────────────────────────────────────────────

describe('a price is never a blank', () => {
  it('renders a known price with a spoken form', () => {
    const view = resolvePrice({ price: gbp(999) }, context);
    renderMonetization(<PriceTag price={view} />);

    expect(screen.getByLabelText(view.spoken)).toBeTruthy();
  });

  it.each([
    ['loading', { isLoading: true }],
    ['at-checkout', { price: null }],
    ['unavailable', { price: gbp(999), isAvailable: false, unavailableReason: 'Not for you yet.' }],
    ['error', { isError: true }],
    ['free', { price: gbp(0), isFree: true }],
  ])('renders a sentence rather than a dash for the %s state', (_label, input) => {
    const view = resolvePrice(input as never, context);
    renderMonetization(<PriceTag price={view} />);

    expect(view.formatted.trim().length).toBeGreaterThan(0);
    expect(view.formatted).not.toBe('—');
    expect(screen.getByLabelText(view.spoken)).toBeTruthy();
  });

  it('reads a discounted price as one statement, not two amounts', () => {
    // The strike-through is invisible to a screen reader, so VoiceOver reading
    // "twenty pounds, fifteen pounds" would leave the listener guessing which
    // one they pay.
    const view = resolvePrice(
      {
        price: gbp(2000),
        quote: {
          code: 'SPRING25',
          isApplicable: true,
          listPrice: gbp(2000),
          discount: gbp(500),
          payable: gbp(1500),
          refusalCode: null,
        },
      },
      context
    );

    renderMonetization(<PriceTag price={view} />);

    const node = screen.getByLabelText(view.spoken);
    expect(node).toBeTruthy();
    expect(view.spoken).toContain('reduced from');
  });

  it('reads a labelled price as one node, so the label and figure arrive together', () => {
    const view = resolvePrice({ price: gbp(1500) }, context);
    renderMonetization(<LabelledPrice label="To pay today" price={view} emphasise />);

    expect(screen.getByLabelText(`To pay today. ${view.spoken}`)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §26 — nothing simulated goes unmarked
// ─────────────────────────────────────────────────────────────────────────────

describe('a simulated surface says so', () => {
  it('names the missing contract in a development build', () => {
    renderMonetization(<MonetizationGapNotice gapKey="campaigns" />);

    expect(screen.getByText(/Preview · not connected/i)).toBeTruthy();
    expect(screen.getByText(/MON-GAP-001/)).toBeTruthy();
  });

  it('renders nothing for a key that is not in the register', () => {
    // A typo in a gap key must fail visibly in review rather than silently
    // removing the marker from a simulated screen.
    const { toJSON } = renderMonetization(<MonetizationGapNotice gapKey="not-a-gap" />);
    expect(toJSON()).toBeNull();
  });

  it('accepts a screen-specific sentence in place of the default', () => {
    renderMonetization(
      <MonetizationGapNotice gapKey="pause" detail="Pausing a promotion is not possible yet." />
    );

    expect(screen.getByText('Pausing a promotion is not possible yet.')).toBeTruthy();
  });

  it('marks a single simulated figure without marking the whole screen', () => {
    renderMonetization(<SimulatedFigureBadge label="Usage simulated" />);

    expect(
      screen.getByLabelText('Usage simulated. This figure is not from the Diaspora backend.')
    ).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §12 — the locked feature experience
// ─────────────────────────────────────────────────────────────────────────────

describe('a locked feature', () => {
  const locked: EntitlementDecision = {
    key: 'analytics.advanced',
    isAvailable: false,
    value: null,
    requiredPlan: plan(),
    reason: 'Advanced analytics is included with Diaspora Plus.',
    isUpgradePath: true,
  };

  it('shows what it is, what it costs and how to get it', () => {
    renderMonetization(<LockedFeature decision={locked} onUpgrade={() => undefined} />);

    expect(screen.getByText('Advanced analytics')).toBeTruthy();
    expect(screen.getByText(/Diaspora Plus/)).toBeTruthy();
    expect(screen.getByLabelText(/Start the 14 day free trial of Diaspora Plus/i)).toBeTruthy();
  });

  it('states where the member is now, not only where they could be', () => {
    renderMonetization(<LockedFeature decision={locked} onUpgrade={() => undefined} />);

    expect(screen.getByText('the free plan')).toBeTruthy();
  });

  it('offers no pay button to somebody paying would not help', () => {
    // A restricted or unverified member cannot fix this by paying; a pay button
    // shown to them takes their money and still refuses them.
    const blocked: EntitlementDecision = {
      ...locked,
      isUpgradePath: false,
      reason: 'Advanced analytics is on a paid plan, and your account cannot start one yet.',
    };

    renderMonetization(<LockedFeature decision={blocked} onUpgrade={() => undefined} />);

    expect(screen.queryByLabelText(/Start the .* free trial/i)).toBeNull();
    expect(screen.queryByLabelText(/See .* and subscribe/i)).toBeNull();
    expect(screen.getByText(blocked.reason!)).toBeTruthy();
  });

  it('does not offer a trial the backend would refuse', () => {
    const held = {
      subscriptionId: 'sub-1',
      planCode: 'plus',
      tier: 'Premium',
      status: 'Active',
      interval: 'Monthly' as const,
      grantsAccess: true,
      entitlements: [],
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      trialEndsAt: null,
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      renewalCount: 4,
    };

    renderMonetization(
      <LockedFeature decision={locked} subscription={held} onUpgrade={() => undefined} />
    );

    expect(screen.queryByLabelText(/free trial/i)).toBeNull();
    expect(screen.getByLabelText(/See Diaspora Plus and subscribe/i)).toBeTruthy();
  });

  it('renders nothing at all from the nudge once the feature is available', () => {
    const { toJSON } = renderMonetization(
      <UpgradeNudge
        decision={{ ...locked, isAvailable: true, reason: null, requiredPlan: null, isUpgradePath: false }}
        onUpgrade={() => undefined}
      />
    );

    expect(toJSON()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §32 and MON-GAP-008 — usage meters
// ─────────────────────────────────────────────────────────────────────────────

describe('a usage meter', () => {
  const ceilingOnly: UsageLimit = {
    key: 'listings.concurrent',
    label: 'Live listings',
    limit: 15,
    isUnlimited: false,
    consumed: null,
    ratio: null,
    isAtLimit: null,
  };

  it('says the usage is unavailable rather than drawing an empty bar', () => {
    // An empty bar reads as "none used" — a specific claim, and one nobody made.
    renderMonetization(<UsageMeter usage={ceilingOnly} />);

    expect(screen.getByText(/Diaspora cannot show how many you have used yet/i)).toBeTruthy();
    expect(screen.getByLabelText(/How many you have used is not available yet/i)).toBeTruthy();
  });

  it('draws the bar and announces the numbers once a counter exists', () => {
    renderMonetization(
      <UsageMeter
        usage={{ ...ceilingOnly, consumed: 11, ratio: 11 / 15, isAtLimit: false }}
        isSimulated
      />
    );

    expect(screen.getByLabelText(/11 of 15 used/i)).toBeTruthy();
    // The consumption half is simulated, and the meter marks it.
    expect(screen.getByLabelText(/Usage simulated/i)).toBeTruthy();
  });

  it('says in words that the limit is reached, not only in colour', () => {
    renderMonetization(
      <UsageMeter usage={{ ...ceilingOnly, consumed: 15, ratio: 1, isAtLimit: true }} />
    );

    expect(screen.getByText('You have reached this limit')).toBeTruthy();
    expect(screen.getByLabelText(/You have reached the limit/i)).toBeTruthy();
  });

  it('renders an unlimited entitlement without a bar', () => {
    renderMonetization(
      <UsageMeter usage={{ ...ceilingOnly, limit: null, isUnlimited: true }} />
    );

    expect(screen.getByText('Unlimited')).toBeTruthy();
  });
});

describe('the entitlement list', () => {
  it('renders a key this build has no label for, rather than hiding it', () => {
    // The property B15 designed capability-based entitlements to have: an
    // operator adds a plan and it appears without a client release.
    renderMonetization(<EntitlementList entitlements={[{ key: 'exports.bulk_csv', value: '5' }]} />);

    expect(screen.getByText('Exports Bulk Csv')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('explains the free plan rather than showing an empty box', () => {
    renderMonetization(<EntitlementList entitlements={[]} />);
    expect(screen.getByText('You are on the free plan.')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Promotions
// ─────────────────────────────────────────────────────────────────────────────

describe('a promotion row', () => {
  it('states the status in words as well as showing a badge', () => {
    const promotion = toPromotion(placement());
    renderMonetization(<PromotionRow promotion={promotion} onPress={() => undefined} />);

    expect(screen.getByLabelText(/Boost promotion on your listing/i)).toBeTruthy();
    expect(screen.getByLabelText(/days left/i)).toBeTruthy();
  });

  it('renders "Ends today" rather than a countdown reading zero', () => {
    const promotion = toPromotion(
      placement({ endsAt: new Date(Date.now() + 3600_000).toISOString() })
    );

    expect(describeTiming(promotion).label).toBe('Ends today');
  });

  it('distinguishes a scheduled promotion from a running one', () => {
    const promotion = toPromotion(
      placement({
        isActive: false,
        status: 'Scheduled',
        startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      })
    );

    expect(describeTiming(promotion).label).toMatch(/^Starts /);
    expect(describeTiming(promotion).spoken).toContain('has not started');
  });

  it('says an open-ended promotion has no end date rather than showing nothing', () => {
    const promotion = toPromotion(placement({ endsAt: null }));
    expect(describeTiming(promotion).label).toContain('no end date');
  });
});

describe('the expiring warning', () => {
  it('is announced as an alert, because it is the only warning a member gets', () => {
    // B15 emits no `placement.expiring` event — MON-GAP-004 — so this card is
    // the whole early-warning system.
    const promotion = toPromotion(
      placement({ endsAt: new Date(Date.now() + 86_400_000).toISOString() })
    );

    renderMonetization(
      <ExpiringPromotionCard promotion={promotion} onRenew={() => undefined} onView={() => undefined} />
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByLabelText(/^Your boost promotion on your listing/i)).toBeTruthy();
    expect(screen.getByLabelText(/Extend the promotion on your listing/i)).toBeTruthy();
  });

  it('offers no extension for something the catalogue says cannot be repeated', () => {
    const promotion = {
      ...toPromotion(placement({ endsAt: new Date(Date.now() + 86_400_000).toISOString() })),
      isRenewable: false,
    };

    renderMonetization(
      <ExpiringPromotionCard promotion={promotion} onRenew={() => undefined} onView={() => undefined} />
    );

    expect(screen.queryByLabelText(/Extend the promotion/i)).toBeNull();
    expect(screen.getByLabelText('See this promotion')).toBeTruthy();
  });
});

describe('the promotion preview', () => {
  const option = {
    code: 'mp-boost-7',
    productId: 'p1',
    name: 'Boost for 7 days',
    description: 'Higher search priority.',
    category: 'BoostedListing' as const,
    price: gbp(999),
    durationDays: 7,
    placementKind: 'Boost' as const,
    priorityWeight: 1.6,
    isRenewable: true,
    isAvailable: true,
    unavailableReasonCode: null,
    unavailableReason: null,
    sortOrder: 10,
    pricePerDay: gbp(142),
  };

  it('promises only what the contract supports — no reach estimate', () => {
    // No impression count exists (MON-GAP-002), and a purchase screen is the
    // worst possible place to invent one.
    renderMonetization(
      <PromotionPreview target={PROMOTION_TARGETS.marketplace} option={option} subjectTitle="Armchair" />
    );

    expect(screen.queryByText(/people will see/i)).toBeNull();
    expect(screen.queryByText(/estimated reach/i)).toBeNull();
    expect(screen.getByLabelText(/Shown 1.6 times as often as normal/i)).toBeTruthy();
  });

  // The facts are asserted through the summary's accessibility label rather
  // than the visible text: the individual rows are deliberately hidden from the
  // accessibility tree so a screen reader gets one coherent summary instead of
  // four fragments, and the label is therefore the accessible source of truth.
  it('says when it starts and how long it runs', () => {
    renderMonetization(
      <PromotionPreview target={PROMOTION_TARGETS.marketplace} option={option} />
    );

    expect(
      screen.getByLabelText(/Starts as soon as the payment clears\. Runs for 7 days\./)
    ).toBeTruthy();
  });

  it('says a scheduled start date when one is set', () => {
    const startsAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
    renderMonetization(
      <PromotionPreview target={PROMOTION_TARGETS.marketplace} option={option} startsAt={startsAt} />
    );

    expect(
      screen.getByLabelText(new RegExp(`Starts ${new Date(startsAt).toLocaleDateString()}`))
    ).toBeTruthy();
  });

  it('produces review rows the payment sheet can render without knowing what a promotion is', () => {
    const details = promotionReviewDetails(PROMOTION_TARGETS.job, option);

    expect(details.map((row) => row.label)).toEqual(['What', 'Runs for', 'Starts', 'Visibility']);
    expect(details.find((row) => row.label === 'Runs for')?.value).toBe('7 days');
    expect(details.find((row) => row.label === 'Starts')?.value).toBe('When the payment clears');
  });
});
