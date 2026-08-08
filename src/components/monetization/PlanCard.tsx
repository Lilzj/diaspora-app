// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Subscription plan surfaces (Frontend Phase 6)
//
// §10: one subscription architecture serving business, organisation, creator,
// recruiter, landlord and seller. The audience is a parameter; there is no
// per-audience plan card.
//
// Two rules carried from Phase 5 and worth restating:
//
//   **Entitlements are rendered, never plan names.** B15 designed
//   `entitlements[]` so an operator can add a plan without a client release, and
//   a card that hard-coded "Plus gets you analytics" would throw that away.
//
//   **A trial is offered only where it will be honoured.** `trialDays > 0` is
//   not enough — the backend refuses `financial.subscription.trial_used` to
//   somebody who has held the plan before — so `PlanView.canStartTrial` decides,
//   and it accounts for both.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { usePricing } from '@/providers/pricing-provider';
import { describeEntitlement, describeEntitlementValue } from '@/lib/entitlements';
import { pricePerMonth } from '@/lib/pricing';
import { PriceTag } from './PriceTag';
import type { PlanView } from '@/types/monetization';

export interface PlanCardProps {
  view: PlanView;
  isSelected: boolean;
  onSelect: () => void;
  /** Collapses the entitlement list to the first few. Used in a horizontal rail. */
  compact?: boolean;
}

export function PlanCard({ view, isSelected, onSelect, compact = false }: PlanCardProps) {
  const { tokens } = useTheme();
  const pricing = usePricing();

  const { plan, isCurrent, canStartTrial, relativeToCurrent } = view;
  const cycle = pricing.cycle(plan.interval);
  const trial = canStartTrial ? pricing.trial(plan) : null;

  const price = pricing.resolve({
    price: plan.price,
    isFree: plan.isFree,
    suffix: plan.isFree ? null : `/ ${cycle.unit}`,
    note: pricing.foreignNote(plan.price),
  });

  // Shown only where it says something the headline price does not: a yearly
  // plan's monthly equivalent. On a monthly plan the two are the same number.
  const monthly = plan.interval === 'Yearly' ? pricePerMonth(plan) : null;

  const entitlements = compact ? plan.entitlements.slice(0, 4) : plan.entitlements;

  /**
   * What a screen reader says for the whole card.
   *
   * The entitlement list below is hidden from the accessibility tree — read as
   * separate nodes it arrives as a stream of unattached fragments after the
   * price — so the card carries one label instead. That label has to *name* the
   * entitlements rather than count them: "includes 2 features" tells somebody
   * choosing between plans nothing at all, and choosing a plan is exactly what
   * this component is for.
   */
  const spoken = [
    plan.name,
    isCurrent ? 'your current plan' : null,
    plan.description,
    price.spoken,
    trial ? `${trial.headline}. ${trial.afterwards}` : null,
    relativeToCurrent === 'downgrade' && view.lostEntitlements.length > 0
      ? `Moving to this would lose ${view.lostEntitlements.length} features you have now`
      : null,
    plan.entitlements.length > 0
      ? `Includes ${plan.entitlements
          .map((entitlement) => {
            const described = describeEntitlement(entitlement.key).label;
            return entitlement.value
              ? `${described} · ${describeEntitlementValue(entitlement.value)}`
              : described;
          })
          .join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <TouchableOpacity
      onPress={onSelect}
      activeOpacity={0.85}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={spoken}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
        borderWidth: isSelected ? 2 : 1,
      }}
      className="rounded-3xl p-5"
    >
      <View className="flex-row items-start justify-between mb-1">
        <View className="flex-1 mr-3">
          <Text style={{ color: tokens.color.text.primary }} className="text-base font-black tracking-tight">
            {plan.name}
          </Text>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-medium leading-relaxed mt-1"
          >
            {plan.description}
          </Text>
        </View>

        {isCurrent ? <Chip tone="success" label="Current" /> : null}
        {!isCurrent && relativeToCurrent === 'downgrade' ? <Chip tone="neutral" label="Lower tier" /> : null}
      </View>

      <View className="mt-3">
        <PriceTag price={price} size="large" hideNote />

        {monthly ? (
          <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-bold mt-1">
            about {pricing.format(monthly)} a month, billed {cycle.phrase}
          </Text>
        ) : null}

        {trial ? (
          <View
            style={{ backgroundColor: tokens.color.success.surface }}
            className="rounded-xl px-3 py-2 mt-2.5"
          >
            <Text style={{ color: tokens.color.success.default }} className="text-[11px] font-black">
              {trial.headline}
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-semibold leading-relaxed mt-0.5"
            >
              {trial.afterwards}
            </Text>
          </View>
        ) : null}

        {price.note ? (
          <Text style={{ color: tokens.color.warning.default }} className="text-[11px] font-semibold mt-2 leading-relaxed">
            {price.note}
          </Text>
        ) : null}
      </View>

      <View
        style={{ borderTopColor: tokens.color.border.default }}
        className="border-t mt-4 pt-3"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {entitlements.map((entitlement) => {
          const described = describeEntitlement(entitlement.key);
          const isNew = view.gainedEntitlements.some((gained) => gained.key === entitlement.key);

          return (
            <View key={entitlement.key} className="flex-row items-center py-1">
              <Ionicons
                name="checkmark"
                size={15}
                color={isNew ? tokens.color.primary[500] : tokens.color.success.default}
                style={{ marginRight: 8 }}
              />
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="flex-1 text-xs font-semibold"
                numberOfLines={2}
              >
                {described.label}
                {entitlement.value ? ` · ${describeEntitlementValue(entitlement.value)}` : ''}
              </Text>
              {isNew ? (
                <Text style={{ color: tokens.color.primary[500] }} className="text-[9px] font-black uppercase tracking-wider">
                  New
                </Text>
              ) : null}
            </View>
          );
        })}

        {compact && plan.entitlements.length > entitlements.length ? (
          <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-bold mt-1.5">
            and {plan.entitlements.length - entitlements.length} more
          </Text>
        ) : null}
      </View>

      {/* A downgrade's cost is what it takes away, and it is said before the
          member commits rather than in a confirmation dialog afterwards. */}
      {relativeToCurrent === 'downgrade' && view.lostEntitlements.length > 0 ? (
        <View
          style={{ backgroundColor: tokens.color.warning.surface }}
          className="rounded-xl px-3 py-2.5 mt-3"
        >
          <Text style={{ color: tokens.color.warning.default }} className="text-[10px] font-black uppercase tracking-widest mb-1">
            You would lose
          </Text>
          <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-semibold leading-relaxed">
            {view.lostEntitlements.map((entry) => describeEntitlement(entry.key).label).join(', ')}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function Chip({ tone, label }: { tone: 'success' | 'neutral'; label: string }) {
  const { tokens } = useTheme();
  const background = tone === 'success' ? tokens.color.success.surface : tokens.color.neutral[100];
  const foreground = tone === 'success' ? tokens.color.success.default : tokens.color.text.secondary;

  return (
    <View style={{ backgroundColor: background }} className="rounded-full px-2.5 py-1">
      <Text style={{ color: foreground }} className="text-[10px] font-black uppercase tracking-wider">
        {label}
      </Text>
    </View>
  );
}

/**
 * The audience picker.
 *
 * Only shows audiences that actually have plans — an operator who has not
 * configured a landlord plan should not have a landlord tab that opens onto an
 * empty screen.
 */
export function AudiencePicker({
  audiences,
  selected,
  onSelect,
}: {
  audiences: { key: string; title: string; icon: string; subtitle: string }[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const { tokens } = useTheme();

  return (
    <View accessibilityRole="radiogroup" className="flex-row flex-wrap" style={{ gap: 8 }}>
      {audiences.map((audience) => {
        const isSelected = selected === audience.key;
        return (
          <TouchableOpacity
            key={audience.key}
            onPress={() => onSelect(audience.key)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${audience.title}. ${audience.subtitle}`}
            style={{
              backgroundColor: isSelected ? tokens.color.primary[500] : tokens.color.surface.card,
              borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
            }}
            className="flex-row items-center rounded-full border px-3.5 py-2"
          >
            <Ionicons
              name={audience.icon as never}
              size={14}
              color={isSelected ? '#FFFFFF' : tokens.color.text.secondary}
            />
            <Text
              style={{ color: isSelected ? '#FFFFFF' : tokens.color.text.primary }}
              className="text-xs font-black ml-1.5"
            >
              {audience.title}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
