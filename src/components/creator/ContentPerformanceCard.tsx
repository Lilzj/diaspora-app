// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — one of a creator's items, with its figures
//
// The row of "Your content" on the creator dashboard (`/creator/analytics`).
// Lifted out of the screen on 27 Nov 2026 (FARCH-004), when that list became a
// FlashList: the screen draws one of these per row and keeps its line budget.
// It holds no state of its own, so a recycled row has nothing to carry over.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { formatCount } from '@/lib/domain/creator-economy';
import { formatRelativeTime } from '@/utils/format';
import type { CreatorContentPerformance } from '@/types/creator-economy';

/**
 * One of the member's items, with its figures.
 *
 * A button only when the item has an analytics page to open — a guide, an
 * update, an event, a job, a listing or a home. A provider profile or an
 * organisation has a row but no page, so its card is not pressable and carries
 * no chevron: a button that goes nowhere is what every row used to be.
 */
export function ContentPerformanceCard({
  item,
  route,
  onOpen,
}: {
  item: CreatorContentPerformance;
  route: string | null;
  onOpen: (item: CreatorContentPerformance, route: string) => void;
}) {
  const { tokens } = useTheme();

  const label = [
    item.title,
    `${item.contentType}, ${item.status}.`,
    ...item.metrics.map((metric) => `${metric.label}: ${formatCount(metric.value)}.`),
    item.isSponsored ? 'Currently sponsored.' : null,
    item.revenue ? `Earned ${item.revenue.currency} ${item.revenue.amount.toFixed(2)}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const cardStyle = {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.border.default,
  };

  const body = (
    <>
      <View className="flex-row items-start justify-between mb-2.5">
        <View className="flex-1 mr-2">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-[13px] font-bold leading-snug"
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <View className="flex-row items-center mt-1">
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold"
            >
              {String(item.contentType)} · {item.status}
              {item.publishedAt ? ` · ${formatRelativeTime(item.publishedAt)}` : ''}
            </Text>
          </View>
        </View>

        {item.isSponsored ? (
          <View
            style={{ backgroundColor: tokens.color.neutral[100] }}
            className="flex-row items-center rounded-full px-2 py-0.5"
          >
            <Ionicons name="megaphone" size={9} color={tokens.color.primary[600]} />
            <Text
              style={{ color: tokens.color.primary[600] }}
              className="text-[9px] font-black uppercase tracking-widest ml-1"
            >
              Sponsored
            </Text>
          </View>
        ) : null}

        {route ? (
          <Ionicons
            name="chevron-forward"
            size={16}
            color={tokens.color.text.placeholder}
            style={{ marginLeft: 6, marginTop: 1 }}
          />
        ) : null}
      </View>

      <View className="flex-row flex-wrap">
        {item.metrics.map((metric) => (
          <View key={metric.key} className="mr-5 mb-1">
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[9px] font-black uppercase tracking-widest"
            >
              {metric.label}
            </Text>
            <Text
              style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
              className="text-[15px] font-black"
            >
              {metric.format === 'percentage'
                ? `${metric.value.toFixed(1)}%`
                : formatCount(metric.value)}
            </Text>
          </View>
        ))}

        {item.revenue ? (
          <View className="mb-1">
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[9px] font-black uppercase tracking-widest"
            >
              Earned
            </Text>
            <Text
              style={{ color: tokens.color.success.default, fontVariant: ['tabular-nums'] }}
              className="text-[15px] font-black"
            >
              {item.revenue.symbol ?? ''}
              {item.revenue.amount.toFixed(2)}
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );

  if (!route) {
    return (
      <View accessible accessibilityLabel={label} style={cardStyle} className="rounded-2xl border p-4 mb-2.5">
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens how this item is doing"
      onPress={() => onOpen(item, route)}
      style={cardStyle}
      className="rounded-2xl border p-4 mb-2.5"
    >
      {body}
    </Pressable>
  );
}
