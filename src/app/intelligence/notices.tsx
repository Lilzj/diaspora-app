// Notices for one country, newest first.
//
// Added 7 Oct 2026 (Phase 10). The server served notices from the start and
// `useOfficialNotices` existed, but no screen listed them. Notices are written by
// Diaspora platform admins and each says so ("Posted by Diaspora platform admin").

import React from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { PostedBy } from '@/components/intelligence/PostedBy';
import { useOfficialNotices } from '@/hooks/country-intelligence';
import type { OfficialNoticeCardResponse } from '@/types/country-intelligence';

const SEVERITY_TONE: Record<string, string> = {
  Critical: 'bg-surface-muted text-error-default',
  High: 'bg-surface-muted text-warning-default',
};

export default function NoticesScreen() {
  const bottomInset = useBottomInset();
  const { country } = useLocalSearchParams<{ country?: string }>();
  const code = (country ?? '').toUpperCase();

  const results = useOfficialNotices({ countryCode: code, sort: 'newest' }, { enabled: !!code });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title={code ? `Notices · ${code}` : 'Notices'} showBack />

      {results.isLoading ? (
        <View className="flex-1 items-center justify-center" accessible accessibilityLabel="Loading notices">
          <ActivityIndicator color="#F59300" />
        </View>
      ) : results.error ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-base font-black text-content-primary text-center">
            Notices are unavailable
          </Text>
          <Text className="text-xs text-content-muted text-center mt-2">{results.error}</Text>
          <TouchableOpacity onPress={results.refresh} className="mt-5 bg-surface-muted px-4 py-2.5 rounded-xl">
            <Text className="text-xs font-black text-content-secondary uppercase">Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={results.notices}
          keyExtractor={(notice) => notice.officialNoticeId}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomInset }}
          onEndReached={() => {
            if (results.hasMore) results.loadMore();
          }}
          ListEmptyComponent={
            <View className="items-center p-8">
              <Text className="text-3xl mb-2">📢</Text>
              <Text className="text-base font-black text-content-primary text-center">
                No notices for {code || 'this country'}
              </Text>
              <Text className="text-xs text-content-muted text-center mt-2 leading-relaxed">
                When Diaspora posts something members here should know, it appears here.
              </Text>
            </View>
          }
          renderItem={({ item }) => <NoticeCard notice={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function NoticeCard({ notice }: { notice: OfficialNoticeCardResponse }) {
  return (
    <TouchableOpacity
      onPress={() => router.push(`/intelligence/notice/${notice.officialNoticeId}` as never)}
      accessibilityRole="button"
      accessibilityLabel={notice.title}
      className="bg-surface-card border border-faint rounded-2xl p-4 mb-3"
    >
      <View className="flex-row items-center flex-wrap mb-1.5">
        <Text
          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md mr-2 ${
            SEVERITY_TONE[notice.severity] ?? 'bg-surface-muted text-content-secondary'
          }`}
        >
          {notice.severity}
        </Text>
        <Text className="text-[11px] font-bold text-content-faint">{notice.categoryName}</Text>
        {!notice.isActive ? (
          <Text className="text-[10px] font-black text-error-default uppercase ml-2">
            {notice.isExpired ? 'Expired' : 'Not in force'}
          </Text>
        ) : null}
      </View>

      <Text className="text-base font-extrabold text-content-primary mb-1" numberOfLines={2}>
        {notice.title}
      </Text>
      <Text className="text-sm text-content-muted mb-2" numberOfLines={3}>
        {notice.summary}
      </Text>

      <View className="border-t border-faint pt-2">
        <PostedBy
          postedByPlatform={notice.postedByPlatform}
          authorityName={notice.authorityName}
          isOfficial={notice.isOfficial}
          compact
        />
      </View>
    </TouchableOpacity>
  );
}
