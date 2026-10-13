// One notice, in full.
//
// Added 7 Oct 2026 (Phase 10). Attribution comes first after the title:
// "Posted by Diaspora platform admin" for what admins write, never presented as
// a government's. The source link is optional and shown when the admin gave one.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { PostedBy } from '@/components/intelligence/PostedBy';
import { useOfficialNotice } from '@/hooks/country-intelligence';
import { backOr } from '@/lib/navigation';
import { ReactionBar, CommentThread, ReportContentSheet } from '@/components/community-social';
import { useContentComments, useContentEngagement, useReact } from '@/hooks/community-social';
import { useNotification } from '@/providers/notification-provider';

function day(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function NoticeScreen() {
  const bottomInset = useBottomInset();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { notice, isLoading, error } = useOfficialNotice(id ?? null);

  // React, comment and discuss, like any update (13 Oct 2026). No Report on the
  // notice itself — Diaspora published it, and the server refuses one — but
  // members' comments under it can still be reported.
  const noticeId = id ?? null;
  const engagement = useContentEngagement('notice', noticeId);
  const reactions = useReact({ contentType: 'notice', contentId: noticeId ?? '' });
  const thread = useContentComments('notice', noticeId);
  const [reportedCommentId, setReportedCommentId] = useState<string | null>(null);
  const { showAlert } = useNotification();

  if (isLoading) {
    return (
      <SafeAreaView
        edges={['top']}
        className="flex-1 bg-surface-background items-center justify-center"
        accessible
        accessibilityLabel="Loading notice"
      >
        <ActivityIndicator color="#F59300" />
      </SafeAreaView>
    );
  }

  if (!notice) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background items-center justify-center p-6">
        <Text className="text-4xl mb-3">📢</Text>
        <Text className="text-base font-black text-content-primary text-center">
          This notice is not available
        </Text>
        <Text className="text-xs text-content-muted text-center mt-2 leading-relaxed max-w-[280px]">
          {error ?? 'It may have been withdrawn or replaced.'}
        </Text>
        <TouchableOpacity onPress={() => backOr()} className="mt-6 bg-surface-muted px-4 py-2.5 rounded-xl">
          <Text className="text-xs font-black text-content-secondary uppercase">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const { card } = notice;
  const posted = day(card.publishedAt);
  const expires = day(card.expiresAt);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title={`Notice · ${card.countryCode}`} showBack />

      <ScrollEndScrollView className="flex-1" contentContainerStyle={{ paddingBottom: bottomInset }}>
        <View className="p-6">
          <View className="flex-row items-center flex-wrap mb-3">
            <Text className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md mr-2 bg-surface-muted text-content-secondary">
              {card.severity}
            </Text>
            <Text className="text-[11px] font-bold text-content-faint">{card.categoryName}</Text>
          </View>

          <Text className="text-2xl font-black text-content-primary leading-snug mb-2">
            {card.title}
          </Text>

          <View className="mb-1">
            <PostedBy
              postedByPlatform={card.postedByPlatform}
              authorityName={card.authorityName}
              isOfficial={card.isOfficial}
            />
          </View>
          <Text className="text-[11px] font-bold text-content-faint mb-5">
            {posted ? `Posted ${posted}` : ''}
            {posted && expires ? ' · ' : ''}
            {expires ? `${card.isExpired ? 'Expired' : 'Until'} ${expires}` : ''}
          </Text>

          <Text className="text-sm font-semibold text-content-muted leading-relaxed mb-4">
            {card.summary}
          </Text>
          <Text className="text-sm text-content-primary leading-relaxed mb-6">{notice.content}</Text>

          {notice.referenceNumber ? (
            <Text className="text-[11px] font-bold text-content-faint mb-3">
              Reference: {notice.referenceNumber}
            </Text>
          ) : null}

          {notice.sourceUrl ? (
            <TouchableOpacity
              onPress={() => void Linking.openURL(notice.sourceUrl as string)}
              accessibilityRole="link"
              className="bg-surface-card border border-subtle rounded-2xl p-4 items-center"
            >
              <Text className="text-xs font-black text-content-secondary uppercase tracking-widest">
                Read the source
              </Text>
            </TouchableOpacity>
          ) : null}

          {engagement.data ? (
            <View className="mt-6 pt-4 border-t border-faint">
              <ReactionBar
                content={engagement.data}
                contentType="notice"
                onReact={(key) => void reactions.react(key)}
                onUnreact={(key) => void reactions.unreact(key)}
                isPending={reactions.isPending}
              />
            </View>
          ) : null}

          <View className="mt-8">
            <Text className="text-lg font-black text-content-primary mb-4">💬 Discussion</Text>
            <CommentThread
              target={{ contentType: 'notice', contentId: card.officialNoticeId }}
              thread={thread}
              onReport={(commentId) => setReportedCommentId(commentId)}
            />
          </View>
        </View>
      </ScrollEndScrollView>

      <ReportContentSheet
        visible={reportedCommentId !== null}
        onClose={() => setReportedCommentId(null)}
        contentType="comment"
        contentId={reportedCommentId}
        onReported={() =>
          showAlert({
            type: 'success',
            title: 'Report sent',
            message: 'A moderator will look at it. Thank you.',
          })
        }
      />
    </SafeAreaView>
  );
}
