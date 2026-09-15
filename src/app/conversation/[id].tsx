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
import { useNotification } from '@/providers/notification-provider';
import {
  View, FlatList, KeyboardAvoidingView, Platform,
  Clipboard, ActivityIndicator, TouchableOpacity, Text, Modal, Pressable, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ReportModal } from '@/components/ReportModal';
import { useLocalSearchParams } from 'expo-router';
import { useConversationStore } from '@/store/conversation';
import { useTypingStore } from '@/store/typing';
import { useAuthStore } from '@/store/auth';
import { ConversationHub } from '@/lib/conversation-hub';
import { currentUserIdIn, isOwnMessage, withAuthors } from '@/lib/conversation-identity';
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
import { Dialog } from '@/components/overlays/AppModal';
import { Button } from '@/components/Button';
import type { Message, ConnectionState, ReplyReference, Conversation } from '@/types/conversation';
import { useTheme } from '@/design-system';

// ---------------------------------------------------------------------------
// DATE SEPARATOR
// ---------------------------------------------------------------------------

/**
 * "Today", "Yesterday", a weekday, or a date — by calendar day on the phone.
 *
 * This counted whole 24-hour periods, so a message sent at 13:09 yesterday read
 * "Today" at 10:27 the next morning. Midnight is the boundary a member means.
 */
export function formatDateSeparator(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  // Rounded, because a day that crosses a clock change is 23 or 25 hours long.
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);

  if (days <= 0) return 'Today';
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
  const { tokens } = useTheme();
  const { showAlert } = useNotification();
  const { id } = useLocalSearchParams<{ id: string }>();
  const flatListRef = useRef<FlatList>(null);
  const isAtBottom = useRef(true);

  const { conversations, messages, isLoadingMessages, loadMessages, markConversationRead } =
    useConversationStore();
  const { getTypingLabel } = useTypingStore();

  const conversation = conversations.find((c) => c.conversationId === id) as Conversation | undefined;
  const convMessages = messages[id] || [];
  const typingLabel = getTypingLabel(id);

  // ── Whose message is whose ─────────────────────────────────────────────────
  //
  // This compared every sender with `'user-current'`, the development fixtures'
  // member, so on a real conversation nothing a member wrote counted as theirs:
  // their messages sat on the left in the other person's colours, with a "?"
  // avatar and no ticks. The server marks the member among the participants;
  // the signed-in account covers a conversation not loaded yet.
  const signedInUserId = useAuthStore((state) => state.user?.userId);
  const currentUserId = currentUserIdIn(conversation, signedInUserId);

  const [connectionState, setConnectionState] = useState<ConnectionState>('connected');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  /** The message the report sheet is open for, or null. */
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);

  // The *person*, distinct from the message. BG-05a — see the sheet entry.
  const [reportMemberId, setReportMemberId] = useState<string | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [attachmentPickerVisible, setAttachmentPickerVisible] = useState(false);
  const [optionsSheetVisible, setOptionsSheetVisible] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyReference | undefined>(undefined);
  // Editing used to go through `Alert.prompt`, which exists only on iOS. On
  // Android it is a no-op, so long-pressing a message and tapping Edit did
  // nothing at all — the feature was not degraded, it was absent.
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
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

  // A message that arrives while the thread is open has been read. Marking it
  // only on opening left it unread in the inbox, and left the sender's ticks
  // short of "read" until the member came back to a conversation they were in.
  const latest = convMessages[convMessages.length - 1];
  const lastMarkedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!id || !latest || latest.isOptimistic || isOwnMessage(latest, currentUserId)) return;
    if (lastMarkedRef.current === latest.messageId) return;
    lastMarkedRef.current = latest.messageId;
    markConversationRead(id);
    ConversationHub.markRead(id).catch(() => {});
  }, [id, latest?.messageId, currentUserId]);

  // Connection state listener
  useEffect(() => {
    const unsub = ConversationHub.onConnectionStateChange(setConnectionState);
    return unsub;
  }, []);

  /**
   * Join this conversation's realtime group while the thread is open.
   *
   * Remediation Wave F, and new work rather than a port: the mock had no notion
   * of groups, so it broadcast every simulated event to whoever was listening
   * and this screen needed to do nothing. On the real hub only the member's own
   * `user:{id}` group is joined automatically — typing signals, read receipts
   * and delivery receipts are all sent to `conversation:{id}`, so without this
   * they never arrive and the thread renders as though nobody else is there.
   *
   * Left on leaving. The server drops the membership when the socket closes
   * anyway, but a member who reads forty conversations in a session would
   * otherwise accumulate forty group memberships on one connection and receive
   * typing indicators for every one of them.
   */
  useEffect(() => {
    if (!id) return;

    void ConversationHub.joinConversation(id);

    return () => {
      void ConversationHub.leaveConversation(id);
    };
  }, [id]);

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
    const named = withAuthors(selectedMessage, conversation?.participants, currentUserId);
    setReplyTo({
      messageId: selectedMessage.messageId,
      senderId: selectedMessage.senderId,
      senderName: named.senderName,
      previewText: selectedMessage.text || '',
      attachmentType: selectedMessage.attachment?.type,
    });
  }, [selectedMessage, conversation, currentUserId]);

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
    setEditText(selectedMessage.text ?? '');
    setEditingMessage(selectedMessage);
  }, [selectedMessage]);

  const handleEditSave = useCallback(() => {
    const trimmed = editText.trim();
    if (editingMessage && trimmed) {
      ConversationHub.editMessage(id, editingMessage.messageId, trimmed);
    }
    setEditingMessage(null);
  }, [editingMessage, editText, id]);

  const handleDelete = useCallback(() => {
    if (!selectedMessage) return;
    showAlert({ type: 'warning', title: 'Delete Message', message: 'This message will be deleted for everyone.', buttons: [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => ConversationHub.deleteMessage(id, selectedMessage.messageId),
      },
    ] });
  }, [selectedMessage, id]);

  // ── Reporting a message ────────────────────────────────────────────────────
  //
  // This began as a bare `showAlert` reading **"Thank you for keeping Diaspora
  // safe. Our team will review this message."** Nothing was reported and no team
  // saw anything — on the surface where a member reports harassment they are
  // receiving privately, which is the worst place on the platform to be told a
  // moderator is looking when nobody is.
  //
  // Remediation Wave B′ replaced it with the truth, because there genuinely was
  // no route: `Diaspora.Modules.Conversations` registered 21 routes and not one
  // was a report; `ReportConversationRequest` existed as a DTO whose doc comment
  // described `POST /conversations/{id}/report` and whose symbol had exactly one
  // occurrence in the solution — its own declaration; and `CommunityContentType`
  // had no `Message` member, so the generic route failed at parse.
  //
  // ── What changed ────────────────────────────────────────────────────────────
  //
  // `CommunityContentType.Message` exists now and `MessageContentSource` claims
  // it, so `POST /community/reports` carries a message report through the same
  // taxonomy, the same queue and the same reasons as every other subject. The
  // source resolves **only for a participant**: a stranger asking about a message
  // id gets `community.content.not-found`, which is exactly what they get for an
  // id that does not exist, so reporting cannot be used to probe somebody's
  // inbox. It never exposes the message body to the moderation queue either.
  //
  // ── Blocking stays first, and that is deliberate ────────────────────────────
  //
  // A report is reviewed; a block takes effect immediately. Somebody being
  // harassed needs the second one now and the first one as well, so this offers
  // both rather than replacing the working control with the new one.
  const handleReport = useCallback(() => {
    const otherParty = conversation?.participants.find((p) => !p.isCurrentUser);
    const message = selectedMessage;

    showAlert({
      type: 'warning',
      title: message ? 'Report this message?' : 'Report this conversation?',
      message: message
        ? 'A moderator will review it. Blocking is the faster protection — it stops this person '
          + 'messaging you and takes effect straight away, without waiting for a decision.'
          + '\n\nIf you are in danger, please contact your local emergency services.'
        // No message selected means the sheet was opened from the conversation
        // header rather than from a message. A conversation is not a content
        // type — only individual messages are — so this offers the block and
        // says where the report lives, rather than posting something that would
        // be refused.
        : 'Open the message you want to report and choose Report from there. Blocking stops this '
          + 'person messaging you and takes effect straight away.'
          + '\n\nIf you are in danger, please contact your local emergency services.',
      buttons: [
        { text: 'Close', style: 'cancel' },
        ...(message
          ? [
              {
                text: 'Report message',
                onPress: () => setReportMessageId(message.messageId),
              },
            ]
          : []),
        ...(otherParty
          ? [
              {
                text: `Block ${otherParty.displayName}`,
                style: 'destructive' as const,
                onPress: () => {
                  void (async () => {
                    const blocked = await ConversationHub.block(otherParty.userId);
                    showAlert(
                      blocked
                        ? {
                            type: 'success',
                            title: 'Blocked',
                            message: `${otherParty.displayName} can no longer message you.`,
                          }
                        : {
                            type: 'error',
                            title: 'Not blocked',
                            message: `We could not reach Diaspora, so ${otherParty.displayName} has not been blocked and can still message you. Please try again.`,
                          }
                    );
                  })();
                },
              },
            ]
          : []),
      ],
    });
  }, [conversation, selectedMessage, showAlert]);

  const other = conversation?.participants.find((p) => !p.isCurrentUser);

  if (!conversation && !isLoadingMessages[id]) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center">
        <Text className="text-5xl mb-4">💬</Text>
        <Text className="text-base font-bold text-content-tertiary">Conversation not found</Text>
        <TouchableOpacity onPress={() => ConversationHub.openConversation(id)} className="mt-4">
          <Text className="text-amber-600 font-bold">← Back to Inbox</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-background">
      <KeyboardAvoidingView
        behavior="padding"
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
        
          statusBarTranslucent
          navigationBarTranslucent>
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}
            onPress={() => setOptionsSheetVisible(false)}
          >
            <Pressable
              style={{
                backgroundColor: tokens.color.surface.card,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingTop: 12,
                paddingBottom: 36,
                paddingHorizontal: 0,
              }}
              onPress={() => {}}
            >
              {/* Handle */}
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: tokens.color.neutral[200], alignSelf: 'center', marginBottom: 20 }} />

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
                      if (!ok) showAlert({ type: 'error', title: 'Pin limit reached', message: 'You can only pin up to 5 conversations.' });
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
                  // ── Reporting the person, not just the message ────────────
                  //
                  // This sheet offered **Block** and no report, which is the
                  // gap BG-05a closed in the backend and nobody wired. The two
                  // are not substitutes: blocking is private and tells
                  // moderation nothing, while a report is what opens a case.
                  //
                  // BG-05a's own justification was that somebody harassed
                  // across several surfaces had to complain about each *thing*
                  // separately and no single case ever described the pattern.
                  // Reporting one message at a time is that same gap, and this
                  // is the control that closes it.
                  //
                  // `userId` is what `MemberContentSource` resolves, from
                  // Community's own member projection.
                  icon: '🚩',
                  label: 'Report this person',
                  danger: true,
                  onPress: () => {
                    setOptionsSheetVisible(false);
                    const subject = conversation?.participants.find((p) => !p.isCurrentUser);
                    if (subject) setReportMemberId(subject.userId);
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
                    showAlert({ type: 'warning', title: 'Block User', message: `Block ${other.displayName}? They won't be able to message you.`, buttons: [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Block',
                          style: 'destructive',
                          // Was fire-and-forget against a helper that swallowed
                          // its own failure, so a block that never reached the
                          // server looked exactly like one that did.
                          onPress: () => {
                            void (async () => {
                              const blocked = await ConversationHub.block(other.userId);
                              showAlert(
                                blocked
                                  ? {
                                      type: 'success',
                                      title: 'Blocked',
                                      message: `${other.displayName} can no longer message you.`,
                                    }
                                  : {
                                      type: 'error',
                                      title: 'Not blocked',
                                      message: `We could not reach Diaspora, so ${other.displayName} has not been blocked and can still message you. Please try again.`,
                                    }
                              );
                            })();
                          },
                        },
                      ] });
                  },
                },
                // ── "Report or block" was here, and has been removed ──────────
                //
                // It existed because a *conversation* is not a reportable content
                // type, so the honest thing it could offer was "open the message
                // you want to report and choose Report from there", plus a block.
                //
                // Both halves are now covered by their own entries above, and the
                // sentence it showed is no longer true: a member can report the
                // person directly from this sheet. Keeping it would have left
                // three overlapping red rows, one of them directing the member
                // away from the control immediately above it.
                //
                // `handleReport` is unchanged and still serves the message-level
                // flow, which is where it is reached from — long-press a message,
                // then Report.
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
                    borderTopColor: tokens.color.neutral[100],
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
            // Who is who can resolve after the messages do — the conversation
            // arrives with them, or the account restores a moment later — and a
            // list that only watches `data` would keep the old attribution.
            extraData={`${currentUserId ?? ''}|${conversation?.participants.length ?? 0}`}
            keyExtractor={(item) => item.messageId}
            renderItem={({ item, index }) => {
              const prevMsg = index > 0 ? convMessages[index - 1] : undefined;
              const showDate = shouldShowDateSeparator(item, prevMsg);
              const isCurrentUser = isOwnMessage(item, currentUserId);
              const showAvatar = !isCurrentUser && shouldShowAvatar(convMessages, index);

              return (
                <View>
                  {showDate && (
                    <View className="items-center my-4">
                      <View className="bg-subtle px-3 py-1 rounded-full">
                        <Text className="text-[11px] text-content-tertiary font-semibold">
                          {formatDateSeparator(item.createdAt)}
                        </Text>
                      </View>
                    </View>
                  )}
                  <MessageBubble
                    message={withAuthors(item, conversation?.participants, currentUserId)}
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
            // ── No `initialScrollIndex` ──────────────────────────────────────
            //
            // It was set to the last message. Without `getItemLayout` a
            // virtualised list then renders *from* that index, and a thread
            // shorter than the screen can never scroll up to ask for the rest —
            // so every conversation showed only its latest message. Found on 15
            // Sep 2026: a thread of five messages displayed "How much?" alone.
            // The list starts at the top and `onContentSizeChange` above takes
            // it to the end, which is what the index was for.
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
        isCurrentUser={selectedMessage ? isOwnMessage(selectedMessage, currentUserId) : false}
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
          showAlert({ type: 'success', title: 'Image Selected', message: 'Image will be sent in the full release.' });
        }}
      />

      {/* What `Alert.prompt` was meant to be, on both platforms. */}
      <Dialog
        visible={editingMessage !== null}
        onClose={() => setEditingMessage(null)}
        title="Edit message"
        testID="edit-message-dialog"
        footer={
          <View className="flex-row gap-3">
            <Button
              label="Cancel"
              variant="neutral"
              fullWidth={false}
              className="flex-1"
              onPress={() => setEditingMessage(null)}
            />
            <Button
              label="Save"
              fullWidth={false}
              className="flex-1"
              disabled={!editText.trim()}
              onPress={handleEditSave}
            />
          </View>
        }
      >
        <TextInput
          value={editText}
          onChangeText={setEditText}
          multiline
          autoFocus
          accessibilityLabel="Message text"
          testID="edit-message-input"
          placeholderTextColor={tokens.color.text.placeholder}
          className="bg-surface-background border border-subtle rounded-xl p-4 text-base"
          style={{ color: tokens.color.text.primary, minHeight: 96, textAlignVertical: 'top' }}
        />
      </Dialog>

      {/* One message, reported through the same route and the same reason list
          as every other subject on the platform. `MessageContentSource` resolves
          it only for a participant, so the id in this modal is the member's own
          conversation and nobody else's. */}
      <ReportModal
        visible={reportMessageId !== null}
        onClose={() => setReportMessageId(null)}
        contentType="Message"
        contentId={reportMessageId ?? ''}
      />

      {/* The person. A separate modal rather than a shared one, because the two
          are different subjects and the confirmation each shows is different —
          reporting a *member* is a standing complaint, not a complaint about
          one thing they wrote. `MemberContentSource` resolves the id from
          Community's own projection (BG-05a). */}
      <ReportModal
        visible={reportMemberId !== null}
        onClose={() => setReportMemberId(null)}
        contentType="Member"
        contentId={reportMemberId ?? ''}
      />
    </SafeAreaView>
  );
}
