// ─────────────────────────────────────────────────────────────────────────────
// Community announcements (§33)
//
// The *feed*. Delivery is not here and never will be: every announcement that
// reaches a member reaches them through B13, the platform's existing
// notification infrastructure, and §33 says plainly not to build a second
// delivery system. `notification-routes.ts` already routes an announcement
// notification to this screen.
//
// Publishing is role-gated and refused server-side when the caller's
// organization capabilities do not include `canPublishAnnouncements`.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  AnnouncementCard,
  Card,
  ChipRow,
  CommunityScreen,
  EmptyState,
  InlineRefusal,
  PrimaryButton,
  SecondaryButton,
} from '@/components/community';
import { FinancialErrorInline } from '@/components/financial';
import {
  useAnnouncements,
  useOrganizationCapabilities,
  usePublishAnnouncement,
} from '@/hooks/community-life';
import { trackCommunityEvent } from '@/lib/community-analytics';
import type { AnnouncementScope } from '@/types/community-advanced';
import type { FinancialError } from '@/lib/financial-errors';

export default function AnnouncementsScreen() {
  const { scope, scopeId } = useLocalSearchParams<{ scope?: AnnouncementScope; scopeId?: string }>();
  const { tokens } = useTheme();

  const [filter, setFilter] = useState<AnnouncementScope | ''>(scope ?? '');
  const [isComposing, setIsComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const { capabilities } = useOrganizationCapabilities(scopeId);
  const publish = usePublishAnnouncement();

  const {
    announcements,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isEnabled,
  } = useAnnouncements({ scope: filter || undefined, scopeId });

  const canPublish = Boolean(scopeId) && capabilities.canPublishAnnouncements;

  return (
    <CommunityScreen
      title="Announcements"
      gapKey="announcements"
      gapDetail="The announcement feed is simulated. Delivery is not — every announcement notification goes through Diaspora's real notification system, and this phase adds no second one."
      isEnabled={isEnabled}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
      headerRight={
        canPublish && !isComposing ? (
          <Ionicons
            name="create-outline"
            size={22}
            color={tokens.color.primary[500]}
            accessibilityRole="button"
            accessibilityLabel="Write an announcement"
            style={{ marginRight: 12 }}
            onPress={() => setIsComposing(true)}
          />
        ) : undefined
      }
      footer={
        isComposing ? (
          <View>
            {publish.isError ? (
              <View className="mb-3">
                <FinancialErrorInline error={publish.error as FinancialError} />
              </View>
            ) : null}
            <PrimaryButton
              label="Publish"
              icon="megaphone-outline"
              busy={publish.isPending}
              disabled={publish.isPending || !title.trim() || !body.trim()}
              accessibilityHint="Sends this to your members' Diaspora inbox"
              onPress={() =>
                publish.mutate(
                  {
                    scope: 'Organization',
                    scopeId,
                    title: title.trim(),
                    body: body.trim(),
                  },
                  {
                    onSuccess: () => {
                      setIsComposing(false);
                      setTitle('');
                      setBody('');
                    },
                  }
                )
              }
            />
            <View className="mt-2.5">
              <SecondaryButton label="Cancel" onPress={() => setIsComposing(false)} />
            </View>
          </View>
        ) : null
      }
    >
      {isComposing ? (
        <View className="px-5 pt-4">
          <InlineRefusal
            icon="notifications-outline"
            reason="This goes to every member of the organisation through their normal Diaspora notifications. They can change how they are notified in their own settings."
          />

          <View className="mt-5">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-xs font-bold mb-1"
              nativeID="announcement-title"
            >
              Title *
            </Text>
            <TextInput
              accessibilityLabel="Announcement title, required"
              value={title}
              onChangeText={setTitle}
              maxLength={90}
              placeholder="Annual general meeting — 2 August"
              placeholderTextColor={tokens.color.text.placeholder}
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
                color: tokens.color.text.primary,
                minHeight: 48,
              }}
              className="rounded-xl border px-4 text-sm font-semibold"
            />
          </View>

          <View className="mt-4">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-xs font-bold mb-1"
              nativeID="announcement-body"
            >
              What do they need to know? *
            </Text>
            <TextInput
              accessibilityLabel="Announcement body, required"
              value={body}
              onChangeText={setBody}
              multiline
              numberOfLines={7}
              placeholder="Where, when, and what they should bring or do."
              placeholderTextColor={tokens.color.text.placeholder}
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
                color: tokens.color.text.primary,
                minHeight: 160,
                textAlignVertical: 'top',
              }}
              className="rounded-xl border px-4 py-3 text-sm font-semibold"
            />
          </View>

          <View className="mt-5">
            <Text
              accessibilityRole="header"
              style={{ color: tokens.color.text.primary }}
              className="text-xs font-black tracking-tight mb-2"
            >
              Preview
            </Text>
            <Card>
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-sm font-black tracking-tight"
              >
                {title.trim() || 'Your title'}
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold mt-1.5 leading-relaxed"
              >
                {body.trim() || 'What you write will appear here.'}
              </Text>
            </Card>
          </View>
        </View>
      ) : (
        <>
          <View className="px-5 pt-4">
            <ChipRow
              accessibilityLabel="Filter announcements"
              options={[
                { value: '' as const, label: 'Everything' },
                { value: 'Organization' as const, label: 'Organisations' },
                { value: 'Neighborhood' as const, label: 'Neighbourhood' },
                { value: 'Campaign' as const, label: 'Fundraising' },
                { value: 'Event' as const, label: 'Events' },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </View>

          <View className="px-5 mt-4">
            {announcements.length === 0 && !isLoading ? (
              <EmptyState
                icon="megaphone-outline"
                title="Nothing announced"
                body="When a community you belong to has something to say, it will be here and in your notifications."
              />
            ) : (
              announcements.map((announcement) => (
                <View key={announcement.announcementId} className="mb-2.5">
                  <AnnouncementCard
                    announcement={announcement}
                    onPress={() => {
                      trackCommunityEvent('community.announcement.viewed', {
                        announcementId: announcement.announcementId,
                        scope: announcement.scope,
                      });
                      if (announcement.actionRoute) router.push(announcement.actionRoute as never);
                    }}
                  />
                </View>
              ))
            )}

            {hasNextPage ? (
              <View className="mb-4">
                {isFetchingNextPage ? (
                  <View className="py-4 items-center" accessibilityLabel="Loading more">
                    <ActivityIndicator size="small" color={tokens.color.primary[500]} />
                  </View>
                ) : (
                  <SecondaryButton label="Show more" onPress={() => void fetchNextPage()} />
                )}
              </View>
            ) : null}

            <InlineRefusal
              icon="notifications-outline"
              reason="Announcements also arrive in your Diaspora notifications. You choose which ones reach you in Settings."
            />
          </View>
        </>
      )}
    </CommunityScreen>
  );
}
