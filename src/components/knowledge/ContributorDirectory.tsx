import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';

import { useCreatorDirectory } from '@/hooks/creator-economy';
import { useLiveFollowerCount } from '@/hooks/community-social';
import type { PublicCreator } from '@/types/creator-economy';

interface ContributorDirectoryProps {
  query: string;
  countryCode?: string | null;
}

/**
 * The people who write for the community, from `GET /creators`.
 *
 * Added 20 Oct 2026. The Contributors tab said "Diaspora does not have a
 * contributor directory": an audit claim that was false, because the Creator
 * module served the directory all along. A row opens the contributor's page,
 * keyed by the member's user id (what their guides and follows are keyed by).
 * Members who opted out of discovery are not listed, by the server.
 */
export function ContributorDirectory({ query, countryCode }: ContributorDirectoryProps) {
  const directory = useCreatorDirectory({
    query: query.trim() || undefined,
    country: countryCode ?? undefined,
  });

  if (directory.isLoading) {
    return (
      <View className="py-6 items-center">
        <ActivityIndicator />
      </View>
    );
  }

  if (directory.isError) {
    return (
      <View className="bg-surface-card rounded-3xl border border-subtle p-5 mb-5">
        <Text className="text-sm font-bold text-content-primary">Contributors could not be loaded</Text>
        <TouchableOpacity onPress={() => void directory.refetch()} className="mt-2" accessibilityRole="button">
          <Text className="text-sm font-bold text-primary-500">Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="mb-5">
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">
        ⭐ Contributors
      </Text>
      {directory.creators.length === 0 ? (
        <View className="bg-surface-card rounded-3xl border border-subtle p-5">
          <Text className="text-sm text-content-muted">
            {query.trim() ? 'No contributor matches that search.' : 'Nobody is listed as a contributor yet.'}
          </Text>
        </View>
      ) : (
        directory.creators.map((creator) => <ContributorRow key={creator.creatorId} creator={creator} />)
      )}
      {directory.hasNextPage ? (
        <TouchableOpacity
          onPress={() => void directory.fetchNextPage()}
          disabled={directory.isFetchingNextPage}
          accessibilityRole="button"
          className="items-center py-3"
        >
          <Text className="text-sm font-bold text-primary-500">
            {directory.isFetchingNextPage ? 'Loading…' : 'Show more contributors'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function ContributorRow({ creator }: { creator: PublicCreator }) {
  const target = creator.userId ? `/contributor/${creator.userId}` : null;
  // Moves when the member follows this contributor anywhere (Android UAT, 3 Nov 2026).
  const followers = useLiveFollowerCount(creator.userId ?? undefined, creator.followers);
  const initials = creator.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <TouchableOpacity
      onPress={() => target && router.push(target as never)}
      disabled={!target}
      accessibilityRole="button"
      accessibilityLabel={`${creator.displayName}, ${creator.contentPublished} published`}
      className="bg-surface-card rounded-2xl border border-subtle p-4 mb-2 flex-row items-center"
    >
      <View className="w-11 h-11 rounded-full bg-primary-50 items-center justify-center mr-3">
        <Text className="text-sm font-black text-primary-600">{initials || '?'}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-extrabold text-content-primary" numberOfLines={1}>
          {creator.displayName} {creator.isVerifiedCreator ? '✓' : ''}
        </Text>
        <Text className="text-xs text-content-muted mt-0.5" numberOfLines={1}>
          {creator.contentPublished} published · {followers}{' '}
          {followers === 1 ? 'follower' : 'followers'}
          {creator.expertise.length > 0 ? ` · ${creator.expertise.slice(0, 2).join(', ')}` : ''}
        </Text>
      </View>
      <Text className="text-content-faint text-lg">›</Text>
    </TouchableOpacity>
  );
}
