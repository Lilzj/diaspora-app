// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator content (Frontend Phase 7, §26 · §27)
//
// §26: "Do not create a second content system. Integrate existing modules."
//
// This screen creates nothing and manages nothing. Diaspora already has a
// content management surface — Creator Studio at `/profile/creator-dashboard`,
// with its drafts, its archive, its bulk actions, its health centre and its
// publishing identities — and duplicating any of that would be the exact
// mistake the brief opens by warning against.
//
// What this screen is: the **performance-first** view of the same content, and
// the route into the two things a creator wants to do with a piece once it is
// published — see how it did, and promote it. Everything structural routes
// straight into Creator Studio.
//
// Whether that is a screen worth having is a fair question. It is, because the
// two surfaces answer different questions. Creator Studio answers "what is the
// state of my listings"; this answers "what of mine is working". A creator
// asking the second question in Creator Studio has to read a grid of statuses
// to find out.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import {
  CreatorCard,
  CreatorEmptyState,
  CreatorScreen,
  CreatorSection,
} from '@/components/creator-economy';
import { useContentPerformance, useCreatorAccess } from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { formatCount } from '@/lib/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import { formatRelativeTime } from '@/utils/format';
import type { AnalyticsRange, CreatorContentPerformance } from '@/types/creator-economy';

const TYPES = ['all', 'Guide', 'Update', 'Event'] as const;

const RANGE: AnalyticsRange = { period: '30d', from: null, to: null };

export default function CreatorContentScreen() {
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const [type, setType] = useState<string>('all');
  const [isRefreshing, setRefreshing] = useState(false);

  const content = useContentPerformance(RANGE, type === 'all' ? undefined : type);
  const access = useCreatorAccess();

  useEffect(() => {
    trackCreatorEvent('creator.analytics.content_viewed', { surface: 'content' });
  }, []);

  const refusal = checkCreatorAccess(CreatorCapabilities.ViewDashboard, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await content.refetch();
    setRefreshing(false);
  }, [content]);

  return (
    <CreatorScreen
      title="Your content"
      subtitle="What you have published, and how it is doing"
      gapKey="analytics"
      gapDetail="The performance figures are simulated. The content itself is real — it is the same content Creator Studio manages, and everything structural is done there."
      isEnabled={content.isEnabled}
      refusal={refusal}
      error={content.error}
      onRetry={content.refetch}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      sticky={
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderBottomColor: tokens.color.border.default,
          }}
          className="border-b px-5 py-3"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 16 }}
          >
            {TYPES.map((item) => {
              const isActive = type === item;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={item === 'all' ? 'Everything' : `${item}s only`}
                  onPress={() => setType(item)}
                  style={{
                    backgroundColor: isActive
                      ? tokens.color.primary[500]
                      : tokens.color.surface.background,
                    borderColor: isActive ? tokens.color.primary[500] : tokens.color.border.default,
                  }}
                  className="rounded-full border px-3.5 py-2 mr-2"
                >
                  <Text
                    style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                    className="text-[11px] font-black"
                  >
                    {item === 'all' ? 'Everything' : `${item}s`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      }
    >
      <View className="px-5 pt-5">
        {/* ── Create ───────────────────────────────────────────────────── */}
        <View className="flex-row -mx-1 mb-5">
          {[
            { icon: 'create-outline', label: 'Guide', route: '/guide/create' },
            { icon: 'megaphone-outline', label: 'Update', route: '/update/create' },
            { icon: 'calendar-outline', label: 'Event', route: '/community-life/event/create' },
          ].map((action) => (
            <View key={action.route} className="flex-1 px-1">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Create a ${action.label.toLowerCase()}`}
                onPress={() => router.push(action.route as never)}
                style={{
                  backgroundColor: tokens.color.surface.card,
                  borderColor: tokens.color.border.default,
                }}
                className="rounded-2xl border p-3 items-center"
              >
                <Ionicons name={action.icon as never} size={19} color={tokens.color.primary[500]} />
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-[11px] font-black mt-1.5"
                >
                  {action.label}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        {/* ── Published, ordered by performance ────────────────────────── */}
        <CreatorSection title="Published" subtitle="Last 30 days, best first">
          {content.isLoading ? (
            <View className="py-10 items-center">
              <ActivityIndicator size="small" color={tokens.color.primary[500]} />
            </View>
          ) : content.items.length === 0 ? (
            <CreatorEmptyState
              icon="document-text-outline"
              title="Nothing published yet"
              body="Write the guide you wish had existed when you arrived."
              actionLabel="Write a guide"
              onAction={() => router.push('/guide/create')}
            />
          ) : (
            <>
              {content.items.map((item) => (
                <ContentRow key={item.contentId} item={item} />
              ))}

              {content.hasNextPage ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Load more"
                  accessibilityState={{ busy: content.isFetchingNextPage }}
                  disabled={content.isFetchingNextPage}
                  onPress={() => content.fetchNextPage()}
                  className="py-3 items-center"
                >
                  <Text
                    style={{ color: tokens.color.primary[500] }}
                    className="text-[11px] font-black uppercase tracking-wider"
                  >
                    {content.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </CreatorSection>

        {/* ── Everything structural lives in Creator Studio ────────────── */}
        <CreatorSection
          title="Managing your content"
          subtitle="Drafts, archive, status changes and bulk actions all live in Creator Studio"
        >
          <CreatorCard padded={false}>
            <StudioRow
              icon="grid-outline"
              label="Creator Studio"
              hint="Everything you have published, in one place"
              onPress={() => router.push('/profile/creator-dashboard')}
            />
            <StudioRow
              icon="document-outline"
              label="Drafts"
              hint="Unfinished pieces"
              onPress={() => router.push('/profile/creator-dashboard')}
            />
            <StudioRow
              icon="archive-outline"
              label="Archive"
              hint="Things you have taken down"
              onPress={() => router.push('/profile/creator-dashboard')}
            />
            <StudioRow
              icon="megaphone-outline"
              label="Promote something"
              hint="Put a piece in front of more people"
              onPress={() => router.push('/creator/sponsored')}
              isLast
            />
          </CreatorCard>
        </CreatorSection>
      </View>
    </CreatorScreen>
  );
}

function ContentRow({ item }: { item: CreatorContentPerformance }) {
  const { tokens } = useTheme();
  const headline = item.metrics[0];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        item.title,
        `${item.contentType}, ${item.status}.`,
        headline ? `${headline.label}: ${formatCount(headline.value)}.` : null,
        item.isSponsored ? 'Currently promoted.' : null,
      ]
        .filter(Boolean)
        .join(' ')}
      onPress={() => router.push('/creator/analytics')}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border p-4 mb-2.5 flex-row items-center"
    >
      <View className="flex-1 mr-3">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-[13px] font-bold leading-snug"
          numberOfLines={2}
        >
          {item.title}
        </Text>

        <View className="flex-row items-center mt-1">
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-bold"
          >
            {String(item.contentType)} · {item.status}
            {item.publishedAt ? ` · ${formatRelativeTime(item.publishedAt)}` : ''}
          </Text>

          {item.isSponsored ? (
            <View
              style={{ backgroundColor: tokens.color.primary[50] }}
              className="rounded-full px-1.5 py-0.5 ml-2"
            >
              <Text
                style={{ color: tokens.color.primary[600] }}
                className="text-[8px] font-black uppercase tracking-widest"
              >
                Promoted
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {headline ? (
        <View className="items-end mr-2">
          <Text
            style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
            className="text-[15px] font-black"
          >
            {formatCount(headline.value)}
          </Text>
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-black uppercase tracking-widest"
          >
            {headline.label}
          </Text>
        </View>
      ) : null}

      <Ionicons name="chevron-forward" size={15} color={tokens.color.text.placeholder} />
    </Pressable>
  );
}

function StudioRow({
  icon,
  label,
  hint,
  onPress,
  isLast = false,
}: {
  icon: string;
  label: string;
  hint: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}.`}
      onPress={onPress}
      style={{
        borderBottomColor: tokens.color.border.default,
        borderBottomWidth: isLast ? 0 : 1,
      }}
      className="flex-row items-center px-4 py-3.5"
    >
      <Ionicons name={icon as never} size={17} color={tokens.color.text.secondary} />
      <View className="flex-1 mx-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-bold">
          {label}
        </Text>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold mt-0.5"
        >
          {hint}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
    </Pressable>
  );
}
