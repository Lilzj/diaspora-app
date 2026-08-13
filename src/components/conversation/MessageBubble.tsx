/**
 * MessageBubble — Renders a single message with all variants.
 * Handles: text, image, voice, document, system, verification, deleted.
 * Shows: edit indicator, reply preview, delivery status (sender only).
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { ReadReceipt } from './ReadReceipt';
import { ReplyBubble } from './ReplyBubble';
import type { Message } from '@/types/conversation';

interface Props {
  message: Message;
  isCurrentUser: boolean;
  showAvatar?: boolean;
  onLongPress?: (message: Message) => void;
  onReplyPress?: (messageId: string) => void;
  onImagePress?: (url: string) => void;
}

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatVoiceDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MessageBubble({ message, isCurrentUser, showAvatar = true, onLongPress, onReplyPress, onImagePress }: Props) {
  const [voicePlaying, setVoicePlaying] = useState(false);

  // System messages
  if (message.type === 'system') {
    return (
      <View className="items-center my-3 px-4">
        <View className="bg-surface-muted border border-subtle px-4 py-1.5 rounded-full">
          <Text className="text-[11px] text-content-muted font-semibold text-center">{message.text}</Text>
        </View>
      </View>
    );
  }

  // Verification messages
  if (message.type === 'verification') {
    return (
      <View className="mx-4 my-2 bg-teal-50 border border-teal-200 rounded-2xl p-4 items-center">
        <Text className="text-2xl mb-1">✅</Text>
        <Text className="text-sm font-bold text-teal-800 text-center">{message.text}</Text>
        <Text className="text-[10px] text-teal-600 font-semibold mt-1">{formatMessageTime(message.createdAt)}</Text>
      </View>
    );
  }

  const bgColor = isCurrentUser ? '#F59300' : '#F3F4F8';
  const textColor = isCurrentUser ? '#FFFFFF' : '#272A35';
  const borderRadius = isCurrentUser
    ? { borderRadius: 20, borderBottomRightRadius: 4 }
    : { borderRadius: 20, borderBottomLeftRadius: 4 };

  return (
    <Pressable
      onLongPress={() => !message.isDeleted && onLongPress?.(message)}
      className={`flex-row items-end mb-1 px-4 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
    >
      {/* Avatar (other user) */}
      {!isCurrentUser && showAvatar && (
        <View className="w-7 h-7 rounded-full bg-amber-100 border border-amber-200 items-center justify-center mr-2 mb-1 overflow-hidden">
          {message.senderAvatarUrl ? (
            <Image source={{ uri: message.senderAvatarUrl }} style={{ width: 28, height: 28 }} contentFit="cover" />
          ) : (
            <Text className="text-[10px] font-black text-amber-700">
              {message.senderName?.split(' ').map((n) => n[0]).join('') || '?'}
            </Text>
          )}
        </View>
      )}
      {!isCurrentUser && !showAvatar && <View className="w-7 mr-2" />}

      {/* Bubble */}
      <View style={{ maxWidth: '78%' }}>
        {/* Reply preview */}
        {message.replyTo && (
          <ReplyBubble
            replyTo={message.replyTo}
            isCurrentUser={isCurrentUser}
            onPress={() => onReplyPress?.(message.replyTo!.messageId)}
          />
        )}

        <View style={[{ backgroundColor: bgColor }, borderRadius, { padding: 0, overflow: 'hidden' }]}>
          {/* DELETED */}
          {message.isDeleted && (
            <View className="px-4 py-3">
              <Text style={{ color: isCurrentUser ? 'rgba(255,255,255,0.6)' : '#9BA3B8', fontSize: 13, fontStyle: 'italic' }}>
                🚫 This message was deleted
              </Text>
            </View>
          )}

          {/* IMAGE */}
          {!message.isDeleted && message.type === 'image' && message.attachment?.type === 'image' && (
            <TouchableOpacity onPress={() => onImagePress?.(message.attachment?.url || '')} activeOpacity={0.9}>
              <Image
                source={{ uri: message.attachment.url }}
                style={{ width: 220, height: 170 }}
                contentFit="cover"
              />
              {message.text && (
                <Text className="px-3 py-2" style={{ color: textColor, fontSize: 14 }}>{message.text}</Text>
              )}
            </TouchableOpacity>
          )}

          {/* VOICE NOTE */}
          {!message.isDeleted && message.type === 'voice' && message.attachment?.type === 'voice' && (
            <View className="px-4 py-3 flex-row items-center" style={{ minWidth: 160 }}>
              <TouchableOpacity
                onPress={() => setVoicePlaying(!voicePlaying)}
                className="w-9 h-9 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: isCurrentUser ? 'rgba(255,255,255,0.25)' : '#F59300' }}
              >
                <Text style={{ color: isCurrentUser ? '#FFFFFF' : '#FFFFFF', fontSize: 16 }}>
                  {voicePlaying ? '⏸' : '▶'}
                </Text>
              </TouchableOpacity>
              <View className="flex-1">
                {/* Waveform placeholder */}
                <View className="flex-row items-center h-6 gap-0.5">
                  {(message.attachment.waveformData || Array.from({ length: 20 }, () => Math.random())).map((amp, i) => (
                    <View
                      key={i}
                      style={{
                        width: 3,
                        height: Math.max(4, amp * 22),
                        backgroundColor: isCurrentUser ? 'rgba(255,255,255,0.7)' : '#F59300',
                        borderRadius: 2,
                      }}
                    />
                  ))}
                </View>
                <Text style={{ color: isCurrentUser ? 'rgba(255,255,255,0.8)' : '#9BA3B8', fontSize: 10, marginTop: 3 }}>
                  {formatVoiceDuration(message.attachment.durationSeconds)}
                </Text>
              </View>
            </View>
          )}

          {/* DOCUMENT */}
          {!message.isDeleted && message.type === 'document' && message.attachment?.type === 'document' && (
            <View className="px-4 py-3 flex-row items-center">
              <View className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: isCurrentUser ? 'rgba(255,255,255,0.2)' : '#FFF8EB' }}>
                <Text style={{ fontSize: 20 }}>📄</Text>
              </View>
              <View className="flex-1">
                <Text style={{ color: textColor, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                  {message.attachment.fileName}
                </Text>
                <Text style={{ color: isCurrentUser ? 'rgba(255,255,255,0.7)' : '#9BA3B8', fontSize: 11 }}>
                  {message.attachment.sizeBytes
                    ? `${(message.attachment.sizeBytes / 1024).toFixed(0)} KB`
                    : ''} · PDF
                </Text>
              </View>
            </View>
          )}

          {/* TEXT */}
          {!message.isDeleted && message.type === 'text' && (
            <View className="px-4 py-3">
              <Text style={{ color: textColor, fontSize: 15, lineHeight: 22 }}>{message.text}</Text>
            </View>
          )}

          {/* Timestamp + edit + receipt */}
          <View className={`flex-row items-center px-3 pb-2 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
            {message.isEdited && (
              <Text style={{ color: isCurrentUser ? 'rgba(255,255,255,0.6)' : '#9BA3B8', fontSize: 10 }} className="mr-1">
                edited
              </Text>
            )}
            <Text style={{ color: isCurrentUser ? 'rgba(255,255,255,0.7)' : '#9BA3B8', fontSize: 11 }}>
              {formatMessageTime(message.createdAt)}
            </Text>
            {isCurrentUser && (
              <View className="ml-1.5">
                <ReadReceipt status={message.delivery.status} size="xs" />
              </View>
            )}
          </View>
        </View>

        {/* Sending indicator */}
        {message.delivery.status === 'sending' && (
          <Text className="text-[10px] text-content-faint font-semibold mt-1 text-right">Sending...</Text>
        )}
        {message.delivery.status === 'failed' && (
          <Text className="text-[10px] text-red-500 font-bold mt-1 text-right">⚠ Failed to send. Tap to retry.</Text>
        )}
      </View>
    </Pressable>
  );
}
