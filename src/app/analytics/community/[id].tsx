// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community analytics (Frontend Phase 15, §12 · §65)
//
// Growth, activity, engagement and reach for one community.
//
// ── §65, and the distinction this screen exists to keep ──────────────────────
//
// The subject is a **community**, not a country. Phase 13 spent a phase removing
// that conflation from the platform, and analytics is the easiest place to
// reintroduce it — a country breakdown of a community's reach is meaningful and
// looks, on a chart, exactly like a community breakdown of a country's reach.
//
// So: `subject.type` is `community`, the breakdown dimensions include `country`
// as a *dimension of* the community rather than as a synonym for it, and the
// resolved community scope token travels in both the request and the cache key.
// Community A's dataset can never be served under Community B — that is asserted
// by test rather than by this comment.
//
// ── Reuse ────────────────────────────────────────────────────────────────────
//
// Phase 13's `/community/[slug]/statistics` already exists and already carries
// per-metric provenance. This screen does not replace it: the same contract is
// read once and normalised by `lib/analytics/adapters.ts`, so the member count
// shown here and the member count shown there are the same number from the same
// request. What this adds is the time dimension Phase 13's snapshot has no room
// for.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/design-system';
import { useCommunity, useCommunityScope } from '@/hooks/communities';
import { AnalyticsSection, SubjectDashboard } from '@/components/analytics';

export default function CommunityAnalyticsScreen() {
  const { tokens } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const community = useCommunity(id);
  const scope = useCommunityScope();

  return (
    <SubjectDashboard
      subject={{ type: 'community', id: id ?? null, label: community.data?.name ?? null }}
      title={community.data?.name ?? 'Community'}
      subtitle="Members, activity and reach"
      breakdowns={['country', 'neighborhood', 'category', 'contentType']}
      communityScopeToken={scope.token}
      gapDetail="Diaspora has no community record to count members from, so member counts, growth and engagement come from a development adapter. The counts of events, organizations, guides, jobs, housing and listings in this community's areas are real — they come from Diaspora's own routes, narrowed by country of origin standing in for a community filter."
    >
      <AnalyticsSection title="Related">
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.border.default,
          }}
          className="rounded-2xl border overflow-hidden"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open this community's statistics page"
            onPress={() =>
              router.push(
                community.data?.slug
                  ? `/community/${community.data.slug}/statistics`
                  : '/community'
              )
            }
            style={{ borderBottomColor: tokens.color.border.default, borderBottomWidth: 1 }}
            className="flex-row items-center px-4 py-3.5"
          >
            <Ionicons name="stats-chart-outline" size={17} color={tokens.color.text.secondary} />
            <View className="flex-1 mx-3">
              <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-bold">
                Community statistics
              </Text>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-semibold mt-0.5"
              >
                The snapshot view, with per-figure sources
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Compare communities side by side"
            onPress={() => router.push('/community/compare')}
            className="flex-row items-center px-4 py-3.5"
          >
            <Ionicons name="git-compare-outline" size={17} color={tokens.color.text.secondary} />
            <View className="flex-1 mx-3">
              <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-bold">
                Compare communities
              </Text>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-semibold mt-0.5"
              >
                Side by side, with no winner declared
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
          </Pressable>
        </View>
      </AnalyticsSection>
    </SubjectDashboard>
  );
}
