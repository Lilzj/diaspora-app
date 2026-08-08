// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Campaign builder (Frontend Phase 6)
//
// ⚠ THE WHOLE ADVERTISING SURFACE IS SIMULATED. MON-GAP-001, MON-GAP-007. ⚠
//
// §13 asks for a proper advertising dashboard and §14 for a targeting UX. Both
// are built here in full, against the development adapter, because a campaign
// aggregate does not exist in the certified backend at all — there is a
// `Campaign` product *category* and nothing to attach a creative, a budget, a
// schedule or a run state to.
//
// The targeting builder lives here and **not** in the promotion flow, and that
// is a deliberate split. The certified purchase request honours exactly one
// targeting dimension — `countryCode` — so a targeting builder on the real
// promotion screen would collect six dimensions and send one. Somewhere the
// whole entity is simulated, collecting all seven is coherent; on a screen that
// takes real money it would not be.
//
// These are the step components. The wizard that sequences them is
// `app/monetization/campaigns/create.tsx`; keeping the steps here means each one
// is renderable in a test without driving the whole wizard.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { usePricing } from '@/providers/pricing-provider';
import { AmountInput, useParsedAmount } from '@/components/financial';
import { fromMinorUnits } from '@/lib/money';
import type { CurrencyFact, Money } from '@/types/financial';
import type {
  AudienceEstimate,
  CampaignAudience,
  CampaignCreative,
  CampaignObjective,
  CampaignPlacementSurface,
  TargetingOption,
  TargetingOptions,
} from '@/types/monetization-gaps';

// ─────────────────────────────────────────────────────────────────────────────
// Objective
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The six objectives, each with the outcome it optimises for.
 *
 * The `leadMetric` line matters: an objective that does not change which number
 * the advertiser is judged on is an objective that does nothing, and this table
 * is the contract the eventual delivery engine has to honour.
 */
const OBJECTIVES: {
  value: CampaignObjective;
  label: string;
  description: string;
  leadMetric: string;
  icon: string;
}[] = [
  {
    value: 'Awareness',
    label: 'Be seen',
    description: 'Get in front of as many people in your community as possible.',
    leadMetric: 'Impressions',
    icon: 'eye-outline',
  },
  {
    value: 'Traffic',
    label: 'Send visits',
    description: 'Bring people to your profile, listing or website.',
    leadMetric: 'Clicks',
    icon: 'arrow-forward-circle-outline',
  },
  {
    value: 'Enquiries',
    label: 'Get messages',
    description: 'Get people to message you about what you offer.',
    leadMetric: 'Enquiries',
    icon: 'chatbubble-ellipses-outline',
  },
  {
    value: 'Applications',
    label: 'Get applicants',
    description: 'Fill a role with people already in the community.',
    leadMetric: 'Applications',
    icon: 'document-text-outline',
  },
  {
    value: 'Attendance',
    label: 'Fill an event',
    description: 'Get people to register for something you are running.',
    leadMetric: 'Registrations',
    icon: 'calendar-outline',
  },
  {
    value: 'Sales',
    label: 'Sell items',
    description: 'Move stock in the marketplace faster.',
    leadMetric: 'Sales',
    icon: 'pricetag-outline',
  },
];

export function ObjectiveSelector({
  selected,
  onSelect,
}: {
  selected: CampaignObjective | null;
  onSelect: (objective: CampaignObjective) => void;
}) {
  const { tokens } = useTheme();

  return (
    <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
      {OBJECTIVES.map((objective) => {
        const isSelected = selected === objective.value;

        return (
          <TouchableOpacity
            key={objective.value}
            onPress={() => onSelect(objective.value)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${objective.label}. ${objective.description} Measured by ${objective.leadMetric.toLowerCase()}.`}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
              borderWidth: isSelected ? 2 : 1,
            }}
            className="flex-row items-center rounded-2xl p-4"
          >
            <View
              style={{ backgroundColor: isSelected ? tokens.color.primary[50] : tokens.color.neutral[100] }}
              className="w-10 h-10 rounded-xl items-center justify-center mr-3"
            >
              <Ionicons
                name={objective.icon as never}
                size={20}
                color={isSelected ? tokens.color.primary[600] : tokens.color.text.secondary}
              />
            </View>

            <View className="flex-1 mr-2">
              <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black tracking-tight">
                {objective.label}
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-medium leading-relaxed mt-0.5"
              >
                {objective.description}
              </Text>
              <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-black uppercase tracking-wider mt-1.5">
                Measured by {objective.leadMetric}
              </Text>
            </View>

            <Ionicons
              name={isSelected ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={isSelected ? tokens.color.primary[500] : tokens.color.text.placeholder}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Placement
// ─────────────────────────────────────────────────────────────────────────────

const PLACEMENTS: { value: CampaignPlacementSurface; label: string; where: string; icon: string }[] = [
  { value: 'HomeFeed', label: 'Home feed', where: 'Between community updates on the home tab.', icon: 'home-outline' },
  { value: 'DiscoverRail', label: 'Discover', where: 'In the featured rail on the discover tab.', icon: 'compass-outline' },
  { value: 'SearchResults', label: 'Search results', where: 'Above results when somebody searches nearby.', icon: 'search-outline' },
  { value: 'CategoryDirectory', label: 'Category directories', where: 'At the top of the directory for your category.', icon: 'apps-outline' },
  { value: 'KnowledgeHub', label: 'Knowledge hub', where: 'Alongside guides and community updates.', icon: 'book-outline' },
  { value: 'CommunityEvents', label: 'Events', where: 'In the community events calendar.', icon: 'calendar-outline' },
  {
    value: 'Notifications',
    label: 'Notifications',
    where: 'As an occasional notification. Used sparingly and never more than once a week.',
    icon: 'notifications-outline',
  },
];

export function PlacementSelector({
  selected,
  onToggle,
}: {
  selected: CampaignPlacementSurface[];
  onToggle: (placement: CampaignPlacementSurface) => void;
}) {
  const { tokens } = useTheme();

  return (
    <View style={{ gap: 8 }}>
      {PLACEMENTS.map((placement) => {
        const isSelected = selected.includes(placement.value);

        return (
          <TouchableOpacity
            key={placement.value}
            onPress={() => onToggle(placement.value)}
            activeOpacity={0.8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={`${placement.label}. ${placement.where}`}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
              borderWidth: isSelected ? 2 : 1,
            }}
            className="flex-row items-center rounded-2xl px-4 py-3.5"
          >
            <Ionicons
              name={isSelected ? 'checkbox' : 'square-outline'}
              size={20}
              color={isSelected ? tokens.color.primary[500] : tokens.color.text.placeholder}
              style={{ marginRight: 12 }}
            />
            <Ionicons
              name={placement.icon as never}
              size={17}
              color={tokens.color.text.secondary}
              style={{ marginRight: 10 }}
            />
            <View className="flex-1">
              <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold">
                {placement.label}
              </Text>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-medium leading-relaxed mt-0.5"
              >
                {placement.where}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Creative
// ─────────────────────────────────────────────────────────────────────────────

const HEADLINE_MAX = 60;
const BODY_MAX = 180;

export function CreativeForm({
  creative,
  onChange,
}: {
  creative: CampaignCreative;
  onChange: (next: CampaignCreative) => void;
}) {
  const { tokens } = useTheme();

  return (
    <View style={{ gap: 16 }}>
      <Field
        label="Headline"
        hint="The first thing people read. Keep it short and specific."
        value={creative.headline}
        onChangeText={(headline) => onChange({ ...creative, headline })}
        maxLength={HEADLINE_MAX}
        placeholder="Affordable moves across London"
      />

      <Field
        label="Body"
        hint="One or two sentences on what you offer and who it is for."
        value={creative.body}
        onChangeText={(body) => onChange({ ...creative, body })}
        maxLength={BODY_MAX}
        multiline
        placeholder="Same-day removals with insured drivers. Nigerian-owned, serving south London since 2019."
      />

      <Field
        label="Button text"
        hint="What the button on your advertisement says."
        value={creative.callToActionLabel}
        onChangeText={(callToActionLabel) => onChange({ ...creative, callToActionLabel })}
        maxLength={24}
        placeholder="Get a quote"
      />

      <View
        style={{ backgroundColor: tokens.color.info.surface, borderColor: `${tokens.color.info.default}33` }}
        className="rounded-2xl border p-3.5"
      >
        <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-semibold leading-relaxed">
          Advertisements are checked before they run. Anything misleading, or aimed at a group rather than
          an interest, will be refused.
        </Text>
      </View>
    </View>
  );
}

function Field({
  label,
  hint,
  value,
  onChangeText,
  maxLength,
  multiline = false,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChangeText: (next: string) => void;
  maxLength: number;
  multiline?: boolean;
  placeholder?: string;
}) {
  const { tokens } = useTheme();
  const remaining = maxLength - value.length;

  return (
    <View>
      <View className="flex-row items-center justify-between mb-1.5">
        <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black uppercase tracking-wider">
          {label}
        </Text>
        <Text
          style={{ color: remaining < 10 ? tokens.color.warning.default : tokens.color.text.placeholder }}
          className="text-[11px] font-bold"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {remaining}
        </Text>
      </View>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        maxLength={maxLength}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={tokens.color.text.placeholder}
        accessibilityLabel={label}
        accessibilityHint={`${hint} ${remaining} characters left.`}
        style={{
          backgroundColor: tokens.color.surface.card,
          borderColor: tokens.color.border.default,
          color: tokens.color.text.primary,
          minHeight: multiline ? 96 : 48,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
        className="rounded-2xl border px-4 py-3 text-sm font-medium"
      />

      <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-medium mt-1.5 leading-relaxed">
        {hint}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Audience — MON-GAP-007
// ─────────────────────────────────────────────────────────────────────────────

export function AudienceBuilder({
  audience,
  options,
  estimate,
  isEstimating,
  onChange,
}: {
  audience: CampaignAudience;
  options: TargetingOptions | null;
  estimate: AudienceEstimate | null;
  isEstimating: boolean;
  onChange: (next: CampaignAudience) => void;
}) {
  const { tokens } = useTheme();

  const toggle = (dimension: keyof CampaignAudience, value: string) => {
    const current = audience[dimension];
    if (!Array.isArray(current)) return;
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    onChange({ ...audience, [dimension]: next });
  };

  if (!options) {
    return (
      <Text style={{ color: tokens.color.text.placeholder }} className="text-sm font-semibold text-center py-8">
        Loading targeting options…
      </Text>
    );
  }

  return (
    <View style={{ gap: 20 }}>
      <ReachEstimate estimate={estimate} isLoading={isEstimating} />

      <Dimension
        title="Countries"
        hint="Where the people you want to reach are living now. Leave empty for everywhere."
        values={options.countries}
        selected={audience.countries}
        onToggle={(value) => toggle('countries', value)}
      />

      <Dimension
        title="Communities"
        hint="Diaspora communities. Leave empty for all."
        values={options.communities}
        selected={audience.communities}
        onToggle={(value) => toggle('communities', value)}
      />

      <Dimension
        title="Neighbourhoods"
        hint="Narrow to specific areas. Only useful for something local."
        values={options.neighbourhoods}
        selected={audience.neighbourhoods}
        onToggle={(value) => toggle('neighbourhoods', value)}
      />

      <Dimension
        title="Who they are"
        hint="How settled somebody is. Leave empty to reach everybody."
        values={options.audienceTypes}
        selected={audience.audienceTypes}
        onToggle={(value) => toggle('audienceTypes', value)}
      />

      <Dimension
        title="Interests"
        hint="What they have shown an interest in on Diaspora."
        values={options.interests}
        selected={audience.interests}
        onToggle={(value) => toggle('interests', value)}
      />

      <Dimension
        title="Categories"
        hint="The kinds of listing, job or event they browse."
        values={options.categories}
        selected={audience.categories}
        onToggle={(value) => toggle('categories', value)}
      />
    </View>
  );
}

function Dimension({
  title,
  hint,
  values,
  selected,
  onToggle,
}: {
  title: string;
  hint: string;
  values: TargetingOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const { tokens } = useTheme();

  if (values.length === 0) return null;

  return (
    <View>
      <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black uppercase tracking-wider">
        {title}
      </Text>
      <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-medium leading-relaxed mt-1 mb-2.5">
        {hint}
        {selected.length > 0 ? ` ${selected.length} selected.` : ''}
      </Text>

      <View className="flex-row flex-wrap" style={{ gap: 6 }}>
        {values.map((option) => {
          const isSelected = selected.includes(option.value);

          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => onToggle(option.value)}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${option.label}${option.group ? `, ${option.group}` : ''}`}
              style={{
                backgroundColor: isSelected ? tokens.color.primary[500] : tokens.color.surface.card,
                borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
              }}
              className="flex-row items-center rounded-full border px-3 py-1.5"
            >
              {isSelected ? (
                <Ionicons name="checkmark" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
              ) : null}
              <Text
                style={{ color: isSelected ? '#FFFFFF' : tokens.color.text.primary }}
                className="text-xs font-bold"
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/**
 * How many people a selection reaches.
 *
 * Bucketed — "1,200 to 3,400" — and never exact. An exact count of the members
 * matching a fine-grained selection is a privacy leak: narrow the filters until
 * the number is one, and the advertiser has learned something about an
 * individual. The contract this asks for returns a range for that reason, and
 * the component would render an exact figure as a range even if one arrived.
 */
function ReachEstimate({
  estimate,
  isLoading,
}: {
  estimate: AudienceEstimate | null;
  isLoading: boolean;
}) {
  const { tokens } = useTheme();

  const body = isLoading
    ? 'Working out how many people this reaches…'
    : !estimate
      ? 'Choose some options to see how many people this reaches.'
      : !estimate.isDeliverable
        ? (estimate.refusalMessage ?? 'This is too narrow to deliver. Try removing a filter.')
        : `About ${estimate.reachLower.toLocaleString()} to ${estimate.reachUpper.toLocaleString()} people.`;

  const tone = estimate && !estimate.isDeliverable && !isLoading ? 'warning' : 'info';

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={body}
      style={{
        backgroundColor: tone === 'warning' ? tokens.color.warning.surface : tokens.color.info.surface,
        borderColor: `${tone === 'warning' ? tokens.color.warning.default : tokens.color.info.default}33`,
      }}
      className="rounded-2xl border p-4"
    >
      <View className="flex-row items-center mb-1">
        <Ionicons
          name={tone === 'warning' ? 'alert-circle-outline' : 'people-outline'}
          size={15}
          color={tone === 'warning' ? tokens.color.warning.default : tokens.color.info.default}
        />
        <Text
          style={{ color: tone === 'warning' ? tokens.color.warning.default : tokens.color.info.default }}
          className="text-[10px] font-black uppercase tracking-widest ml-1.5"
        >
          Estimated reach
        </Text>
      </View>
      <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold leading-relaxed">
        {body}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget and schedule
// ─────────────────────────────────────────────────────────────────────────────

export function BudgetForm({
  amount,
  onAmountChange,
  budgetKind,
  onBudgetKindChange,
  currency,
  currencies,
  durationDays,
  onDurationChange,
}: {
  amount: string;
  onAmountChange: (next: string) => void;
  budgetKind: 'Total' | 'Daily';
  onBudgetKindChange: (next: 'Total' | 'Daily') => void;
  currency: string;
  currencies: CurrencyFact[] | undefined;
  durationDays: number;
  onDurationChange: (days: number) => void;
}) {
  const { tokens } = useTheme();
  const pricing = usePricing();

  const parsed = useParsedAmount(amount, currency, currencies);

  /**
   * What a daily budget adds up to over the run.
   *
   * Integer multiplication on `minorUnits` — the one arithmetic operation in
   * this form, and it is done the way `lib/money.ts` requires rather than on the
   * major-unit float, because sixty days of £2.35 is exactly the kind of sum
   * that drifts a penny when done on a float.
   */
  const total =
    parsed && budgetKind === 'Daily'
      ? multiplyMinorUnits(parsed, durationDays)
      : null;

  return (
    <View style={{ gap: 20 }}>
      <View>
        <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black uppercase tracking-wider mb-2.5">
          How the budget is spent
        </Text>

        <View className="flex-row" style={{ gap: 8 }}>
          {(['Total', 'Daily'] as const).map((kind) => {
            const isSelected = budgetKind === kind;
            return (
              <TouchableOpacity
                key={kind}
                onPress={() => onBudgetKindChange(kind)}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={
                  kind === 'Total'
                    ? 'A total budget, spread over the whole run'
                    : 'A daily budget, spent each day it runs'
                }
                style={{
                  backgroundColor: isSelected ? tokens.color.primary[500] : tokens.color.surface.card,
                  borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
                }}
                className="flex-1 rounded-2xl border px-4 py-3 items-center"
              >
                <Text
                  style={{ color: isSelected ? '#FFFFFF' : tokens.color.text.primary }}
                  className="text-sm font-black"
                >
                  {kind === 'Total' ? 'Total' : 'Per day'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View>
        <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black uppercase tracking-wider mb-2.5">
          {budgetKind === 'Total' ? 'Total budget' : 'Budget per day'}
        </Text>

        <AmountInput
          value={amount}
          onChangeText={onAmountChange}
          currency={currency}
          currencies={currencies}
          label={budgetKind === 'Total' ? 'Total budget' : 'Budget per day'}
        />
      </View>

      <View>
        <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black uppercase tracking-wider mb-2.5">
          How long it runs
        </Text>

        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          {[7, 14, 30, 60].map((days) => {
            const isSelected = durationDays === days;
            return (
              <TouchableOpacity
                key={days}
                onPress={() => onDurationChange(days)}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${days} days`}
                style={{
                  backgroundColor: isSelected ? tokens.color.primary[500] : tokens.color.surface.card,
                  borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
                }}
                className="rounded-full border px-4 py-2"
              >
                <Text
                  style={{ color: isSelected ? '#FFFFFF' : tokens.color.text.primary }}
                  className="text-xs font-black"
                >
                  {days} days
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* What it works out at, so a daily budget's real cost is visible before
          somebody commits to sixty days of it. */}
      {total ? (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Over ${durationDays} days that is about ${pricing.describe(total)} in total.`}
          style={{ backgroundColor: tokens.color.info.surface }}
          className="rounded-2xl p-3.5"
        >
          <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold leading-relaxed">
            Over {durationDays} days that is about {pricing.format(total)} in total.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** `money × n`, exactly. Multiplication is safe on integers; division is not. */
function multiplyMinorUnits(value: Money, factor: number): Money {
  return fromMinorUnits(value.minorUnits * factor, value.currency, value.exponent, value.symbol);
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview
// ─────────────────────────────────────────────────────────────────────────────

/** What the advertisement will look like where it runs. */
export function CampaignCreativePreview({
  creative,
  placementLabel,
}: {
  creative: CampaignCreative;
  placementLabel: string;
}) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Preview. ${creative.headline}. ${creative.body}. Button: ${creative.callToActionLabel}. Shown in ${placementLabel}.`}
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-2xl border p-4"
    >
      <View className="flex-row items-center mb-2.5">
        <View style={{ backgroundColor: tokens.color.neutral[200] }} className="w-8 h-8 rounded-full mr-2.5" />
        <View className="flex-1">
          <View style={{ backgroundColor: tokens.color.neutral[200] }} className="h-2.5 w-24 rounded-full" />
        </View>
        <View style={{ backgroundColor: tokens.color.neutral[100] }} className="rounded-full px-2 py-0.5">
          <Text style={{ color: tokens.color.text.placeholder }} className="text-[9px] font-black uppercase tracking-widest">
            Ad
          </Text>
        </View>
      </View>

      <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black tracking-tight">
        {creative.headline.length > 0 ? creative.headline : 'Your headline'}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-medium leading-relaxed mt-1"
      >
        {creative.body.length > 0 ? creative.body : 'Your description appears here.'}
      </Text>

      <View
        style={{ backgroundColor: tokens.color.primary[500] }}
        className="self-start rounded-full px-4 py-2 mt-3"
      >
        <Text style={{ color: '#FFFFFF' }} className="text-xs font-black">
          {creative.callToActionLabel.length > 0 ? creative.callToActionLabel : 'Find out more'}
        </Text>
      </View>

      <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-semibold mt-3">
        Shown in {placementLabel}
      </Text>
    </View>
  );
}

/** The placement labels a preview and a review row both need. */
export function describePlacements(placements: CampaignPlacementSurface[]): string {
  if (placements.length === 0) return 'no placements chosen yet';
  return placements
    .map((value) => PLACEMENTS.find((entry) => entry.value === value)?.label ?? value)
    .join(', ');
}

/** The objective's label and lead metric, for a review row. */
export function describeObjective(objective: CampaignObjective | null): {
  label: string;
  leadMetric: string;
} {
  const found = OBJECTIVES.find((entry) => entry.value === objective);
  return found
    ? { label: found.label, leadMetric: found.leadMetric }
    : { label: String(objective ?? 'Not chosen'), leadMetric: 'Impressions' };
}

export { OBJECTIVES as CAMPAIGN_OBJECTIVE_OPTIONS, PLACEMENTS as CAMPAIGN_PLACEMENT_OPTIONS };
