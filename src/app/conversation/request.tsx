/**
 * Conversation Requests Inbox
 */

import React, { useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ConversationRequestCard } from '@/components/conversation/ConversationRequestCard';
import { ConversationEmptyState } from '@/components/conversation/ConversationEmptyState';
import { useConversationStore } from '@/store/conversation';
import { ConversationHub } from '@/lib/conversation-hub';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function ConversationRequestsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { requests, isLoadingRequests, loadRequests, acceptRequest, declineRequest } =
    useConversationStore();

  useEffect(() => {
    loadRequests();
  }, []);

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

      {isLoadingRequests ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#F59300" size="large" />
        </View>
      ) : requests.length === 0 ? (
        <ConversationEmptyState filter="Requests" />
      ) : (
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
          contentContainerStyle={{ paddingTop: 16, paddingBottom: bottomInset }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
