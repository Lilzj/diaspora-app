// ─────────────────────────────────────────────────────────────────────────────
// Community Life — the wider platform, on the canonical page
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// There were two screens called "Community Life", and they linked to each other:
//
//     /community-life        →  banner "Community Life"  →  /community-life/hub
//     /community-life/hub    →  card   "Browse events"   →  /community-life
//
// A member entering from Discover → "Enter Community Life Hub" landed on the
// first, tapped something labelled with the name of the page they were already
// on, and arrived somewhere different that carried the same title. There was no
// way to tell from either screen which one you were meant to be on.
//
// The hub was not junk — it was the only route to membership, fundraising,
// volunteering, polls, organisation dashboards and community impact. What made
// it a duplicate was that it was a *page*, titled like the page that linked to
// it. Those destinations are sub-features; they need a way in, not a second
// front door.
//
// So the hub's two pieces of unique value move here, onto the canonical page:
//
//   * the destination rail, with the live counts the hub showed on its tiles
//   * the "For you" recommendations, which nothing else in the app surfaced
//
// Everything else the hub rendered was a short preview of a list that its own
// route already shows in full — `/community-life/memberships`,
// `/community-life/campaign`, `/community-life/announcements` and the rest are
// unchanged and now reachable in one tap instead of two.
//
// ── Why a rail and not a grid ────────────────────────────────────────────────
//
// The hub used a two-column grid of eight tiles, which is ~240pt. Dropped onto
// the canonical page it would have pushed the event search and filters — the
// thing the page exists for — below the fold. A horizontal rail is one row, and
// the page already uses horizontal chip rails twice below this point, so it
// reads as part of the design rather than as a transplanted screen.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/design-system';
import { useCommunityLifeSummary, useDismissRecommendation } from '@/hooks/community-life';
import { trackCommunityEvent } from '@/lib/community-analytics';
import { RecommendationCard } from './CommunityCards';
import { Section } from './CommunityPrimitives';

interface Destination {
  key: string;
  label: string;
  icon: string;
  route: string;
  count?: number;
}

interface CommunityLifeDestinationsProps {
  /** City to scope the summary to, so the counts match the page's location. */
  cityName?: string;
  latitude?: number;
  longitude?: number;
}

export function CommunityLifeDestinations({
  cityName,
  latitude,
  longitude,
}: CommunityLifeDestinationsProps) {
  const { tokens } = useTheme();
  const { summary } = useCommunityLifeSummary({ cityName, latitude, longitude });
  const dismiss = useDismissRecommendation();

  const destinations = useMemo<Destination[]>(
    () => [
      // `events` is deliberately absent: it was a tile on the hub pointing back
      // at this page, and it is the tab the member is already looking at.
      { key: 'memberships', label: 'Membership', icon: 'card-outline', route: '/community-life/membership', count: summary?.counts.myMemberships },
      { key: 'campaigns', label: 'Fundraising', icon: 'heart-outline', route: '/community-life/campaign', count: summary?.counts.activeCampaigns },
      { key: 'volunteer', label: 'Volunteer', icon: 'hand-left-outline', route: '/community-life/volunteer', count: summary?.counts.openOpportunities },
      { key: 'polls', label: 'Polls', icon: 'bar-chart-outline', route: '/community-life/poll', count: summary?.counts.openPolls },
      { key: 'series', label: 'Recurring', icon: 'repeat-outline', route: '/community-life/series' },
      { key: 'organizations', label: 'Organisations', icon: 'business-outline', route: '/community-life/dashboard' },
      { key: 'announcements', label: 'Announcements', icon: 'megaphone-outline', route: '/community-life/announcements' },
      { key: 'impact', label: 'Impact', icon: 'sparkles-outline', route: '/community-life/impact' },
    ],
    [summary]
  );

  const recommendations = summary?.recommendations ?? [];

  return (
    <View>
      <View className="px-6 pt-4 pb-2">
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[10px] font-black uppercase tracking-widest"
        >
          More in Community Life
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 10 }}
        accessibilityRole="menu"
        accessibilityLabel="More in Community Life"
      >
        {destinations.map((destination) => (
          <TouchableOpacity
            key={destination.key}
            onPress={() => router.push(destination.route as never)}
            activeOpacity={0.85}
            accessibilityRole="menuitem"
            accessibilityLabel={
              destination.count !== undefined && destination.count > 0
                ? `${destination.label}, ${destination.count}`
                : destination.label
            }
            accessibilityHint={`Opens ${destination.label.toLowerCase()}`}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.surface.border,
              minWidth: 96,
              // 44pt minimum touch target (WCAG 2.5.5).
              minHeight: 76,
            }}
            className="rounded-2xl border px-3 py-3 items-start justify-between"
          >
            <View className="flex-row items-center justify-between w-full">
              <View
                style={{ backgroundColor: tokens.color.primary[50] }}
                className="w-8 h-8 rounded-xl items-center justify-center"
              >
                <Ionicons
                  name={destination.icon as never}
                  size={16}
                  color={tokens.color.primary[600]}
                />
              </View>

              {destination.count !== undefined && destination.count > 0 ? (
                <View
                  style={{ backgroundColor: tokens.color.primary[500] }}
                  className="rounded-full min-w-[18px] h-[18px] px-1.5 items-center justify-center"
                >
                  <Text
                    style={{ color: tokens.color.text.inverse }}
                    className="text-[10px] font-black"
                  >
                    {destination.count}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[11px] font-black tracking-tight mt-2"
              numberOfLines={1}
            >
              {destination.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* B14's surface, rendered in the order given — nothing here re-ranks it. */}
      {recommendations.length > 0 ? (
        <Section title="For you" subtitle="Suggested by Diaspora, not ranked on your device">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
          >
            {recommendations.map((recommendation) => (
              <RecommendationCard
                key={recommendation.recommendationId}
                recommendation={recommendation}
                onPress={() => {
                  trackCommunityEvent('community.recommendation.tapped', {
                    recommendationId: recommendation.recommendationId,
                    entityType: recommendation.entityType,
                  });
                  router.push(recommendation.actionRoute as never);
                }}
                onDismiss={() => {
                  trackCommunityEvent('community.recommendation.dismissed', {
                    recommendationId: recommendation.recommendationId,
                    entityType: recommendation.entityType,
                  });
                  dismiss.mutate(recommendation.recommendationId);
                }}
              />
            ))}
          </ScrollView>
        </Section>
      ) : null}
    </View>
  );
}
