// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Promotion cards (Frontend Phase 6)
//
// The management and history surfaces. One row component serves "My Promotions",
// the dashboard's active list and the per-entity history, because they are the
// same object in three places and three components would drift.
//
// Status is never carried by colour alone: every row has a `<StatusBadge>` whose
// icon and full-sentence description come from `presentPlacementStatus`, and the
// row's own accessibility label repeats the state in words. §32.
//
// The countdown is the piece most worth getting right. B15 emits no
// `placement.expiring` event (MON-GAP-004), so this row is the only warning a
// member gets before a promotion lapses — which is why an expiring promotion is
// visually distinct here rather than just sorted higher.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { StatusBadge } from '@/components/financial';
import { usePricing } from '@/providers/pricing-provider';
import { presentPlacementStatus, describeSubjectType } from '@/lib/financial-status';
import { describePlacementKind } from '@/lib/monetization-catalog';
import type { Promotion } from '@/types/monetization';

export interface PromotionRowProps {
  promotion: Promotion;
  onPress: () => void;
  /** Hides the subject-type line where the surrounding list is already one type. */
  hideSubject?: boolean;
}

export function PromotionRow({ promotion, onPress, hideSubject = false }: PromotionRowProps) {
  const { tokens } = useTheme();
  const pricing = usePricing();

  const status = presentPlacementStatus(promotion.status);
  const kind = describePlacementKind(promotion.kind);
  const subjectLabel = promotion.target
    ? promotion.target.noun
    : describeSubjectType(promotion.subjectType);

  const timing = describeTiming(promotion);

  const spoken = [
    `${kind.label} promotion on your ${subjectLabel}`,
    status.description,
    timing.spoken,
    promotion.paid ? `Paid ${pricing.describe(promotion.paid)}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the promotion so you can manage it."
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: promotion.isExpiringSoon ? tokens.color.warning.default : tokens.color.border.default,
        borderWidth: promotion.isExpiringSoon ? 1.5 : 1,
      }}
      className="rounded-2xl border p-4"
    >
      <View className="flex-row items-start">
        <View
          style={{ backgroundColor: tokens.color.neutral[100] }}
          className="w-10 h-10 rounded-xl items-center justify-center mr-3"
        >
          <Ionicons
            name={(promotion.target?.icon ?? kind.icon) as never}
            size={19}
            color={tokens.color.text.secondary}
          />
        </View>

        <View className="flex-1 mr-2">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-black tracking-tight"
            numberOfLines={1}
          >
            {kind.label}
          </Text>

          {!hideSubject ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold mt-0.5"
              numberOfLines={1}
            >
              on your {subjectLabel}
            </Text>
          ) : null}

          <View className="mt-2">
            <StatusBadge status={status} size="sm" />
          </View>
        </View>

        <View className="items-end">
          {promotion.paid ? (
            <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black tracking-tight">
              {pricing.format(promotion.paid)}
            </Text>
          ) : null}
          <Ionicons
            name="chevron-forward"
            size={16}
            color={tokens.color.text.placeholder}
            style={{ marginTop: 6 }}
          />
        </View>
      </View>

      <View
        style={{ borderTopColor: tokens.color.border.default }}
        className="flex-row items-center border-t mt-3 pt-2.5"
      >
        <Ionicons
          name={timing.icon as never}
          size={13}
          color={promotion.isExpiringSoon ? tokens.color.warning.default : tokens.color.text.placeholder}
        />
        <Text
          style={{
            color: promotion.isExpiringSoon ? tokens.color.warning.default : tokens.color.text.placeholder,
          }}
          className="text-[11px] font-bold ml-1.5 flex-1"
        >
          {timing.label}
        </Text>

        <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-bold">
          {promotion.priorityWeight}× visibility
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/**
 * When a promotion runs, in one line.
 *
 * Four cases and each says something different: scheduled but not started, live
 * with time left, live and about to lapse, and finished. "Ends in 0 days" is
 * deliberately rendered as "Ends today" — a countdown that says zero reads as
 * broken.
 */
export function describeTiming(promotion: Promotion): {
  label: string;
  spoken: string;
  icon: string;
} {
  if (promotion.status === 'Scheduled') {
    const date = new Date(promotion.startsAt).toLocaleDateString();
    return {
      label: `Starts ${date}`,
      spoken: `It has not started yet. It begins on ${date}`,
      icon: 'calendar-outline',
    };
  }

  if (!promotion.isActive) {
    const date = promotion.endsAt ? new Date(promotion.endsAt).toLocaleDateString() : null;
    return {
      label: date ? `Ended ${date}` : 'Finished',
      spoken: date ? `It finished on ${date}` : 'It has finished',
      icon: 'flag-outline',
    };
  }

  if (promotion.daysRemaining === null) {
    return {
      label: 'Running — no end date',
      spoken: 'It is running with no end date',
      icon: 'infinite-outline',
    };
  }

  if (promotion.daysRemaining === 0) {
    return { label: 'Ends today', spoken: 'It ends today', icon: 'alarm-outline' };
  }

  return {
    label: `${promotion.daysRemaining} ${promotion.daysRemaining === 1 ? 'day' : 'days'} left`,
    spoken: `${promotion.daysRemaining} ${promotion.daysRemaining === 1 ? 'day' : 'days'} left`,
    icon: promotion.isExpiringSoon ? 'alarm-outline' : 'time-outline',
  };
}

/**
 * The prominent card on the monetization dashboard, for a promotion about to
 * lapse.
 *
 * Separate from the row because it does a different job: the row lists, this one
 * interrupts. It carries the renewal action directly, because a warning whose
 * remedy is two taps away is a warning people scroll past.
 */
export function ExpiringPromotionCard({
  promotion,
  onRenew,
  onView,
}: {
  promotion: Promotion;
  onRenew: () => void;
  onView: () => void;
}) {
  const { tokens } = useTheme();
  const kind = describePlacementKind(promotion.kind);
  const timing = describeTiming(promotion);
  const subjectLabel = promotion.target?.noun ?? describeSubjectType(promotion.subjectType);

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`Your ${kind.label.toLowerCase()} promotion on your ${subjectLabel} ${timing.spoken}.`}
      style={{ backgroundColor: tokens.color.warning.surface, borderColor: `${tokens.color.warning.default}44` }}
      className="rounded-2xl border p-4"
    >
      <View className="flex-row items-center mb-1.5">
        <Ionicons name="alarm-outline" size={16} color={tokens.color.warning.default} />
        <Text
          style={{ color: tokens.color.warning.default }}
          className="text-[10px] font-black uppercase tracking-widest ml-1.5"
        >
          {timing.label}
        </Text>
      </View>

      <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black tracking-tight">
        Your {kind.label.toLowerCase()} on your {subjectLabel} is ending
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-medium leading-relaxed mt-1"
      >
        When it ends, your {subjectLabel} goes back to its normal position.
      </Text>

      <View className="flex-row mt-3.5" style={{ gap: 8 }}>
        {promotion.isRenewable ? (
          <TouchableOpacity
            onPress={onRenew}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Extend the promotion on your ${subjectLabel}`}
            style={{ backgroundColor: tokens.color.primary[500] }}
            className="flex-1 h-11 rounded-full items-center justify-center"
          >
            <Text style={{ color: '#FFFFFF' }} className="text-xs font-black tracking-tight">
              Extend it
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          onPress={onView}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="See this promotion"
          style={{ borderColor: tokens.color.border.default }}
          className={`${promotion.isRenewable ? '' : 'flex-1'} h-11 rounded-full border items-center justify-center px-5`}
        >
          <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black tracking-tight">
            See it
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
