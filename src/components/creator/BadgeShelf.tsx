// ─────────────────────────────────────────────────────────────────────────────
// Badges — one shelf and one sheet, for both screens that show them
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// Creator Studio's Overview had a horizontal shelf of five with a "View all"
// that opened `AchievementsModal`. The creator profile had a wrapped grid of
// every badge and no sheet at all. Same data, two presentations, and only one
// of them scaled.
//
// ── The bug the sheet fixes ──────────────────────────────────────────────────
//
// `AchievementsModal` could not scroll: a `ScrollView` inside a
// `TouchableOpacity` loses the pan to the touchable. `Sheet` from
// `components/overlays/AppModal` handles the scroll, the safe area, the Android
// back button and the assistive-tech modal flag. Using it is the fix.
//
// ── Where the badges come from ───────────────────────────────────────────────
//
// The creator's reputation read, `GET /creators/me/reputation`, since
// 20 Oct 2026: Trust's awards and the creator milestones whose reward is a
// badge, each with the `source` the server named. Before that the shelf showed
// `ALL_CREATOR_BADGES`, a static list with every status written in by hand, and
// then only `GET /trust/badges/me`, which left out the milestone badges.
//
// A read that failed says so. It never says "no badges yet", which would be a
// claim about the member made on the strength of a request that did not answer.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Sheet } from '@/components/overlays/AppModal';
import { useTheme } from '@/design-system';
import { useCreatorReputation } from '@/hooks/creator-economy';
import { badgeSourceLabel, badgeSources, toBadgeItem, type BadgeItem } from '@/config/badges';

const SHELF_PREVIEW = 5;

/** The caller's badges, from the reputation read. */
function useReputationBadges(): { badges: BadgeItem[]; isLoading: boolean; isError: boolean } {
  const { reputation, isLoading, isError } = useCreatorReputation();
  return {
    isLoading,
    isError,
    badges: (reputation?.badges ?? []).map(toBadgeItem),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The shelf
// ─────────────────────────────────────────────────────────────────────────────

interface BadgeShelfProps {
  onViewAll: () => void;
  /** Heading above the shelf. */
  title?: string;
}

/**
 * A single scrolling line of badges, earned first, with a "View all" card.
 *
 * Earned first because the first question a member has is "what have I got",
 * not "what am I missing" — a shelf that opens on locked badges reads as a list
 * of failures.
 */
export function BadgeShelf({ onViewAll, title = '🎖️ Achievements' }: BadgeShelfProps) {
  const { tokens } = useTheme();
  const { badges, isLoading, isError } = useReputationBadges();

  const earned = badges.filter((badge) => badge.isEarned);
  const locked = badges.filter((badge) => !badge.isEarned);
  const ordered = [...earned, ...locked];
  const preview = ordered.slice(0, SHELF_PREVIEW);
  const remaining = ordered.length - preview.length;

  const summary = isError
    ? 'Your badges could not be loaded.'
    : isLoading
      ? 'Loading your badges…'
      : badges.length === 0
        ? 'No badges yet. Verifying your account and claiming creator milestones earn them.'
        : locked.length > 0
          ? `${earned.length} earned, ${locked.length} to go`
          : `${earned.length} earned`;

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-3xl border p-5 mb-5"
      testID="badge-shelf"
    >
      <View className="flex-row justify-between items-center mb-3.5">
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-xs font-bold uppercase tracking-widest"
        >
          {title}
        </Text>

        {ordered.length > 0 ? (
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
        ) : null}
      </View>

      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-semibold mb-3"
      >
        {summary}
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
            accessibilityLabel={`${badge.title}. ${badge.statusText}. ${badgeSourceLabel(badge.source)}.`}
            style={{
              backgroundColor: tokens.color.surface.background,
              borderColor: tokens.color.border.default,
              opacity: badge.isEarned ? 1 : 0.55,
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
                color: badge.isEarned ? tokens.color.success.default : tokens.color.text.placeholder,
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
}

/**
 * Every badge, grouped by the source the server named, in a sheet that scrolls.
 */
export function BadgeSheet({ visible, onClose }: BadgeSheetProps) {
  const { tokens } = useTheme();
  const { badges } = useReputationBadges();

  const earnedCount = badges.filter((badge) => badge.isEarned).length;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Achievements"
      subtitle={`${earnedCount} of ${badges.length} earned`}
      height="88%"
      testID="badge-sheet"
    >
      {badgeSources(badges).map((source) => {
        const inGroup = badges.filter((badge) => badge.source === source);
        const groupEarned = inGroup.filter((badge) => badge.isEarned);
        const groupLocked = inGroup.filter((badge) => !badge.isEarned);

        return (
          <View key={source} className="mb-5">
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-black uppercase tracking-widest mb-2.5"
            >
              {badgeSourceLabel(source)} · {groupEarned.length}/{inGroup.length}
            </Text>

            {[...groupEarned, ...groupLocked].map((badge) => (
              <View
                key={badge.id}
                accessible
                accessibilityLabel={`${badge.title}. ${badge.statusText}.${
                  badge.description ? ` ${badge.description}` : ''
                }`}
                style={{
                  backgroundColor: tokens.color.surface.background,
                  borderColor: tokens.color.border.default,
                  opacity: badge.isEarned ? 1 : 0.6,
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
                        color: badge.isEarned
                          ? tokens.color.success.default
                          : tokens.color.text.placeholder,
                      }}
                      className="text-[9px] font-black uppercase tracking-wider"
                    >
                      {badge.statusText}
                    </Text>
                  </View>

                  {badge.description ? (
                    <Text
                      style={{ color: tokens.color.text.secondary }}
                      className="text-[11px] font-medium mt-1 leading-relaxed"
                    >
                      {badge.description}
                    </Text>
                  ) : null}

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
