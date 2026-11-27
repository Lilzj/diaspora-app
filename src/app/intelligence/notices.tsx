// Notices for one country, newest first.
//
// Added 7 Oct 2026 (Phase 10). The server served notices from the start and
// `useOfficialNotices` existed, but no screen listed them. Notices are written by
// Diaspora platform admins and each says so ("Posted by Diaspora platform admin").

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ListEmpty, ListState } from '@/components/ListState';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { PostedBy } from '@/components/intelligence/PostedBy';
import { useOfficialNotices } from '@/hooks/country-intelligence';
import type { OfficialNoticeCardResponse } from '@/types/country-intelligence';

const SEVERITY_TONE: Record<string, string> = {
  Critical: 'bg-surface-muted text-error-default',
  High: 'bg-surface-muted text-warning-default',
};

/** One notice. Module-level, so the list keeps a row until its notice changes (FARCH-004). */
function renderNotice({ item }: ListRenderItemInfo<OfficialNoticeCardResponse>) {
  return <NoticeCard notice={item} />;
}

export default function NoticesScreen() {
  const bottomInset = useBottomInset();
  const { country } = useLocalSearchParams<{ country?: string }>();
  const code = (country ?? '').toUpperCase();

  const results = useOfficialNotices({ countryCode: code, sort: 'newest' }, { enabled: !!code });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title={code ? `Notices · ${code}` : 'Notices'} showBack />

      <ListState
        loading={results.isLoading}
        loadingLabel="Loading notices"
        error={results.error && results.notices.length === 0 ? { title: 'Notices are unavailable', message: results.error } : null}
        onRetry={results.refresh}
      >
        {/* A FlashList since 27 Nov 2026 (FARCH-004): the notices page as the member
            scrolls, and their rows are recycled rather than every page staying mounted. */}
        <FlashList
          data={results.notices}
          keyExtractor={(notice) => notice.officialNoticeId}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomInset }}
          onEndReached={() => {
            if (results.hasMore) results.loadMore();
          }}
          ListEmptyComponent={
            <ListEmpty
              icon="megaphone-outline"
              title={`No notices for ${code || 'this country'}`}
              message="When Diaspora posts something members here should know, it appears here."
            />
          }
          renderItem={renderNotice}
        />
      </ListState>
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
