// ─────────────────────────────────────────────────────────────────────────────
// A creator's reputation, as the server composed it
//
// Since 20 Oct 2026, from `GET /creators/me/reputation` (the creator's own
// screens) and `GET /creators/{creatorId}/reputation` (a public profile). The
// server composes it from Trust, Community, Guides and Creator, and says what
// it cannot answer in `unavailable`, with its reason.
//
// Three rules this component keeps, because each is the failure it replaces:
//
//   * **Nothing is computed here.** The level, the score, the points to the next
//     level and every count are printed as served.
//   * **Nothing is zero-filled.** A figure the server withheld or does not
//     measure is listed under "Not available" with the server's own reason —
//     never drawn as a zero that reads as "nobody", and never left out so that
//     its absence goes unexplained.
//   * **A badge says where it came from.** Trust's awards and creator milestone
//     badges are different things; the `source` the server named is shown.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/design-system';
import { badgeSourceLabel, toBadgeItem } from '@/config/badges';
import { useCreatorReputation, usePublicCreatorReputation } from '@/hooks/creator-economy';
import type { CreatorReputation } from '@/types/creator-economy';

interface ReputationPanelProps {
  reputation: CreatorReputation;
  /**
   * Whether to list the earned badges here. Off on the creator's own screens,
   * which show them on the badge shelf.
   */
  showBadges?: boolean;
  testID?: string;
}

export function ReputationPanel({ reputation, showBadges = false, testID }: ReputationPanelProps) {
  const { tokens } = useTheme();

  const earnedBadges = reputation.badges.filter((badge) => badge.isEarned).map(toBadgeItem);

  return (
    <View
      testID={testID ?? 'reputation-panel'}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-3xl border p-5 mb-5"
    >
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-xs font-bold uppercase tracking-widest mb-2"
      >
        Reputation
      </Text>

      {/* ── Level and score ──────────────────────────────────────────────── */}
      <View className="flex-row items-baseline justify-between">
        <Text style={{ color: tokens.color.text.primary }} className="text-lg font-black">
          {reputation.tierLabel}
        </Text>
        {reputation.score !== null && reputation.score !== undefined ? (
          <Text
            style={{ color: tokens.color.text.brand, fontVariant: ['tabular-nums'] }}
            className="text-sm font-black"
          >
            {reputation.score.toLocaleString()} points
          </Text>
        ) : null}
      </View>

      {reputation.pointsToNextTier !== null &&
      reputation.pointsToNextTier !== undefined &&
      reputation.nextTierLabel ? (
        <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-semibold mt-1">
          {reputation.pointsToNextTier.toLocaleString()} points to {reputation.nextTierLabel}
        </Text>
      ) : null}

      {/* ── Dimensions ───────────────────────────────────────────────────── */}
      {reputation.dimensions.length > 0 ? (
        <View className="mt-3">
          {reputation.dimensions.map((dimension) => (
            <View key={dimension.key} className="mb-2" testID={`reputation-dimension-${dimension.key}`}>
              <View className="flex-row justify-between">
                <Text style={{ color: tokens.color.text.primary }} className="text-[12px] font-bold">
                  {dimension.label}
                </Text>
                <Text
                  style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
                  className="text-[12px] font-black"
                >
                  {dimension.maxScore !== null && dimension.maxScore !== undefined
                    ? `${dimension.score.toLocaleString()} / ${dimension.maxScore.toLocaleString()}`
                    : dimension.score.toLocaleString()}
                </Text>
              </View>
              {dimension.description ? (
                <Text style={{ color: tokens.color.text.secondary }} className="text-[10px] mt-0.5">
                  {dimension.description}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {/* ── Signals: the counts behind the figures ──────────────────────── */}
      {reputation.signals.length > 0 ? (
        <View className="flex-row flex-wrap -mx-1 mt-2">
          {reputation.signals.map((signal) => (
            <View
              key={signal.key}
              testID={`reputation-signal-${signal.key}`}
              accessible
              accessibilityLabel={`${signal.label}: ${signal.value.toLocaleString()}`}
              className="w-1/2 px-1 mb-2"
            >
              <View
                style={{
                  backgroundColor: tokens.color.surface.background,
                  borderColor: tokens.color.border.default,
                }}
                className="rounded-2xl border px-3 py-2"
              >
                <Text
                  style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
                  className="text-base font-black"
                >
                  {signal.value.toLocaleString()}
                </Text>
                <Text style={{ color: tokens.color.text.secondary }} className="text-[10px] font-semibold">
                  {signal.label}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* ── Earned badges (public profile) ───────────────────────────────── */}
      {showBadges && earnedBadges.length > 0 ? (
        <View className="mt-2">
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest mb-1.5"
          >
            Badges
          </Text>
          <View className="flex-row flex-wrap">
            {earnedBadges.map((badge) => (
              <View
                key={badge.id}
                testID={`reputation-badge-${badge.id}`}
                accessible
                accessibilityLabel={`${badge.title}. ${badgeSourceLabel(badge.source)}.`}
                style={{
                  backgroundColor: tokens.color.surface.background,
                  borderColor: tokens.color.border.default,
                }}
                className="flex-row items-center rounded-full border px-3 py-1 mr-2 mb-2"
              >
                <Text className="text-sm mr-1">{badge.icon}</Text>
                <Text style={{ color: tokens.color.text.primary }} className="text-[11px] font-bold">
                  {badge.title}
                </Text>
                <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] ml-1">
                  · {badgeSourceLabel(badge.source)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── What the server could not answer, and why ───────────────────── */}
      {reputation.unavailable.length > 0 ? (
        <View className="mt-2" testID="reputation-unavailable">
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest mb-1.5"
          >
            Not available
          </Text>
          {reputation.unavailable.map((item) => (
            <View key={item.key} className="mb-1.5">
              <Text style={{ color: tokens.color.text.primary }} className="text-[11px] font-bold">
                {item.label}
              </Text>
              <Text style={{ color: tokens.color.text.secondary }} className="text-[10px]">
                {item.reason}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A one-line state for a reputation read that has not answered. */
function ReputationState({ text }: { text: string }) {
  const { tokens } = useTheme();
  return (
    <View
      testID="reputation-state"
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-3xl border p-5 mb-5"
    >
      <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-semibold">
        {text}
      </Text>
    </View>
  );
}

/** The caller's own reputation, on the creator's own screens. */
export function MyReputationPanel() {
  const { reputation, isLoading, isError } = useCreatorReputation();

  if (reputation) return <ReputationPanel reputation={reputation} />;
  if (isError) return <ReputationState text="Your reputation could not be loaded." />;
  if (isLoading) return <ReputationState text="Loading your reputation…" />;
  return null;
}

/**
 * A creator's public reputation, on their public profile. A creator the server
 * does not show publicly renders nothing; a failed read says so.
 */
export function PublicReputationPanel({ creatorId }: { creatorId: string }) {
  const { reputation, isError } = usePublicCreatorReputation(creatorId);

  if (reputation) return <ReputationPanel reputation={reputation} showBadges />;
  if (isError) return <ReputationState text="Their reputation could not be loaded." />;
  return null;
}
