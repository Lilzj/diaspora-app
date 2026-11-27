// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — one supporter of a fundraising campaign (§14)
//
// A row of the campaign screen's supporter list, lifted out of
// `app/community-life/campaign/[id].tsx` when that list became a FlashList
// (FARCH-004, 27 Nov 2026): the list recycles the row from one supporter to the
// next, and the screen stays within its line budget.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useTheme } from '@/design-system';
import { AmountDisplay } from '@/components/financial';
import type { CampaignSupporter } from '@/types/community-advanced';

/** One supporter: who, what they said, and what they gave where they chose to show it. */
export function CampaignSupporterRow({ supporter }: { supporter: CampaignSupporter }) {
  const { tokens } = useTheme();

  return (
    <View
      className="flex-row items-center py-3"
      style={{ borderBottomWidth: 1, borderBottomColor: tokens.color.border.default }}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${supporter.displayName}${
        supporter.amount
          ? `, ${supporter.amount.symbol ?? ''}${supporter.amount.amount}`
          : ''
      }${supporter.message ? `. ${supporter.message}` : ''}`}
    >
      <View
        style={{ backgroundColor: tokens.color.surface.elevated }}
        className="w-9 h-9 rounded-full items-center justify-center"
      >
        <Ionicons
          name={supporter.isAnonymous ? 'eye-off-outline' : 'person-outline'}
          size={15}
          color={tokens.color.text.placeholder}
        />
      </View>
      <View className="flex-1 ml-3">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-xs font-bold"
        >
          {supporter.displayName}
        </Text>
        {supporter.message ? (
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-semibold mt-0.5 leading-relaxed"
          >
            {supporter.message}
          </Text>
        ) : null}
      </View>
      {supporter.amount ? (
        <AmountDisplay
          value={supporter.amount}
          size="small"
          accessibilityPrefix="Gave"
        />
      ) : null}
    </View>
  );
}

/** The supporter list's rows. Module-level, so the list keeps a row until its supporter changes. */
export function renderCampaignSupporter({ item }: ListRenderItemInfo<CampaignSupporter>) {
  return (
    <View className="px-5">
      <CampaignSupporterRow supporter={item} />
    </View>
  );
}

/** The keys the list has always used: a supporter has no id, and an anonymous one no user. */
export function campaignSupporterKey(supporter: CampaignSupporter, index: number): string {
  return `${supporter.userId ?? 'anon'}-${index}`;
}
