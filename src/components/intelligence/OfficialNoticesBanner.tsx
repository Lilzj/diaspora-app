// ─────────────────────────────────────────────────────────────────────────────
// Official notices on Home, for the country the member is in
//
// Added 8 Oct 2026. A platform admin published a notice for Mauritius and a
// member there could not find it: the only list was under Knowledge →
// contributors → a country page → Notices. The owner decided notices belong on
// Home, newest first, with a way into the full list.
//
// Renders nothing while loading, on failure, or when there is nothing in
// force: Home is not the place to say "no notices", and the list screen is.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

import { PostedBy } from '@/components/intelligence/PostedBy';
import { useOfficialNotices } from '@/hooks/country-intelligence';

/** How many notices Home shows before "See all". */
export const HOME_NOTICE_LIMIT = 2;

export function OfficialNoticesBanner({
  countryCode,
  countryName,
}: {
  countryCode: string;
  countryName: string;
}) {
  const code = countryCode.toUpperCase();

  // `activeOnly` explicitly: the notices route defaults it to false, because an
  // editor's list has to show drafts and expired notices. A member's Home must not.
  const { notices } = useOfficialNotices(
    { countryCode: code, sort: 'newest', activeOnly: true, limit: HOME_NOTICE_LIMIT },
    { enabled: code.length === 2 },
  );

  if (notices.length === 0) return null;

  return (
    <View className="px-6 mb-4" accessibilityRole="summary">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs font-black text-content-muted uppercase tracking-widest">
          📢 Official notices · {countryName}
        </Text>
        <TouchableOpacity
          onPress={() => router.push(`/intelligence/notices?country=${code}` as never)}
          accessibilityRole="button"
          accessibilityLabel={`See all official notices for ${countryName}`}
        >
          <Text className="text-xs font-bold text-primary-500">See all</Text>
        </TouchableOpacity>
      </View>

      {notices.slice(0, HOME_NOTICE_LIMIT).map((notice) => (
        <TouchableOpacity
          key={notice.officialNoticeId}
          onPress={() => router.push(`/intelligence/notice/${notice.officialNoticeId}` as never)}
          accessibilityRole="button"
          accessibilityLabel={notice.title}
          className="bg-surface-muted border border-subtle rounded-2xl p-4 mb-2"
        >
          <Text className="text-sm font-extrabold text-content-primary mb-1" numberOfLines={2}>
            {notice.title}
          </Text>
          <Text className="text-xs text-content-muted mb-2" numberOfLines={2}>
            {notice.summary}
          </Text>
          <PostedBy
            postedByPlatform={notice.postedByPlatform}
            authorityName={notice.authorityName}
            isOfficial={notice.isOfficial}
            compact
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}
