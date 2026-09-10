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
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import {
  AnnouncementCard,
  Card,
  EmptyState,
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

interface PostsTabProps {
  organizationId: string;
  organizationName: string;
  capabilities: OrganizationCapabilities;
  onOpenRoute: (route: string) => void;
}

export function PostsTab({
  organizationId,
  organizationName,
  capabilities,
  onOpenRoute,
}: PostsTabProps) {
  const { tokens } = useTheme();
  const { showToast, showAlert } = useNotification();
  const [isComposing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

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

  if (!isEnabled) return <TabUnavailable label="Posts" />;
  if (isLoading) return <TabLoading label="posts" />;
  if (isError)
    return (
      <TabError
        label="Posts"
        subject="reading what it has published"
        kind={error?.kind}
        onRetry={() => void refetch()}
      />
    );

  return (
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

      {/* ── The list ─────────────────────────────────────────────────────── */}
      {announcements.length === 0 && !isComposing ? (
        <EmptyState
          icon="megaphone-outline"
          title="No posts yet"
          body={`Share updates, announcements and community news from ${organizationName}. Members see them in their inbox.`}
          action={canPublish ? 'Write the first post' : undefined}
          onAction={canPublish ? () => setComposing(true) : undefined}
        />
      ) : null}

      {announcements.map((announcement) => (
        <View key={announcement.announcementId} className="mb-2">
          <AnnouncementCard
            announcement={announcement}
            onPress={() =>
              announcement.actionRoute
                ? onOpenRoute(announcement.actionRoute)
                : showAlert({
                    type: 'info',
                    title: announcement.title,
                    message: announcement.body,
                    buttons: [{ text: 'Close', style: 'cancel' }],
                  })
            }
          />
        </View>
      ))}

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
    </View>
  );
}
