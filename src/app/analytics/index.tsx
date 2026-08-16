// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics hub (Frontend Phase 15, §46 · §72)
//
// The one screen that decides what a member is offered, and the place §46's rule
// is most visible: **a dashboard the caller has no capability for is not
// rendered at all.**
//
// Not greyed out, not behind a lock icon, not "ask an administrator". Absent. A
// disabled "Platform analytics" row tells a member that an administrative
// dashboard over their community exists and that somebody can read it — and for
// a diaspora platform, where the underlying data can imply nationality and
// immigration situation, that is not a neutral disclosure.
//
// The exception, and it is deliberate: where a capability is missing because the
// member has not *bought* it, the row renders with an upgrade path. In that case
// the existence of the feature is the product, and Phase 6's entitlement decision
// — a real fact about a real subscription — is what distinguishes the two.
//
// ── §72: not all analytics is administrative ─────────────────────────────────
//
// The member's own sections come first and are not gated behind anything but
// owning the thing. A creator's reach, a seller's listing performance and a
// landlord's enquiry funnel are the member's own data. The administrative
// section is last and is usually absent.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import { useCommunityContext } from '@/hooks/communities';
import { useAnalyticsAccess, useAnalyticsGapsEnabled } from '@/hooks/analytics';
import { trackAnalyticsEvent } from '@/lib/analytics/events';
import {
  AnalyticsGapNotice,
  AnalyticsHeader,
  AnalyticsSection,
} from '@/components/analytics';
import type { AnalyticsSubject } from '@/types/analytics';

interface HubEntry {
  key: string;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  /** Rendered only when true. See the header. */
  isVisible: boolean;
}

export default function AnalyticsHubScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const isEnabled = useAnalyticsGapsEnabled();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { activeCommunity } = useCommunityContext();

  // The capability sets that decide what is offered. Each is a separate
  // server-evaluated answer — §48 — and each defaults to all-false while it
  // loads, so nothing flashes before a permission check lands.
  const platformSubject = useMemo<AnalyticsSubject>(() => ({ type: 'platform', id: null }), []);
  const creatorSubject = useMemo<AnalyticsSubject>(() => ({ type: 'creator', id: null }), []);
  const communitySubject = useMemo<AnalyticsSubject>(
    () => ({ type: 'community', id: activeCommunity?.id ?? null }),
    [activeCommunity?.id]
  );

  const platformAccess = useAnalyticsAccess(platformSubject);
  const creatorAccess = useAnalyticsAccess(creatorSubject);
  const communityAccess = useAnalyticsAccess(communitySubject);

  useEffect(() => {
    trackAnalyticsEvent('analytics.hub.viewed');
  }, []);

  const yourWork: HubEntry[] = [
    {
      key: 'creator',
      label: 'Your content',
      hint: 'Views, reach, engagement and where it travelled',
      icon: 'create-outline',
      route: '/analytics/creator',
      isVisible: creatorAccess.access.canView,
    },
    {
      key: 'wallet',
      label: 'Your money',
      hint: 'What came in, what went out — from your real statement',
      icon: 'wallet-outline',
      route: '/analytics/wallet',
      isVisible: isAuthenticated,
    },
    {
      key: 'seller',
      label: 'Selling',
      hint: 'Listing performance, offers and sales',
      icon: 'pricetag-outline',
      route: '/analytics/seller',
      isVisible: isAuthenticated,
    },
    {
      key: 'landlord',
      label: 'Letting',
      hint: 'Enquiries, applications and how listings are found',
      icon: 'home-outline',
      route: '/analytics/landlord',
      isVisible: isAuthenticated,
    },
  ];

  const community: HubEntry[] = [
    {
      key: 'community',
      label: activeCommunity?.name ? `${activeCommunity.name} community` : 'Your community',
      hint: 'Members, activity, content and reach',
      icon: 'people-outline',
      route: activeCommunity?.id ? `/analytics/community/${activeCommunity.id}` : '/community',
      isVisible: communityAccess.access.canView && Boolean(activeCommunity?.id),
    },
    {
      key: 'compare',
      label: 'Compare communities',
      hint: 'Side by side, with no winner declared',
      icon: 'git-compare-outline',
      route: '/community/compare',
      isVisible: communityAccess.access.canCompare,
    },
  ];

  const platform: HubEntry[] = [
    {
      key: 'platform',
      label: 'Platform overview',
      hint: 'Members, activity and what exists across Diaspora',
      icon: 'planet-outline',
      route: '/analytics/platform',
      isVisible: platformAccess.access.canViewAdministrative,
    },
    {
      key: 'growth',
      label: 'Growth',
      hint: 'What is growing, and how fast',
      icon: 'trending-up-outline',
      route: '/analytics/growth',
      isVisible: platformAccess.access.canViewAdministrative,
    },
    {
      key: 'engagement',
      label: 'Engagement',
      hint: 'Daily, weekly and monthly activity',
      icon: 'pulse-outline',
      route: '/analytics/engagement',
      isVisible: platformAccess.access.canViewAdministrative,
    },
    {
      key: 'retention',
      label: 'Retention',
      hint: 'Who comes back, by cohort',
      icon: 'repeat-outline',
      route: '/analytics/retention',
      isVisible: platformAccess.access.canViewAdministrative,
    },
    {
      key: 'discovery',
      label: 'Search, recommendations and maps',
      hint: 'How people find things — and when they do not',
      icon: 'search-outline',
      route: '/analytics/discovery',
      isVisible: platformAccess.access.canViewAdministrative,
    },
    {
      key: 'communication',
      label: 'Notifications and messages',
      hint: 'Delivery, opens and response rates',
      icon: 'notifications-outline',
      route: '/analytics/communication',
      isVisible: platformAccess.access.canViewAdministrative,
    },
  ];

  const reference: HubEntry[] = [
    {
      key: 'definitions',
      label: 'What every figure means',
      hint: 'The definition behind each number Diaspora reports',
      icon: 'book-outline',
      route: '/analytics/definitions',
      isVisible: true,
    },
    {
      key: 'reports',
      label: 'Saved reports',
      hint: 'Reports you have built',
      icon: 'documents-outline',
      route: '/analytics/reports',
      isVisible: platformAccess.access.canBuildReports || creatorAccess.access.canBuildReports,
    },
    {
      key: 'gaps',
      label: 'What is not measured yet',
      hint: 'Everything Diaspora cannot report on, and why',
      icon: 'construct-outline',
      route: '/analytics/gaps',
      isVisible: isEnabled,
    },
  ];

  const sections = [
    { title: 'Your work', subtitle: 'Your own figures, about the things you publish', entries: yourWork },
    { title: 'Community', subtitle: undefined, entries: community },
    { title: 'Platform', subtitle: 'Administrative', entries: platform },
    { title: 'Reference', subtitle: undefined, entries: reference },
  ].filter((section) => section.entries.some((entry) => entry.isVisible));

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <AnalyticsHeader title="Analytics" subtitle="What Diaspora can tell you" />

      <ScrollEndScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
      >
        {isEnabled ? (
          <View className="mb-5">
            <AnalyticsGapNotice
              gapKey="platformAnalytics"
              detail="Diaspora does not record most of what these reports need yet. The layouts are real and the figures behind them come from a development adapter — they are not measurements. The counts of what exists (guides, jobs, listings, housing) are real."
            />
          </View>
        ) : null}

        {sections.map((section) => (
          <AnalyticsSection key={section.title} title={section.title} subtitle={section.subtitle}>
            <View
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
              }}
              className="rounded-2xl border overflow-hidden"
            >
              {section.entries
                .filter((entry) => entry.isVisible)
                .map((entry, index) => (
                  <Pressable
                    key={entry.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${entry.label}. ${entry.hint}.`}
                    onPress={() => router.push(entry.route as never)}
                    style={{
                      borderTopColor: tokens.color.border.default,
                      borderTopWidth: index === 0 ? 0 : 1,
                    }}
                    className="flex-row items-center px-4 py-3.5"
                  >
                    <Ionicons name={entry.icon} size={18} color={tokens.color.text.secondary} />
                    <View className="flex-1 mx-3">
                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-[13px] font-bold"
                      >
                        {entry.label}
                      </Text>
                      <Text
                        style={{ color: tokens.color.text.placeholder }}
                        className="text-[11px] font-semibold mt-0.5"
                      >
                        {entry.hint}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={tokens.color.text.placeholder}
                    />
                  </Pressable>
                ))}
            </View>
          </AnalyticsSection>
        ))}

        {sections.length === 0 ? (
          <View className="items-center py-16 px-6">
            <View
              style={{ backgroundColor: tokens.color.neutral[100] }}
              className="w-14 h-14 rounded-full items-center justify-center mb-3"
            >
              <Ionicons name="bar-chart-outline" size={22} color={tokens.color.text.placeholder} />
            </View>
            <Text
              accessibilityRole="header"
              style={{ color: tokens.color.text.primary }}
              className="text-[13px] font-black text-center"
            >
              Nothing to report on yet
            </Text>
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-semibold text-center mt-1.5 leading-relaxed"
            >
              Publish something, list something or join a community and your figures will show up
              here.
            </Text>
          </View>
        ) : null}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
