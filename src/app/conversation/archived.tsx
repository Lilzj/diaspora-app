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
import {
  useConversationStore,
  selectFilteredConversations,
  selectSortedConversations,
} from '@/store/conversation';
import { ConversationHub } from '@/lib/conversation-hub';
import type { Conversation } from '@/types/conversation';

export default function ArchivedConversationsScreen() {
  const { showAlert } = useNotification();
  const { conversations, loadConversations } = useConversationStore();

  useEffect(() => {
    loadConversations();
  }, []);

  const archived = selectFilteredConversations(selectSortedConversations(conversations), 'Archived');

  const handleLongPress = (conv: Conversation) => {
    showAlert({ type: 'info', title: 'Archived Conversation', message: 'Restore this conversation to your inbox?', buttons: [
        { text: '📂 Restore', onPress: () => ConversationHub.unarchive(conv.conversationId) },
        { text: 'Cancel', style: 'cancel' },
      ] });
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50">
      <ScreenHeader title="Archived" showBack />

      {archived.length === 0 ? (
        <ConversationEmptyState filter="Archived" />
      ) : (
        <FlatList
          data={archived}
          keyExtractor={(item) => item.conversationId}
          renderItem={({ item }) => (
            <ConversationCard conversation={item} onLongPress={handleLongPress} />
          )}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
