// ─────────────────────────────────────────────────────────────────────────────
// Community members and their roles — 11 Sep 2026
//
// The product decision: "the person that creates the community is the owner of
// the community and can also assign roles to members, and a community creator is
// automatically member of the administrator".
//
// ── What each person sees ───────────────────────────────────────────────────
//
//   **Any member**: the members who chose to be visible, with their roles. §41
//   makes belonging private by default, so a private member is not listed — to
//   anybody, administrators included. A role can only be held with a visible
//   membership, so every role holder is here.
//
//   **An administrator**: the same list, and a Roles button on each member that
//   gives or takes away Moderator and Ambassador.
//
//   **The owner**: all of that, and Administrator as well. Nobody is offered
//   Owner — founding makes one, and handing a community on is a separate act.
//
// ── What decides ────────────────────────────────────────────────────────────
//
// The server, for everything. The buttons follow `canManageRoles` and
// `canAppointAdministrators` from the capability set — never the roles list, which
// is display only — and every refusal the server gives is shown as it wrote it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type { AssignableCommunityRole, CommunityMember } from '@/types/community-directory';
import {
  useChangeCommunityRole,
  useCommunity,
  useCommunityCapabilities,
  useCommunityMembers,
} from '@/hooks/communities';
import { canPerform } from '@/lib/community/access';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useNotification } from '@/providers/notification-provider';
import {
  CommunityAvatar,
  CommunityRoleBadge,
  CommunityUnavailablePanel,
  rolesForDisplay,
} from '@/components/community-directory';
import { backOr } from '@/lib/navigation';

/** How a role reads in a sentence about giving it. */
const ROLE_NOUN: Record<AssignableCommunityRole, string> = {
  Moderator: 'a moderator',
  Ambassador: 'an ambassador',
  Administrator: 'an administrator',
};

const ROLE_EFFECT: Record<AssignableCommunityRole, string> = {
  Moderator: 'They will be able to review reports and moderate posts here.',
  Ambassador: 'They will represent the community in public and can run initiatives.',
  Administrator:
    'They will be able to change rules, publish notices and give other members moderator and ambassador roles.',
};

export default function CommunityMembersScreen() {
  const bottomInset = useBottomInset();
  const { tokens } = useTheme();
  const { showAlert } = useNotification();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const community = useCommunity(slug);
  const capabilities = useCommunityCapabilities(community.data?.id);

  const canView = canPerform('view-members', capabilities.data);
  const canManage = canPerform('manage-roles', capabilities.data);
  const canAppointAdministrators = canPerform('appoint-administrators', capabilities.data);

  const members = useCommunityMembers(slug, canView);
  const changeRole = useChangeCommunityRole(slug);

  const offerRoles = useCallback(
    (member: CommunityMember) => {
      const name = member.displayName ?? 'this member';

      const assignable: AssignableCommunityRole[] = canAppointAdministrators
        ? ['Moderator', 'Ambassador', 'Administrator']
        : ['Moderator', 'Ambassador'];

      const apply = (role: AssignableCommunityRole, granted: boolean) =>
        changeRole.mutate(
          { userId: member.userId, role, granted },
          {
            onSuccess: () =>
              showAlert({
                type: 'success',
                title: granted ? 'Role given' : 'Role removed',
                message: granted
                  ? `${name} is now ${ROLE_NOUN[role]}.`
                  : `${name} is no longer ${ROLE_NOUN[role]}.`,
              }),
            onError: (error) =>
              showAlert({
                type: 'error',
                title: 'That did not change',
                // The community module writes its refusals for members — "This
                // member keeps their membership private…" is the one an owner
                // most needs to read as written.
                message: error instanceof Error ? error.message : 'Please try again.',
              }),
          }
        );

      const confirm = (role: AssignableCommunityRole, granted: boolean) =>
        showAlert({
          type: 'question',
          title: granted ? `Make ${name} ${ROLE_NOUN[role]}?` : `Remove ${name} as ${ROLE_NOUN[role]}?`,
          message: granted ? ROLE_EFFECT[role] : 'They stay a member of the community.',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            {
              text: granted ? 'Give role' : 'Remove role',
              style: granted ? 'default' : 'destructive',
              onPress: () => apply(role, granted),
            },
          ],
        });

      showAlert({
        type: 'info',
        title: name,
        message: 'Choose a role to give or take away.',
        buttons: [
          ...assignable.map((role) => {
            const holds = member.roles.includes(role);
            return {
              text: holds ? `Remove ${role.toLowerCase()}` : `Make ${role.toLowerCase()}`,
              onPress: () => confirm(role, !holds),
            };
          }),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      });
    },
    [canAppointAdministrators, changeRole, showAlert]
  );

  const record = community.data;

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

        {record ? <CommunityAvatar community={record} size={28} /> : null}

        <View className="flex-1 ml-2">
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.primary }}
            className="text-base font-black"
          >
            Members
          </Text>
          {record ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold"
              numberOfLines={1}
            >
              {record.name}
            </Text>
          ) : null}
        </View>
      </View>

      {community.isLoading || capabilities.isLoading ? (
        <CommunityUnavailablePanel reason="loading" subject="the members" />
      ) : !canView ? (
        // Members only. Not an empty list, which would read as an empty community.
        <CommunityUnavailablePanel reason="forbidden" subject="the member list" />
      ) : (
        <ScrollEndScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: bottomInset }}
        >
          <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-bold mb-3">
            {canManage
              ? 'Only members who have chosen to be visible to the community appear here. Tap Roles to give someone a role or take one away.'
              : 'Only members who have chosen to be visible to the community appear here.'}
          </Text>

          {members.isLoading ? (
            <ActivityIndicator color={tokens.color.primary[500]} style={{ marginTop: 24 }} />
          ) : members.isError ? (
            <CommunityUnavailablePanel reason="error" subject="the members" />
          ) : (
            <>
              {members.members.map((member) => {
                // Owner is never offered; your own roles are changed by someone else.
                const canChangeThisOne =
                  canManage && !member.isYou && !member.roles.includes('Owner');

                return (
                  <View
                    key={member.userId}
                    testID={`community-member-${member.userId}`}
                    style={{
                      backgroundColor: tokens.color.surface.card,
                      borderColor: tokens.color.surface.border,
                    }}
                    className="flex-row items-center rounded-xl border px-3 py-3 mb-2"
                  >
                    <View className="flex-1">
                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-sm font-black"
                        numberOfLines={1}
                      >
                        {/* Never the id. A GUID where a name belongs is what the
                            organisation members screen shows today. */}
                        {member.displayName ?? 'A member'}
                        {member.isYou ? ' (you)' : ''}
                      </Text>

                      {rolesForDisplay(member.roles).length > 0 ? (
                        <View className="flex-row flex-wrap mt-1.5">
                          {rolesForDisplay(member.roles).map((role) => (
                            <View key={role} className="mr-1.5">
                              <CommunityRoleBadge role={role} size="xs" />
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>

                    {canChangeThisOne ? (
                      <TouchableOpacity
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={`Change roles for ${member.displayName ?? 'this member'}`}
                        disabled={changeRole.isPending}
                        onPress={() => offerRoles(member)}
                        style={{ borderColor: tokens.color.surface.border }}
                        className="rounded-full border px-3 py-1.5"
                      >
                        <Text
                          style={{ color: tokens.color.primary[600] }}
                          className="text-xs font-black"
                        >
                          Roles
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}

              {members.hasMore ? (
                <TouchableOpacity
                  accessible
                  accessibilityRole="button"
                  onPress={members.loadMore}
                  className="items-center py-3"
                >
                  {members.isFetchingMore ? (
                    <ActivityIndicator color={tokens.color.primary[500]} />
                  ) : (
                    <Text style={{ color: tokens.color.primary[600] }} className="text-xs font-black">
                      Show more members
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </ScrollEndScrollView>
      )}
    </SafeAreaView>
  );
}
