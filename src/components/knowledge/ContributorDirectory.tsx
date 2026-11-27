import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Avatar } from '@/components/Avatar';
import type { ListState } from '@/components/ListState';

import { useCreatorDirectory } from '@/hooks/creator-economy';
import { useLiveFollowerCount } from '@/hooks/community-social';
import type { PublicCreator } from '@/types/creator-economy';

interface ContributorDirectoryProps {
  query: string;
  countryCode?: string | null;
}

/**
 * The directory, in the pieces its parent's list draws it with: the
 * contributors as rows, and what the directory says around them, each in the
 * words and the look it always had.
 */
export interface ContributorDirectoryList {
  /** One row per contributor. None while the first read is in flight, and none once a read has failed. */
  rows: readonly PublicCreator[];
  /** Above the rows, once read: the directory's heading. */
  heading: React.ReactElement | null;
  /**
   * For `<ListState {...state} />` where the rows would be: the first read, a
   * read that failed, or nobody listed. The spinner and the failure stand in
   * for the whole directory, heading included, as they always did.
   */
  state: React.ComponentProps<typeof ListState>;
  /** Below the rows, once read: "Show more contributors", and the space the directory keeps below itself. */
  footer: React.ReactElement | null;
}

/** Stable, so a directory with nothing to show is the same empty list on every render. */
const NO_ROWS: readonly PublicCreator[] = [];

/**
 * The people who write for the community, from `GET /creators`.
 *
 * Added 20 Oct 2026. The Contributors tab said "Diaspora does not have a
 * contributor directory": an audit claim that was false, because the Creator
 * module served the directory all along. A row opens the contributor's page,
 * keyed by the member's user id (what their guides and follows are keyed by).
 * Members who opted out of discovery are not listed, by the server.
 *
 * A hook since 27 Nov 2026 (FARCH-004). The directory pages ("Show more
 * contributors"), and it drew its rows with `.map()` inside its parent's
 * scroll view, so every page a member asked for stayed mounted. Each parent,
 * the Knowledge Hub's Contributors tab and a country page, is one FlashList
 * now: its own content around the directory, and the contributors as rows.
 */
export function useContributorDirectory({ query, countryCode }: ContributorDirectoryProps): ContributorDirectoryList {
  const directory = useCreatorDirectory({
    query: query.trim() || undefined,
    country: countryCode ?? undefined,
  });

  const read = !directory.isLoading && !directory.isError;

  return {
    rows: read ? directory.creators : NO_ROWS,
    heading: read ? (
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">
        ⭐ Contributors
      </Text>
    ) : null,
    state: {
      loading: directory.isLoading,
      skeleton: (
        <View className="py-6 items-center">
          <ActivityIndicator />
        </View>
      ),
      error: directory.isError ? (
        <View className="bg-surface-card rounded-3xl border border-subtle p-5 mb-5">
          <Text className="text-sm font-bold text-content-primary">Contributors could not be loaded</Text>
          <TouchableOpacity onPress={() => void directory.refetch()} className="mt-2" accessibilityRole="button">
            <Text className="text-sm font-bold text-primary-500">Try again</Text>
          </TouchableOpacity>
        </View>
      ) : null,
      // Read, and nobody listed. Drawn where the rows would be, so only when there are none.
      children: (
        <View className="bg-surface-card rounded-3xl border border-subtle p-5">
          <Text className="text-sm text-content-muted">
            {query.trim() ? 'No contributor matches that search.' : 'Nobody is listed as a contributor yet.'}
          </Text>
        </View>
      ),
    },
    footer: read ? (
      <View className="mb-5">
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
    ) : null,
  };
}

export const contributorKey = (creator: PublicCreator) => creator.creatorId;

/** One contributor: a row of its parent's list, recycled from one contributor to the next. */
export function ContributorRow({ creator }: { creator: PublicCreator }) {
  const target = creator.userId ? `/contributor/${creator.userId}` : null;
  // Moves when the member follows this contributor anywhere (Android UAT, 3 Nov 2026).
  const followers = useLiveFollowerCount(creator.userId ?? undefined, creator.followers);

  return (
    <TouchableOpacity
      onPress={() => target && router.push(target as never)}
      disabled={!target}
      accessibilityRole="button"
      accessibilityLabel={`${creator.displayName}, ${creator.contentPublished} published`}
      className="bg-surface-card rounded-2xl border border-subtle p-4 mb-2 flex-row items-center"
    >
      <View className="mr-3">
        {/* `Avatar` keys its photograph to the address, so a row handed the next
            contributor starts blank rather than showing the last one's face. */}
        <Avatar uri={creator.avatarUrl} name={creator.displayName} size={44} />
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
