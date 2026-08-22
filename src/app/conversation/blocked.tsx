/**
 * Blocked Users Screen
 *
 * ── Why this screen reads the server and nothing else ────────────────────────
 *
 * This list used to be seeded from `mockBlockedUsers` in
 * `@/mocks/conversation-data`, held in `useState`, and mutated locally on
 * unblock. Three separate untruths came out of that, and this is a safety
 * surface, so each one matters:
 *
 *   1. **Every member saw the same fabricated blocklist.** Names they had never
 *      blocked, with fabricated reasons and fabricated dates, presented as their
 *      own protective actions.
 *   2. **People they had actually blocked were absent.** A member checking
 *      whether a harasser was still blocked would not find them, and might
 *      reasonably conclude the block had lapsed.
 *   3. **Unblocking reported success it had not earned.** The row disappeared
 *      as soon as `unblock` resolved, and `unblock` resolved even when the
 *      request failed.
 *
 * All three are now closed. The list is `GET /conversations/blocked`
 * (`ListBlockedUsersQuery`, scoped to the caller server-side); the unblock is
 * `DELETE /conversations/blocked/{userId}` and the row only leaves the list
 * when the server has confirmed it.
 *
 * The loading and error states are distinct from the empty state on purpose.
 * "You have not blocked anyone" and "we could not reach the blocklist" are
 * opposite facts to somebody who is frightened, and a spinner that collapses
 * into an empty state on failure would tell them the reassuring one.
 */

import React, { useCallback, useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ConversationHub } from '@/lib/conversation-hub';
import type { BlockedUser } from '@/types/conversation';
import { useBottomInset } from '@/components/layout/bottom-inset';

const BLOCKED_QUERY_KEY = ['conversations', 'blocked'] as const;

export default function BlockedUsersScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { showAlert } = useNotification();
  const queryClient = useQueryClient();

  // Which rows have an unblock in flight. Keyed by user id rather than a single
  // boolean so two quick taps on different rows do not disable each other.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const {
    data: blocked,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery<BlockedUser[]>({
    queryKey: BLOCKED_QUERY_KEY,
    queryFn: () => ConversationHub.listBlocked(),
  });

  const handleUnblock = useCallback(
    (user: BlockedUser) => {
      showAlert({
        type: 'warning',
        title: `Unblock ${user.displayName}?`,
        message: 'They will be able to message you again.',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unblock',
            onPress: async () => {
              setPending((prev) => ({ ...prev, [user.userId]: true }));

              const ok = await ConversationHub.unblock(user.userId);

              setPending((prev) => {
                const next = { ...prev };
                delete next[user.userId];
                return next;
              });

              if (!ok) {
                // The block is still in force. Saying so is the whole point:
                // a member who believes a block was lifted and finds it was
                // not is confused; a member who believes it was lifted when it
                // was not may act on that belief.
                showAlert({
                  type: 'error',
                  title: 'Could not unblock',
                  message: `${user.displayName} is still blocked — the change did not reach the server. Please check your connection and try again.`,
                });
                return;
              }

              // Re-read rather than splicing locally, so the list on screen is
              // always the list the server holds.
              await queryClient.invalidateQueries({ queryKey: BLOCKED_QUERY_KEY });
            },
          },
        ],
      });
    },
    [queryClient, showAlert]
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Blocked Users" showBack />

      {isLoading ? (
        <View className="flex-1 items-center justify-center px-8">
          <ActivityIndicator />
          <Text className="text-sm text-content-muted text-center mt-4">
            Loading your blocklist…
          </Text>
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-5xl mb-6">⚠️</Text>
          <Text className="text-lg font-bold text-content-strong text-center">
            Blocklist unavailable
          </Text>
          <Text className="text-sm text-content-muted text-center mt-2">
            We could not load who you have blocked. Anyone you blocked is still blocked — this is a
            problem showing the list, not with the blocks themselves.
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            disabled={isRefetching}
            className="bg-surface-muted border border-subtle px-4 py-3 rounded-xl mt-6"
            activeOpacity={0.7}
          >
            <Text className="text-sm font-bold text-content-secondary">
              {isRefetching ? 'Retrying…' : 'Try again'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : !blocked || blocked.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-5xl mb-6">🔓</Text>
          <Text className="text-lg font-bold text-content-strong text-center">No blocked users</Text>
          <Text className="text-sm text-content-muted text-center mt-2">
            Users you block will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={blocked}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomInset }}
          refreshing={isRefetching}
          onRefresh={() => refetch()}
          renderItem={({ item }) => (
            <View className="bg-surface-card border border-subtle rounded-2xl px-4 py-4 mb-3 flex-row items-center">
              <View className="w-12 h-12 rounded-full bg-subtle items-center justify-center mr-3">
                <Text className="text-content-muted font-bold text-base">🚫</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-content-primary">{item.displayName}</Text>
                {item.reason && (
                  <Text className="text-[11px] text-content-muted mt-0.5">Reason: {item.reason}</Text>
                )}
                <Text className="text-[10px] text-content-faint mt-0.5">
                  Blocked {new Date(item.blockedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleUnblock(item)}
                disabled={pending[item.userId] === true}
                style={{ opacity: pending[item.userId] === true ? 0.6 : 1 }}
                className="bg-surface-muted border border-subtle px-3 py-2 rounded-xl"
                activeOpacity={0.7}
              >
                <Text className="text-xs font-bold text-content-secondary">
                  {pending[item.userId] === true ? 'Unblocking…' : 'Unblock'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
