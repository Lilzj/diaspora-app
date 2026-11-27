// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — one row of a conversation thread
//
// A message, with the day it was sent above it where the day changes. Lifted
// out of `app/conversation/[id].tsx` on 27 Nov 2026, when the thread became a
// FlashList (FARCH-004): the screen hands the list one stable renderer, and a
// row works out its separator and avatar from the message before it rather than
// from the screen's copy of the whole thread.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text } from 'react-native';
import { MessageBubble } from '@/components/conversation/MessageBubble';
import { isOwnMessage, withAuthors } from '@/lib/domain/conversation-identity';
import type { Conversation, Message } from '@/types/conversation';

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

interface ThreadMessageProps {
  message: Message;
  /** The message above this one, which decides the separator and the avatar. */
  previous?: Message;
  currentUserId?: string | null;
  participants?: Conversation['participants'];
  onLongPress: (message: Message) => void;
  /** Jump to the message a reply quotes. */
  onReplyPress: (messageId: string) => void;
}

export function ThreadMessage({
  message,
  previous,
  currentUserId,
  participants,
  onLongPress,
  onReplyPress,
}: ThreadMessageProps) {
  const isCurrentUser = isOwnMessage(message, currentUserId);
  // An avatar heads each run of messages from the same person.
  const showAvatar = !isCurrentUser && (!previous || previous.senderId !== message.senderId);

  return (
    <View>
      {shouldShowDateSeparator(message, previous) && (
        <View className="items-center my-4">
          <View className="bg-subtle px-3 py-1 rounded-full">
            <Text className="text-[11px] text-content-tertiary font-semibold">
              {formatDateSeparator(message.createdAt)}
            </Text>
          </View>
        </View>
      )}
      <MessageBubble
        message={withAuthors(message, participants, currentUserId)}
        isCurrentUser={isCurrentUser}
        showAvatar={showAvatar}
        onLongPress={onLongPress}
        onReplyPress={onReplyPress}
      />
    </View>
  );
}
