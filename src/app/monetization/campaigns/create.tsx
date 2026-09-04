// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Campaign builder (Frontend Phase 6)
//
// ⚠ SIMULATED. MON-GAP-001, MON-GAP-007. ⚠
//
// §13's campaign creation, end to end:
//
//   objective → placement → creative → audience → budget & schedule → preview
//   → payment → submitted → under review
//
// The payment step is Phase 5's `PaymentSheet` — the same sheet the marketplace,
// donations and promotions use — and the payment it reconciles is a real payment
// intent shape reported by the adapter, watched by `usePaymentReconciliation`
// exactly as a certified one would be. §18 forbids a second payment
// architecture, and building the simulated flow against a forgiving mock would
// mean the real one has never been exercised the way it will behave.
//
// The wizard state lives in this component rather than in Zustand. It is a draft
// that exists for the length of one screen, nothing else reads it, and a global
// store for it would be state that outlives the screen and is stale the next
// time somebody opens the builder.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  AccessGate,
  FinancialErrorInline,
  PaymentSheet,
  useParsedAmount,
} from '@/components/financial';
import {
  AudienceBuilder,
  BudgetForm,
  CampaignCreativePreview,
  CreativeForm,
  MonetizationGapNotice,
  ObjectiveSelector,
  PlacementSelector,
  describeObjective,
  describePlacements,
} from '@/components/monetization';
import {
  useAudienceEstimate,
  useCreateCampaign,
  useMonetizationGapsEnabled,
  useSubmitCampaign,
  useTargetingOptions,
} from '@/hooks/monetization-gaps';
import {
  useCanTransact,
  useCurrencies,
  usePrimaryWallet,
  usePurchaseProduct,
} from '@/hooks/financial';
import { usePricing } from '@/providers/pricing-provider';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import { toFinancialError, type FinancialError } from '@/lib/financial-errors';
import { useAuthStore } from '@/store/auth';
import { useLocationStore } from '@/store/location';
import type { PaymentIntent, PaymentMethodKind } from '@/types/financial';
import type {
  CampaignAudience,
  CampaignCreative,
  CampaignObjective,
  CampaignPlacementSurface,
} from '@/types/monetization-gaps';

type Step = 'objective' | 'placement' | 'creative' | 'audience' | 'budget' | 'review';

const STEPS: { key: Step; title: string; subtitle: string }[] = [
  { key: 'objective', title: 'What do you want?', subtitle: 'This decides how the campaign is judged.' },
  { key: 'placement', title: 'Where should it show?', subtitle: 'Pick as many places as you like.' },
  { key: 'creative', title: 'What does it say?', subtitle: 'The words people will read.' },
  { key: 'audience', title: 'Who should see it?', subtitle: 'Leave anything empty to reach everybody.' },
  { key: 'budget', title: 'How much, how long?', subtitle: 'You are never charged more than this.' },
  { key: 'review', title: 'Check it over', subtitle: 'Nothing is charged until you confirm.' },
];

const EMPTY_AUDIENCE: CampaignAudience = {
  countries: [],
  communities: [],
  neighbourhoods: [],
  audienceTypes: [],
  interests: [],
  categories: [],
  minMonthsInCountry: null,
};

export default function CreateCampaignScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const pricing = usePricing();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);
  const country = useLocationStore((state) => state.currentLocation?.countryCode);

  const gapsEnabled = useMonetizationGapsEnabled();
  const { wallet } = usePrimaryWallet();
  const currenciesQuery = useCurrencies();
  const { canTransact, blockedBy } = useCanTransact();

  const [step, setStep] = useState<Step>('objective');
  const [name, setName] = useState('');
  const [objective, setObjective] = useState<CampaignObjective | null>(null);
  const [placements, setPlacements] = useState<CampaignPlacementSurface[]>([]);
  const [creative, setCreative] = useState<CampaignCreative>({
    headline: '',
    body: '',
    callToActionLabel: '',
    callToActionRoute: null,
    mediaReference: null,
  });
  const [audience, setAudience] = useState<CampaignAudience>(EMPTY_AUDIENCE);
  const [budgetKind, setBudgetKind] = useState<'Total' | 'Daily'>('Total');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [durationDays, setDurationDays] = useState(14);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<FinancialError | null>(null);

  // Everything is denominated in the member's own wallet currency: the platform
  // never converts, so a campaign priced in anything else could not be paid for
  // from the balance they hold.
  const currency = wallet?.currency ?? 'GBP';
  const parsedBudget = useParsedAmount(budgetAmount, currency, currenciesQuery.data);

  const targeting = useTargetingOptions(country ?? undefined);
  const hasSelection = useMemo(
    () =>
      audience.countries.length +
        audience.communities.length +
        audience.neighbourhoods.length +
        audience.audienceTypes.length +
        audience.interests.length +
        audience.categories.length >
      0,
    [audience]
  );
  const estimate = useAudienceEstimate(hasSelection ? audience : null);

  const create = useCreateCampaign();
  const submit = useSubmitCampaign();

  // The same purchase the marketplace, donations and promotions make. §18
  // forbids a second payment path, and advertising does not get one.
  const purchase = usePurchaseProduct();

  const createRefusal = useMemo(
    () => checkAccess(FinancialPermissions.PurchasesCreate, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  const index = STEPS.findIndex((entry) => entry.key === step);
  const spec = STEPS[index];

  /**
   * Whether the current step is complete enough to move on.
   *
   * The audience step is deliberately always complete: an empty audience means
   * "no restriction", which is a legitimate and common choice, and forcing a
   * selection would push people into narrowing a campaign they wanted broad.
   */
  const canAdvance = useMemo(() => {
    switch (step) {
      case 'objective':
        return objective !== null && name.trim().length > 0;
      case 'placement':
        return placements.length > 0;
      case 'creative':
        return (
          creative.headline.trim().length > 0 &&
          creative.body.trim().length > 0 &&
          creative.callToActionLabel.trim().length > 0
        );
      case 'audience':
        return !hasSelection || (estimate.estimate?.isDeliverable ?? true);
      case 'budget':
        return parsedBudget !== null && parsedBudget.minorUnits > 0;
      case 'review':
        return true;
      default:
        return false;
    }
  }, [step, objective, name, placements, creative, hasSelection, estimate.estimate, parsedBudget]);

  /**
   * Creates the campaign, then submits it and returns the payment.
   *
   * Two calls rather than one because a campaign is a draft before it is funded:
   * `POST /campaigns` produces something the member could come back to, and
   * `POST /campaigns/{id}/submit` is what asks for money. That split is the
   * contract this asks the backend for, and building it as one call now would
   * mean losing the draft state when the real one arrives.
   */
  const execute = useCallback(
    async (methodKind: PaymentMethodKind): Promise<PaymentIntent | null> => {
      if (!objective || !parsedBudget) return null;

      setError(null);
      try {
        const startsAt = new Date();
        const endsAt = new Date(startsAt.getTime() + durationDays * 86_400_000);

        const campaign = await create.mutateAsync({
          name: name.trim(),
          objective,
          placements,
          creative,
          audience,
          budgetKind,
          budgetAmount: parsedBudget.amount,
          currency: parsedBudget.currency,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          countryCode: country ?? undefined,
        });

        const submission = await submit.mutateAsync({
          campaignId: campaign.campaignId,
          methodKind,
        });

        // Submitting freezes the campaign and says what to buy; it does not take
        // any money. The purchase route is the one place on this platform that
        // opens a payment intent, and this is the same call the marketplace and
        // donations make — §18 forbids a second payment path, and this is how
        // that stays true for advertising too.
        const paid = await purchase.mutateAsync({
          productCode: submission.productCode,
          subjectType: submission.subjectType,
          subjectId: submission.subjectId,
          methodKind,
        });

        return paid.payment ?? null;
      } catch (cause) {
        setError(toFinancialError(cause, 'mutating'));
        throw cause;
      }
    },
    [
      purchase,
      objective,
      parsedBudget,
      name,
      placements,
      creative,
      audience,
      budgetKind,
      durationDays,
      country,
      create,
      submit,
    ]
  );

  if (!gapsEnabled) {
    return (
      <Shell step={0} total={STEPS.length}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <MonetizationGapNotice gapKey="campaigns" />
        </ScrollView>
      </Shell>
    );
  }

  if (!createRefusal.allowed) {
    return (
      <Shell step={0} total={STEPS.length}>
        <AccessGate refusal={createRefusal} />
      </Shell>
    );
  }

  return (
    <Shell step={index + 1} total={STEPS.length}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {index === 0 ? <MonetizationGapNotice gapKey="campaigns" compact /> : null}

        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-xl font-black tracking-tight mt-4"
          accessibilityRole="header"
        >
          {spec.title}
        </Text>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-sm font-medium leading-relaxed mt-1 mb-6"
        >
          {spec.subtitle}
        </Text>

        {step === 'objective' ? (
          <View style={{ gap: 20 }}>
            <NameField value={name} onChangeText={setName} />
            <ObjectiveSelector selected={objective} onSelect={setObjective} />
          </View>
        ) : null}

        {step === 'placement' ? (
          <PlacementSelector
            selected={placements}
            onToggle={(placement) =>
              setPlacements((current) =>
                current.includes(placement)
                  ? current.filter((entry) => entry !== placement)
                  : [...current, placement]
              )
            }
          />
        ) : null}

        {step === 'creative' ? (
          <View style={{ gap: 24 }}>
            <CreativeForm creative={creative} onChange={setCreative} />
            <View>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[10px] font-black uppercase tracking-widest mb-2.5"
              >
                How it will look
              </Text>
              <CampaignCreativePreview
                creative={creative}
                placementLabel={describePlacements(placements)}
              />
            </View>
          </View>
        ) : null}

        {step === 'audience' ? (
          <View style={{ gap: 16 }}>
            <MonetizationGapNotice
              gapKey="targeting"
              compact
              detail="Diaspora targets by country, community, neighbourhood, interest and category, and applies every one of them. Audience type and time-in-country are shown here but are not applied — the delivery engine does not honour them."
            />
            <AudienceBuilder
              audience={audience}
              options={targeting.options}
              estimate={estimate.estimate}
              isEstimating={estimate.isLoading}
              onChange={setAudience}
            />
          </View>
        ) : null}

        {step === 'budget' ? (
          <BudgetForm
            amount={budgetAmount}
            onAmountChange={setBudgetAmount}
            budgetKind={budgetKind}
            onBudgetKindChange={setBudgetKind}
            currency={currency}
            currencies={currenciesQuery.data}
            durationDays={durationDays}
            onDurationChange={setDurationDays}
          />
        ) : null}

        {step === 'review' ? (
          <View style={{ gap: 20 }}>
            <CampaignCreativePreview creative={creative} placementLabel={describePlacements(placements)} />

            <View
              style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
              className="rounded-2xl border p-4"
            >
              <ReviewRow label="Name" value={name} />
              <ReviewRow label="Goal" value={describeObjective(objective).label} />
              <ReviewRow label="Judged by" value={describeObjective(objective).leadMetric} />
              <ReviewRow label="Shown in" value={describePlacements(placements)} />
              <ReviewRow
                label="Audience"
                value={hasSelection ? describeAudience(audience) : 'Everybody on Diaspora'}
              />
              <ReviewRow label="Runs for" value={`${durationDays} days`} />
              <ReviewRow
                label={budgetKind === 'Total' ? 'Total budget' : 'Budget per day'}
                value={parsedBudget ? pricing.format(parsedBudget) : '—'}
                emphasise
              />
            </View>

            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel="Campaigns are checked before they run. If yours is not approved you are not charged."
              style={{ backgroundColor: tokens.color.info.surface, borderColor: `${tokens.color.info.default}33` }}
              className="rounded-2xl border p-4"
            >
              <Text style={{ color: tokens.color.text.primary }} className="text-xs font-semibold leading-relaxed">
                Campaigns are checked before they run. If yours is not approved you are not charged, and we
                will tell you why.
              </Text>
            </View>
          </View>
        ) : null}

        {error ? (
          <View className="mt-5">
            <FinancialErrorInline error={error} />
          </View>
        ) : null}
      </ScrollView>

      {/* Navigation. Back is always available; forward is gated by the step. */}
      <View
        style={{
          paddingBottom: insets.bottom + 12,
          borderTopColor: tokens.color.border.default,
          backgroundColor: tokens.color.surface.card,
        }}
        className="flex-row px-5 pt-4 border-t"
        // 12 points between the two buttons.
      >
        {index > 0 ? (
          <TouchableOpacity
            onPress={() => setStep(STEPS[index - 1].key)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back a step"
            style={{ borderColor: tokens.color.border.default }}
            className="h-14 rounded-full border items-center justify-center px-6 mr-3"
          >
            <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
              Back
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          onPress={() => (step === 'review' ? setSheetOpen(true) : setStep(STEPS[index + 1].key))}
          disabled={!canAdvance || (step === 'review' && !canTransact)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={step === 'review' ? 'Review and pay for this campaign' : 'Continue'}
          accessibilityState={{ disabled: !canAdvance }}
          style={{
            backgroundColor:
              canAdvance && (step !== 'review' || canTransact)
                ? tokens.color.primary[500]
                : tokens.color.neutral[200],
          }}
          className="flex-1 h-14 rounded-full items-center justify-center"
        >
          <Text
            style={{
              color:
                canAdvance && (step !== 'review' || canTransact)
                  ? '#FFFFFF'
                  : tokens.color.text.disabled,
            }}
            className="text-sm font-black tracking-tight"
          >
            {step === 'review' ? 'Pay and submit' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>

      {blockedBy && step === 'review' ? (
        <Text
          style={{
            color: tokens.color.text.placeholder,
            backgroundColor: tokens.color.surface.card,
            paddingBottom: insets.bottom + 8,
          }}
          className="text-[11px] font-semibold text-center px-5"
        >
          {blockedBy.hint ?? blockedBy.message}
        </Text>
      ) : null}

      {parsedBudget ? (
        <PaymentSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={name.trim().length > 0 ? name.trim() : 'Advertising campaign'}
          description={`${describeObjective(objective).label} · ${durationDays} days · ${describePlacements(
            placements
          )}`}
          subjectLabel="your campaign"
          listPrice={parsedBudget}
          payable={parsedBudget}
          details={[
            { label: 'Goal', value: describeObjective(objective).label },
            { label: 'Runs for', value: `${durationDays} days` },
            { label: 'Budget', value: budgetKind === 'Total' ? 'Total' : 'Per day' },
            {
              label: 'Audience',
              value: hasSelection ? describeAudience(audience) : 'Everybody',
            },
          ]}
          execute={execute}
          confirmLabel="Pay and submit for review"
          onCompleted={() => router.replace('/monetization/campaigns')}
        />
      ) : null}
    </Shell>
  );
}

function Shell({
  step,
  total,
  children,
}: {
  step: number;
  total: number;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="New campaign" showBack />

      {step > 0 ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${step} of ${total}`}
          accessibilityValue={{ min: 0, max: total, now: step }}
          style={{ backgroundColor: tokens.color.neutral[200] }}
          className="h-1"
        >
          <View
            style={{ backgroundColor: tokens.color.primary[500], width: `${(step / total) * 100}%` }}
            className="h-full"
          />
        </View>
      ) : null}

      {children}
    </SafeAreaView>
  );
}

function NameField({ value, onChangeText }: { value: string; onChangeText: (next: string) => void }) {
  const { tokens } = useTheme();

  return (
    <View>
      <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black uppercase tracking-wider mb-2">
        Campaign name
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        maxLength={60}
        placeholder="Spring removals push"
        placeholderTextColor={tokens.color.text.placeholder}
        accessibilityLabel="Campaign name"
        accessibilityHint="Only you see this. It is how you will find the campaign later."
        style={{
          backgroundColor: tokens.color.surface.card,
          borderColor: tokens.color.border.default,
          color: tokens.color.text.primary,
          height: 48,
        }}
        className="rounded-2xl border px-4 text-sm font-medium"
      />
      <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-medium mt-1.5">
        Only you see this. It is how you will find the campaign later.
      </Text>
    </View>
  );
}

function ReviewRow({
  label,
  value,
  emphasise = false,
}: {
  label: string;
  value: string;
  emphasise?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
      className="flex-row items-start justify-between py-2"
    >
      <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold mr-3">
        {label}
      </Text>
      <Text
        style={{ color: tokens.color.text.primary }}
        className={`flex-1 text-right ${emphasise ? 'text-sm font-black' : 'text-xs font-bold'}`}
      >
        {value}
      </Text>
    </View>
  );
}

/** An audience selection in one line, for a review row. */
function describeAudience(audience: CampaignAudience): string {
  const parts: string[] = [];
  if (audience.countries.length > 0) parts.push(`${audience.countries.length} countries`);
  if (audience.communities.length > 0) parts.push(`${audience.communities.length} communities`);
  if (audience.neighbourhoods.length > 0) parts.push(`${audience.neighbourhoods.length} areas`);
  if (audience.audienceTypes.length > 0) parts.push(audience.audienceTypes.join(', '));
  if (audience.interests.length > 0) parts.push(`${audience.interests.length} interests`);
  if (audience.categories.length > 0) parts.push(`${audience.categories.length} categories`);
  return parts.length > 0 ? parts.join(' · ') : 'Everybody on Diaspora';
}
