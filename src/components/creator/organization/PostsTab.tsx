// ─────────────────────────────────────────────────────────────────────────────
// Posts — §10, §11, §12
//
// What an organisation publishes is an *announcement* in this platform, not a
// third content type. `useAnnouncements({ scope: 'Organization', scopeId })`
// already returns them, `usePublishAnnouncement` already writes them, and
// `AnnouncementCard` already draws one — Community Life's announcements screen
// uses all three.
//
// §10 asks not to create another post card if the platform has one. It has one.
//
// ── What is missing, and is said rather than hidden ──────────────────────────
//
// The contract publishes and lists. It does not edit, delete, archive or
// unpublish, and there is no draft state on an announcement. §11 says to build
// the intended flow and document the gap rather than silently omit it, so the
// composer is here and the row actions say what they are waiting for.
//
// The tab pages, so its rows are the sheet's list (FARCH-004, 27 Nov 2026):
// `usePostsTab` hands the sheet the composer and the heading above them, the
// posts as rows, and the next page below them.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { ListRenderItemInfo } from '@shopify/flash-list';

import {
  AnnouncementCard,
  Card,
  PrimaryButton,
  SecondaryButton,
} from '@/components/community';
import { useTheme } from '@/design-system';
import { useNotification } from '@/providers/notification-provider';
import { useAnnouncements, usePublishAnnouncement } from '@/hooks/community-life';
import type { OrganizationCapabilities } from '@/types/community-advanced';

import {
  TabError,
  TabGapNote,
  TabHeading,
  TabLoading,
  TabUnavailable,
} from './OrganizationTabShared';
import { NO_ROWS, type OrganizationRow, type OrganizationTabList } from './OrganizationRows';

interface PostsTabProps {
  organizationId: string;
  organizationName: string;
  capabilities: OrganizationCapabilities;
  onOpenRoute: (route: string) => void;
  /** Whether Posts is the tab in view. */
  active: boolean;
}

export function usePostsTab({
  organizationId,
  organizationName,
  capabilities,
  onOpenRoute,
  active,
}: PostsTabProps): OrganizationTabList {
  const { tokens } = useTheme();
  const { showToast, showAlert } = useNotification();
  const [isComposing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  // The composer was the tab's own, and closed, empty, when the member left the
  // tab. The sheet holds it now (its list draws the posts), and leaving the tab
  // still closes it.
  const [visiting, setVisiting] = useState(active);
  if (visiting !== active) {
    setVisiting(active);
    setComposing(false);
    setTitle('');
    setBody('');
  }

  // Read for as long as the sheet is open, whichever tab is in view:
  // `useAnnouncements` takes no switch, and Timeline, the tab the sheet opens
  // on, reads the same query under the same key.
  const {
    announcements,
    isLoading,
    isError,
    error,
    isEnabled,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useAnnouncements({ scope: 'Organization', scopeId: organizationId });

  const publish = usePublishAnnouncement();

  const canPublish = capabilities.canPublishAnnouncements;
  const isValid = title.trim().length > 2 && body.trim().length > 10;

  const submit = () => {
    publish.mutate(
      {
        scope: 'Organization',
        scopeId: organizationId,
        title: title.trim(),
        body: body.trim(),
        // **`mediaIds`, not `mediaUrls`.** The gap adapter took URLs; the
        // platform takes B5 asset identifiers, and a screen that attaches an
        // image here must upload it to Media first and send the id back. This
        // composer has no attachment control, so it sends none rather than
        // sending an empty field under a name the route does not bind.
        mediaIds: [],
        isPinned: false,
      },
      {
        onSuccess: () => {
          setComposing(false);
          setTitle('');
          setBody('');
          showToast({
            type: 'success',
            title: 'Posted',
            message: `Published as ${organizationName}.`,
          });
        },
        onError: () => {
          showToast({
            type: 'error',
            title: 'Not published',
            message: 'The organisation refused this post. Your permissions may have changed.',
          });
        },
      },
    );
  };

  // Read, and readable: until then the tab's loading, its failure or its
  // unavailability stands in for all of it, as each did.
  const listed = isEnabled && !isLoading && !isError;

  // One post. Kept while the route opener and the alert are, so a row is
  // redrawn only when its post changes.
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<OrganizationRow>) =>
      'announcementId' in item ? (
        <View className="mb-2">
          <AnnouncementCard
            announcement={item}
            onPress={() =>
              item.actionRoute
                ? onOpenRoute(item.actionRoute)
                : showAlert({
                    type: 'info',
                    title: item.title,
                    message: item.body,
                    buttons: [{ text: 'Close', style: 'cancel' }],
                  })
            }
          />
        </View>
      ) : null,
    [onOpenRoute, showAlert]
  );

  return {
    header: listed ? (
      <View>
        <TabGapNote>
          Posts are the organisation&apos;s announcements. Listing and publishing are wired to a
          development adapter; editing and deleting have no contract yet.
        </TabGapNote>

        <TabHeading
          title="Posts"
          count={announcements.length}
          action={canPublish && !isComposing ? '+ New post' : undefined}
          onAction={canPublish ? () => setComposing(true) : undefined}
        />

        {/* ── Composer ─────────────────────────────────────────────────────── */}
        {isComposing ? (
          <Card style={{ marginBottom: 12 }}>
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[9px] font-black uppercase tracking-widest mb-2"
            >
              Posting as {organizationName}
            </Text>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor={tokens.color.text.placeholder}
              accessibilityLabel="Post title"
              style={{
                color: tokens.color.text.primary,
                backgroundColor: tokens.color.surface.background,
                borderColor: tokens.color.border.default,
              }}
              className="rounded-2xl border px-3.5 py-2.5 text-[12px] font-bold mb-2"
            />

            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="What do you want the organisation to say?"
              placeholderTextColor={tokens.color.text.placeholder}
              accessibilityLabel="Post body"
              multiline
              numberOfLines={4}
              style={{
                color: tokens.color.text.primary,
                backgroundColor: tokens.color.surface.background,
                borderColor: tokens.color.border.default,
                minHeight: 88,
                textAlignVertical: 'top',
              }}
              className="rounded-2xl border px-3.5 py-2.5 text-[12px] font-semibold mb-3"
            />

            <PrimaryButton
              label="Publish"
              disabled={!isValid || publish.isPending}
              busy={publish.isPending}
              onPress={submit}
            />
            <View className="mt-2">
              <SecondaryButton
                label="Cancel"
                onPress={() => {
                  setComposing(false);
                  setTitle('');
                  setBody('');
                }}
              />
            </View>
          </Card>
        ) : null}
      </View>
    ) : null,
    rows: listed ? announcements : NO_ROWS,
    renderItem,
    state: {
      // Unavailable first, as it was: nothing was asked, so nothing is loading.
      loading: isEnabled && isLoading,
      skeleton: <TabLoading label="posts" />,
      error: !isEnabled ? (
        <TabUnavailable label="Posts" />
      ) : isError ? (
        <TabError
          label="Posts"
          subject="reading what it has published"
          kind={error?.kind}
          onRetry={() => void refetch()}
        />
      ) : null,
      // Nothing in place of the posts while the composer is open above them.
      isEmpty: announcements.length === 0 && !isComposing,
      empty: {
        icon: 'megaphone-outline',
        title: 'No posts yet',
        message: `Share updates, announcements and community news from ${organizationName}. Members see them in their inbox.`,
        action: canPublish ? { label: 'Write the first post', onPress: () => setComposing(true) } : undefined,
      },
    },
    footer: listed ? (
      <>
        {hasNextPage ? (
          <SecondaryButton
            label={isFetchingNextPage ? 'Loading…' : 'Load more posts'}
            icon="arrow-down-circle-outline"
            disabled={isFetchingNextPage}
            onPress={() => void fetchNextPage()}
          />
        ) : null}

        {announcements.length > 0 && canPublish ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-medium leading-relaxed mt-2 px-1"
          >
            Editing and deleting a published post are not available yet — the organisation service
            exposes publishing and listing only.
          </Text>
        ) : null}
      </>
    ) : null,
  };
}
