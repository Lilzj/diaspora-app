// ─────────────────────────────────────────────────────────────────────────────
// Community Life — the landing page
//
// ── Which of the two screens is canonical, and why this one ──────────────────
//
// There were two screens titled "Community Life" that linked to each other:
// this one, and an events/directory/calendar/saved page that carried a banner
// opening it. The post-APK pass consolidated them the other way round first —
// keeping the events page as the landing and folding this screen's destination
// tiles onto it as a rail — because the report's attached screenshot was of the
// events page.
//
// That read the screenshot wrongly. The red box in it was around the banner to
// *this* screen: it was pointing at the destination, not condemning it. The
// intended landing page is this one — the tiles, memberships, fundraisers,
// volunteering and polls — with the events page one tap away.
//
// So: `/community-life` is this screen. The events, directory, calendar and
// saved tabs live at `/community-life/events`, reached from the Events tile
// below and from the card at the bottom. Nothing was lost in either direction.
//
// ── The original note (§5) ───────────────────────────────────────────────────
//
// One call on mount (`useCommunityLifeSummary`), then nothing until the member
// taps something. §47 forbids loading all organizations, all events, all
// fundraisers, all volunteers and all polls here, and the `counts` on the
// summary are what let a rail be *skipped* rather than fetched to discover it is
// empty.
//
// The events rails are **real B12 data** and carry no gap notice. Everything
// else on this screen is simulated and says so once, at the top, rather than
// eleven times — the per-rail markers are on the cards themselves where a figure
// is involved.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  AnnouncementCard,
  CampaignCard,
  Card,
  CommunityScreen,
  EmptyState,
  MembershipCard,
  OpportunityCard,
  PollCard,
  RecommendationCard,
  Section,
  SecondaryButton,
} from '@/components/community';
import { useCommunityAccess, useCommunityLifeSummary, useDismissRecommendation } from '@/hooks/community-life';
import { useLocationStore } from '@/store/location';
import { trackCommunityEvent } from '@/lib/community-analytics';
import { checkCommunityAccess, CommunityCapabilities } from '@/lib/community-access';
import { useAuthStore } from '@/store/auth';
import type { Event } from '@/types/community-life';

/** A destination on the hub's quick grid. */
interface Destination {
  key: string;
  label: string;
  icon: string;
  route: string;
  count?: number;
}

export default function CommunityLifeScreen() {
  const { tokens } = useTheme();
  const access = useCommunityAccess();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);
  const city = useLocationStore((state) => state.currentLocation?.cityName);
  const coords = useLocationStore((state) => state.currentLocation);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const { summary, isLoading, isError, error, refetch, isSimulated, isEnabled } =
    useCommunityLifeSummary({
      cityName: city ?? 'London',
      latitude: coords?.latitude,
      longitude: coords?.longitude,
    });

  const dismiss = useDismissRecommendation();

  useEffect(() => {
    trackCommunityEvent('community.life.viewed', { surface: 'hub' });
  }, []);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  // Two, and it has to match the `width: '48%'` on the tiles below.
  const COLUMNS = 2;

  const destinations = useMemo<Destination[]>(
    () => [
      { key: 'memberships', label: 'Membership', icon: 'card-outline', route: '/community-life/membership', count: summary?.counts.myMemberships },
      { key: 'events', label: 'Events', icon: 'calendar-outline', route: '/community-life/events', count: summary?.counts.upcomingEvents },
      { key: 'series', label: 'Recurring', icon: 'repeat-outline', route: '/community-life/series' },
      { key: 'campaigns', label: 'Fundraising', icon: 'heart-outline', route: '/community-life/campaign', count: summary?.counts.activeCampaigns },
      { key: 'volunteer', label: 'Volunteer', icon: 'hand-left-outline', route: '/community-life/volunteer', count: summary?.counts.openOpportunities },
      { key: 'polls', label: 'Polls', icon: 'bar-chart-outline', route: '/community-life/poll', count: summary?.counts.openPolls },
      { key: 'organizations', label: 'Organisations', icon: 'business-outline', route: '/community-life/dashboard' },
      { key: 'impact', label: 'Impact', icon: 'sparkles-outline', route: '/community-life/impact' },
    ],
    [summary]
  );

  const refusal = checkCommunityAccess(CommunityCapabilities.ViewHub, accountState, isAuthenticated);

  return (
    <CommunityScreen
      title="Community Life"
      subtitle={city ? `Around ${city}` : 'Your community'}
      showBack
      gapKey="membershipCatalogue"
      gapDetail="Membership, fundraising campaigns, volunteering, polls and organisation dashboards all run on simulated data in this build. The events below are real."
      isEnabled={isEnabled}
      refusal={refusal}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      headerRight={
        <Text
          accessibilityRole="button"
          accessibilityLabel="Search community life"
          onPress={() => router.push('/community-life/search')}
          style={{ color: tokens.color.primary[500] }}
          className="text-xs font-black uppercase tracking-wider mr-3"
        >
          Search
        </Text>
      }
    >
      {/* ── Quick destinations ─────────────────────────────────────────────── */}
      {/*
        `justify-between` spreads whatever is on the final row to the edges, so
        a grid whose item count is not a multiple of its column count ends with
        a tile-sized hole punched in the middle of the last row — Organisations
        on the left, Impact on the right, nothing between them.
        
        The fillers below complete the last row with invisible tiles of the same
        width, so the real ones stay left-aligned and evenly guttered. Derived
        from the count rather than hard-coded, so adding a ninth destination
        cannot reintroduce the hole.
      */}
      <View className="px-5 pt-5 flex-row flex-wrap justify-between">
        {destinations.map((destination) => (
          <Card
            key={destination.key}
            onPress={() => router.push(destination.route as never)}
            accessibilityLabel={
              destination.count !== undefined
                ? `${destination.label}, ${destination.count}`
                : destination.label
            }
            accessibilityHint={`Opens ${destination.label.toLowerCase()}`}
            style={{ width: '48%', marginBottom: 12 }}
          >
            <View className="flex-row items-center justify-between">
              <View
                style={{ backgroundColor: tokens.color.primary[50] }}
                className="w-9 h-9 rounded-xl items-center justify-center"
              >
                <Ionicons name={destination.icon as never} size={17} color={tokens.color.primary[600]} />
              </View>
              {destination.count !== undefined && destination.count > 0 ? (
                <View
                  style={{ backgroundColor: tokens.color.primary[500] }}
                  className="rounded-full min-w-[20px] h-5 px-1.5 items-center justify-center"
                >
                  <Text className="text-white text-[10px] font-black">{destination.count}</Text>
                </View>
              ) : null}
            </View>
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-xs font-black tracking-tight mt-2.5"
            >
              {destination.label}
            </Text>
          </Card>
        ))}

        {/*
          One invisible tile per empty slot in the final row. `aria-hidden`
          equivalents in React Native are the accessibility props, and a spacer
          must carry them or a screen reader announces N empty cards.
        */}
        {Array.from({ length: (COLUMNS - (destinations.length % COLUMNS)) % COLUMNS }).map(
          (_, index) => (
            <View
              key={`filler-${index}`}
              style={{ width: '48%' }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          )
        )}
      </View>

      {/* ── For You — B14's surface, rendered in the order given ───────────── */}
      {summary?.recommendations && summary.recommendations.length > 0 ? (
        <Section
          title="For you"
          subtitle="Suggested by Diaspora, not ranked on your device"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          >
            {summary.recommendations.map((recommendation) => (
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

      {/* ── My memberships ─────────────────────────────────────────────────── */}
      <Section
        title="My memberships"
        subtitle={summary?.myMemberships.length ? undefined : 'Communities you have joined'}
        action={summary?.myMemberships.length ? 'See all' : undefined}
        onAction={() => router.push('/community-life/memberships')}
      >
        <View className="px-5">
          {summary?.myMemberships.length ? (
            summary.myMemberships.slice(0, 3).map((membership) => (
              <View key={membership.membershipId} className="mb-2.5">
                <MembershipCard
                  membership={membership}
                  onPress={() =>
                    router.push(`/community-life/membership/manage?membershipId=${membership.membershipId}` as never)
                  }
                />
              </View>
            ))
          ) : (
            <EmptyState
              icon="card-outline"
              title="You have not joined a community yet"
              body="Associations, churches, professional networks and neighbourhood groups all take members through Diaspora."
              action="Find a community"
              onAction={() => router.push('/community-life/membership')}
            />
          )}
        </View>
      </Section>

      {/* ── Near you — REAL B12 events ─────────────────────────────────────── */}
      {summary?.nearbyEvents && summary.nearbyEvents.length > 0 ? (
        <Section title="Near you" subtitle="Real events from the Diaspora events directory">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          >
            {summary.nearbyEvents.slice(0, 6).map((event) => (
              <NearbyEventCard key={event.id} event={event} />
            ))}
          </ScrollView>
        </Section>
      ) : null}

      {/* ── Active fundraisers ─────────────────────────────────────────────── */}
      {summary?.activeCampaigns && summary.activeCampaigns.length > 0 ? (
        <Section
          title="Active fundraisers"
          action="See all"
          onAction={() => router.push('/community-life/campaign')}
        >
          <View className="px-5">
            {summary.activeCampaigns.slice(0, 2).map((campaign) => (
              <View key={campaign.campaignId} className="mb-3">
                <CampaignCard
                  campaign={campaign}
                  onPress={() => router.push(`/community-life/campaign/${campaign.campaignId}` as never)}
                />
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {/* ── Volunteer opportunities ────────────────────────────────────────── */}
      {summary?.openOpportunities && summary.openOpportunities.length > 0 ? (
        <Section
          title="Volunteer opportunities"
          action="See all"
          onAction={() => router.push('/community-life/volunteer')}
        >
          <View className="px-5">
            {summary.openOpportunities.slice(0, 3).map((opportunity) => (
              <View key={opportunity.opportunityId} className="mb-2.5">
                <OpportunityCard
                  opportunity={opportunity}
                  onPress={() => router.push(`/community-life/volunteer/${opportunity.opportunityId}` as never)}
                />
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {/* ── Open polls ─────────────────────────────────────────────────────── */}
      {summary?.openPolls && summary.openPolls.length > 0 ? (
        <Section title="Have your say" action="See all" onAction={() => router.push('/community-life/poll')}>
          <View className="px-5">
            {summary.openPolls.slice(0, 2).map((poll) => (
              <View key={poll.pollId} className="mb-2.5">
                <PollCard
                  poll={poll}
                  onPress={() => router.push(`/community-life/poll/${poll.pollId}` as never)}
                />
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {/* ── Neighbourhood activity ─────────────────────────────────────────── */}
      {summary?.neighborhoodActivity ? (
        <Section title={`${summary.neighborhoodActivity.neighborhoodName} activity`}>
          <View className="px-5">
            <Card
              onPress={() =>
                router.push(
                  `/community-life/neighborhood?neighborhoodId=${summary.neighborhoodActivity?.neighborhoodId}` as never
                )
              }
              accessibilityLabel={`${summary.neighborhoodActivity.neighborhoodName}: ${summary.neighborhoodActivity.upcomingEventCount} upcoming events, ${summary.neighborhoodActivity.activeCampaignCount} fundraisers, ${summary.neighborhoodActivity.openOpportunityCount} volunteer opportunities, ${summary.neighborhoodActivity.openPollCount} polls`}
              accessibilityHint="Opens your neighbourhood"
            >
              <View className="flex-row justify-between">
                <NeighborhoodStat label="Events" value={summary.neighborhoodActivity.upcomingEventCount} />
                <NeighborhoodStat label="Fundraisers" value={summary.neighborhoodActivity.activeCampaignCount} />
                <NeighborhoodStat label="Volunteering" value={summary.neighborhoodActivity.openOpportunityCount} />
                <NeighborhoodStat label="Polls" value={summary.neighborhoodActivity.openPollCount} />
              </View>
            </Card>
          </View>
        </Section>
      ) : null}

      {/* ── Announcements — delivered by B13, listed here ──────────────────── */}
      {summary?.announcements && summary.announcements.length > 0 ? (
        <Section
          title="Announcements"
          subtitle="Delivered to your Diaspora inbox"
          action="See all"
          onAction={() => router.push('/community-life/announcements')}
        >
          <View className="px-5">
            {summary.announcements.slice(0, 3).map((announcement) => (
              <View key={announcement.announcementId} className="mb-2.5">
                <AnnouncementCard
                  announcement={announcement}
                  onPress={() =>
                    announcement.actionRoute
                      ? router.push(announcement.actionRoute as never)
                      : router.push('/community-life/announcements')
                  }
                />
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {/* ── My organisations ───────────────────────────────────────────────── */}
      {summary?.myOrganizations && summary.myOrganizations.length > 0 ? (
        <Section title="My organisations" subtitle="Communities you help run">
          <View className="px-5">
            {summary.myOrganizations.map((organization) => (
              <View key={organization.organizationId} className="mb-2.5">
                <Card
                  onPress={() =>
                    router.push(`/community-life/dashboard/${organization.organizationId}` as never)
                  }
                  accessibilityLabel={`${organization.name}. Your role: ${organization.role}.`}
                  accessibilityHint="Opens the organisation dashboard"
                >
                  <View className="flex-row items-center">
                    <View
                      style={{ backgroundColor: tokens.color.secondary[50] }}
                      className="w-10 h-10 rounded-xl items-center justify-center"
                    >
                      <Ionicons name="business-outline" size={18} color={tokens.color.secondary[500]} />
                    </View>
                    <View className="flex-1 ml-3">
                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-sm font-black tracking-tight"
                        numberOfLines={1}
                      >
                        {organization.name}
                      </Text>
                      <Text
                        style={{ color: tokens.color.text.placeholder }}
                        className="text-[11px] font-bold mt-0.5"
                      >
                        {organization.role}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
                  </View>
                </Card>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {/* Nothing at all — a genuinely empty community, not a broken screen. */}
      {!isLoading && isSimulated && !summary ? (
        <EmptyState
          icon="people-outline"
          title="Nothing here yet"
          body="Once communities near you start posting, this is where you will find them."
        />
      ) : null}

      <View className="px-5 mt-8">
        <SecondaryButton
          label="Browse all events and organisations"
          icon="compass-outline"
          onPress={() => router.push('/community-life/events')}
        />
      </View>
    </CommunityScreen>
  );
}

function NearbyEventCard({ event }: { event: Event }) {
  const { tokens } = useTheme();

  return (
    <Card
      onPress={() => router.push(`/community-life/event/${event.id}` as never)}
      accessibilityLabel={`${event.title}. ${event.date} at ${event.time}. ${event.location.areaName}.${
        event.location.distanceKm ? ` ${event.location.distanceKm.toFixed(1)} kilometres away.` : ''
      }${event.price ? ` ${event.price} ${event.currency ?? ''}.` : ' Free.'}`}
      accessibilityHint="Opens the event"
      style={{ width: 220 }}
    >
      <Text
        style={{ color: tokens.color.primary[500] }}
        className="text-[10px] font-black uppercase tracking-widest"
      >
        {event.category}
      </Text>
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-black tracking-tight mt-1"
        numberOfLines={2}
      >
        {event.title}
      </Text>
      <View className="flex-row items-center mt-2">
        <Ionicons name="calendar-outline" size={11} color={tokens.color.text.placeholder} />
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold ml-1">
          {event.date} · {event.time}
        </Text>
      </View>
      <View className="flex-row items-center mt-1">
        <Ionicons name="location-outline" size={11} color={tokens.color.text.placeholder} />
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold ml-1 flex-1"
          numberOfLines={1}
        >
          {event.location.areaName}
          {event.location.distanceKm ? ` · ${event.location.distanceKm.toFixed(1)} km` : ''}
        </Text>
      </View>
    </Card>
  );
}

function NeighborhoodStat({ label, value }: { label: string; value: number }) {
  const { tokens } = useTheme();

  return (
    <View className="items-center flex-1">
      <Text style={{ color: tokens.color.text.primary }} className="text-lg font-black tracking-tight">
        {value}
      </Text>
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-bold mt-0.5 text-center"
      >
        {label}
      </Text>
    </View>
  );
}
