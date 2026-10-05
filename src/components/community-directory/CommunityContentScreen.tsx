// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — The community content route (Frontend Phase 13, §17–§24,
// §53)
//
// §53's eight per-community deep links — `/community/nigerian/guides`,
// `/community/nigerian/jobs` and so on — are one screen parameterised by domain,
// not eight screens.
//
// The alternative was eight route files of forty lines each, and the reason not to
// is not brevity: eight copies drift. One would forget the scope note, one would
// forget the offline banner, one would render its own empty state, and a reviewer
// checking that "every scoped list says how the scope was applied" would have to
// check eight files and would be wrong about at least one.
//
// The route files under `app/community/[slug]/` are therefore three lines each and
// contain no logic. What they contribute is the URL, which is the thing §53 is
// actually about.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type { CommunityContentDomain } from '@/lib/community-directory-api';
import { useCommunity, useCommunityContext } from '@/hooks/communities';
import { useConnectivityStore } from '@/lib/connectivity';
import { trackCommunityEvent } from '@/lib/community/analytics';
import { CommunityContentSection, DOMAIN_LABELS } from './CommunityContentSection';
import { CommunityFilterBar } from './CommunitySelector';
import { CommunityOfflineBanner, CommunityUnavailablePanel } from './CommunityStatePanels';
import { CommunityAvatar, communityOriginLabel } from './CommunityIdentity';
import { MultiCommunityGapNotice } from './MultiCommunityGapNotice';
import { backOr } from '@/lib/navigation';

/** Which §63 event each domain emits when its list is opened. */
const DOMAIN_EVENTS: Record<CommunityContentDomain, Parameters<typeof trackCommunityEvent>[0]> = {
  guide: 'community.guide.viewed',
  job: 'community.job.viewed',
  marketplace: 'community.marketplace.viewed',
  housing: 'community.housing.viewed',
  event: 'community.event.viewed',
  provider: 'community.provider.viewed',
  organization: 'community.organization.viewed',
  update: 'community.update.viewed',
};

export function CommunityContentScreen({ domain }: { domain: CommunityContentDomain }) {
  const { tokens } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const isOnline = useConnectivityStore((s) => s.isOnline);

  const community = useCommunity(slug);
  const context = useCommunityContext();

  const labels = DOMAIN_LABELS[domain];

  React.useEffect(() => {
    if (!community.data) return;
    trackCommunityEvent(DOMAIN_EVENTS[domain], {
      communityId: community.data.id,
      contentDomain: domain,
    });
  }, [community.data, domain]);

  const canProject = Boolean(community.data?.origin.countryCode);

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-2">
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => backOr()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={tokens.color.text.primary} />
        </TouchableOpacity>

        {community.data ? <CommunityAvatar community={community.data} size={28} /> : null}

        <View className="flex-1 ml-2">
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.primary }}
            className="text-base font-black"
            numberOfLines={1}
          >
            {labels.title}
          </Text>
          {community.data ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold"
              numberOfLines={1}
            >
              {community.data.name} · {communityOriginLabel(community.data)}
            </Text>
          ) : null}
        </View>
      </View>

      {/* §15's one filter model, on every scoped list. */}
      <CommunityFilterBar compact />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 48, paddingTop: 8 }}
        // The filter bar carries a search field; without this the first tap on
        // a result is spent dismissing the keyboard.
        keyboardShouldPersistTaps="handled"
      >
        {!isOnline ? (
          <View className="px-4 mb-3">
            <CommunityOfflineBanner savedAt={context.hydratedFrom} />
          </View>
        ) : null}

        {community.isLoading ? (
          <CommunityUnavailablePanel reason="loading" subject={labels.subject} />
        ) : community.unavailable ? (
          <CommunityUnavailablePanel
            reason={community.unavailable}
            subject={labels.subject}
            detail={community.data?.statusReason}
            gapKey="communityProfile"
            onAction={
              community.unavailable === 'not-found'
                ? () => router.replace('/community')
                : () => void community.refetch()
            }
          />
        ) : !canProject ? (
          <View className="px-4">
            <MultiCommunityGapNotice
              gapKey="communityScopedContent"
              detail={`${community.data?.name} covers more than one country, and ${labels.subject} can only be matched to a community by the country each person or business came from. Until content can say which community it is for, this list cannot be assembled.`}
            />
          </View>
        ) : (
          <CommunityContentSection domain={domain} hideHeading />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
