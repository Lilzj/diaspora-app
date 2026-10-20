// ─────────────────────────────────────────────────────────────────────────────
// Badges — one shelf and one sheet, for both screens that show them
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// Creator Studio's Overview had a horizontal shelf of five with a "View all"
// that opened `AchievementsModal`. The creator profile had a wrapped grid of
// every badge and no sheet at all. Same data, two presentations, and only one
// of them scaled — the grid was fine at six badges and a wall at thirty-two.
//
// ── The bug the sheet fixes ──────────────────────────────────────────────────
//
// `AchievementsModal` could not scroll. Its body was:
//
//     <TouchableOpacity …>          ← backdrop, closes on press
//       <TouchableOpacity …>        ← the sheet card
//         <ScrollView>              ← never received the gesture
//
// A `ScrollView` inside a `TouchableOpacity` loses the pan to the touchable,
// so the list was stuck at whatever fitted. With twelve badges that was
// survivable; with thirty-two it hid two thirds of them.
//
// `Sheet` from `components/overlays/AppModal` already solves this — it is the
// primitive 35 hand-rolled bottom sheets were consolidated onto, and it handles
// the scroll, the safe area, the Android back button and the assistive-tech
// modal flag. Using it is the fix.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Sheet } from '@/components/overlays/AppModal';
import { useTheme } from '@/design-system';
import { useMyBadges } from '@/hooks/trust';
import type { WireBadge } from '@/types/trust';
import {
  BADGE_GROUP_LABELS,
  BADGE_GROUP_ORDER,
  isBadgeEarned,
  type BadgeItem,
} from '@/config/badges';

const SHELF_PREVIEW = 5;

/**
 * The badges this member has actually been awarded (`GET /trust/badges/me`).
 *
 * Since 20 Oct 2026. The shelf showed `ALL_CREATOR_BADGES`, a static list with
 * every status written in by hand ("UK Residency Verified" to a member in
 * Mauritius, 20 of 32 "earned" for everybody), in every build.
 */
function useEarnedBadges(): { badges: BadgeItem[]; isLoading: boolean } {
  const { badges, isLoading } = useMyBadges();
  return {
    isLoading,
    badges: badges.map((badge: WireBadge) => ({
      id: `${badge.type}-${badge.countryCode ?? ''}`,
      icon: BADGE_ICONS[badge.type] ?? '🏅',
      title: badge.label,
      description: badge.since ? `Earned in ${badge.since}.` : 'Awarded by Diaspora.',
      status: 'unlocked' as const,
      statusText: 'EARNED',
      group: 'trust' as const,
    })),
  };
}

const BADGE_ICONS: Record<string, string> = {
  PhoneVerified: '📱',
  EmailVerified: '✉️',
  CountryVerified: '🏠',
  DiasporaVerified: '🌍',
  GovernmentIdVerified: '🪪',
  EarlyMember: '🚀',
  VerifiedMember: '✅',
};

// ─────────────────────────────────────────────────────────────────────────────
// The shelf
// ─────────────────────────────────────────────────────────────────────────────

interface BadgeShelfProps {
  onViewAll: () => void;
  badges?: BadgeItem[];
  /** Heading above the shelf. */
  title?: string;
}

/**
 * A single scrolling line of badges, earned first, with a "View all" card.
 *
 * Earned first because the first question a member has is "what have I got",
 * not "what am I missing" — a shelf that opens on five locked badges reads as
 * a list of failures.
 */
export function BadgeShelf({
  onViewAll,
  badges: given,
  title = '🎖️ Achievements',
}: BadgeShelfProps) {
  const { tokens } = useTheme();
  const earnedBadges = useEarnedBadges();
  const badges = given ?? earnedBadges.badges;

  const earned = badges.filter(isBadgeEarned);
  const locked = badges.filter((badge) => !isBadgeEarned(badge));
  const ordered = [...earned, ...locked];
  const preview = ordered.slice(0, SHELF_PREVIEW);
  const remaining = ordered.length - preview.length;

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-3xl border p-5 mb-5"
    >
      <View className="flex-row justify-between items-center mb-3.5">
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-xs font-bold uppercase tracking-widest"
        >
          {title}
        </Text>

        <Pressable
          onPress={onViewAll}
          accessibilityRole="button"
          accessibilityLabel={`View all ${ordered.length} badges`}
          hitSlop={8}
        >
          <Text
            style={{ color: tokens.color.text.brand }}
            className="text-xs font-black uppercase tracking-tight"
          >
            View all ({ordered.length}) →
          </Text>
        </Pressable>
      </View>

      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-semibold mb-3"
      >
        {badges.length === 0
          ? 'No badges yet. Verifying your account and publishing earn them.'
          : locked.length > 0
            ? `${earned.length} earned, ${locked.length} to go`
            : `${earned.length} earned`}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'center' }}
      >
        {preview.map((badge) => (
          <View
            key={badge.id}
            accessible
            accessibilityLabel={`${badge.title}. ${badge.statusText}.`}
            style={{
              backgroundColor: tokens.color.surface.background,
              borderColor: tokens.color.border.default,
              opacity: isBadgeEarned(badge) ? 1 : 0.55,
            }}
            className="items-center justify-center p-3 rounded-2xl border w-28 h-28 mr-3"
          >
            <Text className="text-2xl mb-1">{badge.icon}</Text>
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[9px] font-black text-center"
              numberOfLines={2}
            >
              {badge.title}
            </Text>
            <Text
              style={{
                color: isBadgeEarned(badge)
                  ? tokens.color.success.default
                  : tokens.color.text.placeholder,
              }}
              className="text-[8px] font-bold mt-0.5"
              numberOfLines={1}
            >
              {badge.statusText}
            </Text>
          </View>
        ))}

        {remaining > 0 ? (
          <Pressable
            onPress={onViewAll}
            accessibilityRole="button"
            accessibilityLabel={`View all badges, ${remaining} more`}
            style={{
              backgroundColor: tokens.color.primary[50],
              borderColor: tokens.color.primary[500],
            }}
            className="items-center justify-center p-3 rounded-2xl border w-28 h-28 mr-3"
          >
            <Text className="text-xl mb-1">🎖️</Text>
            <Text
              style={{ color: tokens.color.primary[600] }}
              className="text-[10px] font-black text-center"
            >
              View all
            </Text>
            <Text
              style={{ color: tokens.color.text.brand }}
              className="text-[8px] font-bold mt-0.5"
            >
              +{remaining} more →
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The sheet
// ─────────────────────────────────────────────────────────────────────────────

interface BadgeSheetProps {
  visible: boolean;
  onClose: () => void;
  badges?: BadgeItem[];
}

/**
 * Every badge, grouped, in a sheet that scrolls.
 *
 * Grouped rather than one long list: thirty-two in a flat column tells a member
 * nothing except that there are a lot. By group they can see they have every
 * trust badge and have not started community life, which is the only thing a
 * locked badge is good for.
 */
export function BadgeSheet({ visible, onClose, badges: given }: BadgeSheetProps) {
  const { tokens } = useTheme();
  const earnedBadges = useEarnedBadges();
  const badges = given ?? earnedBadges.badges;

  const earnedCount = badges.filter(isBadgeEarned).length;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Achievements"
      subtitle={`${earnedCount} of ${badges.length} earned`}
      height="88%"
      testID="badge-sheet"
    >
      {BADGE_GROUP_ORDER.map((group) => {
        const inGroup = badges.filter((badge) => badge.group === group);
        if (inGroup.length === 0) return null;

        const groupEarned = inGroup.filter(isBadgeEarned);
        const groupLocked = inGroup.filter((badge) => !isBadgeEarned(badge));

        return (
          <View key={group} className="mb-5">
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-black uppercase tracking-widest mb-2.5"
            >
              {BADGE_GROUP_LABELS[group]} · {groupEarned.length}/{inGroup.length}
            </Text>

            {[...groupEarned, ...groupLocked].map((badge) => (
              <View
                key={badge.id}
                accessible
                accessibilityLabel={`${badge.title}. ${badge.statusText}. ${badge.description}`}
                style={{
                  backgroundColor: tokens.color.surface.background,
                  borderColor: tokens.color.border.default,
                  opacity: isBadgeEarned(badge) ? 1 : 0.6,
                }}
                className="flex-row items-start rounded-2xl border p-3.5 mb-2"
              >
                <Text className="text-2xl mr-3">{badge.icon}</Text>

                <View className="flex-1">
                  <View className="flex-row items-center justify-between">
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-[13px] font-black flex-1 mr-2"
                    >
                      {badge.title}
                    </Text>
                    <Text
                      style={{
                        color: isBadgeEarned(badge)
                          ? tokens.color.success.default
                          : tokens.color.text.placeholder,
                      }}
                      className="text-[9px] font-black uppercase tracking-wider"
                    >
                      {badge.statusText}
                    </Text>
                  </View>

                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-[11px] font-medium mt-1 leading-relaxed"
                  >
                    {badge.description}
                  </Text>

                  {badge.progress ? (
                    <Text
                      style={{ color: tokens.color.text.brand }}
                      className="text-[10px] font-black mt-1.5"
                    >
                      {badge.progress}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </Sheet>
  );
}
