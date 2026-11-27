/**
 * Conversation Requests Inbox
 */

import React, { useEffect } from 'react';
import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ConversationRequestCard } from '@/components/conversation/ConversationRequestCard';
import { ConversationEmptyState } from '@/components/conversation/ConversationEmptyState';
import { ListState } from '@/components/ListState';
import { useConversationStore } from '@/store/conversation';
import { ConversationHub } from '@/lib/transport/conversation-hub';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function ConversationRequestsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { requests, isLoadingRequests, requestsError, loadRequests, acceptRequest, declineRequest } =
    useConversationStore();

  useEffect(() => {
    void loadRequests();
    // A Zustand action: defined once when the store is created and never
    // recreated, so naming it keeps this a mount-only load.
  }, [loadRequests]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader
        title="Message Requests"
        showBack
      />

      {/* Info banner */}
      <View className="bg-surface-muted border-b border-subtle px-4 py-3">
        <Text className="text-xs font-semibold text-warning-default">
          💡 Review requests before accepting. You won't receive messages until you accept.
        </Text>
      </View>

      {/* A failed read is said, not drawn as "No pending requests" (FARCH-007,
          27 Nov 2026): the store swallowed it, so an outage read as an empty inbox. */}
      <ListState
        loading={isLoadingRequests && requests.length === 0}
        loadingLabel="Loading message requests"
        error={
          requestsError && requests.length === 0
            ? { title: 'Message requests could not be loaded', message: requestsError }
            : null
        }
        onRetry={() => void loadRequests()}
      >
        <FlatList
          data={requests}
          keyExtractor={(item) => item.requestId}
          renderItem={({ item }) => (
            <ConversationRequestCard
              request={item}
              onAccept={() => acceptRequest(item.requestId)}
              onDecline={() => declineRequest(item.requestId)}
              onBlock={() => ConversationHub.block(item.fromUser.userId, 'Blocked from request')}
            />
          )}
          ListEmptyComponent={<ConversationEmptyState filter="Requests" />}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: bottomInset }}
          showsVerticalScrollIndicator={false}
        />
      </ListState>
    </SafeAreaView>
  );
}
