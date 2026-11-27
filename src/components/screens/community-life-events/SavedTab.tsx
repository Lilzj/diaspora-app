// Community Life: the Saved tab.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, TextInput, Text, TouchableOpacity } from 'react-native';
import { useThemeTokens } from '@/design-system';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { organizationKind, organizationLine } from '@/lib/domain/organization-summary';
import { ListState } from '@/components/ListState';
import { ListSkeleton } from '@/components/screens/community-life-events/ListSkeleton';
import type { SavedItems } from '@/components/screens/community-life-events/useSavedItems';
import type {
  CommunityLifeLists,
} from '@/components/screens/community-life-events/useCommunityLifeLists';

interface SavedTabProps {
  saved: SavedItems;
  /** The events and directory reads the saved items are picked from: loading, or failed (FARCH-007). */
  lists: CommunityLifeLists;
}

export function SavedTab({ saved, lists }: SavedTabProps) {
  const tokens = useThemeTokens();
  const { savedSearchQuery, setSavedSearchQuery, savedEvents, followedOrgs } = saved;
  const { eventsLoading, eventsError, orgsLoading, orgsError, refresh } = lists;

  return (
    <View className="p-5">
      
      {/* Search bar inside Saved Tab to search saved items */}
      <View className="flex-row bg-surface-card border border-subtle h-11 rounded-2xl px-4 items-center shadow-sm mb-5">
        <Ionicons name="search-outline" size={16} color="#9CA3AF" className="mr-2" />
        <TextInput
          placeholder="Search saved events & followed hubs..."
          value={savedSearchQuery}
          onChangeText={setSavedSearchQuery}
          className="flex-1 text-xs font-semibold text-content-strong"
          placeholderTextColor={tokens.color.text.placeholder}
        />
      </View>

      {/* Saved Events */}
      <Text className="text-xs font-black text-content-faint uppercase tracking-widest mb-3.5">
        Saved Events ({savedEvents.length})
      </Text>
      
      <ListState
        loading={eventsLoading && savedEvents.length === 0}
        skeleton={<ListSkeleton label="Loading saved events" />}
        error={
          eventsError && savedEvents.length === 0
            ? { title: 'Saved events could not be loaded', message: eventsError.message }
            : null
        }
        onRetry={refresh}
        isEmpty={savedEvents.length === 0}
        empty={{ icon: 'bookmark-outline', title: 'No saved events match search' }}
      >
        {savedEvents.map((evt) => (
          <TouchableOpacity
            key={evt.id}
            onPress={() => router.push(`/community-life/event/${evt.id}`)}
            className="bg-surface-card border border-subtle rounded-3xl p-4 mb-4 flex-row items-center shadow-sm"
            activeOpacity={0.9}
          >
            <View className="w-16 h-16 rounded-2xl bg-subtle mr-4 overflow-hidden justify-center items-center">
              <Ionicons name="sparkles" size={24} color="#6B7280" />
            </View>
            <View className="flex-1">
              <Text className="text-[9px] font-black text-primary-500 uppercase">{evt.category}</Text>
              <Text className="text-sm font-black text-content-primary mt-0.5" numberOfLines={1}>
                {evt.title}
              </Text>
              <Text className="text-xs text-content-muted font-bold mt-0.5">
                🗓 {evt.date} · {evt.location.areaName}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
          </TouchableOpacity>
        ))}
      </ListState>

      {/* Followed Organizations */}
      <Text className="text-xs font-black text-content-faint uppercase tracking-widest mb-3.5 mt-4">
        Followed Hubs ({followedOrgs.length})
      </Text>
      
      <ListState
        loading={orgsLoading && followedOrgs.length === 0}
        skeleton={<ListSkeleton label="Loading followed hubs" />}
        error={
          orgsError && followedOrgs.length === 0
            ? { title: 'Followed hubs could not be loaded', message: orgsError.message }
            : null
        }
        onRetry={refresh}
        isEmpty={followedOrgs.length === 0}
        empty={{ icon: 'people-outline', title: 'Not following any hubs yet' }}
      >
        {followedOrgs.map((org) => (
          <TouchableOpacity
            key={org.organizationId}
            onPress={() => router.push(`/community-life/org/${org.organizationId}`)}
            className="bg-surface-card border border-subtle rounded-3xl p-4 mb-4 flex-row items-center shadow-sm"
            activeOpacity={0.9}
          >
            <View className="w-16 h-16 rounded-2xl bg-subtle mr-4 overflow-hidden justify-center items-center">
              <Ionicons name="home" size={24} color="#6B7280" />
            </View>
            <View className="flex-1">
              <Text className="text-[9px] font-black text-primary-500 uppercase">{organizationKind(org)}</Text>
              <Text className="text-sm font-black text-content-primary mt-0.5" numberOfLines={1}>
                {org.name}
              </Text>
              <Text className="text-xs text-content-muted font-bold mt-0.5">
                📍 {organizationLine(org)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
          </TouchableOpacity>
        ))}
      </ListState>

    </View>
  );
}
