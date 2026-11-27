/**
 * One row of a conversation thread (FARCH-004, 27 Nov 2026).
 *
 * The thread became a FlashList, and its row moved out of the screen into
 * `ThreadMessage`. A row now works out its avatar and its day separator from
 * the message before it, which the list hands it, rather than from the screen's
 * copy of the whole thread. These tests draw a run of rows the way the list
 * does and hold the two rules that moved: an avatar heads each run of messages
 * from the same person, and the day is said where it changes.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { ThemeProvider } from '@/design-system';
import { ThreadMessage } from '../conversation/ThreadMessage';
import type { Message } from '@/types/conversation';

const AISHA = '01a0576f-2c1d-7f00-8000-0000000000a1';
const DAVID = '01a05770-33f2-7600-8000-0000000000da';

/** Midday UTC, so the day is the same day wherever the test runs. */
function message(id: string, senderId: string, day: string, minute: number): Message {
  return {
    messageId: id,
    conversationId: 'c1',
    senderId,
    senderName: senderId === DAVID ? 'David Mensah' : 'Aisha',
    senderAvatarUrl: senderId === DAVID ? 'https://media.example/david.jpg' : undefined,
    type: 'text',
    text: `Message ${id}`,
    delivery: { status: 'delivered' },
    createdAt: `${day}T12:${String(minute).padStart(2, '0')}:00.000Z`,
  };
}

/** The rows as the list draws them: each handed the message before it. */
function drawThread(messages: Message[]) {
  return render(
    <ThemeProvider>
      {messages.map((item, index) => (
        <ThreadMessage
          key={item.messageId}
          message={item}
          previous={index > 0 ? messages[index - 1] : undefined}
          currentUserId={AISHA}
          onLongPress={jest.fn()}
          onReplyPress={jest.fn()}
        />
      ))}
    </ThemeProvider>
  );
}

it('heads each run of messages from the other side with an avatar, and only the run', () => {
  drawThread([
    message('1', DAVID, '2025-01-05', 1),
    message('2', DAVID, '2025-01-05', 2),
    message('3', AISHA, '2025-01-05', 3),
    message('4', DAVID, '2025-01-05', 4),
    message('5', DAVID, '2025-01-05', 5),
  ]);

  // David's two runs each start with his photograph; Aisha's own message has none.
  expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(2);
  for (const id of ['1', '2', '3', '4', '5']) expect(screen.getByText(`Message ${id}`)).toBeTruthy();
});

it('says the day where it changes, and only there', () => {
  drawThread([
    message('1', DAVID, '2025-01-05', 1),
    message('2', AISHA, '2025-01-05', 2),
    message('3', DAVID, '2025-01-06', 1),
    message('4', AISHA, '2025-01-06', 2),
  ]);

  expect(screen.getAllByText('5 January 2025')).toHaveLength(1);
  expect(screen.getAllByText('6 January 2025')).toHaveLength(1);
});
