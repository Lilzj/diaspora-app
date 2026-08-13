// ─────────────────────────────────────────────────────────────────────────────
// Organisation membership management (§28)
//
// View, search, filter, approve, reject, suspend, remove, assign roles, and see
// membership status and history.
//
// Every decision is refused server-side when the caller's capability set does
// not permit it — §19, and the adapter answers 403 regardless of which buttons
// this screen chose to draw.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  ChipRow,
  CommunityScreen,
  CommunityStatusBadge,
  EmptyState,
  InlineRefusal,
  PrimaryButton,
  SecondaryButton,
  readableDate,
} from '@/components/community';
import { FinancialErrorInline } from '@/components/financial';
import {
  useDecideMembership,
  useOrganizationCapabilities,
  useOrganizationMembers,
} from '@/hooks/community-life';
import { describeMembership } from '@/lib/community-state';
import type { FinancialError } from '@/lib/financial-errors';
import type { MembershipStatus } from '@/types/community-advanced';

type Filter = '' | 'Pending' | 'Active' | 'Suspended' | 'Expired';

export default function OrganizationMembersScreen() {
  const { showAlert } = useNotification();
  const { organizationId } = useLocalSearchParams<{ organizationId: string }>();
  const { tokens } = useTheme();

  const [filter, setFilter] = useState<Filter>('Pending');
  const [query, setQuery] = useState('');

  const { capabilities } = useOrganizationCapabilities(organizationId);
  const params = useMemo(
    () => ({ state: filter || undefined, query: query.trim() || undefined }),
    [filter, query]
  );

  const {
    members,
    totalCount,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isEnabled,
  } = useOrganizationMembers(organizationId, params);

  const decide = useDecideMembership(organizationId);

  return (
    <CommunityScreen
      title="Members"
      subtitle={totalCount !== null ? `${totalCount} in this view` : undefined}
      gapKey="membershipLifecycle"
      isEnabled={isEnabled}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
      sticky={
        capabilities.canManageMembers ? (
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderBottomColor: tokens.color.border.default,
            }}
            className="border-b px-5 py-3"
          >
            <View
              style={{
                backgroundColor: tokens.color.surface.elevated,
                borderColor: tokens.color.border.default,
              }}
              className="flex-row items-center rounded-full border px-4"
            >
              <Ionicons name="search" size={16} color={tokens.color.text.placeholder} />
              <TextInput
                accessibilityLabel="Search members by name"
                value={query}
                onChangeText={setQuery}
                placeholder="Search by name"
                placeholderTextColor={tokens.color.text.placeholder}
                returnKeyType="search"
                style={{ color: tokens.color.text.primary, minHeight: 44 }}
                className="flex-1 ml-2 text-sm font-semibold"
              />
            </View>
          </View>
        ) : undefined
      }
    >
      {!capabilities.canManageMembers ? (
        <View className="px-5 pt-5">
          <InlineRefusal
            icon="lock-closed-outline"
            reason="Managing members is limited to Owners and Administrators. If you think you should have this, ask an administrator of the organisation to change your role."
          />
        </View>
      ) : (
        <>
          <View className="px-5 pt-4">
            <ChipRow
              accessibilityLabel="Filter members"
              options={[
                { value: 'Pending' as const, label: 'Waiting' },
                { value: 'Active' as const, label: 'Active' },
                { value: 'Suspended' as const, label: 'Suspended' },
                { value: 'Expired' as const, label: 'Expired' },
                { value: '' as const, label: 'Everyone' },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </View>

          <View className="px-5 mt-3">
            {decide.isError ? (
              <View className="mb-3">
                <FinancialErrorInline error={decide.error as FinancialError} />
              </View>
            ) : null}

            {members.length === 0 && !isLoading ? (
              <EmptyState
                icon="people-outline"
                title={filter === 'Pending' ? 'Nothing to review' : 'Nobody here'}
                body={
                  filter === 'Pending'
                    ? 'Every application has been decided.'
                    : 'No member is in this state.'
                }
              />
            ) : (
              members.map((member) => {
                const state = describeMembership(member.status);

                return (
                  <View key={member.membershipId} className="mb-3">
                    <Card
                      accessibilityLabel={`${member.displayName}, ${member.tierName}, ${state.label}. Role: ${member.role}.`}
                    >
                      <View className="flex-row items-start">
                        <View
                          style={{ backgroundColor: tokens.color.surface.elevated }}
                          className="w-10 h-10 rounded-full items-center justify-center"
                        >
                          <Ionicons
                            name="person-outline"
                            size={17}
                            color={tokens.color.text.placeholder}
                          />
                        </View>

                        <View className="flex-1 ml-3">
                          <View className="flex-row items-center">
                            <Text
                              style={{ color: tokens.color.text.primary }}
                              className="text-sm font-black tracking-tight flex-1"
                              numberOfLines={1}
                            >
                              {member.displayName}
                            </Text>
                            {member.isVerified ? (
                              <Ionicons
                                name="checkmark-circle"
                                size={14}
                                color={tokens.color.info.default}
                                accessibilityLabel="Verified member"
                              />
                            ) : null}
                          </View>

                          <Text
                            style={{ color: tokens.color.text.placeholder }}
                            className="text-[11px] font-bold mt-0.5"
                          >
                            {member.tierName} · {member.role}
                            {member.joinedAt ? ` · joined ${readableDate(member.joinedAt)}` : ''}
                          </Text>

                          <View className="mt-2">
                            <CommunityStatusBadge state={state} size="small" />
                          </View>
                        </View>
                      </View>

                      {/* Decisions, gated by the fetched capability set */}
                      {member.status === 'Pending' && capabilities.canApproveMembers ? (
                        <View className="flex-row mt-3" style={{ gap: 8 }}>
                          <View className="flex-1">
                            <PrimaryButton
                              label="Approve"
                              icon="checkmark"
                              busy={decide.isPending}
                              onPress={() =>
                                decide.mutate({
                                  membershipId: member.membershipId,
                                  decision: 'approve',
                                })
                              }
                            />
                          </View>
                          <View className="flex-1">
                            <SecondaryButton
                              label="Decline"
                              disabled={decide.isPending}
                              onPress={() =>
                                showAlert({ type: 'success', title: `Decline ${member.displayName}?`, message: 'They will be told the application was not successful.', buttons: [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                      text: 'Decline',
                                      style: 'destructive',
                                      onPress: () =>
                                        decide.mutate({
                                          membershipId: member.membershipId,
                                          decision: 'reject',
                                        }),
                                    },
                                  ] })
                              }
                            />
                          </View>
                        </View>
                      ) : null}

                      {member.status === 'Active' && capabilities.canApproveMembers ? (
                        <View className="mt-3">
                          <SecondaryButton
                            label="Suspend"
                            icon="pause-circle-outline"
                            disabled={decide.isPending}
                            onPress={() =>
                              showAlert({ type: 'warning', title: `Suspend ${member.displayName}?`, message: 'They keep their place but lose access to member benefits until you reinstate them.', buttons: [
                                  { text: 'Cancel', style: 'cancel' },
                                  {
                                    text: 'Suspend',
                                    style: 'destructive',
                                    onPress: () =>
                                      decide.mutate({
                                        membershipId: member.membershipId,
                                        decision: 'suspend',
                                      }),
                                  },
                                ] })
                            }
                          />
                        </View>
                      ) : null}

                      {member.status === 'Suspended' && capabilities.canApproveMembers ? (
                        <View className="mt-3">
                          <PrimaryButton
                            label="Reinstate"
                            icon="refresh-outline"
                            busy={decide.isPending}
                            onPress={() =>
                              decide.mutate({
                                membershipId: member.membershipId,
                                decision: 'reinstate',
                              })
                            }
                          />
                        </View>
                      ) : null}
                    </Card>
                  </View>
                );
              })
            )}

            {hasNextPage ? (
              <View className="mb-4">
                {isFetchingNextPage ? (
                  <View className="py-4 items-center" accessibilityLabel="Loading more">
                    <ActivityIndicator size="small" color={tokens.color.primary[500]} />
                  </View>
                ) : (
                  <SecondaryButton label="Show more" onPress={() => void fetchNextPage()} />
                )}
              </View>
            ) : null}
          </View>
        </>
      )}
    </CommunityScreen>
  );
}
