// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community governance routes (Frontend Phase 13, §34, §35,
// §36)
//
// Four screens — rules, moderators, ambassadors, initiatives — as one component
// parameterised by kind, for the same reason the eight content routes are one
// component: four copies would drift, and the thing that would drift is the notice
// saying these surfaces are not connected to a backend.
//
// ── The rule that applies to all four ────────────────────────────────────────
//
// §35: "Do not imply ambassador status without backend authorization."
//
// Every badge on these screens comes from the server's own `roles` echo, and every
// name on them is a name the *community* chose to publish — GAP-018's contract is
// consent-gated per holder, and the register says so. The client asserts no role
// and infers none. `areaLabel` is city-precision by contract, and the type carries
// nothing finer, so this screen has no path to a person's neighbourhood.
//
// Notices appear on the rules screen rather than as a fifth route: a notice is a
// statement about how the community is being run, which is what somebody opening
// "rules" is looking for, and a separate route would be one more place to look.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  useCommunity,
  useCommunityInitiatives,
  useCommunityNotices,
  useCommunityRoleHolders,
  useCommunityRules,
} from '@/hooks/communities';
import { trackCommunityEvent } from '@/lib/community/analytics';
import { CommunityAvatar, communityOriginLabel } from './CommunityIdentity';
import {
  CommunityInitiativeCard,
  CommunityNoticeCard,
  CommunityRoleHolderCard,
  CommunityRuleCard,
} from './CommunityPanels';
import { CommunityUnavailablePanel } from './CommunityStatePanels';
import { MultiCommunityGapNotice } from './MultiCommunityGapNotice';

export type GovernanceKind = 'rules' | 'moderators' | 'ambassadors' | 'initiatives';

const KIND_COPY: Record<
  GovernanceKind,
  { title: string; subject: string; gapKey: string; blurb: string }
> = {
  rules: {
    title: 'Community rules',
    subject: 'rules',
    gapKey: 'communityGovernance',
    blurb:
      'These are this community’s own rules, set by its moderators. They sit alongside Diaspora’s platform guidelines, not instead of them.',
  },
  moderators: {
    title: 'Moderators',
    subject: 'moderators',
    gapKey: 'communityRoleDirectory',
    blurb:
      'Moderators review reports and keep this community’s rules. They are members like anyone else, with an extra job.',
  },
  ambassadors: {
    title: 'Ambassadors',
    subject: 'ambassadors',
    gapKey: 'communityRoleDirectory',
    blurb:
      'Ambassadors organise things — meet-ups, guides, help for people who have just arrived. They are the people to ask first.',
  },
  initiatives: {
    title: 'Initiatives',
    subject: 'initiatives',
    gapKey: 'communityInitiatives',
    blurb: 'Things this community is working on together.',
  },
};

export function CommunityGovernanceScreen({ kind }: { kind: GovernanceKind }) {
  const { tokens } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const community = useCommunity(slug);
  const communityId = community.data?.id;

  const rules = useCommunityRules(kind === 'rules' ? communityId : undefined);
  const notices = useCommunityNotices(kind === 'rules' ? communityId : undefined, {
    includeExpired: true,
  });
  const holders = useCommunityRoleHolders(
    kind === 'moderators' || kind === 'ambassadors' ? communityId : undefined,
    kind === 'moderators' ? 'Moderator' : 'Ambassador'
  );
  const initiatives = useCommunityInitiatives(kind === 'initiatives' ? communityId : undefined);

  const active =
    kind === 'rules'
      ? rules
      : kind === 'initiatives'
        ? initiatives
        : holders;

  const copy = KIND_COPY[kind];

  React.useEffect(() => {
    if (!communityId) return;

    if (kind === 'rules') trackCommunityEvent('community.rules.viewed', { communityId });
    if (kind === 'moderators')
      trackCommunityEvent('community.moderator_profile.viewed', { communityId });
    if (kind === 'ambassadors')
      trackCommunityEvent('community.ambassador_profile.viewed', { communityId });
    if (kind === 'initiatives')
      trackCommunityEvent('community.initiative.viewed', { communityId });
  }, [communityId, kind]);

  const isEmpty =
    !active.isLoading &&
    !active.isError &&
    (kind === 'rules'
      ? (rules.data?.length ?? 0) === 0 && (notices.data?.length ?? 0) === 0
      : kind === 'initiatives'
        ? (initiatives.data?.length ?? 0) === 0
        : (holders.data?.length ?? 0) === 0);

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
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
            {copy.title}
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

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-semibold leading-relaxed mb-4"
        >
          {copy.blurb}
        </Text>

        {active.isSimulated ? (
          <View className="mb-4">
            <MultiCommunityGapNotice gapKey={copy.gapKey} compact />
          </View>
        ) : null}

        {community.isLoading || active.isLoading ? (
          <CommunityUnavailablePanel reason="loading" subject={copy.subject} />
        ) : community.unavailable ? (
          <CommunityUnavailablePanel
            reason={community.unavailable}
            subject={copy.subject}
            detail={community.data?.statusReason}
          />
        ) : active.isError ? (
          <CommunityUnavailablePanel
            reason="error"
            subject={copy.subject}
            onAction={() => void active.refetch()}
          />
        ) : isEmpty ? (
          <CommunityUnavailablePanel reason="empty" subject={copy.subject} />
        ) : (
          <View>
            {kind === 'rules' ? (
              <>
                {(rules.data ?? []).map((rule) => (
                  <CommunityRuleCard key={rule.id} rule={rule} />
                ))}

                {(notices.data ?? []).length > 0 ? (
                  <View className="mt-5">
                    <Text
                      accessibilityRole="header"
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[10px] font-black uppercase tracking-widest mb-2"
                    >
                      Notices from moderators
                    </Text>
                    {(notices.data ?? []).map((notice) => (
                      <CommunityNoticeCard key={notice.id} notice={notice} />
                    ))}
                  </View>
                ) : null}

                {/* §36: community rules are additive to the platform's own. */}
                <TouchableOpacity
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Read Diaspora’s platform guidelines"
                  onPress={() => router.push('/profile/community-guidelines')}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: tokens.color.surface.card,
                    borderColor: tokens.color.border.default,
                  }}
                  className="flex-row items-center rounded-2xl border p-3 mt-5"
                >
                  <Ionicons
                    name="library-outline"
                    size={17}
                    color={tokens.color.text.secondary}
                  />
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-xs font-bold ml-3 flex-1"
                  >
                    Diaspora’s platform guidelines
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={15}
                    color={tokens.color.text.placeholder}
                  />
                </TouchableOpacity>
              </>
            ) : null}

            {kind === 'moderators' || kind === 'ambassadors'
              ? (holders.data ?? []).map((holder) => (
                  <CommunityRoleHolderCard
                    key={holder.userId}
                    holder={holder}
                    onPress={() => router.push(`/contributor/${holder.userId}`)}
                  />
                ))
              : null}

            {kind === 'initiatives'
              ? (initiatives.data ?? []).map((initiative) => (
                  <CommunityInitiativeCard key={initiative.id} initiative={initiative} />
                ))
              : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
