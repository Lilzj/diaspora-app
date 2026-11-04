// ─────────────────────────────────────────────────────────────────────────────
// The moderation queue — Remediation Wave D-2b
//
// **This screen used to be fixtures**, and it made two claims the platform does
// not make. It split `mocks/community-data.ts`'s queue into "🤖 AI Flagged" and
// "📋 Pending Review", printed a confidence percentage next to each flagged row,
// stamped "✅ AI Check: Clean" on every pending one, and labelled each with
// `Author: {authorName} ({authorLevel})`. Its four buttons — Reject, Approve,
// Review — were `TouchableOpacity` elements with no `onPress`.
//
// It now renders `GET /community/moderation/queue`, and the differences are not
// cosmetic.
//
// ── What this route will not tell you ────────────────────────────────────────
//
// **1. Four display fields are hardcoded null.** `reporterName`, `authorName`,
// `authorLevel` on the queue item and `moderatorName` on a decision. The server
// never populates them — they are typed `null`, not `string | null`, precisely
// so a screen cannot be written against a value that will never arrive. This
// screen identifies content by what it *is* and by the reports against it,
// because that is what the route carries. Printing "Author: null (null)" is the
// alternative, and the old screen was one real response away from doing it.
//
// **2. `title` can be the literal string `"(removed)"`.** Not a null, not an
// empty string — those five characters, when the content is already gone. It is
// rendered as a state rather than as a heading.
//
// **3. There is no AI review on this contract.** `ModerationQueueItemResponse`
// carries no `reviewStatus`, no confidence and no flag list; `ContentReviewStatus`
// lives on the post or comment itself, and its most common value is
// **`unavailable`** — no provider answered — which is *not* `clean`. So the "AI
// Flagged" split is gone rather than being reconstructed from something that
// does not mean what it looked like it meant.
//
// **4. It is not pageable, despite accepting `cursor` and `limit`.** The answer
// is a bare array with no cursor in it, beside it, or in `meta` — there is
// nothing to send as the next page and no signal that a next page exists. So
// there is no "load more" here and there cannot be one. Worse, `limit` bounds
// the number of **reports** read *before* they are grouped by content, so the
// row count is unpredictable and **"fewer rows than the limit" does not mean
// "that is all there is"**. The screen says so rather than implying a complete
// list. `useModerationQueue` does not expose `limit` at all.
//
// ── What it will do ──────────────────────────────────────────────────────────
//
// `POST /community/moderation/decisions`, with a real action from the module's
// camelCase vocabulary. Every button below sends one.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { humanise, relativeTime } from '@/components/community-social';
import { useModerationDecision, useModerationQueue } from '@/hooks/community-social';
import { useNotification } from '@/providers/notification-provider';
import { useBottomInset } from '@/components/layout/bottom-inset';
import type {
  ModerationAction,
  ModerationQueueItemResponse,
} from '@/types/community-social';
import { backOr } from '@/lib/navigation';

/** The literal the server sends for content that has already gone. */
const REMOVED_TITLE = '(removed)';

/**
 * The three decisions this screen offers, in the module's camelCase vocabulary.
 *
 * `warn`, `escalate` and `restore` are on the contract and are not offered here:
 * a warning needs somebody to warn and the queue carries no author name, and a
 * restore needs a removed item to restore, which this queue does not list.
 */
const ACTIONS: { action: ModerationAction; label: string; tone: 'danger' | 'muted' | 'primary' }[] = [
  { action: 'remove', label: 'Remove', tone: 'danger' },
  { action: 'hide', label: 'Hide', tone: 'muted' },
  { action: 'dismiss', label: 'Dismiss reports', tone: 'primary' },
];

export default function ModerationQueueScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { showAlert } = useNotification();
  const queue = useModerationQueue();
  const deciding = useModerationDecision();

  const [busyKey, setBusyKey] = useState<string | null>(null);

  const decide = useCallback(
    async (item: ModerationQueueItemResponse, action: ModerationAction) => {
      const key = `${item.contentType}|${item.contentId}`;
      setBusyKey(key);
      try {
        await deciding.decide({
          contentType: item.contentType,
          contentId: item.contentId,
          action,
        });
        showAlert({
          type: 'success',
          title: 'Decision recorded',
          message: `Marked as ${humanise(action).toLowerCase()}.`,
        });
      } catch {
        // `deciding.error` carries the server's own sentence and is rendered
        // above the list.
      } finally {
        setBusyKey(null);
      }
    },
    [deciding, showAlert]
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row items-center">
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => backOr()}
          className="mr-4"
        >
          <Text className="text-xl text-content-tertiary">←</Text>
        </TouchableOpacity>
        <Text className="text-xl font-bold text-content-primary">Moderator queue</Text>
      </View>

      <ScrollEndScrollView
        className="flex-1 p-6"
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={queue.refresh} />}
      >
        {queue.isLoading ? (
          <QueueSkeleton />
        ) : queue.error ? (
          <EmptyState
            icon="📡"
            title="We could not load the queue"
            description={queue.error}
            action={
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Try again"
                onPress={queue.refresh}
                className="bg-primary-500 px-5 py-3 rounded-xl active:bg-primary-600"
              >
                <Text className="text-white font-extrabold text-sm">Try again</Text>
              </TouchableOpacity>
            }
          />
        ) : queue.isEmpty ? (
          <EmptyState
            icon="✅"
            title="Nothing waiting"
            description="No reported content is pending a decision right now."
          />
        ) : (
          <>
            {deciding.error ? (
              <View className="bg-surface-muted border border-error-default/30 rounded-2xl px-4 py-3 mb-4">
                <Text className="text-xs font-bold text-error-default">{deciding.error}</Text>
              </View>
            ) : null}

            {queue.items.map((item) => {
              const key = `${item.contentType}|${item.contentId}`;
              const isGone = item.title === REMOVED_TITLE;
              const isBusy = busyKey === key;

              return (
                <View
                  key={key}
                  className="bg-surface-card border border-subtle rounded-2xl p-4 mb-4"
                >
                  <View className="flex-row items-start justify-between mb-2">
                    <View className="flex-1 mr-3">
                      {/* `title` is the literal "(removed)" when the content is
                          already gone. That is a state, not a heading. */}
                      {isGone ? (
                        <Text className="text-sm font-black text-content-faint italic">
                          This content has already been removed
                        </Text>
                      ) : (
                        <Text className="text-sm font-black text-content-primary leading-snug">
                          {item.title}
                        </Text>
                      )}
                      <Text className="text-[10px] font-bold text-content-faint uppercase tracking-wider mt-1">
                        {humanise(item.contentType)} · {item.status}
                      </Text>
                    </View>

                    <View className="bg-surface-muted px-2 py-1 rounded-lg">
                      <Text className="text-[10px] font-black text-error-default">
                        {item.reportCount} {item.reportCount === 1 ? 'report' : 'reports'}
                      </Text>
                    </View>
                  </View>

                  {/* The reasons, which are the only description of the problem
                      this route carries — `reporterName` and `authorName` are
                      hardcoded null, so there is nobody to name. */}
                  <View className="flex-row flex-wrap mb-3">
                    {item.reasons.map((reason) => (
                      <Text
                        key={reason}
                        className="text-[10px] font-bold text-content-secondary bg-surface-muted px-2 py-1 rounded mr-2 mb-1.5"
                      >
                        {humanise(reason)}
                      </Text>
                    ))}
                  </View>

                  <Text className="text-[10px] font-semibold text-content-faint mb-3">
                    First reported {relativeTime(item.firstReportedAt)} · last{' '}
                    {relativeTime(item.lastReportedAt)}
                  </Text>

                  <View className="flex-row">
                    {ACTIONS.map(({ action, label, tone }) => (
                      <TouchableOpacity
                        key={action}
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={`${label} this content`}
                        accessibilityState={{ disabled: isBusy || deciding.isPending }}
                        disabled={isBusy || deciding.isPending}
                        onPress={() => void decide(item, action)}
                        className={`flex-1 py-2.5 rounded-xl items-center mr-2 border ${
                          tone === 'danger'
                            ? 'bg-error-solid border-error-solid'
                            : tone === 'primary'
                              ? 'bg-primary-500 border-primary-500'
                              : 'bg-surface-card border-subtle'
                        }`}
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color="#6B7280" />
                        ) : (
                          <Text
                            className={`text-xs font-black ${
                              tone === 'muted' ? 'text-content-secondary' : 'text-white'
                            }`}
                          >
                            {label}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })}

            {/* Point 4. There is no next page to offer and no way to know
                whether one exists, so the list says what it is rather than
                letting its own length imply completeness. */}
            <Text className="text-[10px] font-semibold text-content-faint leading-relaxed mt-2">
              This queue is not paged. The server groups reports by content after
              reading them, so this may not be everything waiting — pull to refresh
              after acting on what is here.
            </Text>
          </>
        )}

        <View className="h-8" />
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

function QueueSkeleton() {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading the moderation queue">
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {[0, 1, 2].map((row) => (
          <View key={row} className="bg-surface-card border border-subtle rounded-2xl p-4 mb-4">
            <Skeleton width="70%" height={16} className="mb-2" />
            <Skeleton width="35%" height={12} className="mb-3" />
            <Skeleton width="55%" height={14} className="mb-3" />
            <Skeleton width="100%" height={36} borderRadius={12} />
          </View>
        ))}
      </View>
    </View>
  );
}
