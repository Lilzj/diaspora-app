// Community Life: the Directory tab, the organisations near the place in view.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, TextInput, ScrollView, TouchableOpacity, Text } from 'react-native';
import { useThemeTokens } from '@/design-system';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TourSpotlight } from '@/components/explore/TourProvider';
import type { OrgCategory } from '@/types/community-life';
import { organizationKind, organizationLine } from '@/lib/domain/organization-summary';
import { EmptyState } from '@/components/screens/community-life-events/EmptyState';
import type {
  DirectorySearch,
} from '@/components/screens/community-life-events/useDirectorySearch';
import type {
  CommunityLifeLists,
} from '@/components/screens/community-life-events/useCommunityLifeLists';
import type { EventsPlace } from '@/components/screens/community-life-events/useEventsPlace';
import type { SavedItems } from '@/components/screens/community-life-events/useSavedItems';

const ORG_CATEGORIES: OrgCategory[] = [
  'Churches', 'Mosques', 'Associations', 'Embassies', 'Student Associations',
  'Professional Associations', 'Community Centres', 'NGOs', 'Doctors', 'Lawyers',
  'Accountants', 'Immigration Consultants', 'Cultural Organizations', 'Sports Clubs',
  'Business Associations', 'Volunteer Organizations', 'Restaurants'
];

interface DirectoryTabProps {
  directorySearch: DirectorySearch;
  lists: CommunityLifeLists;
  place: EventsPlace;
  saved: SavedItems;
}

export function DirectoryTab({ directorySearch, lists, place, saved }: DirectoryTabProps) {
  const tokens = useThemeTokens();
  const { dirQuery, setDirQuery, selectedDirCat, setSelectedDirCat } = directorySearch;
  const { orgsList } = lists;
  const { placeName } = place;
  const { isSaved, handleSaveToggle } = saved;

  return (
    <TourSpotlight spotlightKey="community_organizations_directory">
    <View className="p-5">
      
      {/* Search Bar */}
      <View className="flex-row bg-surface-card border border-subtle h-12 rounded-2xl px-4 items-center shadow-sm mb-4">
        <Ionicons name="search-outline" size={18} color="#9CA3AF" className="mr-2" />
        <TextInput
          placeholder={`Search hubs, lawyers, accountants in ${placeName}...`}
          value={dirQuery}
          onChangeText={setDirQuery}
          className="flex-1 text-xs font-semibold text-content-strong"
          placeholderTextColor={tokens.color.text.placeholder}
        />
      </View>

      {/* Directory Categories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5 pb-1">
        <TouchableOpacity
          onPress={() => setSelectedDirCat('All')}
          className={`px-3 py-1.5 rounded-xl mr-2.5 ${
                    selectedDirCat === 'All' ? 'bg-surface-muted border border-primary-300' : 'bg-surface-muted'
                  }`}
        >
          <Text className={`text-[11px] font-bold ${selectedDirCat === 'All' ? 'text-primary-500' : 'text-content-tertiary'}`}>
            All Organizations
          </Text>
        </TouchableOpacity>
        {ORG_CATEGORIES.map((cat) => {
          const isSelected = selectedDirCat === cat;
          return (
            <TouchableOpacity
              key={cat}
              onPress={() => setSelectedDirCat(cat)}
              className={`px-3 py-1.5 rounded-xl mr-2.5 ${
                        isSelected ? 'bg-surface-muted border border-primary-300' : 'bg-surface-muted'
                      }`}
            >
              <Text className={`text-[11px] font-bold ${isSelected ? 'text-primary-500' : 'text-content-tertiary'}`}>
                {cat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Directory Org Cards */}
      {orgsList.length > 0 ? (
        orgsList.map((org) => {
          const isFollowing = isSaved(org.organizationId);
          return (
            <TouchableOpacity
              key={org.organizationId}
              onPress={() => router.push(`/community-life/org/${org.organizationId}`)}
              className="bg-surface-card rounded-3xl border border-subtle p-4 mb-4 flex-row items-center shadow-sm"
              activeOpacity={0.9}
            >
              <View className="w-16 h-16 rounded-2xl bg-surface-muted justify-center items-center mr-4 overflow-hidden border border-subtle">
                <Ionicons name="home" size={24} color="#6B7280" />
              </View>

              <View className="flex-1 mr-2">
                <View className="flex-row items-center flex-wrap gap-1 mb-1">
                  <Text className="text-[9px] font-black text-primary-500 bg-surface-muted px-2 py-0.5 rounded uppercase">
                    {organizationKind(org)}
                  </Text>
                  {org.isVerified && (
                    <View className="bg-surface-muted px-1.5 py-0.5 rounded flex-row items-center">
                      <Text className="text-[8px] font-extrabold text-success-default mr-0.5">✓ VERIFIED</Text>
                    </View>
                  )}
                </View>
                
                <Text className="text-sm font-black text-content-primary leading-snug" numberOfLines={1}>
                  {org.name}
                </Text>
                
                <Text className="text-[11px] text-content-muted font-semibold mt-0.5">
                  📍 {organizationLine(org)}
                </Text>
              </View>

              {/* Follow Action */}
              <TouchableOpacity
                onPress={() => handleSaveToggle(org.organizationId, 'Organization')}
                className={`px-3 py-1.5 rounded-full border ${
                          isFollowing ? 'bg-surface-background border-subtle' : 'bg-primary-500 border-primary-500'
                        }`}
              >
                <Text className={`text-[10px] font-black ${isFollowing ? 'text-content-muted' : 'text-white'}`}>
                  {isFollowing ? 'Following' : '+ Follow'}
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })
      ) : (
        <EmptyState
          title="No organizations found"
          desc="We couldn't find any listings matching your search. Create one now!"
          actionText="Register Hub"
          onPressAction={() => router.push('/community-life/org/create')}
        />
      )}
    </View>
    </TourSpotlight>
  );
}
