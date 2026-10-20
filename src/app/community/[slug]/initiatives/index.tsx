// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — /community/[slug]/initiatives (§35, §53)
//
// A community's initiatives, as `GET /communities/{idOrSlug}/initiatives` serves
// them (backend e57082e, 20 Oct 2026): newest first, with their status as the
// server writes it, their organisers each as they chose to be seen, and how many
// are taking part and how many updates have been posted.
//
// ── What is not here, on purpose ─────────────────────────────────────────────
//
// **No progress bar.** The simulation this replaced drew one from a figure
// nothing measured. The server sends none, so none is drawn: the organisers'
// updates are the account of progress, and the card counts them.
//
// **"Start an initiative" only for `canManageInitiatives`** — the owner,
// administrators and ambassadors, as the server computes it. The server checks
// again on the write; this only decides whether to draw the button.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  useCommunity,
  useCommunityCapabilities,
  useCommunityInitiatives,
} from '@/hooks/communities';
import { canPerform } from '@/lib/community/access';
import { trackCommunityEvent } from '@/lib/community/analytics';
import { CommunityAvatar, communityOriginLabel } from '@/components/community-directory/CommunityIdentity';
import { CommunityInitiativeCard } from '@/components/community-directory/CommunityPanels';
import { CommunityUnavailablePanel } from '@/components/community-directory/CommunityStatePanels';
import type { CommunityInitiativeStatus } from '@/types/community-directory';
import { backOr } from '@/lib/navigation';

const FILTERS: { value: CommunityInitiativeStatus | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'Planned', label: 'Planned' },
  { value: 'Active', label: 'Active' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Cancelled', label: 'Cancelled' },
];

export default function CommunityInitiativesRoute() {
  const { tokens } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [status, setStatus] = React.useState<CommunityInitiativeStatus | undefined>(undefined);

  const community = useCommunity(slug);
  const communityId = community.data?.id;

  const capabilities = useCommunityCapabilities(communityId);
  const canStart = canPerform('manage-initiatives', capabilities.data);

  const initiatives = useCommunityInitiatives(communityId, status);
  const list = initiatives.data ?? [];

  React.useEffect(() => {
    if (communityId) trackCommunityEvent('community.initiative.viewed', { communityId });
  }, [communityId]);

  const readError = initiatives.error as { message?: string } | null;

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      <View className="flex-row items-center px-4 pt-2 pb-3">
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
          >
            Initiatives
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

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 48 }}>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-semibold leading-relaxed mb-4"
        >
          Things this community is working on together. Open one to see its updates and to take
          part.
        </Text>

        {canStart && slug ? (
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Start an initiative"
            onPress={() => router.push(`/community/${slug}/initiatives/edit`)}
            activeOpacity={0.8}
            style={{ borderColor: tokens.color.border.default }}
            className="rounded-xl border border-dashed py-2.5 items-center mb-4"
            testID="start-initiative"
          >
            <Text style={{ color: tokens.color.primary[600] }} className="text-[11px] font-bold">
              Start an initiative
            </Text>
          </TouchableOpacity>
        ) : null}

        <View
          accessibilityRole="tablist"
          accessibilityLabel="Show initiatives by status"
          className="flex-row flex-wrap mb-3"
        >
          {FILTERS.map((filter) => {
            const selected = filter.value === status;
            return (
              <TouchableOpacity
                key={filter.label}
                accessible
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`Show ${filter.label.toLowerCase()} initiatives`}
                onPress={() => setStatus(filter.value)}
                activeOpacity={0.7}
                style={{
                  backgroundColor: selected ? tokens.color.primary[500] : tokens.color.neutral[100],
                }}
                className="rounded-full px-3 py-1.5 mr-2 mb-2"
              >
                <Text
                  style={{ color: selected ? tokens.color.text.inverse : tokens.color.text.secondary }}
                  className="text-[11px] font-bold"
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {community.isLoading || initiatives.isLoading ? (
          <CommunityUnavailablePanel reason="loading" subject="initiatives" />
        ) : community.unavailable ? (
          <CommunityUnavailablePanel
            reason={community.unavailable}
            subject="initiatives"
            detail={community.data?.statusReason}
          />
        ) : initiatives.unavailable === 'feature-disabled' ? (
          <CommunityUnavailablePanel reason="feature-disabled" subject="initiatives" />
        ) : initiatives.isError ? (
          // Unanswered is not none: the server's sentence where it sent one.
          <CommunityUnavailablePanel
            reason="error"
            subject="initiatives"
            detail={readError?.message}
            onAction={() => void initiatives.refetch()}
          />
        ) : list.length === 0 ? (
          <CommunityUnavailablePanel
            reason="empty"
            subject="initiatives"
            detail={
              status
                ? `No initiative here is ${status.toLowerCase()}.`
                : 'Nothing is being worked on together here yet.'
            }
          />
        ) : (
          list.map((initiative) => (
            <CommunityInitiativeCard
              key={initiative.id}
              initiative={initiative}
              onPress={() => router.push(`/community/${slug}/initiatives/${initiative.id}`)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
