import React from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView } from 'react-native';
import { useOrganizationStore } from '@/store/organization';
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

  const getRoleBadge = (role: CreatorOrganization['userRole']) => {
    switch (role) {
      case 'owner':
        return { label: '👑 Owner', bg: 'bg-amber-50 border-amber-200 text-amber-800' };
      case 'manager':
        return { label: '⭐ Manager', bg: 'bg-blue-50 border-blue-200 text-blue-800' };
      case 'moderator':
        return { label: '🛡️ Moderator', bg: 'bg-purple-50 border-purple-200 text-purple-800' };
      case 'contributor':
        return { label: '✍️ Contributor', bg: 'bg-emerald-50 border-emerald-200 text-emerald-800' };
    }
  };

  return (
    <View className="mb-6">
      {/* Role Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-4">
        {[
          { key: 'all', label: 'All Orgs' },
          { key: 'owner', label: 'Owned (1)' },
          { key: 'manager', label: 'Managed (1)' },
          { key: 'moderator', label: 'Moderated (1)' },
          { key: 'contributor', label: 'Contributed (1)' },
        ].map((tab) => {
          const isActive = activeRoleTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveRoleTab(tab.key as any)}
              className={`px-3 py-1.5 rounded-xl border mr-2 ${
                isActive ? 'bg-neutral-900 border-neutral-900' : 'bg-surface-card border-subtle'
              }`}
            >
              <Text className={`text-xs font-bold ${isActive ? 'text-white' : 'text-content-tertiary'}`}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Organization Cards */}
      <View className="space-y-3 gap-3">
        {filteredOrgs.map((org) => {
          const roleBadge = getRoleBadge(org.userRole);
          return (
            <TouchableOpacity
              key={org.id}
              activeOpacity={0.8}
              onPress={() => onOpenOrgDetail(org)}
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

                <View className={`px-2 py-1 rounded-lg border ${roleBadge.bg}`}>
                  <Text className="text-[9px] font-black">{roleBadge.label}</Text>
                </View>
              </View>

              <Text className="text-xs text-content-tertiary leading-relaxed mt-3" numberOfLines={2}>
                {org.description}
              </Text>

              {/* Metrics bar */}
              <View className="flex-row justify-between items-center mt-4 pt-3 border-t border-faint">
                <View className="flex-row gap-4">
                  <Text className="text-[10px] font-bold text-content-muted">👥 {org.membersCount} Members</Text>
                  <Text className="text-[10px] font-bold text-content-muted">🔔 {org.followersCount} Followers</Text>
                  <Text className="text-[10px] font-bold text-content-muted">📝 {org.postsCount} Posts</Text>
                </View>
                <Text className="text-xs font-black text-primary-500">MANAGE →</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};
