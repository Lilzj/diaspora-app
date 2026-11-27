// ─────────────────────────────────────────────────────────────────────────────
// Members — §15, §16, §17, §18, §23, §24
//
// The roster, searchable, with role changes and application decisions behind
// the capability set the server answers.
//
// ── What this replaced ───────────────────────────────────────────────────────
//
// Three names in a `const` inside the modal file — Joshua, Amara Kone, Fatou
// Diop — rendered for every organisation regardless of which one was opened,
// with a "Permissions" button that raised a toast and changed nothing.
//
// `useOrganizationMembers` has been there the whole time: paged, searchable by
// the server, filterable by membership state, and returning
// `OrganizationMember` with a role, a status, a join date and a verification
// flag. `/community-life/dashboard/members` already uses it.
//
// ── Owner protection ─────────────────────────────────────────────────────────
//
// §23. The rule that matters is the last owner: demoting them leaves an
// organisation nobody can administer, and the server would accept it, because
// from its side it is a legitimate assignment by somebody holding
// `canManageMembers`. `canChangeRole` refuses it here, and the reason is shown
// rather than the control silently missing.
//
// The owner count comes from the loaded roster, so this tab deliberately does
// not filter by role — a filtered page could show one owner while hiding
// another, and "one owner loaded" would then read as "one owner".
//
// ── One list, in the sheet (FARCH-004, 27 Nov 2026) ──────────────────────────
//
// The roster pages, so its rows are the sheet's list: `useMembersTab` hands the
// sheet the search and the heading above them, the members as rows, and the
// next page below them. A row is `MemberCard`, which holds nothing of its own:
// which row is open is the tab's, keyed by membership, so a recycled row never
// arrives open on somebody nobody opened.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ListRenderItemInfo } from '@shopify/flash-list';

import { Card, SecondaryButton, readableDate } from '@/components/community';
import { useTheme } from '@/design-system';
import { useNotification } from '@/providers/notification-provider';
import {
  useAssignOrganizationRole,
  useOrganizationMembers,
} from '@/hooks/community-life';
import {
  ROLE_CATALOGUE,
  assignableRoles,
  canChangeRole,
  canRemoveMember,
  describeRole,
} from '@/lib/domain/organization-permissions';
import type {
  OrganizationCapabilities,
  OrganizationMember,
  OrganizationRole,
} from '@/types/community-advanced';

import {
  TabError,
  TabGapNote,
  TabHeading,
  TabLoading,
  TabRefused,
  TabUnavailable,
} from './OrganizationTabShared';
import { NO_ROWS, type OrganizationRow, type OrganizationTabList } from './OrganizationRows';

interface MembersTabProps {
  organizationId: string;
  organizationName: string;
  capabilities: OrganizationCapabilities;
  /** Retained across tab switches by the sheet. §29. */
  search: string;
  onSearchChange: (value: string) => void;
  /** Whether Members is the tab in view. Only the tab in view fetches (§40). */
  active: boolean;
}

export function useMembersTab({
  organizationId,
  organizationName,
  capabilities,
  search,
  onSearchChange,
  active,
}: MembersTabProps): OrganizationTabList {
  const { tokens } = useTheme();
  const { showAlert, showToast } = useNotification();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // A row opened on one visit to the tab is closed on the next, as it was when
  // the tab unmounted on leaving.
  const [visiting, setVisiting] = useState(active);
  if (visiting !== active) {
    setVisiting(active);
    setExpandedId(null);
  }

  // The query is keyed on the trimmed term, so an empty box and a box of
  // spaces are the same request rather than two cache entries.
  const term = search.trim();
  const {
    members,
    totalCount,
    isLoading,
    isError,
    error,
    isEnabled,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useOrganizationMembers(active ? organizationId : undefined, term ? { query: term } : {});

  const { mutate: assignRole, isPending: isAssigning } = useAssignOrganizationRole(organizationId);

  const ownerCount = useMemo(
    () => members.filter((member) => member.role === 'Owner').length,
    [members],
  );

  const changeRole = useCallback(
    (member: OrganizationMember, role: OrganizationRole) => {
      // §24 — the shared confirmation, not a new one-off modal.
      showAlert({
        type: 'warning',
        title: 'Change role?',
        message: `Change ${member.displayName} from ${member.role} to ${role} in ${organizationName}?`,
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Change role',
            style: 'destructive',
            onPress: () => {
              assignRole(
                { userId: member.userId, role },
                {
                  onSuccess: () => {
                    setExpandedId(null);
                    showToast({
                      type: 'success',
                      title: 'Role changed',
                      message: `${member.displayName} is now ${role}.`,
                    });
                  },
                  onError: () => {
                    // The refusal is the server's. Saying so matters: the
                    // button was drawn because the fetched capability set
                    // allowed it, and a 403 here means that answer has moved.
                    showToast({
                      type: 'error',
                      title: 'Role not changed',
                      message: 'The organisation refused this change. Your permissions may have changed.',
                    });
                  },
                },
              );
            },
          },
        ],
      });
    },
    [assignRole, organizationName, showAlert, showToast],
  );

  // A refusal or a failure replaces the whole tab — there is nothing to search.
  const usable = isEnabled && !isError;
  const listed = usable && !isLoading;

  // §17 — the search field must survive its own results.
  //
  // Each keystroke changes the query key, so `isLoading` is true for every new
  // term rather than only the first fetch. Returning `<TabLoading/>` on it — as
  // the other four tabs correctly do — unmounted the search field on every
  // character: the keyboard closed, focus was lost, and typing a second letter
  // was impossible.
  //
  // So the field is rendered unconditionally and only the region beneath it
  // switches. `isSearching` is the same signal, shown where it does no harm.
  const isSearching = isLoading && term.length > 0;

  // One member. Kept until what it draws with changes; opening a row changes
  // `expandedId`, so the open row and the one that closed are both redrawn.
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<OrganizationRow>) =>
      'membershipId' in item ? (
        <MemberCard
          member={item}
          capabilities={capabilities}
          ownerCount={ownerCount}
          isExpanded={expandedId === item.membershipId}
          onExpand={setExpandedId}
          onChangeRole={changeRole}
          isAssigning={isAssigning}
        />
      ) : null,
    [capabilities, ownerCount, expandedId, changeRole, isAssigning]
  );

  return {
    header: usable ? (
      <View>
        <TabGapNote>
          The roster, roles and join dates come from a development adapter. Role changes are sent to
          it and refused by it when your role does not permit them.
        </TabGapNote>

        {/* ── Search ───────────────────────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: tokens.color.surface.background,
            borderColor: tokens.color.border.default,
          }}
          className="flex-row items-center rounded-2xl border px-3.5 py-2.5 mb-3"
        >
          <Ionicons name="search-outline" size={15} color={tokens.color.text.placeholder} />
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder={
              totalCount ? `Search ${totalCount} members` : `Search members of ${organizationName}`
            }
            placeholderTextColor={tokens.color.text.placeholder}
            accessibilityLabel="Search members"
            returnKeyType="search"
            className="flex-1 ml-2 text-[12px] font-semibold"
            style={{ color: tokens.color.text.primary, paddingVertical: 0 }}
          />
          {search.length > 0 ? (
            <Pressable
              onPress={() => onSearchChange('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={16} color={tokens.color.text.placeholder} />
            </Pressable>
          ) : null}
        </View>

        {listed ? (
          <TabHeading
            title={term ? 'Matching members' : 'Members'}
            count={term ? members.length : totalCount ?? members.length}
          />
        ) : null}
      </View>
    ) : null,
    rows: listed ? members : NO_ROWS,
    renderItem,
    state: {
      loading: usable && isLoading,
      skeleton: isSearching ? (
        <View className="py-6 items-center">
          <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-semibold">
            Searching for “{term}”…
          </Text>
        </View>
      ) : (
        <TabLoading label="members" />
      ),
      error: !isEnabled ? (
        <TabUnavailable label="Members" />
      ) : isError ? (
        <TabError
          label="Members"
          subject="seeing who belongs to it"
          kind={error?.kind}
          onRetry={() => void refetch()}
        />
      ) : null,
      isEmpty: members.length === 0,
      empty: term
        ? {
            icon: 'search-outline',
            title: 'No members match',
            message: `Nobody in ${organizationName} matches “${term}”.`,
            action: { label: 'Clear search', onPress: () => onSearchChange('') },
          }
        : {
            icon: 'people-outline',
            title: 'No members yet',
            message: 'When people join this organisation they will appear here, with their role and when they joined.',
          },
    },
    footer:
      listed && hasNextPage ? (
        <View className="mt-1">
          <SecondaryButton
            label={isFetchingNextPage ? 'Loading…' : 'Load more members'}
            icon="arrow-down-circle-outline"
            disabled={isFetchingNextPage}
            onPress={() => void fetchNextPage()}
          />
        </View>
      ) : null,
  };
}

interface MemberCardProps {
  member: OrganizationMember;
  capabilities: OrganizationCapabilities;
  ownerCount: number;
  isExpanded: boolean;
  /** Opens this row's role options, or closes them with null. */
  onExpand: (membershipId: string | null) => void;
  onChangeRole: (member: OrganizationMember, role: OrganizationRole) => void;
  /** A role change is on its way. */
  isAssigning: boolean;
}

/** One member, and their role options once opened. */
function MemberCard({
  member,
  capabilities,
  ownerCount,
  isExpanded,
  onExpand,
  onChangeRole,
  isAssigning,
}: MemberCardProps) {
  const { tokens } = useTheme();
  const { showAlert } = useNotification();
  const descriptor = describeRole(member.role);
  const assignable = assignableRoles(capabilities);

  const roleVerdict = canChangeRole(member, { capabilities, ownerCount });
  const removeVerdict = canRemoveMember(member, { capabilities, ownerCount });

  return (
    <Card style={{ marginBottom: 8 }}>
      {/*
        Not pressable without `canManageMembers`. The expanded body is
        gated, so leaving the row live gave a member a touch target that
        expanded to nothing — and announced itself as a button to a screen
        reader while doing so.
      */}
      <Pressable
        onPress={
          capabilities.canManageMembers
            ? () => onExpand(isExpanded ? null : member.membershipId)
            : undefined
        }
        accessibilityRole={capabilities.canManageMembers ? 'button' : 'text'}
        accessibilityState={
          capabilities.canManageMembers ? { expanded: isExpanded } : undefined
        }
        accessibilityLabel={`${member.displayName}, ${member.role}, ${member.status}`}
        accessibilityHint={
          capabilities.canManageMembers ? 'Opens role options for this member' : undefined
        }
        className="flex-row items-center"
      >
        <View
          style={{ backgroundColor: tokens.color.neutral[100] }}
          className="w-9 h-9 rounded-full items-center justify-center mr-3"
        >
          <Text style={{ color: tokens.color.primary[600] }} className="text-[12px] font-black">
            {member.displayName.slice(0, 2).toUpperCase()}
          </Text>
        </View>

        <View className="flex-1 mr-2">
          <View className="flex-row items-center">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[12px] font-black"
              numberOfLines={1}
            >
              {member.displayName}
            </Text>
            {member.isVerified ? (
              <Text style={{ color: tokens.color.success.default }} className="text-[10px] ml-1">
                ✓
              </Text>
            ) : null}
          </View>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[9.5px] font-semibold mt-0.5"
            numberOfLines={1}
          >
            {descriptor.icon} {member.role} · {member.tierName}
            {member.joinedAt ? ` · joined ${readableDate(member.joinedAt)}` : ''}
          </Text>
        </View>

        {capabilities.canManageMembers ? (
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={15}
            color={tokens.color.text.placeholder}
          />
        ) : null}
      </Pressable>

      {/* ── Role options ─────────────────────────────────────────── */}
      {isExpanded && capabilities.canManageMembers ? (
        <View
          style={{ borderTopColor: tokens.color.border.default }}
          className="border-t mt-3 pt-3"
        >
          {roleVerdict.allowed ? (
            <>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[9px] font-black uppercase tracking-widest mb-2"
              >
                Change role to
              </Text>
              <View className="flex-row flex-wrap">
                {ROLE_CATALOGUE.filter(
                  (entry) => assignable.includes(entry.role) && entry.role !== member.role,
                ).map((entry) => (
                  <Pressable
                    key={entry.role}
                    onPress={() => onChangeRole(member, entry.role)}
                    disabled={isAssigning}
                    accessibilityRole="button"
                    accessibilityLabel={`Change ${member.displayName} to ${entry.role}`}
                    style={{
                      backgroundColor: tokens.color.surface.background,
                      borderColor: tokens.color.border.default,
                      opacity: isAssigning ? 0.5 : 1,
                    }}
                    className="rounded-xl border px-2.5 py-1.5 mr-2 mb-2"
                  >
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-[10px] font-bold"
                    >
                      {entry.icon} {entry.role}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <TabRefused reason={roleVerdict.reason} />
          )}

          {!removeVerdict.allowed ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[9.5px] font-semibold mt-1 leading-relaxed"
            >
              {removeVerdict.reason}
            </Text>
          ) : (
            <View className="mt-1">
              <SecondaryButton
                label="Remove from organisation"
                icon="person-remove-outline"
                onPress={() =>
                  showAlert({
                    type: 'warning',
                    title: 'Removal is not available yet',
                    message:
                      'Changing a role is supported. Removing a member needs a contract the organisation service does not expose yet — see Organization-Management-Backend-Gaps.md.',
                    buttons: [{ text: 'Close', style: 'cancel' }],
                  })
                }
              />
            </View>
          )}
        </View>
      ) : null}
    </Card>
  );
}
