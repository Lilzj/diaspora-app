// ─────────────────────────────────────────────────────────────────────────────
// Roles — §19, §20, §21, §22
//
// ── Why this tab changes shape rather than getting longer ────────────────────
//
// The old Roles tab was headed "Your Granted Permissions" and listed
// `organization.permissions` — a `string[]` on the creator store, uppercased.
// That is a read-only fact about *you*, and it belongs on a profile.
//
// A roles tab is about the organisation: which roles exist, what each may do,
// and how many people hold it. That is what somebody deciding whether to make
// a member a Moderator needs to read, and none of it was there.
//
// ── The two halves, and why they are marked differently ──────────────────────
//
// **What you may do** is authoritative. It is `OrganizationCapabilities`, which
// the server answers and the client never computes.
//
// **What each role conventionally carries** is not. The server grants
// capabilities per member; an organisation may have narrowed a role for one
// person. Presenting the catalogue as though it were the live grant would
// invent an authority the API does not offer, so it is labelled as the
// description of the role and the member counts beside it come from the roster.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '@/components/community';
import { useTheme } from '@/design-system';
import { useOrganizationMembers } from '@/hooks/community-life';
import {
  CAPABILITY_LABELS,
  ROLE_CATALOGUE,
  describeRole,
  isReadOnly,
  splitCapabilities,
} from '@/lib/organization-permissions';
import type { OrganizationCapabilities } from '@/types/community-advanced';

import { TabHeading, TabLoading, TabUnavailable } from './OrganizationTabShared';

interface RolesTabProps {
  organizationId: string;
  capabilities: OrganizationCapabilities;
}

export function RolesTab({ organizationId, capabilities }: RolesTabProps) {
  const { tokens } = useTheme();
  const [openRole, setOpenRole] = useState<string | null>(null);

  // The roster is only used for the "how many hold this role" counts, and it is
  // already cached by the Members tab under the same key when both have been
  // opened, so this is usually free.
  //
  // **It is also refused to anyone without `canManageMembers`,** which is most
  // people. That must not take the tab down with it: the caller's own
  // capabilities and the role catalogue are the substance here, and both are
  // readable by everyone. So a failed roster costs the counts and nothing else.
  const { members, isLoading, isEnabled } = useOrganizationMembers(organizationId);
  const hasCounts = members.length > 0;

  const countByRole = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const member of members) {
      counts[member.role] = (counts[member.role] ?? 0) + 1;
    }
    return counts;
  }, [members]);

  const { granted, withheld } = splitCapabilities(capabilities);
  const mine = describeRole(capabilities.role);

  if (!isEnabled) return <TabUnavailable label="Roles" />;
  if (isLoading) return <TabLoading label="roles" />;

  return (
    <View>
      {/* ── What you hold ─────────────────────────────────────────────────── */}
      <TabHeading title="Your role here" />

      <Card style={{ marginBottom: 14 }}>
        <View className="flex-row items-center mb-2.5">
          <Text className="text-lg mr-2">{mine.icon}</Text>
          <View className="flex-1">
            <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-black">
              {capabilities.role ?? 'No role'}
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[10px] font-semibold mt-0.5 leading-relaxed"
            >
              {capabilities.role ? mine.description : 'You hold no role in this organisation.'}
            </Text>
          </View>
        </View>

        {isReadOnly(capabilities) ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10.5px] font-semibold leading-relaxed"
          >
            You can read this organisation but not manage any part of it. Management controls are
            hidden throughout — and refused by the organisation even if they were not.
          </Text>
        ) : (
          <>
            {granted.map((key) => (
              <View key={key} className="flex-row items-center py-0.5">
                <Ionicons name="checkmark-circle" size={13} color={tokens.color.success.default} />
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-[11px] font-bold ml-2"
                >
                  {CAPABILITY_LABELS[key]}
                </Text>
              </View>
            ))}
            {withheld.map((key) => (
              <View key={key} className="flex-row items-center py-0.5">
                <Ionicons name="close-circle-outline" size={13} color={tokens.color.text.placeholder} />
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[11px] font-semibold ml-2"
                >
                  {CAPABILITY_LABELS[key]}
                </Text>
              </View>
            ))}
          </>
        )}
      </Card>

      {/* ── The catalogue ─────────────────────────────────────────────────── */}
      <TabHeading title="Roles in this organisation" count={ROLE_CATALOGUE.length} />

      {ROLE_CATALOGUE.map((entry) => {
        const isOpen = openRole === entry.role;
        const holders = countByRole[entry.role] ?? 0;
        const isMine = capabilities.role === entry.role;

        return (
          <Card key={entry.role} style={{ marginBottom: 8 }}>
            <Pressable
              onPress={() => setOpenRole(isOpen ? null : entry.role)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={`${entry.role}.${
                hasCounts ? ` ${holders} ${holders === 1 ? 'person' : 'people'}.` : ''
              } ${entry.description}`}
              className="flex-row items-center"
            >
              <Text className="text-base mr-2.5">{entry.icon}</Text>

              <View className="flex-1 mr-2">
                <View className="flex-row items-center">
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-[12px] font-black"
                  >
                    {entry.role}
                  </Text>
                  {isMine ? (
                    <View
                      style={{ backgroundColor: tokens.color.neutral[100] }}
                      className="rounded-md px-1.5 py-0.5 ml-2"
                    >
                      <Text
                        style={{ color: tokens.color.primary[600] }}
                        className="text-[8px] font-black uppercase tracking-wider"
                      >
                        You
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[9.5px] font-semibold mt-0.5"
                >
                  {/*
                    Three cases, and the third is the one that would otherwise
                    read as a contradiction. The seeded roster for an
                    organisation does not include the caller's own membership,
                    so an Owner reading this tab would see "Your role here:
                    Owner" above and "Nobody holds this" on the Owner row.
                  */}
                  {!hasCounts
                    ? 'Held by an unknown number of people'
                    : holders === 0
                      ? isMine
                        ? 'You'
                        : 'Nobody in the loaded roster'
                      : `${holders} ${holders === 1 ? 'person' : 'people'}${isMine ? ', and you' : ''}`}
                </Text>
              </View>

              <Ionicons
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={15}
                color={tokens.color.text.placeholder}
              />
            </Pressable>

            {isOpen ? (
              <View
                style={{ borderTopColor: tokens.color.border.default }}
                className="border-t mt-3 pt-3"
              >
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[10.5px] font-semibold leading-relaxed mb-2.5"
                >
                  {entry.description}
                </Text>

                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[9px] font-black uppercase tracking-widest mb-1.5"
                >
                  Usually carries
                </Text>

                {entry.conventional.length === 0 ? (
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[10.5px] font-semibold"
                  >
                    No management capabilities.
                  </Text>
                ) : (
                  entry.conventional.map((key) => (
                    <View key={key} className="flex-row items-center py-0.5">
                      <Ionicons name="checkmark" size={12} color={tokens.color.text.secondary} />
                      <Text
                        style={{ color: tokens.color.text.secondary }}
                        className="text-[10.5px] font-semibold ml-2"
                      >
                        {CAPABILITY_LABELS[key]}
                      </Text>
                    </View>
                  ))
                )}

                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[9.5px] font-medium leading-relaxed mt-2.5"
                >
                  What a role usually carries is a description. What any one person may actually do
                  is granted by the organisation and answered per member — which is what the list
                  above shows for you.
                </Text>
              </View>
            ) : null}
          </Card>
        );
      })}

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-medium leading-relaxed mt-1 px-1"
      >
        Roles are assigned from the Members tab. Custom roles are not supported — these six are the
        organisation role model the platform defines.
      </Text>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-medium leading-relaxed mt-2 px-1"
      >
        {hasCounts
          ? 'Counts are taken from the members loaded so far.'
          : 'How many people hold each role is only shown to members who can manage the roster.'}
      </Text>
    </View>
  );
}
