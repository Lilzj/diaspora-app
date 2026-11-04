// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Contextual promote entry (Frontend Phase 6)
//
// §23: contextual entry points where the UX genuinely needs them, without
// duplicating the feature into another navigation tree. A vertical screen drops
// this in and gets the whole promotion surface — the offer, the running state,
// the countdown — without importing anything from the financial layer or
// knowing that placements exist.
//
// It renders three different things depending on what the certified
// `GET /placements/{subjectType}/{subjectId}` says, and nothing at all for
// somebody who does not own the thing:
//
//   Not promoted → the offer.
//   Promoted, comfortably → a quiet confirmation with the days left.
//   Promoted, about to lapse → the warning, with the extend action.
//
// It renders nothing while loading rather than a skeleton: this sits inside
// somebody else's screen, and a placeholder that appears and vanishes is worse
// than a section that simply arrives.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { useSubjectPromotion } from '@/hooks/monetization';
import { describePlacementKind } from '@/lib/monetization-catalog';
import { PROMOTION_TARGETS, type PromotionTargetKey } from '@/types/monetization';

export interface PromoteEntryProps {
  /** Which vertical this is. Decides the verb, the noun and the wire subject type. */
  target: PromotionTargetKey;
  subjectId: string | undefined;
  /** The subject's own title, carried into the promote flow for the review step. */
  title?: string;
  /**
   * Whether the viewer owns the thing.
   *
   * Required and not inferred: only the vertical knows, and a promote button
   * shown to somebody else's listing would be an invitation to pay to promote a
   * stranger's item.
   */
  isOwner: boolean;
}

export function PromoteEntry({ target: targetKey, subjectId, title, isOwner }: PromoteEntryProps) {
  const { tokens } = useTheme();
  const target = PROMOTION_TARGETS[targetKey];

  const promotion = useSubjectPromotion(isOwner ? target : null, subjectId);

  if (!isOwner || !subjectId || promotion.isLoading) return null;

  const open = () =>
    router.push({
      pathname: '/monetization/promote',
      params: { subjectType: String(target.subjectType), subjectId, ...(title ? { title } : {}) },
    });

  // ── Already promoted ───────────────────────────────────────────────────────
  if (promotion.active) {
    const kind = describePlacementKind(promotion.active.kind);
    const days = promotion.daysRemaining;

    const timing =
      days === null
        ? 'It has no end date.'
        : days <= 0
          ? 'It ends today.'
          : `${days} ${days === 1 ? 'day' : 'days'} left.`;

    return (
      <TouchableOpacity
        onPress={() => router.push(`/monetization/promotions/${promotion.active!.placementId}`)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`This ${target.noun} is promoted. ${kind.label}. ${timing} Tap to manage the promotion.`}
        style={{
          backgroundColor: promotion.isExpiringSoon
            ? tokens.color.warning.surface
            : tokens.color.success.surface,
          borderColor: promotion.isExpiringSoon
            ? `${tokens.color.warning.default}44`
            : `${tokens.color.success.default}33`,
        }}
        className="flex-row items-center rounded-2xl border p-4"
      >
        <Ionicons
          name={promotion.isExpiringSoon ? 'alarm-outline' : 'checkmark-circle'}
          size={20}
          color={promotion.isExpiringSoon ? tokens.color.warning.default : tokens.color.success.default}
          style={{ marginRight: 12 }}
        />

        <View className="flex-1 mr-2">
          <Text
            style={{
              color: promotion.isExpiringSoon
                ? tokens.color.warning.default
                : tokens.color.success.default,
            }}
            className="text-[10px] font-black uppercase tracking-widest"
          >
            {promotion.isExpiringSoon ? 'Ending soon' : 'Promoted'}
          </Text>
          <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold mt-0.5">
            {kind.label} · {timing}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
      </TouchableOpacity>
    );
  }

  // ── Not promoted ───────────────────────────────────────────────────────────
  return (
    <TouchableOpacity
      onPress={open}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${target.verb} this ${target.noun}. ${target.benefit}`}
      accessibilityHint="Opens the promotion options with prices."
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.primary[500] }}
      className="flex-row items-center rounded-2xl border p-4"
    >
      <View
        style={{ backgroundColor: tokens.color.neutral[100] }}
        className="w-10 h-10 rounded-xl items-center justify-center mr-3"
      >
        <Ionicons name="trending-up-outline" size={20} color={tokens.color.primary[600]} />
      </View>

      <View className="flex-1 mr-2">
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black tracking-tight">
          {target.verb} this {target.noun}
        </Text>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-medium leading-relaxed mt-0.5"
        >
          {target.benefit}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={tokens.color.primary[600]} />
    </TouchableOpacity>
  );
}
