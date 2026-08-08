/**
 * Conversation Screen — The core messaging experience
 *
 * Features:
 * - Context header (collapsible)
 * - Trust banner
 * - Virtualized message list with date separators
 * - Message grouping
 * - Typing indicator
 * - Floating new message badge (when scrolled up)
 * - Long-press message actions
 * - Reply threading
 * - Connection status banner
 * - Keyboard avoiding
 * - Safe area support
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, FlatList, KeyboardAvoidingView, Platform, Alert,
  Clipboard, ActivityIndicator, TouchableOpacity, Text, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useConversationStore } from '@/store/conversation';
import { useTypingStore } from '@/store/typing';
import { ConversationHub } from '@/lib/conversation-hub';
import { ConversationHeader } from '@/components/conversation/ConversationHeader';
import { ContextCard } from '@/components/conversation/ContextCard';
import { TrustBanner } from '@/components/conversation/TrustBanner';
import { MessageBubble } from '@/components/conversation/MessageBubble';
import { TypingIndicator } from '@/components/conversation/TypingIndicator';
import { MessageComposer } from '@/components/conversation/MessageComposer';
import { MessageActionSheet } from '@/components/conversation/MessageActionSheet';
import { AttachmentPicker } from '@/components/conversation/AttachmentPicker';
import { FloatingNewMessageBadge } from '@/components/conversation/FloatingNewMessageBadge';
import { ConnectionBanner } from '@/components/conversation/ConnectionBanner';
import type { Message, ConnectionState, ReplyReference, Conversation } from '@/types/conversation';

// ---------------------------------------------------------------------------
// DATE SEPARATOR
// ---------------------------------------------------------------------------

function formatDateSeparator(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString('en-GB', { weekday: 'long' });
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: days > 365 ? 'numeric' : undefined });
}

function shouldShowDateSeparator(current: Message, previous?: Message): boolean {
  if (!previous) return true;
  const a = new Date(previous.createdAt);
  const b = new Date(current.createdAt);
  return a.toDateString() !== b.toDateString();
}

function shouldShowAvatar(messages: Message[], index: number): boolean {
  if (index === 0) return true;
  const current = messages[index];
  const prev = messages[index - 1];
  return prev.senderId !== current.senderId;
}

// ---------------------------------------------------------------------------
// SCREEN
// ---------------------------------------------------------------------------

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const flatListRef = useRef<FlatList>(null);
  const isAtBottom = useRef(true);

  const { conversations, messages, isLoadingMessages, loadMessages, markConversationRead } =
    useConversationStore();
  const { getTypingLabel } = useTypingStore();

  const conversation = conversations.find((c) => c.conversationId === id) as Conversation | undefined;
  const convMessages = messages[id] || [];
  const typingLabel = getTypingLabel(id);

  const [connectionState, setConnectionState] = useState<ConnectionState>('connected');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [attachmentPickerVisible, setAttachmentPickerVisible] = useState(false);
  const [optionsSheetVisible, setOptionsSheetVisible] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyReference | undefined>(undefined);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const prevMessageCount = useRef(convMessages.length);

  // Load messages + mark read
  useEffect(() => {
    if (id) {
      loadMessages(id);
      markConversationRead(id);
      ConversationHub.markRead(id).catch(() => {});
    }
  }, [id]);

  // Connection state listener
  useEffect(() => {
    const unsub = ConversationHub.onConnectionStateChange(setConnectionState);
    return unsub;
  }, []);

  // Track new messages when scrolled up
  useEffect(() => {
    const count = convMessages.length;
    if (!isAtBottom.current && count > prevMessageCount.current) {
      setNewMessageCount((n) => n + (count - prevMessageCount.current));
    }
    prevMessageCount.current = count;
  }, [convMessages.length]);

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
    setNewMessageCount(0);
    isAtBottom.current = true;
  }, []);

  const handleSend = useCallback(async (text: string) => {
    await ConversationHub.sendMessage(id, text, replyTo?.messageId);
    setReplyTo(undefined);
    setTimeout(scrollToBottom, 100);
  }, [id, replyTo]);

  const handleLongPress = useCallback((message: Message) => {
    setSelectedMessage(message);
    setActionSheetVisible(true);
  }, []);

  const handleReply = useCallback(() => {
    if (!selectedMessage) return;
    setReplyTo({
      messageId: selectedMessage.messageId,
      senderId: selectedMessage.senderId,
      senderName: selectedMessage.senderName,
      previewText: selectedMessage.text || '',
      attachmentType: selectedMessage.attachment?.type,
    });
  }, [selectedMessage]);

  const handleCopy = useCallback(() => {
    if (selectedMessage?.text) {
      if (Platform.OS === 'web') {
        navigator.clipboard?.writeText(selectedMessage.text);
      } else {
        Clipboard.setString(selectedMessage.text);
      }
    }
  }, [selectedMessage]);

  const handleEdit = useCallback(() => {
    if (!selectedMessage) return;
    Alert.prompt(
      'Edit Message',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (newText: string | undefined) => {
            if (newText?.trim()) {
              ConversationHub.editMessage(id, selectedMessage.messageId, newText.trim());
            }
          },
        },
      ],
      'plain-text',
      selectedMessage.text
    );
  }, [selectedMessage, id]);

  const handleDelete = useCallback(() => {
    if (!selectedMessage) return;
    Alert.alert('Delete Message', 'This message will be deleted for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => ConversationHub.deleteMessage(id, selectedMessage.messageId),
      },
    ]);
  }, [selectedMessage, id]);

  const handleReport = useCallback(() => {
    Alert.alert('Report Message', 'Thank you for keeping Diaspora safe. Our team will review this message.', [{ text: 'OK' }]);
  }, []);

  const other = conversation?.participants.find((p) => !p.isCurrentUser);

  if (!conversation && !isLoadingMessages[id]) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <Text className="text-5xl mb-4">💬</Text>
        <Text className="text-base font-bold text-neutral-600">Conversation not found</Text>
        <TouchableOpacity onPress={() => ConversationHub.openConversation(id)} className="mt-4">
          <Text className="text-amber-600 font-bold">← Back to Inbox</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-neutral-50">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        {conversation && (
          <ConversationHeader
            conversation={conversation}
            onMorePress={() => setOptionsSheetVisible(true)}
          />
        )}

        {/* ── Conversation Options Bottom Sheet ── */}
        <Modal
          visible={optionsSheetVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setOptionsSheetVisible(false)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}
            onPress={() => setOptionsSheetVisible(false)}
          >
            <Pressable
              style={{
                backgroundColor: '#FFFFFF',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingTop: 12,
                paddingBottom: 36,
                paddingHorizontal: 0,
              }}
              onPress={() => {}}
            >
              {/* Handle */}
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 20 }} />

              {/* Title */}
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 24, marginBottom: 12 }}>
                Conversation Options
              </Text>

              {/* Options */}
              {[
                {
                  icon: conversation?.isPinned ? '📌' : '📌',
                  label: conversation?.isPinned ? 'Unpin Conversation' : 'Pin Conversation',
                  onPress: async () => {
                    setOptionsSheetVisible(false);
                    if (conversation?.isPinned) {
                      await ConversationHub.unpinConversation(id);
                    } else {
                      const ok = await ConversationHub.pinConversation(id);
                      if (!ok) Alert.alert('Pin limit reached', 'You can only pin up to 5 conversations.');
                    }
                  },
                },
                {
                  icon: conversation?.isMuted ? '🔔' : '🔕',
                  label: conversation?.isMuted ? 'Unmute Notifications' : 'Mute for 24 Hours',
                  onPress: async () => {
                    setOptionsSheetVisible(false);
                    if (conversation?.isMuted) {
                      await ConversationHub.unmute(id);
                    } else {
                      await ConversationHub.mute(id, '24h');
                    }
                  },
                },
                {
                  icon: '📦',
                  label: conversation?.isArchived ? 'Unarchive' : 'Archive Conversation',
                  onPress: async () => {
                    setOptionsSheetVisible(false);
                    if (conversation?.isArchived) {
                      await ConversationHub.unarchive(id);
                    } else {
                      await ConversationHub.archive(id);
                    }
                  },
                },
                {
                  icon: '✓',
                  label: 'Mark as Read',
                  onPress: async () => {
                    setOptionsSheetVisible(false);
                    await ConversationHub.markRead(id);
                  },
                },
                {
                  icon: '🚫',
                  label: 'Block User',
                  danger: true,
                  onPress: () => {
                    setOptionsSheetVisible(false);
                    const other = conversation?.participants.find(p => !p.isCurrentUser);
                    if (!other) return;
                    Alert.alert(
                      'Block User',
                      `Block ${other.displayName}? They won't be able to message you.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Block', style: 'destructive', onPress: () => ConversationHub.block(other.userId) },
                      ]
                    );
                  },
                },
                {
                  icon: '🛡️',
                  label: 'Report Conversation',
                  danger: true,
                  onPress: () => {
                    setOptionsSheetVisible(false);
                    Alert.alert('Report Submitted', 'Thank you. Our moderation team will review this conversation.');
                  },
                },
              ].map((opt, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={opt.onPress}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 24,
                    paddingVertical: 15,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: '#F3F4F6',
                  }}
                >
                  <Text style={{ fontSize: 20, width: 32 }}>{opt.icon}</Text>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: '600',
                      color: (opt as any).danger ? '#EF4444' : '#111827',
                      flex: 1,
                    }}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Connection status */}
        {connectionState !== 'connected' && (
          <ConnectionBanner state={connectionState} />
        )}

        {/* Main scroll area */}
        {isLoadingMessages[id] ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#F59300" size="large" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={convMessages}
            keyExtractor={(item) => item.messageId}
            renderItem={({ item, index }) => {
              const prevMsg = index > 0 ? convMessages[index - 1] : undefined;
              const showDate = shouldShowDateSeparator(item, prevMsg);
              const isCurrentUser = item.senderId === 'user-current';
              const showAvatar = !isCurrentUser && shouldShowAvatar(convMessages, index);

              return (
                <View>
                  {showDate && (
                    <View className="items-center my-4">
                      <View className="bg-neutral-200 px-3 py-1 rounded-full">
                        <Text className="text-[11px] text-neutral-600 font-semibold">
                          {formatDateSeparator(item.createdAt)}
                        </Text>
                      </View>
                    </View>
                  )}
                  <MessageBubble
                    message={item}
                    isCurrentUser={isCurrentUser}
                    showAvatar={showAvatar}
                    onLongPress={handleLongPress}
                    onReplyPress={(msgId) => {
                      const target = convMessages.find((m) => m.messageId === msgId);
                      if (target) {
                        const targetIndex = convMessages.findIndex((m) => m.messageId === msgId);
                        flatListRef.current?.scrollToIndex({ index: targetIndex, animated: true, viewPosition: 0.5 });
                      }
                    }}
                  />
                </View>
              );
            }}
            ListHeaderComponent={
              conversation ? (
                <View className="pt-4">
                  <ContextCard context={conversation.context} />
                  {other?.trust && other.trust.isVerified && (
                    <TrustBanner trust={other.trust} displayName={other.displayName} />
                  )}
                </View>
              ) : null
            }
            ListFooterComponent={
              typingLabel ? <TypingIndicator label={typingLabel} /> : <View className="h-4" />
            }
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              isAtBottom.current =
                contentOffset.y + layoutMeasurement.height >= contentSize.height - 40;
              if (isAtBottom.current) setNewMessageCount(0);
            }}
            scrollEventThrottle={16}
            onContentSizeChange={() => {
              if (isAtBottom.current) scrollToBottom();
            }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 8 }}
            initialScrollIndex={convMessages.length > 0 ? convMessages.length - 1 : undefined}
            onScrollToIndexFailed={() => {
              flatListRef.current?.scrollToEnd({ animated: false });
            }}
          />
        )}

        {/* Floating new message badge */}
        {newMessageCount > 0 && (
          <FloatingNewMessageBadge count={newMessageCount} onPress={scrollToBottom} />
        )}

        {/* Composer */}
        <MessageComposer
          onSend={handleSend}
          onAttachmentPress={() => setAttachmentPickerVisible(true)}
          onTypingStart={() => ConversationHub.emitTypingStarted(id)}
          onTypingEnd={() => ConversationHub.emitTypingEnded(id)}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(undefined)}
          disabled={conversation?.state === 'Blocked' || conversation?.state === 'Closed'}
        />
      </KeyboardAvoidingView>

      {/* Message action sheet */}
      <MessageActionSheet
        visible={actionSheetVisible}
        message={selectedMessage}
        isCurrentUser={selectedMessage?.senderId === 'user-current'}
        onClose={() => { setActionSheetVisible(false); setSelectedMessage(null); }}
        onReply={handleReply}
        onCopy={handleCopy}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onReport={handleReport}
      />

      {/* Attachment picker */}
      <AttachmentPicker
        visible={attachmentPickerVisible}
        onClose={() => setAttachmentPickerVisible(false)}
        onImageSelected={(uri) => {
          setAttachmentPickerVisible(false);
          // In production: upload and send as image message
          Alert.alert('Image Selected', 'Image will be sent in the full release.');
        }}
      />
    </SafeAreaView>
  );
}
