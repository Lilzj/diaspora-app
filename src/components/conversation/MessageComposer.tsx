/**
 * MessageComposer — Multi-mode message input
 * Text, voice hold-to-record (mocked), attachments, emoji, send.
 */

import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeTokens } from '@/design-system';
import { ReplyBubble } from './ReplyBubble';
import type { ReplyReference } from '@/types/conversation';

interface Props {
  onSend: (text: string) => void;
  onAttachmentPress: () => void;
  onTypingStart?: () => void;
  onTypingEnd?: () => void;
  replyTo?: ReplyReference;
  onClearReply?: () => void;
  disabled?: boolean;
}

export function MessageComposer({
  onSend,
  onAttachmentPress,
  onTypingStart,
  onTypingEnd,
  replyTo,
  onClearReply,
  disabled = false,
}: Props) {
  const tokens = useThemeTokens();
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const insets = useSafeAreaInsets();
  const typingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextChange = useCallback((value: string) => {
    setText(value);

    // Emit typing events with debounce
    if (!typingRef.current) {
      typingRef.current = true;
      onTypingStart?.();
    }

    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      typingRef.current = false;
      onTypingEnd?.();
    }, 1500);
  }, [onTypingStart, onTypingEnd]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    // Clear typing
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingRef.current = false;
    onTypingEnd?.();

    onSend(trimmed);
    setText('');
    Keyboard.dismiss();
  }, [text, disabled, onSend, onTypingEnd]);

  const canSend = text.trim().length > 0;

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderTopWidth: 1,
        borderTopColor: tokens.color.neutral[200],
        paddingBottom: Platform.OS === 'ios' ? insets.bottom + 4 : 8,
      }}
    >
      {/* Reply preview */}
      {replyTo && (
        <View className="flex-row items-center px-4 pt-3 pb-1">
          <View className="flex-1 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <Text className="text-[10px] font-bold text-amber-600 mb-0.5">↩ Replying to {replyTo.senderName}</Text>
            <Text className="text-xs text-content-tertiary" numberOfLines={1}>{replyTo.previewText}</Text>
          </View>
          <TouchableOpacity onPress={onClearReply} className="ml-2 p-2" activeOpacity={0.7}>
            <Text className="text-content-faint text-lg">✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input row */}
      <View className="flex-row items-end px-3 pt-2 gap-2">
        {/* Attachment button */}
        <TouchableOpacity
          onPress={onAttachmentPress}
          activeOpacity={0.7}
          className="w-10 h-10 rounded-full bg-surface-muted border border-subtle items-center justify-center mb-0.5"
        >
          <Text className="text-lg">📎</Text>
        </TouchableOpacity>

        {/* Text input */}
        <View className="flex-1 bg-surface-muted rounded-3xl px-4 py-2.5 min-h-10 max-h-28 justify-center border border-subtle">
          <TextInput
            testID="message-composer"
            value={text}
            onChangeText={handleTextChange}
            placeholder="Message..."
            // The composer had no label at all, so the one field on the
            // messaging critical path announced itself as an unnamed input.
            accessibilityLabel="Message"
            // Was #9BA3B8, which scores 2.40:1 on the composer's own
            // background and fails WCAG AA.
            placeholderTextColor={tokens.color.text.placeholder}
            multiline
            style={{
              fontSize: 15,
              color: tokens.color.neutral[800],
              fontWeight: '400',
              maxHeight: 100,
              padding: 0,
            }}
            editable={!disabled}
            returnKeyType="default"
            blurOnSubmit={false}
          />
        </View>

        {/* Send or voice */}
        {canSend ? (
          <TouchableOpacity
            onPress={handleSend}
            activeOpacity={0.85}
            className="w-10 h-10 rounded-full items-center justify-center mb-0.5"
            style={{ backgroundColor: '#F59300' }}
          >
            <Text className="text-white text-base font-black">↑</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPressIn={() => setIsRecording(true)}
            onPressOut={() => {
              setIsRecording(false);
              // Mock: show toast that recording is demo-only
            }}
            activeOpacity={0.85}
            className="w-10 h-10 rounded-full items-center justify-center mb-0.5"
            style={{ backgroundColor: isRecording ? '#DC2626' : '#F59300' }}
          >
            <Text className="text-white text-base">{isRecording ? '⏹' : '🎤'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {isRecording && (
        <View className="flex-row items-center justify-center py-2">
          <View className="w-2 h-2 rounded-full bg-red-500 mr-2" />
          <Text className="text-xs font-bold text-red-500">Recording... Slide left to cancel</Text>
        </View>
      )}
    </View>
  );
}
