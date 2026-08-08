// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Campaign list row (Frontend Phase 6)
//
// ⚠ SIMULATED. MON-GAP-001. ⚠
//
// The row on the advertising dashboard. Budget consumption is the thing an
// advertiser actually scans for, so it is the bar; the status badge carries the
// lifecycle state with an icon and a full sentence, never colour alone.
//
// `spend` and `remaining` both come from the campaign rather than being
// subtracted here, for the same reason a discount is never computed on the
// device: the server owns the arithmetic on money, and a row that disagreed with
// the detail screen by a penny would be a bug nobody could reproduce.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { StatusBadge } from '@/components/financial';
import { usePricing } from '@/providers/pricing-provider';
import { presentCampaignStatus } from '@/lib/monetization-catalog';
import { describeObjective, describePlacements } from './CampaignBuilder';
import type { Campaign } from '@/types/monetization-gaps';

export function CampaignRow({ campaign, onPress }: { campaign: Campaign; onPress: () => void }) {
  const { tokens } = useTheme();
  const pricing = usePricing();

  const status = presentCampaignStatus(campaign.status);
  const objective = describeObjective(campaign.objective);

  const ratio =
    campaign.budget.minorUnits > 0
      ? Math.min(1, Math.max(0, campaign.spend.minorUnits / campaign.budget.minorUnits))
      : 0;

  const spoken = [
    campaign.name,
    status.description,
    `Objective: ${objective.label}`,
    `${pricing.describe(campaign.spend)} spent of ${pricing.describe(campaign.budget)}`,
    `Runs from ${new Date(campaign.startsAt).toLocaleDateString()} to ${new Date(campaign.endsAt).toLocaleDateString()}`,
    campaign.rejectionReason ? `Rejected: ${campaign.rejectionReason}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the campaign so you can manage it."
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-2xl border p-4"
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-black tracking-tight"
            numberOfLines={1}
          >
            {campaign.name}
          </Text>
          <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-semibold mt-0.5" numberOfLines={1}>
            {objective.label} · {describePlacements(campaign.placements)}
          </Text>
        </View>

        <StatusBadge status={status} size="sm" />
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ backgroundColor: tokens.color.neutral[200] }}
        className="h-1.5 rounded-full overflow-hidden mt-2"
      >
        <View
          style={{ backgroundColor: tokens.color.primary[500], width: `${Math.round(ratio * 100)}%` }}
          className="h-full rounded-full"
        />
      </View>

      <View className="flex-row items-center justify-between mt-2">
        <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-bold">
          {pricing.format(campaign.spend)} of {pricing.format(campaign.budget)}
        </Text>
        <View className="flex-row items-center">
          <Ionicons name="calendar-outline" size={12} color={tokens.color.text.placeholder} />
          <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-bold ml-1">
            {new Date(campaign.endsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </Text>
        </View>
      </View>

      {/* A rejection is the one state where the row itself has to carry the
          reason: sending somebody into a detail screen to find out why is the
          worst moment to make them tap again. */}
      {campaign.rejectionReason ? (
        <View style={{ backgroundColor: tokens.color.error.surface }} className="rounded-xl px-3 py-2 mt-3">
          <Text style={{ color: tokens.color.error.default }} className="text-[11px] font-semibold leading-relaxed">
            {campaign.rejectionReason}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

/**
 * The budget summary on a campaign detail screen.
 *
 * Three figures rather than two — budget, spent, left — because "£40 of £100"
 * makes somebody do the subtraction, and the one they care about is the third.
 */
export function CampaignBudgetPanel({ campaign }: { campaign: Campaign }) {
  const { tokens } = useTheme();
  const pricing = usePricing();

  const ratio =
    campaign.budget.minorUnits > 0
      ? Math.min(1, Math.max(0, campaign.spend.minorUnits / campaign.budget.minorUnits))
      : 0;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Budget ${pricing.describe(campaign.budget)}. Spent ${pricing.describe(
        campaign.spend
      )}. Left ${pricing.describe(campaign.remaining)}.`}
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-2xl border p-4"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="flex-row items-end justify-between mb-3"
      >
        {[
          { label: 'Budget', value: pricing.format(campaign.budget), emphasise: false },
          { label: 'Spent', value: pricing.format(campaign.spend), emphasise: true },
          { label: 'Left', value: pricing.format(campaign.remaining), emphasise: false },
        ].map((entry) => (
          <View key={entry.label} className="flex-1">
            <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-black uppercase tracking-widest">
              {entry.label}
            </Text>
            <Text
              style={{ color: tokens.color.text.primary }}
              className={`${entry.emphasise ? 'text-lg' : 'text-sm'} font-black tracking-tight mt-0.5`}
            >
              {entry.value}
            </Text>
          </View>
        ))}
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ backgroundColor: tokens.color.neutral[200] }}
        className="h-2 rounded-full overflow-hidden"
      >
        <View
          style={{ backgroundColor: tokens.color.primary[500], width: `${Math.round(ratio * 100)}%` }}
          className="h-full rounded-full"
        />
      </View>
    </View>
  );
}
