// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Promotion preview (Frontend Phase 6)
//
// What the member is about to buy, before they buy it: where the subject will
// appear, how long for, and how much more often it will be shown.
//
// Everything here is read from the certified contract — `placementKind` decides
// where, `durationDays` decides how long, `priorityWeight` decides how much. The
// component makes no claim the backend does not support, which is why there is
// no impressions estimate and no "reach 2,400 people" line: no such figure
// exists (MON-GAP-002), and inventing one on a purchase screen would be the
// worst possible place to invent one.
//
// The "where it appears" mock-up is a schematic rather than a real render of the
// member's own listing. A pixel-accurate preview would need the ranking engine's
// actual output, which no contract exposes; a schematic that shows the *slot*
// promises only what the platform actually delivers.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { describePlacementKind } from '@/lib/monetization-catalog';
import type { PromotionOption, PromotionTarget } from '@/types/monetization';

export interface PromotionPreviewProps {
  target: PromotionTarget;
  option: PromotionOption;
  /** The subject's own title, so the schematic shows the member's actual thing. */
  subjectTitle?: string;
  /** When it starts, when the caller has scheduled it. */
  startsAt?: string | null;
}

export function PromotionPreview({ target, option, subjectTitle, startsAt }: PromotionPreviewProps) {
  const { tokens } = useTheme();
  const kind = describePlacementKind(option.placementKind);

  const endsPhrase = option.durationDays
    ? `Runs for ${option.durationDays} days`
    : 'Runs until you stop it';

  const startPhrase = startsAt
    ? `Starts ${new Date(startsAt).toLocaleDateString()}`
    : 'Starts as soon as the payment clears';

  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={[
        `Preview of your ${kind.label.toLowerCase()} promotion.`,
        kind.where,
        `${startPhrase}. ${endsPhrase}.`,
        `Shown ${option.priorityWeight} times as often as normal.`,
      ].join(' ')}
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-2xl border p-4"
    >
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[10px] font-black uppercase tracking-widest mb-3"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        What you get
      </Text>

      {/* The schematic. Two neutral rows and the member's own subject in the
          promoted slot, so the position is legible without claiming a render. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ backgroundColor: tokens.color.surface.background, borderColor: tokens.color.border.default }}
        className="rounded-xl border p-3 mb-4"
      >
        <View
          style={{
            backgroundColor: tokens.color.primary[50],
            borderColor: tokens.color.primary[500],
          }}
          className="rounded-lg border p-2.5 mb-2"
        >
          <View className="flex-row items-center">
            <Ionicons name={kind.icon as never} size={13} color={tokens.color.primary[600]} />
            <Text
              style={{ color: tokens.color.primary[600] }}
              className="text-[9px] font-black uppercase tracking-widest ml-1"
            >
              {kind.label}
            </Text>
          </View>
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-black mt-1"
            numberOfLines={1}
          >
            {subjectTitle ?? `Your ${target.noun}`}
          </Text>
        </View>

        {[0, 1].map((index) => (
          <View
            key={index}
            style={{ backgroundColor: tokens.color.neutral[100], opacity: 1 - index * 0.3 }}
            className="rounded-lg h-8 mb-1.5"
          />
        ))}

        <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-semibold mt-1">
          Other {target.plural}
        </Text>
      </View>

      <View style={{ gap: 2 }}>
        <PreviewFact icon={kind.icon} text={kind.where} />
        <PreviewFact icon="calendar-outline" text={`${startPhrase}. ${endsPhrase}.`} />
        <PreviewFact
          icon="trending-up-outline"
          text={`Shown ${option.priorityWeight}× as often as an unpromoted ${target.noun}.`}
        />
        {option.isRenewable ? (
          <PreviewFact icon="refresh-outline" text="You can buy it again when it ends." />
        ) : (
          <PreviewFact icon="information-circle-outline" text="This one cannot be repeated on the same item." />
        )}
      </View>
    </View>
  );
}

function PreviewFact({ icon, text }: { icon: string; text: string }) {
  const { tokens } = useTheme();
  return (
    <View
      className="flex-row items-start py-1"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons
        name={icon as never}
        size={14}
        color={tokens.color.text.placeholder}
        style={{ marginRight: 8, marginTop: 2 }}
      />
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="flex-1 text-xs font-semibold leading-relaxed"
      >
        {text}
      </Text>
    </View>
  );
}

/**
 * The one-line version, for a review row inside the payment sheet.
 *
 * Returns the details array `PaymentSheet` takes, so the sheet renders promotion
 * specifics without knowing what a promotion is — the same composition rule that
 * keeps Marketplace out of the payment layer.
 */
export function promotionReviewDetails(
  target: PromotionTarget,
  option: PromotionOption,
  startsAt?: string | null
): { label: string; value: string }[] {
  const kind = describePlacementKind(option.placementKind);

  return [
    { label: 'What', value: `${kind.label} on your ${target.noun}` },
    ...(option.durationDays ? [{ label: 'Runs for', value: `${option.durationDays} days` }] : []),
    {
      label: 'Starts',
      value: startsAt ? new Date(startsAt).toLocaleDateString() : 'When the payment clears',
    },
    { label: 'Visibility', value: `${option.priorityWeight}× normal` },
  ];
}
