// ─────────────────────────────────────────────────────────────────────────────
// Diaspora's review of communities asked to close — 12 Sep 2026
//
// "this will be reviewed by the diaspora admins, and if the diaspora admin final
// decision is not to delete, then the community owner will be emailed that their
// community cannot be deleted based on the decision taken and reasons this
// decision was taken will be in the mail."
//
// Two things this screen is careful about:
//
// **A refusal needs a reason, and the reason is not for us.** It is sent to the
// owner in an email, word for word. So the field is required by the screen as
// well as by the platform, and its label says who reads it — the alternative is
// an administrator typing "no" and a founder of four thousand people receiving
// an email that says "no".
//
// **An empty queue and a refused queue look identical if you let them.** This is
// a platform-administrator route; a moderator calling it is refused. Rendering
// that refusal as "Nothing to review" would tell the wrong people they are
// trusted and tell the right people the queue is clear when it is not. The
// refusal is shown as a refusal.
//
// ── Why /moderation and not /admin ──────────────────────────────────────────
//
// `/moderation` is a deep-link prefix the app already restores context for;
// `/admin` is not, so a notification opening `/admin/…` lands nowhere. The
// permission comes from the platform either way — the prefix is only routing.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/design-system';
import { ScreenHeader } from '@/components/ScreenHeader';
import { EmptyState } from '@/components/EmptyState';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useNotification } from '@/providers/notification-provider';
import type { CommunityDeletionRequest } from '@/types/community-directory';
import { useCommunityDeletionQueue, useDecideCommunityDeletion } from '@/hooks/communities';
import { daysUntil } from '@/lib/community/closure';

const MAX_REASON = 1000;

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}


export default function CommunityDeletionReviewScreen() {
  const bottomInset = useBottomInset();
  const { tokens } = useTheme();
  const { showAlert } = useNotification();

  const queue = useCommunityDeletionQueue('AwaitingReview');
  const decide = useDecideCommunityDeletion();

  /** The request whose refusal is being written, and the words so far. */
  const [refusing, setRefusing] = useState<string | null>(null);
  const [refusalReason, setRefusalReason] = useState('');
  const [showReasonError, setShowReasonError] = useState(false);

  const approve = (item: CommunityDeletionRequest) =>
    showAlert({
      type: 'question',
      title: `Approve closing ${item.communityName}?`,
      message: `The community keeps running until ${formatDate(item.effectiveAt)} and then closes. Its owner is told today.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'destructive',
          onPress: () =>
            decide.mutate(
              { requestId: item.id, approve: true },
              {
                onSuccess: () =>
                  showAlert({
                    type: 'success',
                    title: 'Approved',
                    message: `${item.communityName} will close on ${formatDate(item.effectiveAt)}.`,
                  }),
                onError: (error) =>
                  showAlert({
                    type: 'error',
                    title: 'That did not go through',
                    message: error instanceof Error ? error.message : 'Please try again.',
                  }),
              }
            ),
        },
      ],
    });

  const refuse = (item: CommunityDeletionRequest) => {
    const written = refusalReason.trim();

    if (written.length < 10) {
      setShowReasonError(true);
      return;
    }

    decide.mutate(
      { requestId: item.id, approve: false, reason: written },
      {
        onSuccess: () => {
          setRefusing(null);
          setRefusalReason('');
          setShowReasonError(false);
          showAlert({
            type: 'success',
            title: 'Decision sent',
            message: `${item.communityName} stays open. Its owner has been sent your reason, and offered the chance to hand the community on instead.`,
          });
        },
        onError: (error) =>
          showAlert({
            type: 'error',
            title: 'That did not go through',
            message: error instanceof Error ? error.message : 'Please try again.',
          }),
      }
    );
  };

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      <ScreenHeader onBack={() => router.back()} title="Communities asked to close" />

      <ScrollEndScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: bottomInset }}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => void queue.refetch()} />
        }
      >
        {queue.isLoading ? (
          <ActivityIndicator color={tokens.color.primary[500]} style={{ marginTop: 32 }} />
        ) : queue.isError ? (
          // A refusal, not an empty queue. Which one it is comes from the server.
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="rounded-2xl border p-4 mt-4"
          >
            <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black mb-1">
              We could not read the queue
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold leading-relaxed"
            >
              {queue.error instanceof Error
                ? queue.error.message
                : 'This is for Diaspora administrators. If you are one, try again.'}
            </Text>
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              onPress={() => void queue.refetch()}
              className="mt-3"
            >
              <Text style={{ color: tokens.color.primary[600] }} className="text-xs font-black">
                Try again
              </Text>
            </TouchableOpacity>
          </View>
        ) : queue.requests.length === 0 ? (
          <EmptyState
            icon="✅"
            title="Nothing waiting"
            description="No community is waiting on a decision from Diaspora."
          />
        ) : (
          <>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold leading-relaxed mb-3"
            >
              Each of these communities carries on as normal while it waits. Approving does not close
              anything today — it lets the thirty days run out. Refusing needs a reason, which the
              owner is sent word for word.
            </Text>

            {queue.requests.map((item) => {
              const left = daysUntil(item.effectiveAt);
              const isRefusing = refusing === item.id;

              return (
                <View
                  key={item.id}
                  testID={`deletion-request-${item.id}`}
                  style={{
                    backgroundColor: tokens.color.surface.card,
                    borderColor: tokens.color.surface.border,
                  }}
                  className="rounded-2xl border p-4 mb-3"
                >
                  <TouchableOpacity
                    accessible
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${item.communityName}`}
                    onPress={() => router.push(`/community/${item.communitySlug}` as never)}
                  >
                    <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
                      {item.communityName}
                    </Text>
                  </TouchableOpacity>

                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[11px] font-bold mt-0.5"
                  >
                    Asked by {item.requestedByName ?? 'its owner'} on {formatDate(item.requestedAt)}
                    {left === null ? '' : left === 0 ? ' · the wait is over' : ` · ${left} days left`}
                  </Text>

                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-xs font-semibold leading-relaxed mt-2"
                  >
                    {item.reason}
                  </Text>

                  {isRefusing ? (
                    <View className="mt-3">
                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-xs font-bold mb-1"
                      >
                        Why is Diaspora not closing it? *
                      </Text>
                      <TextInput
                        accessibilityLabel="The reason the owner will be sent, required"
                        value={refusalReason}
                        onChangeText={(next) => {
                          setRefusalReason(next);
                          if (showReasonError) setShowReasonError(false);
                        }}
                        multiline
                        numberOfLines={5}
                        maxLength={MAX_REASON}
                        placeholder="The owner reads this exactly as you write it."
                        placeholderTextColor={tokens.color.text.placeholder}
                        style={{
                          backgroundColor: tokens.color.surface.background,
                          borderColor: showReasonError
                            ? tokens.color.error.default
                            : tokens.color.border.default,
                          color: tokens.color.text.primary,
                          minHeight: 110,
                          textAlignVertical: 'top',
                        }}
                        className="rounded-xl border px-3 py-3 text-sm font-semibold"
                      />

                      {showReasonError ? (
                        <Text
                          accessibilityRole="alert"
                          style={{ color: tokens.color.error.default }}
                          className="text-[11px] font-bold mt-1"
                        >
                          Write the reason the owner will be sent. At least 10 characters.
                        </Text>
                      ) : null}

                      <View className="flex-row mt-3">
                        <TouchableOpacity
                          accessible
                          accessibilityRole="button"
                          accessibilityLabel={`Send the decision not to close ${item.communityName}`}
                          testID={`deletion-refuse-send-${item.id}`}
                          disabled={decide.isPending}
                          onPress={() => refuse(item)}
                          style={{
                            backgroundColor: tokens.color.primary[600],
                            opacity: decide.isPending ? 0.6 : 1,
                          }}
                          className="flex-1 rounded-xl px-4 py-2.5 items-center mr-2"
                        >
                          {decide.isPending ? (
                            <ActivityIndicator color="#ffffff" />
                          ) : (
                            <Text className="text-xs font-black" style={{ color: '#ffffff' }}>
                              Send the decision
                            </Text>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          accessible
                          accessibilityRole="button"
                          accessibilityLabel="Cancel this decision"
                          onPress={() => {
                            setRefusing(null);
                            setRefusalReason('');
                            setShowReasonError(false);
                          }}
                          style={{ borderColor: tokens.color.border.default }}
                          className="rounded-xl border px-4 py-2.5 items-center"
                        >
                          <Text
                            style={{ color: tokens.color.text.secondary }}
                            className="text-xs font-black"
                          >
                            Cancel
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row mt-3">
                      <TouchableOpacity
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={`Approve closing ${item.communityName}`}
                        testID={`deletion-approve-${item.id}`}
                        disabled={decide.isPending}
                        onPress={() => approve(item)}
                        style={{ borderColor: tokens.color.error.default }}
                        className="flex-1 flex-row items-center justify-center rounded-xl border px-4 py-2.5 mr-2"
                      >
                        <Ionicons name="trash-outline" size={14} color={tokens.color.error.default} />
                        <Text
                          style={{ color: tokens.color.error.default }}
                          className="text-xs font-black ml-1.5"
                        >
                          Approve
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={`Decide not to close ${item.communityName}`}
                        testID={`deletion-refuse-${item.id}`}
                        disabled={decide.isPending}
                        onPress={() => {
                          setRefusing(item.id);
                          setRefusalReason('');
                          setShowReasonError(false);
                        }}
                        style={{ backgroundColor: tokens.color.primary[600] }}
                        className="flex-1 rounded-xl px-4 py-2.5 items-center"
                      >
                        <Text className="text-xs font-black" style={{ color: '#ffffff' }}>
                          Keep it open
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
