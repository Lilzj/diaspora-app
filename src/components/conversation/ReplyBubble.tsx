/**
 * ReplyBubble — Quoted reply preview inside a message bubble
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { ReplyReference } from '@/types/conversation';
import { useThemeTokens } from '@/design-system';

interface Props {
  replyTo: ReplyReference;
  isCurrentUser: boolean;
  onPress?: () => void;
}

export function ReplyBubble({ replyTo, isCurrentUser, onPress }: Props) {
  const tokens = useThemeTokens();
  const barColor = isCurrentUser ? 'rgba(255,255,255,0.5)' : '#F59300';
  const bgColor = isCurrentUser ? 'rgba(255,255,255,0.15)' : 'rgba(245,147,0,0.08)';
  const textColor = isCurrentUser ? 'rgba(255,255,255,0.9)' : tokens.color.text.primary;
  const subColor = isCurrentUser ? 'rgba(255,255,255,0.7)' : '#6B7280';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="rounded-t-2xl mb-0.5 overflow-hidden"
      style={{ backgroundColor: bgColor }}
    >
      <View className="flex-row">
        <View style={{ width: 3, backgroundColor: barColor, borderTopLeftRadius: 20 }} />
        <View className="flex-1 px-3 py-2">
          <Text style={{ color: barColor, fontSize: 11, fontWeight: '700', marginBottom: 1 }}>
            {/* Was `senderName || 'You'`. The server never sends the name, so
                every reply — including one to the other person — said "You". The
                screen now names the quoted author; an unnamed one is not you. */}
            {replyTo.senderName || 'Earlier message'}
          </Text>
          <Text style={{ color: subColor, fontSize: 12 }} numberOfLines={1}>
            {replyTo.attachmentType === 'image' ? '📷 Photo'
              : replyTo.attachmentType === 'voice' ? '🎤 Voice message'
              : replyTo.attachmentType === 'document' ? '📄 Document'
              : replyTo.previewText}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
