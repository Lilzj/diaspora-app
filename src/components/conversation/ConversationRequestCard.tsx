/**
 * ConversationRequestCard — Pending conversation request UI
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import type { ConversationRequest } from '@/types/conversation';

interface Props {
  request: ConversationRequest;
  onAccept: () => void;
  onDecline: () => void;
  onBlock: () => void;
}

function getContextIcon(type: string): string {
  const map: Record<string, string> = {
    MarketplaceListing: '🛒', HousingListing: '🏠', JobOpportunity: '💼',
    PrivateConversation: '💬', ProviderInquiry: '🍽️',
  };
  return map[type] || '💬';
}

export function ConversationRequestCard({ request, onAccept, onDecline, onBlock }: Props) {
  const initials = request.fromUser.displayName
    .split(' ').map((n) => n[0]).join('').slice(0, 2);

  return (
    <View className="bg-surface-card border border-subtle rounded-2xl mx-4 mb-3 overflow-hidden"
      style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
      
      {/* Request header */}
      <View className="bg-amber-50 border-b border-amber-100 px-4 py-2.5 flex-row items-center">
        <Text className="text-sm mr-2">📩</Text>
        <Text className="text-xs font-bold text-amber-700">Message Request</Text>
        {!request.fromUser.trust.isVerified && (
          <View className="ml-auto bg-surface-muted border border-subtle px-2 py-0.5 rounded-full">
            <Text className="text-[9px] font-bold text-content-tertiary">Unknown User</Text>
          </View>
        )}
      </View>

      {/* User info */}
      <View className="px-4 pt-4 pb-3 flex-row items-start">
        <View className="w-12 h-12 rounded-full bg-amber-100 border border-amber-200 items-center justify-center mr-3 overflow-hidden">
          {request.fromUser.avatarUrl ? (
            <Image source={{ uri: request.fromUser.avatarUrl }} style={{ width: 48, height: 48 }} contentFit="cover" />
          ) : (
            <Text className="text-base font-black text-amber-700">{initials}</Text>
          )}
        </View>
        <View className="flex-1">
          <Text className="text-sm font-bold text-content-primary">{request.fromUser.displayName}</Text>
          <Text className="text-[11px] text-content-muted font-semibold">
            {request.fromUser.trust.memberSince ? `Member since ${request.fromUser.trust.memberSince}` : 'New member'}
          </Text>
        </View>
      </View>

      {/* Context */}
      <View className="mx-4 mb-3 bg-surface-background border border-subtle rounded-xl px-3 py-2 flex-row items-center">
        <Text className="text-base mr-2">{getContextIcon(request.context.type)}</Text>
        <View className="flex-1">
          <Text className="text-[10px] font-bold text-content-faint uppercase">About</Text>
          <Text className="text-xs font-semibold text-content-secondary" numberOfLines={1}>{request.context.entityTitle}</Text>
        </View>
      </View>

      {/* Preview message */}
      <View className="mx-4 mb-4 bg-surface-muted rounded-xl px-3 py-2.5">
        <Text className="text-sm text-content-secondary" numberOfLines={3}>{request.previewMessage}</Text>
      </View>

      {/* Actions */}
      <View className="flex-row border-t border-faint">
        <TouchableOpacity
          onPress={onBlock}
          activeOpacity={0.7}
          className="flex-1 py-3.5 items-center border-r border-faint"
        >
          <Text className="text-xs font-bold text-content-faint">Block</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDecline}
          activeOpacity={0.7}
          className="flex-1 py-3.5 items-center border-r border-faint"
        >
          <Text className="text-xs font-bold text-content-tertiary">Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onAccept}
          activeOpacity={0.7}
          className="flex-2 py-3.5 items-center"
          style={{ flex: 2, backgroundColor: '#F59300' }}
        >
          <Text className="text-xs font-black text-white">✓ Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
