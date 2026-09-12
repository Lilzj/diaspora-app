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
  useCommunityCapabilities,
  useCommunityInitiatives,
  useCommunityMembers,
  useCommunityNotices,
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
import { roleHoldersFromMembers } from '@/lib/community/roles';
import { canPerform } from '@/lib/community/access';
import { MultiCommunityGapNotice } from './MultiCommunityGapNotice';

export type GovernanceKind = 'rules' | 'moderators' | 'ambassadors' | 'initiatives';

const KIND_COPY: Record<
  GovernanceKind,
  {
    title: string;
    subject: string;
    gapKey: string;
    blurb: string;
    /**
     * What "nothing here" means on *this* screen.
     *
     * The shared panel's generic body was written for the filtered directory —
     * "for the communities you have chosen. Try widening your community filter
     * or looking in a wider area." On one community's moderator list there is no
     * filter to widen and no wider area to look in, so it read as advice that
     * could not be taken.
     */
    emptyDetail: string;
  }
> = {
  rules: {
    title: 'Community rules',
    subject: 'rules',
    gapKey: 'communityGovernance',
    emptyDetail:
      'This community has not written its own rules yet. Diaspora’s platform guidelines still apply to everyone here.',
    blurb:
      'These are this community’s own rules, set by its moderators. They sit alongside Diaspora’s platform guidelines, not instead of them.',
  },
  moderators: {
    title: 'Moderators',
    subject: 'moderators',
    gapKey: 'communityRoleDirectory',
    emptyDetail:
      'Nobody here is a moderator yet. An administrator can give somebody the role from the members list.',
    blurb:
      'Moderators review reports and keep this community’s rules. They are members like anyone else, with an extra job.',
  },
  ambassadors: {
    title: 'Ambassadors',
    subject: 'ambassadors',
    gapKey: 'communityRoleDirectory',
    emptyDetail:
      'Nobody here is an ambassador yet. An administrator can give somebody the role from the members list.',
    blurb:
      'Ambassadors organise things — meet-ups, guides, help for people who have just arrived. They are the people to ask first.',
  },
  initiatives: {
    title: 'Initiatives',
    subject: 'initiatives',
    gapKey: 'communityInitiatives',
    emptyDetail: 'Nothing is being worked on together here yet.',
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
  // ── Who moderates this community, for real ────────────────────────────────
  //
  // `useCommunityRoleHolders` is gap-gated and answers nothing in a release
  // build. `GET /communities/{idOrSlug}/members` is served and carries each
  // member's roles, and a role cannot be held without a visible membership — so
  // the member list *is* the role directory. See `roleHoldersFromMembers`.
  //
  // It inherits the member list's gate, and that is right rather than
  // unfortunate: §41 makes belonging private by default, so somebody who may not
  // see who is in a community may not see who runs it either. They are told
  // that, instead of being told there is nobody.
  const wantsHolders = kind === 'moderators' || kind === 'ambassadors';
  const capabilities = useCommunityCapabilities(wantsHolders ? communityId : undefined);
  const maySeeMembers = canPerform('view-members', capabilities.data);

  const members = useCommunityMembers(slug, wantsHolders && maySeeMembers);

  const holderList = React.useMemo(
    () =>
      wantsHolders
        ? roleHoldersFromMembers(members.members, kind === 'moderators' ? 'Moderator' : 'Ambassador')
        : [],
    [wantsHolders, members.members, kind]
  );
  const initiatives = useCommunityInitiatives(kind === 'initiatives' ? communityId : undefined);

  const active = kind === 'rules' ? rules : initiatives;

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

  // Only ever asked of a query that actually ran. A disabled query is not
  // loading, not erroring and holds nothing — all three true — so this used to
  // be permanently true in a release build and the screen announced an absence
  // it had never checked.
  const isEmpty =
    !active.isLoading &&
    !active.isError &&
    (kind === 'rules'
      ? (rules.data?.length ?? 0) === 0 && (notices.data?.length ?? 0) === 0
      : (initiatives.data?.length ?? 0) === 0);

  /**
   * Whether there is anything to draw under the panels.
   *
   * One expression rather than a negation of the ladder, so a panel and an empty
   * content block can never both render — which is what happened the first time
   * this was split apart.
   */
  const showContent = wantsHolders
    ? maySeeMembers && !members.isError && holderList.length > 0
    : active.unavailable !== 'feature-disabled' && !active.isError && !isEmpty;

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

        {!wantsHolders && active.isSimulated ? (
          <View className="mb-4">
            <MultiCommunityGapNotice gapKey={copy.gapKey} compact />
          </View>
        ) : null}

        {community.isLoading || capabilities.isLoading || (wantsHolders ? members.isLoading : active.isLoading) ? (
          <CommunityUnavailablePanel reason="loading" subject={copy.subject} />
        ) : community.unavailable ? (
          <CommunityUnavailablePanel
            reason={community.unavailable}
            subject={copy.subject}
            detail={community.data?.statusReason}
          />
        ) : wantsHolders && !maySeeMembers ? (
          // Not "nobody moderates this". Belonging is private by default, so who
          // runs a community is a members-only answer — and a refusal is a
          // different sentence from an absence.
          <CommunityUnavailablePanel reason="forbidden" subject={copy.subject} />
        ) : wantsHolders && members.isError ? (
          <CommunityUnavailablePanel
            reason="error"
            subject={copy.subject}
            onAction={() => void members.refetch()}
          />
        ) : wantsHolders ? (
          holderList.length === 0 ? (
            // True now, and only now: the member list was fetched and nobody in
            // it holds this role.
            <CommunityUnavailablePanel
              reason="empty"
              subject={copy.subject}
              detail={copy.emptyDetail}
            />
          ) : null
        ) : active.unavailable === 'feature-disabled' ? (
          // The query never ran, so there is nothing to be empty. Announcing an
          // absence here is the defect this ladder was rebuilt for.
          <CommunityUnavailablePanel
            reason="feature-disabled"
            subject={copy.subject}
            gapKey={copy.gapKey}
          />
        ) : active.isError ? (
          <CommunityUnavailablePanel
            reason="error"
            subject={copy.subject}
            onAction={() => void active.refetch()}
          />
        ) : isEmpty ? (
          <CommunityUnavailablePanel
            reason="empty"
            subject={copy.subject}
            detail={copy.emptyDetail}
          />
        ) : null}

        {/* The content, only where a panel above did not already answer. */}
        {showContent ? (
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

            {wantsHolders
              ? holderList.map((holder) => (
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
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
