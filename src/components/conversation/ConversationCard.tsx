/**
 * ConversationCard — Inbox list item
 * Shows avatar, context, last message, unread badge, status indicators.
 */

import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { usePresenceStore } from '@/store/presence';
import { OnlineIndicator } from './OnlineIndicator';
import { ReadReceipt } from './ReadReceipt';
import type { Conversation } from '@/types/conversation';
import { conversationInitials, conversationTitle } from '@/lib/conversation-title';
import { currentUserIdIn, isOwnMessage } from '@/lib/conversation-identity';

interface Props {
  conversation: Conversation;
  onLongPress?: (conversation: Conversation) => void;
}

function getContextEmoji(type: string): string {
  const map: Record<string, string> = {
    MarketplaceListing: '🛒',
    HousingListing: '🏠',
    JobOpportunity: '💼',
    ProviderInquiry: '🍽️',
    CommunityEvent: '🎉',
    Organization: '🏢',
    CommunityGuide: '📖',
    SupportTicket: '🛡️',
    TrustAppeal: '⚖️',
    PrivateConversation: '💬',
    AIAssistant: '🤖',
    BusinessAccount: '🏪',
  };
  return map[type] || '💬';
}

function formatTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (hrs < 24) return `${hrs}h`;
  if (days === 1) return 'Yesterday';
  if (days < 7) {
    return date.toLocaleDateString('en-GB', { weekday: 'short' });
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function ConversationCard({ conversation, onLongPress }: Props) {
  const { getStatusLabel } = usePresenceStore();
  const other = conversation.participants.find((p) => !p.isCurrentUser);

  const hasUnread = conversation.unreadCount > 0;
  const lastMsg = conversation.lastMessage;

  const getLastMessagePreview = useCallback(() => {
    if (!lastMsg) return 'Start a conversation';
    if (lastMsg.isDeleted) return '🚫 Message deleted';
    if (lastMsg.type === 'image') return '📷 Photo';
    if (lastMsg.type === 'voice') return '🎤 Voice message';
    if (lastMsg.type === 'document') return '📄 Document';
    if (lastMsg.type === 'system') return lastMsg.text || '';
    return lastMsg.text || '';
  }, [lastMsg]);

  // Falls back to the conversation's subject for the same reason the name does:
  // an organisation is not a participant, and '?' told the member nothing.
  const initials = conversationInitials(conversation);

  return (
    <TouchableOpacity
      onPress={() => router.push(`/conversation/${conversation.conversationId}`)}
      onLongPress={() => onLongPress?.(conversation)}
      activeOpacity={0.7}
      className="bg-surface-card px-4 py-3.5 flex-row items-center border-b border-faint"
    >
      {/* Avatar */}
      <View className="relative mr-3">
        <View className="w-13 h-13 rounded-full bg-amber-100 border border-amber-200 items-center justify-center overflow-hidden"
          style={{ width: 52, height: 52 }}>
          {other?.avatarUrl ? (
            <Image source={{ uri: other.avatarUrl }} style={{ width: 52, height: 52 }} contentFit="cover" />
          ) : (
            <Text className="text-lg font-black text-amber-700">{initials}</Text>
          )}
        </View>
        {/* Online indicator */}
        {other && (
          <View className="absolute bottom-0 right-0">
            <OnlineIndicator userId={other.userId} size="sm" />
          </View>
        )}
      </View>

      {/* Content */}
      <View className="flex-1 min-w-0">
        {/* Row 1: Name + time */}
        <View className="flex-row items-center justify-between mb-0.5">
          <View className="flex-row items-center flex-1 mr-2 min-w-0">
            {conversation.isPinned && (
              <Text className="text-[10px] mr-1.5">📌</Text>
            )}
            {conversation.isMuted && (
              <Text className="text-[10px] mr-1.5">🔕</Text>
            )}
            <Text
              className={`font-bold text-content-primary flex-1 ${hasUnread ? 'font-black' : ''}`}
              numberOfLines={1}
              style={{ fontSize: 14 }}
            >
              {conversationTitle(conversation)}
            </Text>
            {other?.trust.isVerified && (
              <View className="ml-1.5 bg-teal-50 border border-teal-200 px-1 py-0.5 rounded">
                <Text className="text-[8px] font-black text-teal-700">✓</Text>
              </View>
            )}
          </View>
          <Text className={`text-[11px] ml-2 ${hasUnread ? 'text-amber-600 font-bold' : 'text-content-faint font-semibold'}`}>
            {lastMsg ? formatTime(lastMsg.createdAt) : ''}
          </Text>
        </View>

        {/* Row 2: Context chip */}
        <View className="flex-row items-center mb-1">
          <Text className="text-[9px] mr-1">{getContextEmoji(conversation.context.type)}</Text>
          <Text className="text-[10px] text-content-muted font-semibold" numberOfLines={1}>
            {conversation.context.entityTitle}
          </Text>
        </View>

        {/* Row 3: Message preview + unread */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 min-w-0 mr-2">
            {/* The member's own last message carries its ticks. This compared
                with the fixtures' `'user-current'`, so on a real inbox it never did. */}
            {lastMsg && isOwnMessage(lastMsg, currentUserIdIn(conversation, null)) && (
              <View className="mr-1.5">
                <ReadReceipt status={lastMsg.delivery.status} size="xs" />
              </View>
            )}
            <Text
              className={`text-[13px] flex-1 ${hasUnread ? 'text-content-strong font-semibold' : 'text-content-muted font-normal'}`}
              numberOfLines={1}
            >
              {getLastMessagePreview()}
            </Text>
          </View>

          {hasUnread && (
            <View className="bg-amber-500 rounded-full min-w-5 h-5 items-center justify-center px-1.5 ml-1">
              <Text className="text-[11px] font-black text-white">
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
