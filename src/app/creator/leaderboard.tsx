// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator leaderboards (Frontend Phase 7, §32)
//
// §32: "Do not create authoritative ranking logic in frontend."
//
// Nothing is ranked here. The scope and the period go up, an ordered page comes
// back, and it is rendered in the order it arrived. The two things this screen
// insists on are both about honesty rather than ranking:
//
//   **The score is labelled.** A rank without a scoring rule is a number
//   somebody will argue with. `scoreLabel` and `periodLabel` are served and
//   always shown.
//
//   **The viewer's own position is always visible**, even when it falls off the
//   page — `viewerEntry` comes back separately for exactly that reason, and it
//   is pinned above the list rather than being something to scroll for.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  CreatorCard,
  CreatorCardSkeleton,
  CreatorEmptyState,
  CreatorScreen,
  LeaderboardHeader,
  LeaderboardRow,
} from '@/components/creator-economy';
import { useCreatorLeaderboard } from '@/hooks/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';

const SCOPES = [
  { key: 'top-creators', label: 'Top creators' },
  { key: 'top-contributors', label: 'Contributors' },
  { key: 'country', label: 'Your country' },
  { key: 'community', label: 'Your community' },
] as const;

const PERIODS = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
] as const;

export default function CreatorLeaderboardScreen() {
  const { tokens } = useTheme();

  const [scope, setScope] = useState<string>('top-creators');
  const [period, setPeriod] = useState<string>('30d');
  const [isRefreshing, setRefreshing] = useState(false);

  const query = useCreatorLeaderboard({ scope, period });

  useEffect(() => {
    trackCreatorEvent('creator.leaderboard.viewed', { scope, period });
  }, [scope, period]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    query.refetch();
    setRefreshing(false);
  }, [query]);

  const leaderboard = query.leaderboard;
  const viewer = leaderboard?.viewerEntry;

  return (
    <CreatorScreen
      title="Leaderboards"
      subtitle="Where you stand"
      gapKey="leaderboards"
      isEnabled={query.isEnabled}
      isLoading={query.isLoading}
      error={query.error}
      onRetry={query.refetch}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      sticky={
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderBottomColor: tokens.color.border.default,
          }}
          className="border-b px-5 py-3"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 16, paddingBottom: 8 }}
          >
            {SCOPES.map((item) => {
              const isActive = scope === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${item.label} leaderboard`}
                  onPress={() => setScope(item.key)}
                  style={{
                    backgroundColor: isActive
                      ? tokens.color.primary[500]
                      : tokens.color.surface.background,
                    borderColor: isActive ? tokens.color.primary[500] : tokens.color.border.default,
                  }}
                  className="rounded-full border px-3.5 py-2 mr-2"
                >
                  <Text
                    style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                    className="text-[11px] font-black"
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View className="flex-row">
            {PERIODS.map((item) => {
              const isActive = period === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`Ranked over ${item.label}`}
                  onPress={() => setPeriod(item.key)}
                  className="mr-4"
                >
                  <Text
                    style={{
                      color: isActive ? tokens.color.primary[500] : tokens.color.text.placeholder,
                    }}
                    className="text-[11px] font-black uppercase tracking-wider"
                  >
                    {item.label}
                  </Text>
                  {isActive ? (
                    <View
                      style={{ backgroundColor: tokens.color.primary[500] }}
                      className="h-0.5 rounded-full mt-1"
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      }
    >
      <View className="px-5 pt-5">
        {query.isLoading ? (
          <CreatorCardSkeleton rows={4} />
        ) : !leaderboard || leaderboard.entries.length === 0 ? (
          <CreatorEmptyState
            icon="podium-outline"
            title="No ranking yet"
            body="Diaspora has not published a ranking for this scope and period."
          />
        ) : (
          <>
            <LeaderboardHeader leaderboard={leaderboard} />

            {/* The viewer's position, pinned. Always visible, even when off-page. */}
            {viewer ? (
              <View
                style={{ backgroundColor: tokens.color.primary[50] }}
                className="rounded-2xl p-3.5 mb-4"
                accessible
                accessibilityLabel={`Your position: rank ${viewer.rank} with ${viewer.score.toLocaleString()} ${leaderboard.scoreLabel.toLowerCase()}.`}
              >
                <Text
                  style={{ color: tokens.color.primary[600] }}
                  className="text-[10px] font-black uppercase tracking-widest mb-1"
                >
                  Where you are
                </Text>
                <View className="flex-row items-baseline">
                  <Text
                    style={{ color: tokens.color.primary[600], fontVariant: ['tabular-nums'] }}
                    className="text-2xl font-black"
                  >
                    #{viewer.rank}
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-[12px] font-bold ml-2"
                  >
                    {viewer.score.toLocaleString()} {leaderboard.scoreLabel.toLowerCase()}
                  </Text>
                  {viewer.rankDelta ? (
                    <View className="flex-row items-center ml-2">
                      <Ionicons
                        name={viewer.rankDelta > 0 ? 'arrow-up' : 'arrow-down'}
                        size={11}
                        color={
                          viewer.rankDelta > 0
                            ? tokens.color.success.default
                            : tokens.color.warning.default
                        }
                      />
                      <Text
                        style={{
                          color:
                            viewer.rankDelta > 0
                              ? tokens.color.success.default
                              : tokens.color.warning.default,
                        }}
                        className="text-[11px] font-black ml-0.5"
                      >
                        {Math.abs(viewer.rankDelta)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            <CreatorCard padded={false}>
              <View className="px-2 py-1">
                {leaderboard.entries.map((entry) => (
                  <LeaderboardRow
                    key={entry.creatorId}
                    entry={entry}
                    scoreLabel={leaderboard.scoreLabel}
                    isViewer={entry.creatorId === viewer?.creatorId}
                  />
                ))}
              </View>
            </CreatorCard>
          </>
        )}

        <Text
          style={{ color: tokens.color.text.disabled }}
          className="text-[10px] font-semibold text-center mt-4 mb-4 leading-relaxed"
        >
          Diaspora produces this ranking. Nothing here is ordered on your phone.
        </Text>
      </View>
    </CreatorScreen>
  );
}
