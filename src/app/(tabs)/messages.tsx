/**
 * Messages Inbox — Main conversation inbox tab
 * Home → Discover → Create → Messages (this) → Knowledge → Profile
 */

import React, { useEffect, useCallback, useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import {
  useConversationStore,
  selectFilteredConversations,
  selectSortedConversations,
  selectTotalUnread,
} from '@/store/conversation';
import { ConversationHub } from '@/lib/conversation-hub';
import { ConversationCard } from '@/components/conversation/ConversationCard';
import { InboxFilterBar } from '@/components/conversation/InboxFilterBar';
import { ConversationEmptyState } from '@/components/conversation/ConversationEmptyState';
import { Skeleton } from '@/components/Skeleton';
import type { Conversation, InboxFilter } from '@/types/conversation';

export default function MessagesScreen() {
  const { showAlert } = useNotification();
  const { isAuthenticated } = useAuthStore();
  const {
    conversations, isLoadingConversations, activeFilter, requests,
    loadConversations, loadRequests, setActiveFilter,
  } = useConversationStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [hubInitialized, setHubInitialized] = useState(false);

  // Initialize ConversationHub + real-time connection
  useEffect(() => {
    if (!isAuthenticated) return;
    const init = async () => {
      await ConversationHub.initialize('user-current');
      setHubInitialized(true);
      loadConversations();
      loadRequests();
    };
    init();
    return () => ConversationHub.teardown();
  }, [isAuthenticated]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadConversations();
    await loadRequests();
    setRefreshing(false);
  }, []);

  // Filter + sort conversations
  const sorted = selectSortedConversations(conversations);
  const filtered = searchQuery
    ? sorted.filter((c) => {
        const other = c.participants.find((p) => !p.isCurrentUser);
        return (
          other?.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.context.entityTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.lastMessage?.text?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      })
    : selectFilteredConversations(sorted, activeFilter);

  const totalUnread = selectTotalUnread(conversations);

  const handleLongPress = useCallback((conv: Conversation) => {
    showAlert({ type: 'info', title: conv.participants.find((p) => !p.isCurrentUser)?.displayName || 'Conversation', message: 'Choose an action', buttons: [
        {
          text: conv.isPinned ? '📌 Unpin' : '📌 Pin',
          onPress: async () => {
            if (conv.isPinned) {
              await ConversationHub.unpinConversation(conv.conversationId);
            } else {
              const ok = await ConversationHub.pinConversation(conv.conversationId);
              if (!ok) showAlert({ type: 'error', title: 'Pin limit reached', message: 'You can only pin up to 5 conversations.' });
            }
          },
        },
        {
          text: conv.isMuted ? '🔔 Unmute' : '🔕 Mute',
          onPress: () => {
            if (conv.isMuted) {
              ConversationHub.unmute(conv.conversationId);
            } else {
              showAlert({ type: 'question', title: 'Mute Conversation', message: 'How long?', buttons: [
                { text: '8 Hours', onPress: () => ConversationHub.mute(conv.conversationId, '8h') },
                { text: '24 Hours', onPress: () => ConversationHub.mute(conv.conversationId, '24h') },
                { text: '7 Days', onPress: () => ConversationHub.mute(conv.conversationId, '7d') },
                { text: 'Forever', onPress: () => ConversationHub.mute(conv.conversationId, 'forever') },
                { text: 'Cancel', style: 'cancel' },
              ] });
            }
          },
        },
        {
          text: '📦 Archive',
          onPress: () => ConversationHub.archive(conv.conversationId),
        },
        {
          text: '✓ Mark as Read',
          onPress: () => ConversationHub.markRead(conv.conversationId),
        },
        { text: 'Cancel', style: 'cancel' },
      ] });
  }, []);

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-50 items-center justify-center px-8">
        <Text className="text-5xl mb-6">💬</Text>
        <Text className="text-xl font-black text-neutral-900 text-center mb-3">
          Sign in to Message
        </Text>
        <Text className="text-sm text-neutral-500 text-center mb-8 leading-relaxed">
          Connect with providers, sellers, and community members directly inside Diaspora.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/(auth)/login')}
          className="bg-amber-500 px-8 py-4 rounded-2xl"
        >
          <Text className="text-white font-black text-sm">Sign In →</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50">
      {/* Header */}
      <View className="bg-white px-4 py-4 border-b border-neutral-100"
        style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 }}>
        <View className="flex-row items-center justify-between mb-3">
          <View>
            <Text className="text-xl font-black text-neutral-900">Messages</Text>
            {totalUnread > 0 && (
              <Text className="text-xs font-semibold text-amber-600">{totalUnread} unread</Text>
            )}
          </View>
          <View className="flex-row gap-2">
            {requests.length > 0 && (
              <TouchableOpacity
                onPress={() => router.push('/conversation/request')}
                className="flex-row items-center bg-amber-50 border border-amber-200 rounded-xl px-3 py-2"
                activeOpacity={0.7}
              >
                <Text className="text-xs font-bold text-amber-700">📩 {requests.length}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => router.push('/conversation/archived')}
              className="w-10 h-10 bg-neutral-100 border border-neutral-200 rounded-full items-center justify-center"
              activeOpacity={0.7}
            >
              <Text className="text-base">📦</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <View className="bg-neutral-100 rounded-2xl flex-row items-center px-4 py-2.5 border border-neutral-200">
          <Text className="text-neutral-400 text-base mr-2">🔍</Text>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search conversations..."
            placeholderTextColor="#9BA3B8"
            style={{ flex: 1, fontSize: 14, color: '#272A35', padding: 0 }}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
              <Text className="text-neutral-400 text-base ml-1">✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Filter bar */}
      {!searchQuery && (
        <InboxFilterBar
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          unreadCount={conversations.filter((c) => c.unreadCount > 0).length}
          requestCount={requests.length}
        />
      )}

      {/* Conversation list */}
      {isLoadingConversations && !refreshing ? (
        <View className="flex-1 px-4 pt-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} className="flex-row items-center mb-4">
              <Skeleton width={52} height={52} borderRadius={26} />
              <View className="flex-1 ml-3">
                <View style={{ marginBottom: 8 }}>
                  <Skeleton width="60%" height={14} borderRadius={7} />
                </View>
                <View style={{ marginBottom: 6 }}>
                  <Skeleton width="80%" height={12} borderRadius={6} />
                </View>
                <Skeleton width="50%" height={12} borderRadius={6} />
              </View>
            </View>
          ))}
        </View>
      ) : filtered.length === 0 ? (
        <ConversationEmptyState
          filter={searchQuery ? 'All' : activeFilter}
          onExplore={() => router.push('/(tabs)/discover')}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.conversationId}
          renderItem={({ item }) => (
            <ConversationCard
              conversation={item}
              onLongPress={handleLongPress}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F59300" />
          }
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={null}
        />
      )}
    </SafeAreaView>
  );
}
