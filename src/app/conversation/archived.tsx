/**
 * Archived Conversations Screen
 */

import React, { useEffect } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ConversationCard } from '@/components/conversation/ConversationCard';
import { ConversationEmptyState } from '@/components/conversation/ConversationEmptyState';
import { ListState } from '@/components/ListState';
import {
  useConversationStore,
  selectFilteredConversations,
  selectSortedConversations,
} from '@/store/conversation';
import { ConversationHub } from '@/lib/transport/conversation-hub';
import type { Conversation } from '@/types/conversation';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function ArchivedConversationsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { showAlert } = useNotification();
  const { conversations, loadConversations, isLoadingConversations, conversationsError } = useConversationStore();

  useEffect(() => {
    void loadConversations();
    // A Zustand action: defined once when the store is created and never
    // recreated, so naming it keeps this a mount-only load.
  }, [loadConversations]);

  const archived = selectFilteredConversations(selectSortedConversations(conversations), 'Archived');

  const handleLongPress = (conv: Conversation) => {
    showAlert({ type: 'info', title: 'Archived Conversation', message: 'Restore this conversation to your inbox?', buttons: [
        { text: '📂 Restore', onPress: () => ConversationHub.unarchive(conv.conversationId) },
        { text: 'Cancel', style: 'cancel' },
      ] });
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Archived" showBack />

      {/* Read from the inbox, which can be loading or have failed: neither is "nothing
          archived" (FARCH-007, 27 Nov 2026). */}
      <ListState
        loading={isLoadingConversations && conversations.length === 0}
        loadingLabel="Loading your archived conversations"
        error={
          conversationsError && conversations.length === 0
            ? { title: 'Conversations could not be loaded', message: conversationsError }
            : null
        }
        onRetry={() => void loadConversations()}
      >
        <FlatList
          data={archived}
          keyExtractor={(item) => item.conversationId}
          renderItem={({ item }) => (
            <ConversationCard conversation={item} onLongPress={handleLongPress} />
          )}
          ListEmptyComponent={<ConversationEmptyState filter="Archived" />}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomInset }}
          showsVerticalScrollIndicator={false}
        />
      </ListState>
    </SafeAreaView>
  );
}
