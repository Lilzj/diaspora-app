// ─────────────────────────────────────────────────────────────────────────────
// The organisation list in Creator Studio's Organizations section
//
// Real since 20 Oct 2026: the organisations the member belongs to, from
// `GET /communities/organizations/me`, with their role there. The list used to
// be a fixture seeded into a store in every build ("Nigerian Community
// Association", "Ghanaian Professionals Network", 420 members, 2450 followers),
// so a member who had created nothing was shown three organisations to manage.
//
// The route answers the organisation, the member's role and whether it is
// verified. It does not send member, follower or post counts, so the card does
// not show any rather than show zeros that would read as facts.
//
// Manage opens the organisation's own page, where its real management lives.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';

import { useMyOrganizations } from '@/hooks/community-life';
import type { MyProgrammeOrganization } from '@/lib/community-programme-api';

type RoleTab = 'all' | 'owner' | 'manager' | 'moderator' | 'member';

/** The platform's roles, grouped the way the chips filter them. */
function tabOf(role: string): Exclude<RoleTab, 'all'> {
  if (role === 'Owner') return 'owner';
  if (role === 'Administrator' || role === 'Organizer' || role === 'Treasurer') return 'manager';
  if (role === 'Moderator') return 'moderator';
  return 'member';
}

const TABS: { key: RoleTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'owner', label: 'Owned' },
  { key: 'manager', label: 'Managed' },
  { key: 'moderator', label: 'Moderated' },
  { key: 'member', label: 'Member of' },
];

export const OrganizationSwitcher: React.FC = () => {
  const { data: organizations, isLoading, isError, refetch } = useMyOrganizations();
  const [activeTab, setActiveTab] = useState<RoleTab>('all');

  const filtered = organizations.filter((org) => activeTab === 'all' || tabOf(org.role) === activeTab);
  const countFor = (tab: RoleTab) =>
    tab === 'all' ? organizations.length : organizations.filter((org) => tabOf(org.role) === tab).length;

  if (isLoading) {
    return (
      <View className="py-8 items-center">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="bg-surface-card border border-subtle rounded-2xl p-4 mb-6">
        <Text className="text-sm font-bold text-content-primary">Your organisations could not be loaded</Text>
        <TouchableOpacity onPress={refetch} className="mt-2" accessibilityRole="button">
          <Text className="text-sm font-bold text-primary-500">Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (organizations.length === 0) {
    return (
      <View className="bg-surface-card border border-subtle rounded-2xl p-4 mb-6">
        <Text className="text-sm font-bold text-content-primary">You are not part of an organisation yet</Text>
        <Text className="text-xs text-content-muted mt-1 leading-relaxed">
          Create one to run events, campaigns and announcements for your community, or join one from its page.
        </Text>
      </View>
    );
  }

  return (
    <View className="mb-6">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-4">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              className={`px-4 py-2 rounded-full mr-2 ${
                isActive ? 'bg-primary-500' : 'bg-surface-card border border-subtle'
              }`}
            >
              <Text className={`text-xs font-bold ${isActive ? 'text-white' : 'text-content-secondary'}`}>
                {tab.label} {countFor(tab.key)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {filtered.map((org: MyProgrammeOrganization) => (
        <View
          key={org.organizationId}
          className="bg-surface-card border border-subtle rounded-3xl p-4 mb-3"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-base font-black text-content-primary" numberOfLines={1}>
                {org.name} {org.isVerified ? '✓' : ''}
              </Text>
              <Text className="text-xs font-semibold text-content-muted mt-0.5">Your role: {org.role}</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => router.push(`/community-life/org/${encodeURIComponent(org.organizationId)}` as never)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${org.name}`}
            className="bg-primary-500 rounded-full py-3 items-center mt-3"
          >
            <Text className="text-xs font-black text-white">
              {tabOf(org.role) === 'member' ? 'Open organisation' : 'Manage organisation'}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
};
