// ─────────────────────────────────────────────────────────────────────────────
// Edit an update — the author's own post (14 Oct 2026)
//
// `updatePost` and `useUpdatePost` were written in Wave D and no screen called
// them, so an author's only remedy for a typo was to remove the update and post
// it again, losing every comment on it.
//
// What is editable is what `UpdatePostRequest` carries: the words, the title, a
// change summary for the revision history, and — for a published alert — its
// urgency. Category, visibility, location, expiry and the poll are not on the
// request, so they are not on this form; offering them would collect changes the
// server discards. Photos are not edited here and are kept by leaving
// `attachments` out of the request — see `postEditRequest`.
//
// Ownership is the server's `canEdit`, never a comparison on the device: the
// post's author id is not on the wire (see `update/[id].tsx`).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { ScreenHeader } from '@/components/ScreenHeader';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { useAlertCapabilities, usePost, useUpdatePost } from '@/hooks/community-social';
import {
  POST_BODY_MAX_LENGTH,
  POST_TITLE_MAX_LENGTH,
  postEditRequest,
} from '@/lib/community-social-api';
import { backOr } from '@/lib/navigation';
import { useNotification } from '@/providers/notification-provider';
import type { CommunityPostUrgency } from '@/types/community-social';

const URGENCIES: { value: CommunityPostUrgency; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'emergency', label: 'Emergency' },
];

function serverMessage(cause: unknown): string {
  const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) return detail;
  return 'Your changes were not saved. Please try again in a moment.';
}

export default function EditUpdateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = typeof id === 'string' && id.length > 0 ? id : null;
  const back = () => backOr(postId ? `/update/${postId}` : '/(tabs)');

  const { post, isLoading, error } = usePost(postId);
  const { updatePost, isPending } = useUpdatePost();
  const queryClient = useQueryClient();
  const { showToast, showAlert } = useNotification();

  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [urgency, setUrgency] = useState<CommunityPostUrgency | null>(null);
  const [changeSummary, setChangeSummary] = useState('');
  const [prefilled, setPrefilled] = useState(false);

  // Prefill once. A background refetch must not overwrite what the author is typing.
  useEffect(() => {
    if (post && !prefilled) {
      setBody(post.body);
      setTitle(post.title ?? '');
      setUrgency(post.urgency ?? null);
      setPrefilled(true);
    }
  }, [post, prefilled]);

  // Urgency belongs to alerts, and `AmendAlert` refuses anything but a published
  // post — so the control is shown only where the server would accept it.
  const urgencyEditable = Boolean(post?.urgency) && post?.status === 'published';
  const { capabilities } = useAlertCapabilities(urgencyEditable);
  const urgencies = URGENCIES.filter(
    (level) =>
      level.value !== 'emergency' ||
      post?.urgency === 'emergency' ||
      capabilities?.canPublishEmergency === true
  );

  const changed = useMemo(() => {
    if (!post) return false;
    return (
      body.trim() !== post.body.trim() ||
      title.trim() !== (post.title ?? '').trim() ||
      (urgencyEditable && urgency !== (post.urgency ?? null))
    );
  }, [post, body, title, urgency, urgencyEditable]);

  // Named, so the member knows why Save is greyed out.
  const missing = body.trim().length === 0 ? 'The update text is required.' : null;
  const canSave = changed && !missing && !isPending;

  const save = async () => {
    if (!post || !canSave) return;
    try {
      await updatePost(
        post.postId,
        postEditRequest(post, {
          body,
          title,
          urgency: urgencyEditable ? urgency : null,
          changeSummary,
        })
      );
      void queryClient.invalidateQueries();
      showToast({ type: 'success', title: 'Update saved', message: 'Your changes are live.' });
      back();
    } catch (cause) {
      // The form keeps everything the member typed.
      showAlert({ type: 'error', title: 'Could not save your update', message: serverMessage(cause) });
    }
  };

  let content: React.ReactNode;

  if (isLoading) {
    content = (
      <View className="p-4">
        <Skeleton height={48} className="mb-4" />
        <Skeleton height={160} />
      </View>
    );
  } else if (!post) {
    content = (
      <EmptyState
        icon="⚠️"
        title="This update is not available"
        description={error ?? 'It may have been removed.'}
      />
    );
  } else if (!post.canEdit) {
    content = (
      <EmptyState
        icon="🔒"
        title="You can only edit your own updates"
        description="This update was posted by somebody else."
      />
    );
  } else {
    content = (
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Input
          label="Title (optional)"
          value={title}
          onChangeText={setTitle}
          maxLength={POST_TITLE_MAX_LENGTH}
        />
        <Input
          label="Update"
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={6}
          maxLength={POST_BODY_MAX_LENGTH}
          className="h-40"
          textAlignVertical="top"
          error={missing ?? undefined}
        />
        <Text className="text-xs text-content-faint -mt-2 mb-4 text-right">
          {body.length}/{POST_BODY_MAX_LENGTH}
        </Text>

        {urgencyEditable ? (
          <View className="mb-4">
            <Text className="mb-2 text-sm font-medium text-content-muted">Urgency</Text>
            <View className="flex-row flex-wrap">
              {urgencies.map((level) => {
                const selected = urgency === level.value;
                return (
                  <TouchableOpacity
                    key={level.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setUrgency(level.value)}
                    className={`px-4 py-2 mr-2 mb-2 rounded-full border ${
                      selected ? 'bg-primary-500 border-primary-500' : 'border-subtle bg-surface-card'
                    }`}
                  >
                    <Text className={`text-sm font-bold ${selected ? 'text-white' : 'text-content-primary'}`}>
                      {level.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        <Input
          label="What did you change? (optional)"
          placeholder="e.g. Corrected the road name"
          value={changeSummary}
          onChangeText={setChangeSummary}
          maxLength={200}
        />

        {post.attachments.length > 0 ? (
          <Text className="text-xs text-content-faint mb-4">
            Photos on this update are kept as they are.
          </Text>
        ) : null}

        <Button
          label="Save changes"
          onPress={() => void save()}
          disabled={!canSave}
          isLoading={isPending}
          loadingLabel="Saving…"
        />
        {!changed && !isPending ? (
          <Text className="text-xs text-content-faint mt-2 text-center">No changes yet.</Text>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Edit update" showBack onBack={back} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
