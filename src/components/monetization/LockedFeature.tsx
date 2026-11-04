// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Locked feature experience (Frontend Phase 6)
//
// §12: a premium feature the member has not bought is not hidden. It is shown,
// explained, priced, and made buyable.
//
// The rule that shapes the whole component is the last line of §12: *"Do not
// reveal sensitive or premium data that the user is not entitled to see."* So
// the preview is a **schematic** — the shape of the report, the names of the
// charts, greyed placeholder bars — and never the member's own figures behind a
// blur. A blur is a client-side decision about data that has already been sent
// to the device, and anybody with a debugger has it. The premium query is not
// made at all until the entitlement resolves true; see `usePremiumAnalytics`.
//
// The upgrade path is only offered when upgrading would actually work.
// `EntitlementDecision.isUpgradePath` is false for a member whose account is
// restricted or unverified — they cannot fix that by paying, and a pay button
// shown to them takes their money and still refuses them. Those cases get the
// financial layer's own access refusal instead.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { usePricing } from '@/providers/pricing-provider';
import { canStartTrial, describeEntitlement } from '@/lib/entitlements';
import { GATED_FEATURES, type EntitlementDecision, type GatedFeature } from '@/types/monetization';
import type { Subscription } from '@/types/financial';

export interface LockedFeatureProps {
  decision: EntitlementDecision;
  /** Overrides the registry entry, for a feature declared inline. */
  feature?: GatedFeature;
  /** The caller's subscription, so the trial offer is honest. */
  subscription?: Subscription | null;
  onUpgrade: () => void;
  /** Opens the full plan comparison. */
  onLearnMore?: () => void;
  /** A schematic of what the feature looks like. Never the member's real data. */
  preview?: React.ReactNode;
  compact?: boolean;
}

export function LockedFeature({
  decision,
  feature,
  subscription,
  onUpgrade,
  onLearnMore,
  preview,
  compact = false,
}: LockedFeatureProps) {
  const { tokens } = useTheme();
  const pricing = usePricing();

  const spec: GatedFeature = feature ??
    GATED_FEATURES[decision.key] ?? {
      entitlementKey: decision.key,
      title: describeEntitlement(decision.key).label,
      pitch: describeEntitlement(decision.key).description ?? 'Available on a paid plan.',
      includes: [],
      icon: 'lock-closed-outline',
    };

  const plan = decision.requiredPlan;
  const cycle = plan ? pricing.cycle(plan.interval) : null;
  const trial = plan && canStartTrial(plan, subscription ?? null) ? pricing.trial(plan) : null;

  const price = plan
    ? pricing.resolve({
        price: plan.price,
        isFree: plan.isFree,
        suffix: plan.isFree ? null : `/ ${cycle!.unit}`,
      })
    : null;

  const spoken = [
    `${spec.title} is locked.`,
    spec.pitch,
    decision.reason,
    price && plan ? `${plan.name} costs ${price.spoken}` : null,
    trial ? `${trial.headline}. ${trial.afterwards}` : null,
    decision.isUpgradePath ? null : 'Upgrading is not what unlocks this for your account.',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <View
      accessible={compact}
      accessibilityRole={compact ? 'summary' : undefined}
      accessibilityLabel={compact ? spoken : undefined}
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-3xl border overflow-hidden"
    >
      {/* The schematic preview. Presentational, and hidden from the accessibility
          tree — a screen reader is told what the feature *is*, which is more
          useful than a description of grey rectangles. */}
      {preview && !compact ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ backgroundColor: tokens.color.surface.background }}
          className="px-4 pt-4 pb-2"
        >
          {preview}
        </View>
      ) : null}

      <View className="p-5">
        <View className="flex-row items-center mb-3">
          <View
            style={{ backgroundColor: tokens.color.neutral[100] }}
            className="w-11 h-11 rounded-2xl items-center justify-center mr-3"
          >
            <Ionicons name={spec.icon as never} size={22} color={tokens.color.primary[600]} />
          </View>

          <View className="flex-1">
            <View className="flex-row items-center">
              <Ionicons name="lock-closed" size={12} color={tokens.color.text.placeholder} />
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[10px] font-black uppercase tracking-widest ml-1"
              >
                On a paid plan
              </Text>
            </View>
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-base font-black tracking-tight mt-0.5"
              accessibilityRole={compact ? undefined : 'header'}
            >
              {spec.title}
            </Text>
          </View>
        </View>

        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-sm font-medium leading-relaxed"
        >
          {spec.pitch}
        </Text>

        {spec.includes.length > 0 && !compact ? (
          <View className="mt-4" style={{ gap: 2 }}>
            {spec.includes.map((line) => (
              <View key={line} className="flex-row items-start py-1">
                <Ionicons
                  name="checkmark-circle"
                  size={15}
                  color={tokens.color.success.default}
                  style={{ marginRight: 8, marginTop: 1 }}
                />
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="flex-1 text-xs font-semibold leading-relaxed"
                >
                  {line}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Where the member is now, and what would change. Both stated, because
            "upgrade" with no starting point is a word rather than a decision. */}
        <View
          style={{ backgroundColor: tokens.color.surface.background }}
          className="rounded-2xl p-3.5 mt-4"
        >
          <PlanLine
            label="You are on"
            value={subscription ? subscription.planCode : 'the free plan'}
            muted
          />
          {plan ? (
            <PlanLine
              label="Included with"
              value={plan.name}
              trailing={price ? price.formatted : undefined}
            />
          ) : (
            <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold leading-relaxed">
              {decision.reason ?? 'This is not on any plan at the moment.'}
            </Text>
          )}
        </View>

        {trial ? (
          <View
            style={{ backgroundColor: tokens.color.success.surface }}
            className="rounded-xl px-3.5 py-2.5 mt-3"
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

        {decision.isUpgradePath && plan ? (
          <>
            <TouchableOpacity
              onPress={onUpgrade}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={
                trial
                  ? `Start the ${plan.trialDays} day free trial of ${plan.name}`
                  : `See ${plan.name} and subscribe`
              }
              accessibilityHint="Opens the plan so you can review it before paying."
              style={{ backgroundColor: tokens.color.primary[500] }}
              className="h-13 rounded-full items-center justify-center mt-4 py-3.5"
            >
              <Text style={{ color: '#FFFFFF' }} className="text-sm font-black tracking-tight">
                {trial ? `Start ${plan.trialDays}-day free trial` : `Get ${plan.name}`}
              </Text>
            </TouchableOpacity>

            {onLearnMore ? (
              <TouchableOpacity
                onPress={onLearnMore}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Compare all the plans"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                className="items-center justify-center mt-3"
              >
                <Text style={{ color: tokens.color.primary[600] }} className="text-xs font-black">
                  Compare all plans
                </Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          // Not an upgrade path: paying would not fix it, so no pay button.
          <View
            style={{ backgroundColor: tokens.color.warning.surface }}
            className="rounded-xl px-3.5 py-3 mt-4"
          >
            <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold leading-relaxed">
              {decision.reason ?? 'This is not available on your account at the moment.'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function PlanLine({
  label,
  value,
  trailing,
  muted = false,
}: {
  label: string;
  value: string;
  trailing?: string;
  muted?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <View className="flex-row items-center justify-between py-1">
      <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-bold">
        {label}
      </Text>
      <View className="flex-row items-baseline">
        <Text
          style={{ color: muted ? tokens.color.text.secondary : tokens.color.text.primary }}
          className="text-xs font-black"
        >
          {value}
        </Text>
        {trailing ? (
          <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-bold ml-1.5">
            {trailing}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The inline nudge, for a locked control inside an otherwise usable screen.
 *
 * A row rather than a card: a full locked-feature card next to every disabled
 * button would drown the screen it is on.
 */
export function UpgradeNudge({
  decision,
  onUpgrade,
}: {
  decision: EntitlementDecision;
  onUpgrade: () => void;
}) {
  const { tokens } = useTheme();

  if (decision.isAvailable) return null;

  return (
    <TouchableOpacity
      onPress={decision.isUpgradePath ? onUpgrade : undefined}
      disabled={!decision.isUpgradePath}
      activeOpacity={0.7}
      accessibilityRole={decision.isUpgradePath ? 'button' : 'text'}
      accessibilityLabel={decision.reason ?? 'This is on a paid plan.'}
      style={{ backgroundColor: tokens.color.neutral[100] }}
      className="flex-row items-center rounded-2xl px-3.5 py-3"
    >
      <Ionicons name="lock-closed" size={15} color={tokens.color.primary[600]} />
      <Text
        style={{ color: tokens.color.text.primary }}
        className="flex-1 text-xs font-semibold leading-relaxed ml-2.5"
      >
        {decision.reason ?? 'This is on a paid plan.'}
      </Text>
      {decision.isUpgradePath ? (
        <Ionicons name="chevron-forward" size={15} color={tokens.color.primary[600]} />
      ) : null}
    </TouchableOpacity>
  );
}
