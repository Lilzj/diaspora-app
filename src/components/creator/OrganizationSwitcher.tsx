// ─────────────────────────────────────────────────────────────────────────────
// The organisation list in Creator Studio's Organizations section
//
// ── Two things were wrong with the card ──────────────────────────────────────
//
// **The Manage CTA was not a control.** It was the word `MANAGE →` in brand
// orange sharing a `flex-row` with three metrics. At three metrics the row
// overflows and the CTA rides into "Posts"; and orange text at the end of a
// statistics row does not read as a button in the first place — the whole card
// was the touch target, which nothing said.
//
// It is now a filled button on its own line, which is what the rest of the app
// uses for a primary action on a card, and the card itself is no longer the
// target.
//
// **The active role chip was black.** `bg-surface-inverse` is the app's
// near-black, and it is used for inverted surfaces — not for selection. Every
// other selected chip in the app is `primary-500`. Two of these sat above the
// black Publishing-as pill and made this the only near-black region in the
// product.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView } from 'react-native';
import { useOrganizationStore } from '@/store/organization';
import { describeCreatorRole } from '@/lib/organization-permissions';
import { CreatorOrganization } from '@/types/creator';

interface OrganizationSwitcherProps {
  onOpenOrgDetail: (org: CreatorOrganization) => void;
}

export const OrganizationSwitcher: React.FC<OrganizationSwitcherProps> = ({ onOpenOrgDetail }) => {
  const { organizations, activeRoleTab, setActiveRoleTab } = useOrganizationStore();

  const filteredOrgs = organizations.filter((org) => {
    if (activeRoleTab === 'all') return true;
    return org.userRole === activeRoleTab;
  });

  // Counts from the data rather than the hard-coded "(1)" the chips used to
  // carry, which was wrong the moment the list changed.
  const countFor = (role: string) =>
    role === 'all' ? organizations.length : organizations.filter((o) => o.userRole === role).length;

  return (
    <View className="mb-6">
      {/* Role Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-4">
        {[
          { key: 'all', label: 'All orgs' },
          { key: 'owner', label: 'Owned' },
          { key: 'manager', label: 'Managed' },
          { key: 'moderator', label: 'Moderated' },
          { key: 'contributor', label: 'Contributed' },
        ].map((tab) => {
          const isActive = activeRoleTab === tab.key;
          const count = countFor(tab.key);
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveRoleTab(tab.key as any)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label}, ${count}`}
              className={`px-3 py-1.5 rounded-xl border mr-2 ${
                isActive ? 'bg-primary-500 border-primary-500' : 'bg-surface-card border-subtle'
              }`}
            >
              <Text className={`text-xs font-bold ${isActive ? 'text-white' : 'text-content-tertiary'}`}>
                {tab.label} {count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Organization Cards */}
      <View className="space-y-3 gap-3">
        {filteredOrgs.map((org) => {
          const role = describeCreatorRole(org.userRole);
          return (
            <View
              key={org.id}
              className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm"
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-row items-center flex-1 mr-3">
                  <Image source={{ uri: org.logo }} className="w-12 h-12 rounded-2xl mr-3 bg-surface-muted" />
                  <View className="flex-1">
                    <View className="flex-row items-center">
                      <Text className="text-sm font-black text-content-primary mr-1" numberOfLines={1}>
                        {org.name}
                      </Text>
                      {org.verified && <Text className="text-xs text-success-default">✓</Text>}
                    </View>
                    <Text className="text-[10px] text-content-muted font-semibold">{org.category}</Text>
                    <Text className="text-[9px] text-content-faint mt-0.5">{org.location}</Text>
                  </View>
                </View>

                <View className="px-2 py-1 rounded-lg border border-primary-500 bg-primary-50">
                  <Text className="text-[9px] font-black text-primary-600">
                    {role.icon} {role.label}
                  </Text>
                </View>
              </View>

              <Text className="text-xs text-content-tertiary leading-relaxed mt-3" numberOfLines={2}>
                {org.description}
              </Text>

              {/*
                Metrics wrap rather than sharing a row with the CTA. Three of
                them plus a button does not fit at any phone width, which is why
                the CTA used to overlap "Posts".
              */}
              <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-4 pt-3 border-t border-faint">
                <Text className="text-[10px] font-bold text-content-muted">👥 {org.membersCount} Members</Text>
                <Text className="text-[10px] font-bold text-content-muted">🔔 {org.followersCount} Followers</Text>
                <Text className="text-[10px] font-bold text-content-muted">📝 {org.postsCount} Posts</Text>
              </View>

              <TouchableOpacity
                onPress={() => onOpenOrgDetail(org)}
                accessibilityRole="button"
                accessibilityLabel={`Manage ${org.name}`}
                accessibilityHint="Opens members, posts, events and roles for this organisation"
                className="bg-primary-500 rounded-2xl py-3 items-center mt-4"
              >
                <Text className="text-xs font-black text-white">Manage organisation</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
};
