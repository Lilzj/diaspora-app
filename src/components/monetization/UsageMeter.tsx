// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Entitlement and usage surfaces (Frontend Phase 6)
//
// A meter whose two halves come from different places and are honest about it.
//
// The **ceiling** is real: `Entitlement.value` is served by B15 on both the plan
// and the subscription, and `listings.concurrent: 15` means fifteen.
//
// The **consumption** is not. No usage counter exists on the certified wire
// (MON-GAP-008), so `UsageLimit.consumed` is null against a real backend. A null
// consumption draws no bar at all and says so — because an empty bar reads as
// "none used", which is a specific claim, and it would be a claim nobody made.
//
// This is the difference between a mock that fills a gap and a mock that hides
// one. The bar appears only when there is something real to draw with.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { describeEntitlement, describeEntitlementValue } from '@/lib/entitlements';
import { SimulatedFigureBadge } from './MonetizationGapNotice';
import type { Entitlement } from '@/types/financial';
import type { UsageLimit } from '@/types/monetization';

export interface UsageMeterProps {
  usage: UsageLimit;
  /** Marks the consumption half as simulated. True whenever a counter was used. */
  isSimulated?: boolean;
}

export function UsageMeter({ usage, isSimulated = false }: UsageMeterProps) {
  const { tokens } = useTheme();

  const described = describeEntitlement(usage.key);
  const hasBar = usage.ratio !== null && usage.limit !== null;

  const barColour = !usage.isAtLimit
    ? tokens.color.primary[500]
    : tokens.color.warning.default;

  const spoken = [
    described.label,
    usage.isUnlimited
      ? 'Unlimited'
      : usage.limit !== null
        ? usage.consumed !== null
          ? `${usage.consumed} of ${usage.limit} used`
          : `Your plan allows ${usage.limit}. How many you have used is not available yet.`
        : 'Included',
    usage.isAtLimit ? 'You have reached the limit.' : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={spoken}
      accessibilityValue={
        hasBar && usage.limit !== null && usage.consumed !== null
          ? { min: 0, max: usage.limit, now: usage.consumed }
          : undefined
      }
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-2xl border p-4"
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black tracking-tight">
            {described.label}
          </Text>
          {described.description ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-medium leading-relaxed mt-0.5"
            >
              {described.description}
            </Text>
          ) : null}
        </View>

        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
          {usage.isUnlimited
            ? 'Unlimited'
            : usage.limit !== null
              ? usage.consumed !== null
                ? `${usage.consumed} / ${usage.limit}`
                : String(usage.limit)
              : 'Included'}
        </Text>
      </View>

      {hasBar ? (
        <>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ backgroundColor: tokens.color.neutral[200] }}
            className="h-2 rounded-full overflow-hidden"
          >
            <View
              style={{
                backgroundColor: barColour,
                width: `${Math.round((usage.ratio ?? 0) * 100)}%`,
              }}
              className="h-full rounded-full"
            />
          </View>

          <View className="flex-row items-center justify-between mt-2">
            {usage.isAtLimit ? (
              <View className="flex-row items-center flex-1 mr-2">
                <Ionicons name="alert-circle" size={13} color={tokens.color.warning.default} />
                <Text
                  style={{ color: tokens.color.warning.default }}
                  className="text-[11px] font-bold ml-1 flex-1"
                >
                  You have reached this limit
                </Text>
              </View>
            ) : (
              <View className="flex-1" />
            )}
            {isSimulated ? <SimulatedFigureBadge label="Usage simulated" /> : null}
          </View>
        </>
      ) : usage.limit !== null && !usage.isUnlimited ? (
        // A ceiling with no consumption. The honest rendering of MON-GAP-008.
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-semibold leading-relaxed">
          Your plan allows {usage.limit}. Diaspora cannot show how many you have used yet.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The whole entitlement set, as a list.
 *
 * Every entitlement renders, including ones this build has no label for — they
 * come out of their own dotted key. A plan an operator configures tomorrow shows
 * up here without a client release, which is the property the backend's
 * capability-based contract exists to give.
 */
export function EntitlementList({
  entitlements,
  emptyMessage = 'You are on the free plan.',
}: {
  entitlements: Entitlement[];
  emptyMessage?: string;
}) {
  const { tokens } = useTheme();

  if (entitlements.length === 0) {
    return (
      <View
        style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
        className="rounded-2xl border p-4"
      >
        <Text style={{ color: tokens.color.text.secondary }} className="text-sm font-semibold leading-relaxed">
          {emptyMessage}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-2xl border overflow-hidden"
    >
      {entitlements.map((entitlement, index) => {
        const described = describeEntitlement(entitlement.key);

        return (
          <View
            key={entitlement.key}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${described.label}. ${describeEntitlementValue(entitlement.value)}.${
              described.description ? ` ${described.description}` : ''
            }`}
            style={{
              borderTopColor: tokens.color.border.default,
              borderTopWidth: index === 0 ? 0 : 1,
            }}
            className="flex-row items-center px-4 py-3.5"
          >
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={tokens.color.success.default}
              style={{ marginRight: 12 }}
            />
            <View className="flex-1 mr-2">
              <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold">
                {described.label}
              </Text>
              {described.description ? (
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[11px] font-medium leading-relaxed mt-0.5"
                >
                  {described.description}
                </Text>
              ) : null}
            </View>

            {entitlement.value ? (
              <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-black">
                {describeEntitlementValue(entitlement.value)}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
